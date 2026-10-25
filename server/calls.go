package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pion/turn/v4"
)

// Call is a 1:1 WebRTC call. The server only relays signaling (SDP/ICE);
// media flows peer-to-peer, or through the built-in TURN relay when peers cannot reach each other.
type Call struct {
	ID         string
	ChatID     int64
	CallerID   int64
	CalleeID   int64
	Video      bool
	Status     string // ringing | active
	StartedAt  int64
	AnsweredAt int64
	caller     *Client
	callee     *Client
	timer      *time.Timer
}

type CallManager struct {
	s      *Server
	mu     sync.Mutex
	calls  map[string]*Call
	byUser map[int64]*Call
}

func newCallManager(s *Server) *CallManager {
	return &CallManager{s: s, calls: map[string]*Call{}, byUser: map[int64]*Call{}}
}

func (m *CallManager) handle(c *Client, env wsEnvelope) {
	var d struct {
		CallID string          `json:"callId"`
		To     int64           `json:"to"`
		Video  bool            `json:"video"`
		Ref    string          `json:"ref"`
		Reason string          `json:"reason"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(env.D, &d) != nil {
		return
	}
	switch env.T {
	case "call_invite":
		m.invite(c, d.To, d.Video, d.Ref)
	case "call_accept":
		m.accept(c, d.CallID)
	case "call_reject":
		m.finish(d.CallID, c.userID, "rejected")
	case "call_end":
		m.finish(d.CallID, c.userID, "ended")
	case "call_signal":
		m.signal(c, d.CallID, d.Data)
	}
}

func (m *CallManager) invite(c *Client, to int64, video bool, ref string) {
	s := m.s
	st := s.cfg()
	fail := func(reason string) {
		c.push(encodeEvent("call_failed", map[string]string{"ref": ref, "reason": reason}))
	}
	if !st.CallsEnabled || (video && !st.VideoCallsEnabled) {
		fail("disabled")
		return
	}
	if to == c.userID {
		fail("invalid")
		return
	}
	peer, err := s.userByID(to)
	if err != nil || peer.Deleted || peer.Banned {
		fail("invalid")
		return
	}
	if !s.limiter.allow("call:"+itoa(c.userID), 20, 10*time.Minute) {
		fail("rate_limited")
		return
	}
	chatID, created, err := s.ensureDirect(c.userID, to)
	if err != nil {
		fail("invalid")
		return
	}
	if created {
		s.hub.sendTo(to, "chat_update", map[string]int64{"chatId": chatID})
	}

	m.mu.Lock()
	if m.byUser[c.userID] != nil {
		m.mu.Unlock()
		fail("busy_self")
		return
	}
	if m.byUser[to] != nil || !s.hub.online(to) {
		m.mu.Unlock()
		reason := "busy"
		if !s.hub.online(to) {
			reason = "offline"
		}
		fail(reason)
		s.logCall(&Call{ID: randomHex(8), ChatID: chatID, CallerID: c.userID, CalleeID: to, Video: video, StartedAt: nowMs()}, "missed")
		return
	}
	call := &Call{ID: randomHex(12), ChatID: chatID, CallerID: c.userID, CalleeID: to, Video: video, Status: "ringing", StartedAt: nowMs(), caller: c}
	m.calls[call.ID] = call
	m.byUser[c.userID] = call
	m.byUser[to] = call
	call.timer = time.AfterFunc(time.Duration(st.CallRingSeconds)*time.Second, func() {
		m.finish(call.ID, 0, "missed")
	})
	m.mu.Unlock()

	me, _ := s.userByID(c.userID)
	c.push(encodeEvent("call_created", map[string]any{"ref": ref, "callId": call.ID, "chatId": chatID, "peer": s.public(peer, c.userID), "video": video}))
	s.hub.sendTo(to, "call_incoming", map[string]any{"callId": call.ID, "chatId": chatID, "from": s.public(me, to), "video": video})
}

func (m *CallManager) accept(c *Client, callID string) {
	m.mu.Lock()
	call := m.calls[callID]
	if call == nil || call.CalleeID != c.userID || call.Status != "ringing" {
		m.mu.Unlock()
		c.push(encodeEvent("call_ended", map[string]string{"callId": callID, "reason": "gone"}))
		return
	}
	call.Status = "active"
	call.AnsweredAt = nowMs()
	call.callee = c
	call.timer.Stop()
	caller := call.caller
	m.mu.Unlock()

	caller.push(encodeEvent("call_accepted", map[string]string{"callId": callID}))
	// Stop the ringing on the callee's other devices.
	b := encodeEvent("call_handled", map[string]string{"callId": callID})
	m.s.hub.mu.RLock()
	for other := range m.s.hub.clients[c.userID] {
		if other != c {
			other.push(b)
		}
	}
	m.s.hub.mu.RUnlock()
}

func (m *CallManager) signal(c *Client, callID string, data json.RawMessage) {
	if len(data) > 32<<10 {
		return
	}
	m.mu.Lock()
	call := m.calls[callID]
	var target *Client
	if call != nil && call.Status == "active" {
		switch c {
		case call.caller:
			target = call.callee
		case call.callee:
			target = call.caller
		}
	}
	m.mu.Unlock()
	if target != nil {
		target.push(encodeEvent("call_signal", map[string]any{"callId": callID, "data": data}))
	}
}

// finish ends a call. by is the user who ended it (0 = timeout).
func (m *CallManager) finish(callID string, by int64, reason string) {
	m.mu.Lock()
	call := m.calls[callID]
	if call == nil || (by != 0 && by != call.CallerID && by != call.CalleeID) {
		m.mu.Unlock()
		return
	}
	delete(m.calls, callID)
	delete(m.byUser, call.CallerID)
	delete(m.byUser, call.CalleeID)
	if call.timer != nil {
		call.timer.Stop()
	}
	m.mu.Unlock()

	status := "ended"
	switch {
	case call.Status == "ringing" && by == call.CalleeID:
		status = "rejected"
	case call.Status == "ringing" && by == call.CallerID:
		status = "cancelled"
	case call.Status == "ringing":
		status = "missed"
	}
	ev := map[string]any{"callId": callID, "reason": status}
	m.s.hub.sendToMany([]int64{call.CallerID, call.CalleeID}, "call_ended", ev)
	m.s.logCall(call, status)
}

func (m *CallManager) clientGone(c *Client) {
	m.mu.Lock()
	call := m.byUser[c.userID]
	var id string
	if call != nil && (call.caller == c || call.callee == c) {
		id = call.ID
	}
	m.mu.Unlock()
	if id != "" {
		m.finish(id, c.userID, "ended")
	}
}

func (m *CallManager) activeCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.calls)
}

// logCall writes the history row and a "call" message into the 1:1 chat.
func (s *Server) logCall(call *Call, status string) {
	ended := nowMs()
	s.db.Exec(`INSERT OR REPLACE INTO calls(id, chat_id, caller_id, callee_id, video, status, started_at, answered_at, ended_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		call.ID, call.ChatID, call.CallerID, call.CalleeID, boolInt(call.Video), status, call.StartedAt, call.AnsweredAt, ended)
	duration := int64(0)
	if call.AnsweredAt > 0 {
		duration = (ended - call.AnsweredAt) / 1000
	}
	payload, _ := json.Marshal(map[string]any{"status": status, "video": call.Video, "duration": duration})
	s.insertMessage(call.ChatID, call.CallerID, "call", string(payload), "", 0, "")
}

func (s *Server) handleCallHistory(w http.ResponseWriter, r *http.Request, u *User) error {
	rows, err := s.db.Query(`SELECT c.id, c.chat_id, c.caller_id, c.callee_id, c.video, c.status, c.started_at, c.answered_at, c.ended_at
		FROM calls c WHERE c.caller_id=? OR c.callee_id=? ORDER BY c.started_at DESC LIMIT 100`, u.ID, u.ID)
	if err != nil {
		return err
	}
	type entry struct {
		ID         string `json:"id"`
		ChatID     int64  `json:"chatId"`
		Outgoing   bool   `json:"outgoing"`
		Peer       *User  `json:"peer"`
		Video      bool   `json:"video"`
		Status     string `json:"status"`
		StartedAt  int64  `json:"startedAt"`
		AnsweredAt int64  `json:"answeredAt"`
		EndedAt    int64  `json:"endedAt"`
	}
	type raw struct {
		e      entry
		peerID int64
	}
	var raws []raw
	for rows.Next() {
		var x raw
		var caller, callee int64
		var video int
		if err := rows.Scan(&x.e.ID, &x.e.ChatID, &caller, &callee, &video, &x.e.Status, &x.e.StartedAt, &x.e.AnsweredAt, &x.e.EndedAt); err != nil {
			rows.Close()
			return err
		}
		x.e.Video = video == 1
		x.e.Outgoing = caller == u.ID
		x.peerID = callee
		if !x.e.Outgoing {
			x.peerID = caller
		}
		raws = append(raws, x)
	}
	rows.Close()
	list := []entry{}
	for _, x := range raws {
		if p, err := s.userByID(x.peerID); err == nil {
			x.e.Peer = s.public(p, u.ID)
			list = append(list, x.e)
		}
	}
	writeJSON(w, 200, list)
	return nil
}

// handleICE gives the client STUN/TURN servers with short-lived credentials for the built-in relay.
func (s *Server) handleICE(w http.ResponseWriter, r *http.Request, u *User) error {
	st := s.cfg()
	servers := []map[string]any{}
	if st.TurnEnabled && s.turn.running() {
		secret, err := s.secret("turn_secret")
		if err != nil {
			return err
		}
		user, pass, err := turn.GenerateLongTermCredentials(secret, 12*time.Hour)
		if err != nil {
			return err
		}
		host := st.TurnPublicIP
		if host == "" {
			host = requestHostname(r)
		}
		hostPort := net.JoinHostPort(host, fmt.Sprint(s.turn.port()))
		servers = append(servers,
			map[string]any{"urls": []string{"stun:" + hostPort}},
			map[string]any{"urls": []string{"turn:" + hostPort + "?transport=udp", "turn:" + hostPort + "?transport=tcp"}, "username": user, "credential": pass},
		)
	}
	for _, extra := range st.ExtraICEServers {
		servers = append(servers, map[string]any{"urls": []string{extra}})
	}
	writeJSON(w, 200, map[string]any{"iceServers": servers})
	return nil
}

func requestHostname(r *http.Request) string {
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.Trim(host, "[]")
}

// turnServer wraps the embedded pion TURN relay so the admin can reconfigure it live.
type turnServer struct {
	mu     sync.Mutex
	srv    *turn.Server
	cfgKey string
	p      int
	err    string
}

func (t *turnServer) running() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.srv != nil
}

func (t *turnServer) port() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.p
}

func (t *turnServer) status() map[string]any {
	t.mu.Lock()
	defer t.mu.Unlock()
	return map[string]any{"running": t.srv != nil, "port": t.p, "error": t.err}
}

// apply (re)starts or stops the relay to match settings. It is a no-op when nothing changed.
func (s *Server) applyTURN() {
	st := s.cfg()
	t := s.turn
	t.mu.Lock()
	defer t.mu.Unlock()
	relayIP := st.TurnPublicIP
	if relayIP == "" {
		relayIP = s.opts.PublicIP
	}
	if relayIP == "" {
		relayIP = detectLocalIP()
	}
	key := fmt.Sprintf("%v|%s|%d", st.TurnEnabled && st.CallsEnabled, relayIP, st.TurnPort)
	if key == t.cfgKey {
		return
	}
	if t.srv != nil {
		t.srv.Close()
		t.srv = nil
	}
	t.cfgKey, t.err = key, ""
	if !st.TurnEnabled || !st.CallsEnabled {
		return
	}
	ip := net.ParseIP(relayIP)
	if ip == nil {
		// A hostname was given: resolve it once.
		if addrs, err := net.LookupIP(relayIP); err == nil && len(addrs) > 0 {
			ip = addrs[0]
		}
	}
	if ip == nil {
		t.err = "invalid relay IP: " + relayIP
		log.Printf("turn: %s", t.err)
		return
	}
	secret, err := s.secret("turn_secret")
	if err != nil {
		t.err = err.Error()
		return
	}
	addr := fmt.Sprintf("0.0.0.0:%d", st.TurnPort)
	udp, err := net.ListenPacket("udp4", addr)
	if err != nil {
		t.err = err.Error()
		log.Printf("turn: listen udp %s: %v", addr, err)
		return
	}
	gen := func() turn.RelayAddressGenerator {
		return &turn.RelayAddressGeneratorStatic{RelayAddress: ip, Address: "0.0.0.0"}
	}
	cfg := turn.ServerConfig{
		Realm:             "neochat",
		AuthHandler:       turn.NewLongTermAuthHandler(secret, nil),
		PacketConnConfigs: []turn.PacketConnConfig{{PacketConn: udp, RelayAddressGenerator: gen()}},
	}
	// TCP is a fallback for networks that block UDP; the relay still works without it.
	tcp, err := net.Listen("tcp4", addr)
	if err != nil {
		log.Printf("turn: tcp listener disabled (%v); continuing with udp only", err)
	} else {
		cfg.ListenerConfigs = []turn.ListenerConfig{{Listener: tcp, RelayAddressGenerator: gen()}}
	}
	srv, err := turn.NewServer(cfg)
	if err != nil {
		udp.Close()
		if tcp != nil {
			tcp.Close()
		}
		t.err = err.Error()
		log.Printf("turn: %v", err)
		return
	}
	t.srv, t.p = srv, st.TurnPort
	log.Printf("turn: relay listening on %s (udp+tcp), relay address %s", addr, ip)
}

func detectLocalIP() string {
	// No packets are sent: this only asks the OS which interface would route outward.
	if conn, err := net.Dial("udp4", "10.255.255.255:9"); err == nil {
		defer conn.Close()
		if a, ok := conn.LocalAddr().(*net.UDPAddr); ok && !a.IP.IsLoopback() {
			return a.IP.String()
		}
	}
	ifaces, _ := net.InterfaceAddrs()
	for _, a := range ifaces {
		if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil && !ipn.IP.IsLoopback() && !ipn.IP.IsLinkLocalUnicast() {
			return ipn.IP.String()
		}
	}
	return "127.0.0.1"
}
