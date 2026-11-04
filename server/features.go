package main

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// --- change events (offline sync) ---------------------------------------------------------

// logEvent records a change that clients which were offline must replay: an edit, a delete,
// a read receipt, reactions, pins or a self-destruct countdown.
func (s *Server) logEvent(chatID int64, kind string, messageID, userID int64, data string) {
	s.db.Exec(`INSERT INTO events(chat_id, kind, message_id, user_id, data, created_at) VALUES(?,?,?,?,?,?)`,
		chatID, kind, messageID, userID, data, nowMs())
}

// broadcastEdit sends a changed message to the chat and records it for offline devices.
func (s *Server) broadcastEdit(m *Message) {
	s.logEvent(m.ChatID, "edit", m.ID, 0, "")
	ids, _ := s.memberIDs(m.ChatID)
	s.hub.sendToMany(ids, "message_edit", m)
}

type syncEvent struct {
	ID        int64           `json:"id"`
	ChatID    int64           `json:"chatId"`
	Kind      string          `json:"kind"`
	MessageID int64           `json:"messageId,omitempty"`
	UserID    int64           `json:"userId,omitempty"`
	Message   *Message        `json:"message,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
}

const syncMessageLimit = 500

// handleSync brings a device that was offline up to date in one request: every message newer
// than `msg` in all the user's chats, and every change (edit, delete, read, reaction, pin, timer)
// newer than `ev`. A client without a cursor just receives the current one.
func (s *Server) handleSync(w http.ResponseWriter, r *http.Request, u *User) error {
	since := int64(queryInt(r, "msg", 0, 0, 1<<62))
	sinceEv := int64(queryInt(r, "ev", 0, 0, 1<<62))
	var maxMsg, maxEv, minEv int64
	s.db.QueryRow(`SELECT COALESCE(MAX(id),0) FROM messages`).Scan(&maxMsg)
	s.db.QueryRow(`SELECT COALESCE(MAX(id),0), COALESCE(MIN(id),0) FROM events`).Scan(&maxEv, &minEv)
	out := map[string]any{"messages": []*Message{}, "events": []syncEvent{}}
	if !r.URL.Query().Has("msg") {
		out["cursor"] = map[string]int64{"msg": maxMsg, "ev": maxEv}
		writeJSON(w, 200, out)
		return nil
	}
	// Events older than the ones still kept were pruned: the client reloads instead.
	if sinceEv > 0 && minEv > sinceEv+1 {
		out["reset"] = true
		out["cursor"] = map[string]int64{"msg": maxMsg, "ev": maxEv}
		writeJSON(w, 200, out)
		return nil
	}
	mine := `(SELECT chat_id FROM chat_members WHERE user_id=?)`
	rows, err := s.db.Query(messageSelect+` WHERE m.chat_id IN `+mine+` AND m.id>? ORDER BY m.id ASC LIMIT ?`, u.ID, since, syncMessageLimit)
	if err != nil {
		return err
	}
	msgs := []*Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			rows.Close()
			return err
		}
		msgs = append(msgs, m)
	}
	rows.Close()
	s.attachReactions(msgs)
	cursorMsg := since
	if len(msgs) > 0 {
		cursorMsg = msgs[len(msgs)-1].ID
	}
	more := len(msgs) == syncMessageLimit
	if !more {
		cursorMsg = max(cursorMsg, maxMsg)
	}

	evs := []syncEvent{}
	cursorEv := sinceEv
	erows, err := s.db.Query(`SELECT id, chat_id, kind, message_id, user_id, data FROM events
		WHERE id>? AND chat_id IN `+mine+` ORDER BY id ASC LIMIT 2000`, sinceEv, u.ID)
	if err != nil {
		return err
	}
	for erows.Next() {
		var e syncEvent
		var data string
		if erows.Scan(&e.ID, &e.ChatID, &e.Kind, &e.MessageID, &e.UserID, &data) == nil {
			if data != "" {
				e.Data = json.RawMessage(data)
			}
			evs = append(evs, e)
			cursorEv = e.ID
		}
	}
	erows.Close()
	// Many edits of one message collapse into its current state.
	seenEdit := map[int64]bool{}
	for i := len(evs) - 1; i >= 0; i-- {
		e := &evs[i]
		if e.Kind != "edit" || seenEdit[e.MessageID] {
			continue
		}
		seenEdit[e.MessageID] = true
		if m, err := s.messageByID(e.MessageID); err == nil {
			e.Message = m
		}
	}
	if len(evs) < 2000 {
		cursorEv = max(cursorEv, maxEv)
	} else {
		more = true
	}
	out["messages"], out["events"], out["more"] = msgs, evs, more
	out["cursor"] = map[string]int64{"msg": cursorMsg, "ev": cursorEv}
	writeJSON(w, 200, out)
	return nil
}

// --- reactions ----------------------------------------------------------------------------

type ReactionGroup struct {
	Emoji string  `json:"emoji"`
	Users []int64 `json:"users"`
}

func (s *Server) attachReactions(list []*Message) {
	if len(list) == 0 {
		return
	}
	byID := make(map[int64]*Message, len(list))
	args := make([]any, 0, len(list))
	marks := make([]string, 0, len(list))
	for _, m := range list {
		byID[m.ID] = m
		args = append(args, m.ID)
		marks = append(marks, "?")
	}
	rows, err := s.db.Query(`SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (`+strings.Join(marks, ",")+`) ORDER BY created_at`, args...)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, uid int64
		var emoji string
		if rows.Scan(&id, &emoji, &uid) != nil {
			continue
		}
		m := byID[id]
		found := false
		for i := range m.Reactions {
			if m.Reactions[i].Emoji == emoji {
				m.Reactions[i].Users = append(m.Reactions[i].Users, uid)
				found = true
				break
			}
		}
		if !found {
			m.Reactions = append(m.Reactions, ReactionGroup{Emoji: emoji, Users: []int64{uid}})
		}
	}
}

func (s *Server) handleReaction(w http.ResponseWriter, r *http.Request, u *User) error {
	m, _, _, err := s.loadOwnedMessage(r, u)
	if err != nil {
		return err
	}
	if m.Kind == "system" {
		return errf(400, "bad_request", "cannot react to this message")
	}
	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if !s.limiter.allow("react:"+itoa(u.ID), 120, time.Minute) {
		return errf(429, "rate_limited", "too many reactions")
	}
	if req.Emoji == "" {
		s.db.Exec(`DELETE FROM reactions WHERE message_id=? AND user_id=?`, m.ID, u.ID)
	} else {
		allowed := false
		for _, e := range s.cfg().ReactionEmojis {
			if e == req.Emoji {
				allowed = true
			}
		}
		if !allowed {
			return errf(400, "bad_request", "this reaction is not allowed on this server")
		}
		if _, err := s.db.Exec(`INSERT INTO reactions(message_id, user_id, emoji, created_at) VALUES(?,?,?,?)
			ON CONFLICT(message_id, user_id) DO UPDATE SET emoji=excluded.emoji, created_at=excluded.created_at`,
			m.ID, u.ID, req.Emoji, nowMs()); err != nil {
			return err
		}
	}
	m.Reactions = nil
	s.attachReactions([]*Message{m})
	ev := map[string]any{"chatId": m.ChatID, "messageId": m.ID, "reactions": m.Reactions}
	data, _ := json.Marshal(m.Reactions)
	s.logEvent(m.ChatID, "reaction", m.ID, u.ID, string(data))
	ids, _ := s.memberIDs(m.ChatID)
	s.hub.sendToMany(ids, "reactions", ev)
	writeJSON(w, 200, ev)
	return nil
}

// --- forwarding ---------------------------------------------------------------------------

// handleForward copies messages into other chats. Files are not stored again: the new message
// points at the same file.
func (s *Server) handleForward(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		IDs        []int64 `json:"ids"`
		To         []int64 `json:"to"`
		HideSender bool    `json:"hideSender"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if len(req.IDs) == 0 || len(req.To) == 0 || len(req.IDs) > 100 || len(req.To) > 20 {
		return errf(400, "bad_request", "pick 1–100 messages and 1–20 chats")
	}
	if !s.limiter.allow("msg:"+itoa(u.ID), s.cfg().MessagesPerMinute, time.Minute) {
		return errf(429, "rate_limited", "you are sending messages too fast")
	}
	var src []*Message
	for _, id := range req.IDs {
		m, err := s.messageByID(id)
		if err != nil {
			continue
		}
		if _, _, err := s.member(m.ChatID, u.ID); err != nil {
			continue
		}
		if m.Kind == "system" || m.Kind == "call" || m.Once > 0 || (m.Media != nil && m.Media.Expired) {
			continue
		}
		src = append(src, m)
	}
	if len(src) == 0 {
		return errf(400, "bad_request", "nothing to forward")
	}
	sortByID(src)
	count := 0
	for _, chatID := range req.To {
		typ, role, err := s.member(chatID, u.ID)
		if err != nil || (typ == "channel" && !isAdminRole(role)) {
			continue
		}
		ttl := s.chatTTL(chatID)
		for _, m := range src {
			name := ""
			if !req.HideSender {
				name = m.FwdName
				if name == "" && m.Sender != nil {
					name = m.Sender.DisplayName
				}
			}
			mediaID := ""
			if m.Media != nil {
				mediaID = m.Media.ID
			}
			if _, err := s.insertMessageOpts(chatID, u.ID, m.Kind, m.Text, mediaID, 0, msgOpts{ttl: ttl, fwdName: name}); err == nil {
				count++
			}
		}
	}
	writeJSON(w, 200, map[string]int{"count": count})
	return nil
}

func sortByID(l []*Message) {
	for i := 1; i < len(l); i++ {
		for j := i; j > 0 && l[j].ID < l[j-1].ID; j-- {
			l[j], l[j-1] = l[j-1], l[j]
		}
	}
}

// --- pinned messages ----------------------------------------------------------------------

func (s *Server) canPin(typ, role string) bool { return typ == "direct" || isAdminRole(role) }

func (s *Server) pinIDs(chatID int64) []int64 {
	ids := []int64{}
	rows, err := s.db.Query(`SELECT message_id FROM pins WHERE chat_id=? ORDER BY created_at DESC`, chatID)
	if err != nil {
		return ids
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Server) handlePins(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if _, _, err := s.member(id, u.ID); err != nil {
		return err
	}
	list := []*Message{}
	for _, mid := range s.pinIDs(id) {
		if m, err := s.messageByID(mid); err == nil {
			list = append(list, m)
		}
	}
	writeJSON(w, 200, list)
	return nil
}

func (s *Server) handlePin(w http.ResponseWriter, r *http.Request, u *User) error {
	m, typ, role, err := s.loadOwnedMessage(r, u)
	if err != nil {
		return err
	}
	if !s.canPin(typ, role) {
		return errForbidden
	}
	if r.Method == http.MethodDelete {
		s.db.Exec(`DELETE FROM pins WHERE chat_id=? AND message_id=?`, m.ChatID, m.ID)
	} else {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM pins WHERE chat_id=?`, m.ChatID).Scan(&n)
		if n >= 50 {
			return errf(400, "bad_request", "a chat can have at most 50 pinned messages")
		}
		s.db.Exec(`INSERT OR IGNORE INTO pins(chat_id, message_id, pinned_by, created_at) VALUES(?,?,?,?)`, m.ChatID, m.ID, u.ID, nowMs())
	}
	ev := map[string]any{"chatId": m.ChatID, "pins": s.pinIDs(m.ChatID)}
	s.logEvent(m.ChatID, "pin", m.ID, u.ID, "")
	ids, _ := s.memberIDs(m.ChatID)
	s.hub.sendToMany(ids, "pins", ev)
	writeJSON(w, 200, ev)
	return nil
}

// --- self-destructing messages ------------------------------------------------------------

var allowedTTL = map[int]bool{0: true, 30: true, 60: true, 3600: true, 86400: true, 604800: true}

func (s *Server) chatTTL(chatID int64) int {
	var ttl int
	s.db.QueryRow(`SELECT ttl_seconds FROM chats WHERE id=?`, chatID).Scan(&ttl)
	return ttl
}

func (s *Server) handleSetTTL(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	if typ != "direct" && !isAdminRole(role) {
		return errForbidden
	}
	var req struct {
		Seconds int `json:"seconds"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if !allowedTTL[req.Seconds] {
		return errf(400, "bad_request", "unsupported timer")
	}
	if _, err := s.db.Exec(`UPDATE chats SET ttl_seconds=? WHERE id=?`, req.Seconds, id); err != nil {
		return err
	}
	s.systemMessage(id, u.ID, "ttl:"+itoa(int64(req.Seconds)))
	s.notifyChatUpdate(id)
	writeJSON(w, 200, map[string]int{"seconds": req.Seconds})
	return nil
}

// startCountdown begins the self-destruct timer of messages the reader has just seen.
func (s *Server) startCountdown(chatID, readerID, upTo int64) {
	rows, err := s.db.Query(`SELECT id, ttl FROM messages WHERE chat_id=? AND id<=? AND ttl>0 AND destroy_at=0 AND sender_id<>?`,
		chatID, upTo, readerID)
	if err != nil {
		return
	}
	type item struct {
		ID        int64 `json:"id"`
		DestroyAt int64 `json:"destroyAt"`
	}
	var items []item
	now := nowMs()
	for rows.Next() {
		var id int64
		var ttl int
		if rows.Scan(&id, &ttl) == nil {
			items = append(items, item{id, now + int64(ttl)*1000})
		}
	}
	rows.Close()
	if len(items) == 0 {
		return
	}
	for _, it := range items {
		s.db.Exec(`UPDATE messages SET destroy_at=? WHERE id=? AND destroy_at=0`, it.DestroyAt, it.ID)
	}
	data, _ := json.Marshal(items)
	s.logEvent(chatID, "ttl", 0, readerID, string(data))
	ids, _ := s.memberIDs(chatID)
	s.hub.sendToMany(ids, "message_ttl", map[string]any{"chatId": chatID, "items": items})
}

// runDestroyer removes messages whose countdown ran out, from the server and (through the
// delete event) from every device, together with their files.
func (s *Server) runDestroyer() {
	for {
		time.Sleep(2 * time.Second)
		s.destroyDue()
	}
}

func (s *Server) destroyDue() {
	rows, err := s.db.Query(`SELECT id, chat_id, media_id FROM messages WHERE destroy_at>0 AND destroy_at<=? LIMIT 500`, nowMs())
	if err != nil {
		return
	}
	type due struct {
		id, chat int64
		media    string
	}
	var list []due
	for rows.Next() {
		var d due
		if rows.Scan(&d.id, &d.chat, &d.media) == nil {
			list = append(list, d)
		}
	}
	rows.Close()
	for _, d := range list {
		s.deleteMessage(d.chat, d.id)
		s.forgetMedia(d.media)
	}
}

// forgetMedia deletes a file nothing refers to anymore (its message destroyed or opened once).
func (s *Server) forgetMedia(id string) {
	if id == "" {
		return
	}
	var refs int
	s.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE media_id=?`, id).Scan(&refs)
	if refs > 0 {
		return
	}
	var keep int
	s.db.QueryRow(`SELECT keep FROM media WHERE id=?`, id).Scan(&keep)
	if keep == 1 {
		return
	}
	s.removeMediaFiles(id)
	s.db.Exec(`DELETE FROM media WHERE id=?`, id)
}

// --- view once ----------------------------------------------------------------------------

func (s *Server) hideThumb(mediaID string) {
	os.Remove(s.mediaPath(mediaID) + "_t")
	s.db.Exec(`UPDATE media SET has_thumb=0 WHERE id=?`, mediaID)
}

// handleOpened is called when the recipient closes a view-once photo: the file is deleted from
// the server and the message on both phones turns into "opened".
func (s *Server) handleOpened(w http.ResponseWriter, r *http.Request, u *User) error {
	m, _, _, err := s.loadOwnedMessage(r, u)
	if err != nil {
		return err
	}
	if m.Once != 1 || m.SenderID == u.ID {
		writeJSON(w, 200, m)
		return nil
	}
	s.db.Exec(`UPDATE messages SET once=2, media_id='' WHERE id=?`, m.ID)
	if m.Media != nil {
		s.forgetMedia(m.Media.ID)
	}
	m, err = s.messageByID(m.ID)
	if err != nil {
		return err
	}
	s.broadcastEdit(m)
	writeJSON(w, 200, m)
	return nil
}

// --- locked messages ----------------------------------------------------------------------

// validLockbox checks the shape of a password-locked message. The server never sees the
// password or the plain text; it only makes sure the envelope is well formed.
func validLockbox(text string) bool {
	var box struct {
		V    int    `json:"v"`
		Salt string `json:"salt"`
		IV   string `json:"iv"`
		CT   string `json:"ct"`
		Hint string `json:"hint"`
	}
	if json.Unmarshal([]byte(text), &box) != nil || box.V != 1 || len([]rune(box.Hint)) > 80 {
		return false
	}
	for _, f := range []string{box.Salt, box.IV, box.CT} {
		if _, err := base64.StdEncoding.DecodeString(f); err != nil || f == "" {
			return false
		}
	}
	return true
}

// pruneEvents keeps the change log short; devices offline for longer reload instead.
func (s *Server) pruneEvents() {
	cutoff := time.Now().AddDate(0, 0, -30).UnixMilli()
	if res, err := s.db.Exec(`DELETE FROM events WHERE created_at<?`, cutoff); err == nil {
		if n, _ := res.RowsAffected(); n > 0 {
			log.Printf("sync: pruned %d old change events", n)
		}
	}
}
