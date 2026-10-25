package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	wsWriteWait  = 10 * time.Second
	wsPongWait   = 60 * time.Second
	wsPingPeriod = 25 * time.Second
	wsMaxMessage = 64 << 10
)

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	userID int64
	send   chan []byte
	mu     sync.Mutex
	closed bool
}

type Hub struct {
	s       *Server
	mu      sync.RWMutex
	clients map[int64]map[*Client]struct{}
}

func newHub(s *Server) *Hub {
	return &Hub{s: s, clients: map[int64]map[*Client]struct{}{}}
}

func (h *Hub) add(c *Client) (first bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.clients[c.userID]
	if set == nil {
		set = map[*Client]struct{}{}
		h.clients[c.userID] = set
	}
	set[c] = struct{}{}
	return len(set) == 1
}

func (h *Hub) remove(c *Client) (last bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.clients[c.userID]
	if _, ok := set[c]; !ok {
		return false
	}
	delete(set, c)
	if len(set) == 0 {
		delete(h.clients, c.userID)
		return true
	}
	return false
}

func (h *Hub) online(uid int64) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[uid]) > 0
}

func (h *Hub) onlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func encodeEvent(ev string, data any) []byte {
	b, err := json.Marshal(map[string]any{"t": ev, "d": data})
	if err != nil {
		log.Printf("ws encode %s: %v", ev, err)
		return nil
	}
	return b
}

func (c *Client) push(b []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	select {
	case c.send <- b:
	default:
		// A client that cannot keep up is dropped; it will reconnect and resync.
		c.closed = true
		close(c.send)
	}
}

func (c *Client) close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		close(c.send)
	}
}

func (h *Hub) sendTo(uid int64, ev string, data any) {
	b := encodeEvent(ev, data)
	if b == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients[uid] {
		c.push(b)
	}
}

func (h *Hub) sendToMany(uids []int64, ev string, data any) {
	b := encodeEvent(ev, data)
	if b == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, uid := range uids {
		for c := range h.clients[uid] {
			c.push(b)
		}
	}
}

func (h *Hub) broadcast(ev string, data any) {
	b := encodeEvent(ev, data)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, set := range h.clients {
		for c := range set {
			c.push(b)
		}
	}
}

func (h *Hub) disconnectUser(uid int64) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients[uid] {
		c.close()
	}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		// Same-origin only: the web client is always served by this binary.
		return originHost(origin) == r.Host
	},
}

func originHost(origin string) string {
	for _, p := range []string{"https://", "http://"} {
		if len(origin) > len(p) && origin[:len(p)] == p {
			return origin[len(p):]
		}
	}
	return origin
}

type wsEnvelope struct {
	T string          `json:"t"`
	D json.RawMessage `json:"d"`
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(wsMaxMessage)
	// The first frame must authenticate; tokens never travel in the URL.
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	var env wsEnvelope
	if err := conn.ReadJSON(&env); err != nil || env.T != "auth" {
		conn.Close()
		return
	}
	var auth struct {
		Token string `json:"token"`
	}
	json.Unmarshal(env.D, &auth)
	u, _, err := s.authenticate(auth.Token)
	if err != nil {
		conn.WriteJSON(map[string]any{"t": "auth_error", "d": map[string]string{"message": err.Error()}})
		conn.Close()
		return
	}
	c := &Client{hub: s.hub, conn: conn, userID: u.ID, send: make(chan []byte, 256)}
	first := s.hub.add(c)
	c.push(encodeEvent("ready", map[string]any{"user": s.public(u, u.ID), "config": s.publicConfig()}))
	if first {
		s.setPresence(u.ID, true)
	}
	go c.writeLoop()
	c.readLoop(s)
}

func (c *Client) writeLoop() {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readLoop(s *Server) {
	defer func() {
		s.calls.clientGone(c)
		if c.hub.remove(c) {
			s.setPresence(c.userID, false)
		}
		c.close()
		c.conn.Close()
	}()
	c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})
	for {
		var env wsEnvelope
		if err := c.conn.ReadJSON(&env); err != nil {
			return
		}
		c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
		s.dispatchWS(c, env)
	}
}

func (s *Server) dispatchWS(c *Client, env wsEnvelope) {
	switch env.T {
	case "ping":
		c.push(encodeEvent("pong", nowMs()))
	case "typing":
		var d struct {
			ChatID int64  `json:"chatId"`
			Action string `json:"action"`
		}
		if json.Unmarshal(env.D, &d) != nil {
			return
		}
		if !s.limiter.allow("typing:"+itoa(c.userID), 30, 10*time.Second) {
			return
		}
		typ, _, err := s.member(d.ChatID, c.userID)
		if err != nil || typ == "channel" {
			return
		}
		ids, _ := s.memberIDs(d.ChatID)
		var others []int64
		for _, id := range ids {
			if id != c.userID {
				others = append(others, id)
			}
		}
		action := "typing"
		if d.Action == "recording" || d.Action == "uploading" {
			action = d.Action
		}
		s.hub.sendToMany(others, "typing", map[string]any{"chatId": d.ChatID, "userId": c.userID, "action": action})
	default:
		s.calls.handle(c, env)
	}
}

func (s *Server) setPresence(uid int64, online bool) {
	ts := nowMs()
	s.db.Exec(`UPDATE users SET last_seen=? WHERE id=?`, ts, uid)
	u, err := s.userByID(uid)
	if err != nil {
		return
	}
	for _, id := range s.contactIDs(uid) {
		p := s.public(u, id)
		s.hub.sendTo(id, "presence", map[string]any{"userId": uid, "online": online, "lastSeen": p.LastSeen, "lastSeenHidden": p.LastSeenHidden})
	}
}
