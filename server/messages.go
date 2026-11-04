package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

type MessageSender struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Avatar      string `json:"avatar"`
}

type ReplyPreview struct {
	ID         int64  `json:"id"`
	Kind       string `json:"kind"`
	Text       string `json:"text"`
	SenderName string `json:"senderName"`
}

type Message struct {
	ID        int64          `json:"id"`
	ChatID    int64          `json:"chatId"`
	SenderID  int64          `json:"senderId"`
	Sender    *MessageSender `json:"sender"`
	Kind      string         `json:"kind"`
	Text      string         `json:"text"`
	Media     *Media         `json:"media,omitempty"`
	ReplyTo   int64          `json:"replyTo,omitempty"`
	Reply     *ReplyPreview  `json:"reply,omitempty"`
	EditedAt  int64          `json:"editedAt,omitempty"`
	CreatedAt int64          `json:"createdAt"`
	ClientID  string         `json:"clientId,omitempty"`
	// TTL (seconds) makes the message destroy itself that long after the recipient saw it;
	// DestroyAt is when that happens once the countdown started.
	TTL       int   `json:"ttl,omitempty"`
	DestroyAt int64 `json:"destroyAt,omitempty"`
	// Once: 1 = a view-once photo/video not opened yet, 2 = opened (the file is gone).
	Once      int             `json:"once,omitempty"`
	FwdName   string          `json:"fwdName,omitempty"`
	Reactions []ReactionGroup `json:"reactions,omitempty"`
}

// msgOpts are the optional parts of a new message.
type msgOpts struct {
	clientID string
	ttl      int
	once     bool
	fwdName  string
}

const messageSelect = `
SELECT m.id, m.chat_id, m.sender_id, m.kind, m.text, m.media_id, m.reply_to, m.edited_at, m.created_at,
	m.ttl, m.destroy_at, m.once, m.fwd_name,
	u.username, u.display_name, u.avatar,
	COALESCE(md.kind,''), COALESCE(md.mime,''), COALESCE(md.name,''), COALESCE(md.size,0),
	COALESCE(md.width,0), COALESCE(md.height,0), COALESCE(md.has_thumb,0), COALESCE(md.expires_at,0), COALESCE(md.removed,0),
	COALESCE(r.id,0), COALESCE(r.kind,''), COALESCE(r.text,''), COALESCE(ru.display_name,'')
FROM messages m
JOIN users u ON u.id=m.sender_id
LEFT JOIN media md ON md.id=m.media_id
LEFT JOIN messages r ON r.id=m.reply_to
LEFT JOIN users ru ON ru.id=r.sender_id`

func scanMessage(sc scanner) (*Message, error) {
	var m Message
	var snd MessageSender
	var mediaID string
	var md Media
	var hasThumb, removed int
	var rp ReplyPreview
	if err := sc.Scan(&m.ID, &m.ChatID, &m.SenderID, &m.Kind, &m.Text, &mediaID, &m.ReplyTo, &m.EditedAt, &m.CreatedAt,
		&m.TTL, &m.DestroyAt, &m.Once, &m.FwdName,
		&snd.Username, &snd.DisplayName, &snd.Avatar,
		&md.Kind, &md.Mime, &md.Name, &md.Size, &md.Width, &md.Height, &hasThumb, &md.ExpiresAt, &removed,
		&rp.ID, &rp.Kind, &rp.Text, &rp.SenderName); err != nil {
		return nil, err
	}
	snd.ID = m.SenderID
	m.Sender = &snd
	if mediaID != "" && md.Kind != "" && m.Once != 2 {
		md.ID, md.HasThumb, md.Expired = mediaID, hasThumb == 1, removed == 1
		if m.Once == 1 {
			md.HasThumb = false // a view-once photo has no preview
		}
		m.Media = &md
	}
	if rp.ID > 0 {
		rp.Text = trimLen(rp.Text, 120)
		m.Reply = &rp
	}
	return &m, nil
}

func (s *Server) messageByID(id int64) (*Message, error) {
	m, err := scanMessage(s.db.QueryRow(messageSelect+` WHERE m.id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errNotFound
	}
	if err == nil {
		s.attachReactions([]*Message{m})
	}
	return m, err
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if _, _, err := s.member(id, u.ID); err != nil {
		return err
	}
	limit := queryInt(r, "limit", 50, 1, 200)
	before := int64(queryInt(r, "before", 0, 0, 1<<62))
	after := int64(queryInt(r, "after", 0, 0, 1<<62))
	var rows *sql.Rows
	switch {
	case after > 0:
		rows, err = s.db.Query(messageSelect+` WHERE m.chat_id=? AND m.id>? ORDER BY m.id ASC LIMIT ?`, id, after, limit)
	case before > 0:
		rows, err = s.db.Query(messageSelect+` WHERE m.chat_id=? AND m.id<? ORDER BY m.id DESC LIMIT ?`, id, before, limit)
	default:
		rows, err = s.db.Query(messageSelect+` WHERE m.chat_id=? ORDER BY m.id DESC LIMIT ?`, id, limit)
	}
	if err != nil {
		return err
	}
	defer rows.Close()
	list := []*Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return err
		}
		list = append(list, m)
	}
	s.attachReactions(list)
	if after == 0 {
		// return oldest → newest
		for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
			list[i], list[j] = list[j], list[i]
		}
	}
	writeJSON(w, 200, map[string]any{"messages": list, "hasMore": after == 0 && len(list) == limit})
	return rows.Err()
}

// insertMessage stores a message, bumps the chat and fans it out to every member.
func (s *Server) insertMessage(chatID, senderID int64, kind, text, mediaID string, replyTo int64, clientID string) (*Message, error) {
	return s.insertMessageOpts(chatID, senderID, kind, text, mediaID, replyTo, msgOpts{clientID: clientID})
}

func (s *Server) insertMessageOpts(chatID, senderID int64, kind, text, mediaID string, replyTo int64, o msgOpts) (*Message, error) {
	clientID := o.clientID
	ts := nowMs()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO messages(chat_id, sender_id, kind, text, media_id, reply_to, created_at, client_id, ttl, once, fwd_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
		chatID, senderID, kind, text, mediaID, replyTo, ts, clientID, o.ttl, boolInt(o.once), o.fwdName)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	if _, err := tx.Exec(`UPDATE chats SET last_msg_id=?, last_msg_at=? WHERE id=?`, id, ts, chatID); err != nil {
		return nil, err
	}
	// Your own message counts as read; un-archive the chat for everyone like Telegram does.
	if _, err := tx.Exec(`UPDATE chat_members SET last_read_id=? WHERE chat_id=? AND user_id=?`, id, chatID, senderID); err != nil {
		return nil, err
	}
	if kind != "system" {
		if _, err := tx.Exec(`UPDATE chat_members SET archived=0 WHERE chat_id=? AND archived=1 AND muted=0`, chatID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	m, err := s.messageByID(id)
	if err != nil {
		return nil, err
	}
	m.ClientID = clientID
	ids, _ := s.memberIDs(chatID)
	s.hub.sendToMany(ids, "message", m)
	go s.pushMessage(m)
	return m, nil
}

// systemMessage records room events ("created", "joined", "added:<id>", ...) that clients render localized.
func (s *Server) systemMessage(chatID, actorID int64, event string) {
	s.insertMessage(chatID, actorID, "system", event, "", 0, "")
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request, u *User) error {
	chatID, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, role, err := s.member(chatID, u.ID)
	if err != nil {
		return err
	}
	if typ == "channel" && !isAdminRole(role) {
		return errf(403, "forbidden", "only channel admins can post")
	}
	st := s.cfg()
	if !s.limiter.allow("msg:"+itoa(u.ID), st.MessagesPerMinute, time.Minute) {
		return errf(429, "rate_limited", "you are sending messages too fast")
	}
	var req struct {
		Text     string `json:"text"`
		MediaID  string `json:"mediaId"`
		ReplyTo  int64  `json:"replyTo"`
		ClientID string `json:"clientId"`
		// Kind "locked": text is an encrypted envelope only the password opens.
		Kind string `json:"kind"`
		// Once: a photo or video that can be opened a single time (private chats only).
		Once bool `json:"once"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	req.ClientID = trimLen(req.ClientID, 64)
	// A retry from the offline outbox of a message the server already has: answer with it.
	if req.ClientID != "" {
		var existing int64
		if s.db.QueryRow(`SELECT id FROM messages WHERE sender_id=? AND client_id=? AND chat_id=?`, u.ID, req.ClientID, chatID).Scan(&existing) == nil {
			m, err := s.messageByID(existing)
			if err != nil {
				return err
			}
			m.ClientID = req.ClientID
			writeJSON(w, 200, m)
			return nil
		}
	}
	text := strings.TrimSpace(req.Text)
	limit := st.MaxMessageLen
	if req.Kind == "locked" {
		limit = st.MaxMessageLen*2 + 512 // the encrypted envelope is larger than the text
	}
	if len([]rune(text)) > limit {
		return errf(400, "too_long", "message is too long")
	}
	kind := "text"
	var md *Media
	if req.MediaID != "" {
		md, err = s.mediaByID(req.MediaID)
		if err != nil || md.OwnerID != u.ID || md.Expired {
			return errf(400, "bad_request", "invalid attachment")
		}
		kind = md.Kind
	} else if text == "" {
		return errf(400, "bad_request", "message is empty")
	}
	if req.Kind == "locked" {
		if !validLockbox(text) || (md != nil && md.Kind != "file") {
			return errf(400, "bad_request", "invalid locked message")
		}
		kind = "locked"
	}
	if req.Once {
		if typ != "direct" || md == nil || (md.Kind != "image" && md.Kind != "video") {
			return errf(400, "bad_request", "view-once works for photos and videos in private chats")
		}
		s.hideThumb(md.ID)
	}
	if req.ReplyTo > 0 {
		var rc int64
		if err := s.db.QueryRow(`SELECT chat_id FROM messages WHERE id=?`, req.ReplyTo).Scan(&rc); err != nil || rc != chatID {
			req.ReplyTo = 0
		}
	}
	m, err := s.insertMessageOpts(chatID, u.ID, kind, text, req.MediaID, req.ReplyTo,
		msgOpts{clientID: req.ClientID, ttl: s.chatTTL(chatID), once: req.Once})
	if err != nil {
		return err
	}
	writeJSON(w, 201, m)
	return nil
}

func (s *Server) loadOwnedMessage(r *http.Request, u *User) (*Message, string, string, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, "", "", err
	}
	m, err := s.messageByID(id)
	if err != nil {
		return nil, "", "", err
	}
	typ, role, err := s.member(m.ChatID, u.ID)
	if err != nil {
		return nil, "", "", errNotFound
	}
	return m, typ, role, nil
}

func (s *Server) handleEditMessage(w http.ResponseWriter, r *http.Request, u *User) error {
	m, _, _, err := s.loadOwnedMessage(r, u)
	if err != nil {
		return err
	}
	if m.SenderID != u.ID || m.Kind == "system" || m.Kind == "call" || m.Kind == "locked" || m.Once > 0 {
		return errForbidden
	}
	var req struct {
		Text string `json:"text"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	text := strings.TrimSpace(req.Text)
	if text == "" && m.Media == nil {
		return errf(400, "bad_request", "message is empty")
	}
	if len([]rune(text)) > s.cfg().MaxMessageLen {
		return errf(400, "too_long", "message is too long")
	}
	if _, err := s.db.Exec(`UPDATE messages SET text=?, edited_at=? WHERE id=?`, text, nowMs(), m.ID); err != nil {
		return err
	}
	m, err = s.messageByID(m.ID)
	if err != nil {
		return err
	}
	s.broadcastEdit(m)
	writeJSON(w, 200, m)
	return nil
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request, u *User) error {
	m, typ, role, err := s.loadOwnedMessage(r, u)
	if err != nil {
		return err
	}
	// Anyone can delete their own messages; room admins can delete anything in groups/channels.
	if m.SenderID != u.ID && !(typ != "direct" && isAdminRole(role)) {
		return errForbidden
	}
	if err := s.deleteMessage(m.ChatID, m.ID); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) deleteMessage(chatID, id int64) error {
	if _, err := s.db.Exec(`DELETE FROM messages WHERE id=?`, id); err != nil {
		return err
	}
	var lastID, lastAt int64
	s.db.QueryRow(`SELECT COALESCE(MAX(id),0) FROM messages WHERE chat_id=?`, chatID).Scan(&lastID)
	if lastID > 0 {
		s.db.QueryRow(`SELECT created_at FROM messages WHERE id=?`, lastID).Scan(&lastAt)
	}
	s.db.Exec(`UPDATE chats SET last_msg_id=?, last_msg_at=CASE WHEN ?>0 THEN ? ELSE last_msg_at END WHERE id=?`, lastID, lastAt, lastAt, chatID)
	s.logEvent(chatID, "delete", id, 0, "")
	ids, _ := s.memberIDs(chatID)
	s.hub.sendToMany(ids, "message_delete", map[string]int64{"chatId": chatID, "id": id, "lastMessageId": lastID})
	return nil
}
