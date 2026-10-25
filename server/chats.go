package main

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type ChatView struct {
	ID          int64    `json:"id"`
	Type        string   `json:"type"`
	Title       string   `json:"title"`
	Handle      string   `json:"handle"`
	Description string   `json:"description"`
	Avatar      string   `json:"avatar"`
	InviteCode  string   `json:"inviteCode,omitempty"`
	OwnerID     int64    `json:"ownerId"`
	CreatedAt   int64    `json:"createdAt"`
	LastMsgAt   int64    `json:"lastMessageAt"`
	Role        string   `json:"role"`
	Muted       bool     `json:"muted"`
	Archived    bool     `json:"archived"`
	Pinned      bool     `json:"pinned"`
	LastReadID  int64    `json:"lastReadId"`
	OthersRead  int64    `json:"othersReadId"`
	Unread      int      `json:"unread"`
	Members     int      `json:"memberCount"`
	Peer        *User    `json:"peer,omitempty"`
	LastMessage *Message `json:"lastMessage,omitempty"`
	Saved       bool     `json:"saved,omitempty"`
}

const chatViewQuery = `
SELECT c.id, c.type, c.title, COALESCE(c.handle,''), c.description, c.avatar, COALESCE(c.invite_code,''), c.owner_id,
	c.created_at, c.last_msg_id, c.last_msg_at, cm.role, cm.muted, cm.archived, cm.pinned, cm.last_read_id,
	(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id AND m.id>cm.last_read_id AND m.sender_id<>cm.user_id),
	(SELECT COUNT(*) FROM chat_members x WHERE x.chat_id=c.id),
	(SELECT COALESCE(MAX(x.last_read_id),0) FROM chat_members x WHERE x.chat_id=c.id AND x.user_id<>cm.user_id)
FROM chat_members cm JOIN chats c ON c.id=cm.chat_id
WHERE cm.user_id=?`

func (s *Server) scanChatViews(rows *sql.Rows, uid int64) ([]*ChatView, error) {
	defer rows.Close()
	var list []*ChatView
	var lastIDs []int64
	for rows.Next() {
		var c ChatView
		var lastID int64
		var muted, archived, pinned int
		if err := rows.Scan(&c.ID, &c.Type, &c.Title, &c.Handle, &c.Description, &c.Avatar, &c.InviteCode, &c.OwnerID,
			&c.CreatedAt, &lastID, &c.LastMsgAt, &c.Role, &muted, &archived, &pinned, &c.LastReadID,
			&c.Unread, &c.Members, &c.OthersRead); err != nil {
			return nil, err
		}
		c.Muted, c.Archived, c.Pinned = muted == 1, archived == 1, pinned == 1
		if c.Role == "member" {
			c.InviteCode = "" // only admins can see / share the private link
		}
		list = append(list, &c)
		lastIDs = append(lastIDs, lastID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i, c := range list {
		if c.Type == "direct" {
			peer, err := s.directPeer(c.ID, uid)
			if err != nil {
				return nil, err
			}
			c.Peer = s.public(peer, uid)
			c.Saved = peer.ID == uid
		}
		if lastIDs[i] > 0 {
			if m, err := s.messageByID(lastIDs[i]); err == nil {
				c.LastMessage = m
			}
		}
	}
	return list, nil
}

func (s *Server) directPeer(chatID, uid int64) (*User, error) {
	var peerID int64
	err := s.db.QueryRow(`SELECT user_id FROM chat_members WHERE chat_id=? AND user_id<>? LIMIT 1`, chatID, uid).Scan(&peerID)
	if errors.Is(err, sql.ErrNoRows) {
		peerID = uid // saved messages: a direct chat with yourself
	} else if err != nil {
		return nil, err
	}
	return s.userByID(peerID)
}

func (s *Server) chatView(chatID, uid int64) (*ChatView, error) {
	rows, err := s.db.Query(chatViewQuery+` AND c.id=?`, uid, chatID)
	if err != nil {
		return nil, err
	}
	list, err := s.scanChatViews(rows, uid)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, errNotFound
	}
	return list[0], nil
}

// member returns the chat type and the user's role, or errNotFound when the user is not in the chat.
func (s *Server) member(chatID, uid int64) (string, string, error) {
	var typ, role string
	err := s.db.QueryRow(`SELECT c.type, cm.role FROM chat_members cm JOIN chats c ON c.id=cm.chat_id WHERE cm.chat_id=? AND cm.user_id=?`, chatID, uid).Scan(&typ, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", errNotFound
	}
	return typ, role, err
}

func (s *Server) memberIDs(chatID int64) ([]int64, error) {
	rows, err := s.db.Query(`SELECT user_id FROM chat_members WHERE chat_id=?`, chatID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func isAdminRole(role string) bool { return role == "owner" || role == "admin" }

func (s *Server) handleListChats(w http.ResponseWriter, r *http.Request, u *User) error {
	rows, err := s.db.Query(chatViewQuery+` ORDER BY cm.pinned DESC, c.last_msg_at DESC, c.id DESC`, u.ID)
	if err != nil {
		return err
	}
	list, err := s.scanChatViews(rows, u.ID)
	if err != nil {
		return err
	}
	if list == nil {
		list = []*ChatView{}
	}
	writeJSON(w, 200, list)
	return nil
}

func (s *Server) handleGetChat(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	c, err := s.chatView(id, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, c)
	return nil
}

// ensureDirect returns (creating if needed) the 1:1 chat between a and b.
func (s *Server) ensureDirect(a, b int64) (int64, bool, error) {
	lo, hi := a, b
	if lo > hi {
		lo, hi = hi, lo
	}
	key := fmt.Sprintf("%d:%d", lo, hi)
	var id int64
	err := s.db.QueryRow(`SELECT id FROM chats WHERE direct_key=?`, key).Scan(&id)
	if err == nil {
		return id, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO chats(type, direct_key, created_at, last_msg_at) VALUES('direct',?,?,?)`, key, nowMs(), nowMs())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			tx.Rollback()
			err = s.db.QueryRow(`SELECT id FROM chats WHERE direct_key=?`, key).Scan(&id)
			return id, false, err
		}
		return 0, false, err
	}
	id, _ = res.LastInsertId()
	for _, uid := range uniqueIDs(a, b) {
		if _, err := tx.Exec(`INSERT INTO chat_members(chat_id, user_id, role, joined_at) VALUES(?,?,'member',?)`, id, uid, nowMs()); err != nil {
			return 0, false, err
		}
	}
	return id, true, tx.Commit()
}

func uniqueIDs(ids ...int64) []int64 {
	seen := map[int64]bool{}
	var out []int64
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func (s *Server) handleDirect(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		UserID   int64  `json:"userId"`
		Username string `json:"username"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	var peer *User
	var err error
	if req.UserID > 0 {
		peer, err = s.userByID(req.UserID)
	} else {
		peer, err = s.userByUsername(strings.TrimPrefix(strings.TrimSpace(req.Username), "@"))
	}
	if err != nil {
		return err
	}
	if peer.Deleted || peer.Banned {
		return errf(404, "not_found", "user not found")
	}
	id, created, err := s.ensureDirect(u.ID, peer.ID)
	if err != nil {
		return err
	}
	if created && peer.ID != u.ID {
		s.hub.sendTo(peer.ID, "chat_update", map[string]int64{"chatId": id})
	}
	c, err := s.chatView(id, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, c)
	return nil
}

func (s *Server) userByUsername(name string) (*User, error) {
	u, err := scanUser(s.db.QueryRow(`SELECT `+userCols+` FROM users u WHERE u.username=? AND u.deleted=0`, name))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errf(404, "not_found", "user not found")
	}
	return u, err
}

type roomReq struct {
	Type        string  `json:"type"`
	Title       *string `json:"title"`
	Handle      *string `json:"handle"`
	Description *string `json:"description"`
	Avatar      *string `json:"avatar"`
	Members     []int64 `json:"members"`
}

func (s *Server) validateHandle(handle string, chatID int64) (any, error) {
	handle = strings.TrimPrefix(strings.TrimSpace(handle), "@")
	if handle == "" {
		return nil, nil // NULL = private room
	}
	if err := validateUsername(handle); err != nil {
		return nil, errf(400, "invalid_handle", "public link must be 4-32 characters: English letters, digits and _")
	}
	if s.handleTaken(handle, chatID) {
		return nil, errf(409, "handle_taken", "this public link is already taken")
	}
	return handle, nil
}

func (s *Server) handleCreateRoom(w http.ResponseWriter, r *http.Request, u *User) error {
	if !s.cfg().AllowUserRooms && !u.IsAdmin {
		return errf(403, "forbidden", "creating groups and channels is disabled on this server")
	}
	var req roomReq
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if req.Type != "group" && req.Type != "channel" {
		return errf(400, "bad_request", "type must be group or channel")
	}
	title := ""
	if req.Title != nil {
		title = trimLen(*req.Title, 80)
	}
	if title == "" {
		return errf(400, "bad_request", "title is required")
	}
	var handle any
	if req.Handle != nil {
		var err error
		if handle, err = s.validateHandle(*req.Handle, 0); err != nil {
			return err
		}
	}
	desc, avatar := "", ""
	if req.Description != nil {
		desc = trimLen(*req.Description, 500)
	}
	if req.Avatar != nil && *req.Avatar != "" {
		if !s.ownsMedia(u.ID, *req.Avatar, "image") {
			return errf(400, "bad_request", "invalid avatar")
		}
		avatar = *req.Avatar
	}
	members := uniqueIDs(req.Members...)
	if len(members)+1 > s.cfg().MaxGroupMembers {
		return errf(400, "too_many_members", "too many members")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO chats(type, title, handle, description, avatar, invite_code, owner_id, created_at, last_msg_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		req.Type, title, handle, desc, avatar, randomToken(9), u.ID, nowMs(), nowMs())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return errf(409, "handle_taken", "this public link is already taken")
		}
		return err
	}
	chatID, _ := res.LastInsertId()
	if _, err := tx.Exec(`INSERT INTO chat_members(chat_id,user_id,role,joined_at) VALUES(?,?,'owner',?)`, chatID, u.ID, nowMs()); err != nil {
		return err
	}
	for _, m := range members {
		if m == u.ID {
			continue
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO chat_members(chat_id,user_id,role,joined_at) SELECT ?, id, 'member', ? FROM users WHERE id=? AND deleted=0`, chatID, nowMs(), m); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.systemMessage(chatID, u.ID, "created")
	for _, m := range members {
		if m != u.ID {
			s.hub.sendTo(m, "chat_update", map[string]int64{"chatId": chatID})
		}
	}
	c, err := s.chatView(chatID, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 201, c)
	return nil
}

func (s *Server) handleUpdateRoom(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	if typ == "direct" || !isAdminRole(role) {
		return errForbidden
	}
	var req struct {
		roomReq
		ResetInvite bool `json:"resetInvite"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if req.Title != nil {
		t := trimLen(*req.Title, 80)
		if t == "" {
			return errf(400, "bad_request", "title is required")
		}
		if _, err := s.db.Exec(`UPDATE chats SET title=? WHERE id=?`, t, id); err != nil {
			return err
		}
	}
	if req.Description != nil {
		if _, err := s.db.Exec(`UPDATE chats SET description=? WHERE id=?`, trimLen(*req.Description, 500), id); err != nil {
			return err
		}
	}
	if req.Avatar != nil {
		if *req.Avatar != "" && !s.ownsMedia(u.ID, *req.Avatar, "image") {
			return errf(400, "bad_request", "invalid avatar")
		}
		if _, err := s.db.Exec(`UPDATE chats SET avatar=? WHERE id=?`, *req.Avatar, id); err != nil {
			return err
		}
	}
	if req.Handle != nil {
		h, err := s.validateHandle(*req.Handle, id)
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(`UPDATE chats SET handle=? WHERE id=?`, h, id); err != nil {
			if strings.Contains(err.Error(), "UNIQUE") {
				return errf(409, "handle_taken", "this public link is already taken")
			}
			return err
		}
	}
	if req.ResetInvite {
		if _, err := s.db.Exec(`UPDATE chats SET invite_code=? WHERE id=?`, randomToken(9), id); err != nil {
			return err
		}
	}
	s.notifyChatUpdate(id)
	c, err := s.chatView(id, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, c)
	return nil
}

func (s *Server) notifyChatUpdate(chatID int64) {
	ids, _ := s.memberIDs(chatID)
	s.hub.sendToMany(ids, "chat_update", map[string]int64{"chatId": chatID})
}

func (s *Server) deleteChat(chatID int64) error {
	ids, _ := s.memberIDs(chatID)
	if _, err := s.db.Exec(`DELETE FROM chats WHERE id=?`, chatID); err != nil {
		return err
	}
	s.hub.sendToMany(ids, "chat_removed", map[string]int64{"chatId": chatID})
	return nil
}

func (s *Server) handleDeleteRoom(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	if typ != "direct" && role != "owner" {
		return errForbidden
	}
	if typ == "direct" {
		// Deleting a 1:1 chat removes its history for both sides, like Telegram's "delete for both".
		if _, err := s.db.Exec(`DELETE FROM messages WHERE chat_id=?`, id); err != nil {
			return err
		}
	}
	if err := s.deleteChat(id); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

type MemberView struct {
	User     *User  `json:"user"`
	Role     string `json:"role"`
	JoinedAt int64  `json:"joinedAt"`
}

func (s *Server) handleMembers(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	if typ == "channel" && !isAdminRole(role) {
		return errForbidden
	}
	rows, err := s.db.Query(`SELECT `+userCols+`, cm.role, cm.joined_at FROM chat_members cm JOIN users u ON u.id=cm.user_id
		WHERE cm.chat_id=? ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at LIMIT 5000`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	list := []MemberView{}
	for rows.Next() {
		var m MemberView
		var uu User
		var admin, banned, deleted, hide int
		if err := rows.Scan(&uu.ID, &uu.Username, &uu.DisplayName, &uu.Bio, &uu.Avatar, &admin, &banned, &deleted, &hide, &uu.LastSeen, &uu.CreatedAt, &m.Role, &m.JoinedAt); err != nil {
			return err
		}
		uu.HideLastSeen, uu.Deleted = hide == 1, deleted == 1
		m.User = s.public(&uu, u.ID)
		list = append(list, m)
	}
	writeJSON(w, 200, list)
	return rows.Err()
}

func (s *Server) memberCount(chatID int64) int {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM chat_members WHERE chat_id=?`, chatID).Scan(&n)
	return n
}

func (s *Server) addMember(chatID, actorID, uid int64) error {
	if s.memberCount(chatID) >= s.cfg().MaxGroupMembers {
		return errf(400, "too_many_members", "this room is full")
	}
	res, err := s.db.Exec(`INSERT OR IGNORE INTO chat_members(chat_id,user_id,role,joined_at) VALUES(?,?,'member',?)`, chatID, uid, nowMs())
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errf(409, "already_member", "already a member")
	}
	var typ string
	s.db.QueryRow(`SELECT type FROM chats WHERE id=?`, chatID).Scan(&typ)
	if typ == "channel" {
		// Channels don't announce subscribers, like Telegram.
	} else if actorID == uid {
		s.systemMessage(chatID, uid, "joined")
	} else {
		s.systemMessage(chatID, actorID, fmt.Sprintf("added:%d", uid))
	}
	s.hub.sendTo(uid, "chat_update", map[string]int64{"chatId": chatID})
	return nil
}

func (s *Server) handleAddMember(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	if typ == "direct" || (typ == "channel" && !isAdminRole(role)) {
		return errForbidden
	}
	var req struct {
		Username string `json:"username"`
		UserID   int64  `json:"userId"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	var target *User
	if req.UserID > 0 {
		target, err = s.userByID(req.UserID)
	} else {
		target, err = s.userByUsername(strings.TrimPrefix(strings.TrimSpace(req.Username), "@"))
	}
	if err != nil {
		return err
	}
	if target.Deleted || target.Banned {
		return errf(404, "not_found", "user not found")
	}
	if err := s.addMember(id, u.ID, target.ID); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleUpdateMember(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	uid, err := pathID(r, "uid")
	if err != nil {
		return err
	}
	_, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	if role != "owner" {
		return errForbidden
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if req.Role != "admin" && req.Role != "member" {
		return errf(400, "bad_request", "role must be admin or member")
	}
	if uid == u.ID {
		return errf(400, "bad_request", "the owner's role cannot be changed")
	}
	res, err := s.db.Exec(`UPDATE chat_members SET role=? WHERE chat_id=? AND user_id=? AND role<>'owner'`, req.Role, id, uid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	s.hub.sendTo(uid, "chat_update", map[string]int64{"chatId": id})
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	uid, err := pathID(r, "uid")
	if err != nil {
		return err
	}
	if uid == u.ID {
		return s.leave(w, id, u)
	}
	_, role, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	_, targetRole, err := s.member(id, uid)
	if err != nil {
		return err
	}
	if !isAdminRole(role) || targetRole == "owner" || (targetRole == "admin" && role != "owner") {
		return errForbidden
	}
	if _, err := s.db.Exec(`DELETE FROM chat_members WHERE chat_id=? AND user_id=?`, id, uid); err != nil {
		return err
	}
	s.systemMessage(id, u.ID, fmt.Sprintf("removed:%d", uid))
	s.hub.sendTo(uid, "chat_removed", map[string]int64{"chatId": id})
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleLeave(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	return s.leave(w, id, u)
}

func (s *Server) leave(w http.ResponseWriter, chatID int64, u *User) error {
	typ, role, err := s.member(chatID, u.ID)
	if err != nil {
		return err
	}
	if typ == "direct" {
		return errf(400, "bad_request", "use delete for private chats")
	}
	if role == "owner" {
		// Hand the room to the longest-serving admin, then to the oldest member.
		var next int64
		err := s.db.QueryRow(`SELECT user_id FROM chat_members WHERE chat_id=? AND user_id<>? ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at LIMIT 1`, chatID, u.ID).Scan(&next)
		if errors.Is(err, sql.ErrNoRows) {
			if err := s.deleteChat(chatID); err != nil {
				return err
			}
			writeJSON(w, 200, map[string]bool{"ok": true})
			return nil
		}
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(`UPDATE chat_members SET role='owner' WHERE chat_id=? AND user_id=?`, chatID, next); err != nil {
			return err
		}
		s.db.Exec(`UPDATE chats SET owner_id=? WHERE id=?`, next, chatID)
	}
	if _, err := s.db.Exec(`DELETE FROM chat_members WHERE chat_id=? AND user_id=?`, chatID, u.ID); err != nil {
		return err
	}
	if typ == "group" {
		s.systemMessage(chatID, u.ID, "left")
	}
	s.notifyChatUpdate(chatID)
	s.hub.sendTo(u.ID, "chat_removed", map[string]int64{"chatId": chatID})
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleJoinPublic(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var handle sql.NullString
	if err := s.db.QueryRow(`SELECT handle FROM chats WHERE id=? AND type<>'direct'`, id).Scan(&handle); err != nil {
		return errNotFound
	}
	if !handle.Valid {
		return errForbidden
	}
	if err := s.addMember(id, u.ID, u.ID); err != nil {
		return err
	}
	c, err := s.chatView(id, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, c)
	return nil
}

type roomPreview struct {
	ID          int64  `json:"id"`
	Type        string `json:"type"`
	Title       string `json:"title"`
	Handle      string `json:"handle"`
	Description string `json:"description"`
	Avatar      string `json:"avatar"`
	Members     int    `json:"memberCount"`
	IsMember    bool   `json:"isMember"`
}

func (s *Server) previewByInvite(code string, uid int64) (*roomPreview, error) {
	var p roomPreview
	err := s.db.QueryRow(`SELECT id, type, title, COALESCE(handle,''), description, avatar FROM chats WHERE invite_code=? AND type<>'direct'`, code).
		Scan(&p.ID, &p.Type, &p.Title, &p.Handle, &p.Description, &p.Avatar)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errf(404, "not_found", "this invite link is invalid or has been reset")
	}
	if err != nil {
		return nil, err
	}
	p.Members = s.memberCount(p.ID)
	_, _, merr := s.member(p.ID, uid)
	p.IsMember = merr == nil
	return &p, nil
}

func (s *Server) handleInvitePreview(w http.ResponseWriter, r *http.Request, u *User) error {
	p, err := s.previewByInvite(r.PathValue("code"), u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, p)
	return nil
}

func (s *Server) handleInviteJoin(w http.ResponseWriter, r *http.Request, u *User) error {
	p, err := s.previewByInvite(r.PathValue("code"), u.ID)
	if err != nil {
		return err
	}
	if !p.IsMember {
		if err := s.addMember(p.ID, u.ID, u.ID); err != nil {
			return err
		}
	}
	c, err := s.chatView(p.ID, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, c)
	return nil
}

func (s *Server) handleRead(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	typ, _, err := s.member(id, u.ID)
	if err != nil {
		return err
	}
	var req struct {
		MessageID int64 `json:"messageId"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	res, err := s.db.Exec(`UPDATE chat_members SET last_read_id=? WHERE chat_id=? AND user_id=? AND last_read_id<?
		AND ? <= (SELECT COALESCE(MAX(id),0) FROM messages WHERE chat_id=?)`, req.MessageID, id, u.ID, req.MessageID, req.MessageID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		ev := map[string]int64{"chatId": id, "userId": u.ID, "messageId": req.MessageID}
		if typ == "channel" {
			s.hub.sendTo(u.ID, "read", ev) // sync my other devices only
		} else {
			ids, _ := s.memberIDs(id)
			s.hub.sendToMany(ids, "read", ev)
		}
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handlePrefs(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if _, _, err := s.member(id, u.ID); err != nil {
		return err
	}
	var req struct {
		Muted    *bool `json:"muted"`
		Archived *bool `json:"archived"`
		Pinned   *bool `json:"pinned"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	set := func(col string, v *bool) error {
		if v == nil {
			return nil
		}
		_, err := s.db.Exec(`UPDATE chat_members SET `+col+`=? WHERE chat_id=? AND user_id=?`, boolInt(*v), id, u.ID)
		return err
	}
	if err := set("muted", req.Muted); err != nil {
		return err
	}
	if err := set("archived", req.Archived); err != nil {
		return err
	}
	if err := set("pinned", req.Pinned); err != nil {
		return err
	}
	s.hub.sendTo(u.ID, "chat_update", map[string]int64{"chatId": id})
	c, err := s.chatView(id, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, 200, c)
	return nil
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request, u *User) error {
	q := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("q")), "@")
	out := map[string]any{"users": []*User{}, "rooms": []roomPreview{}}
	if len([]rune(q)) < 2 {
		writeJSON(w, 200, out)
		return nil
	}
	like := strings.NewReplacer("%", `\%`, "_", `\_`, `\`, `\\`).Replace(q)
	rows, err := s.db.Query(`SELECT `+userCols+` FROM users u WHERE u.deleted=0 AND u.banned=0 AND
		(u.username LIKE ? ESCAPE '\' OR u.display_name LIKE ? ESCAPE '\')
		ORDER BY CASE WHEN u.username=? THEN 0 WHEN u.username LIKE ? ESCAPE '\' THEN 1 ELSE 2 END, u.username LIMIT 20`,
		like+"%", "%"+like+"%", q, like+"%")
	if err != nil {
		return err
	}
	users := []*User{}
	for rows.Next() {
		uu, err := scanUser(rows)
		if err != nil {
			rows.Close()
			return err
		}
		users = append(users, s.public(uu, u.ID))
	}
	rows.Close()
	out["users"] = users

	rrows, err := s.db.Query(`SELECT c.id, c.type, c.title, c.handle, c.description, c.avatar,
		(SELECT COUNT(*) FROM chat_members x WHERE x.chat_id=c.id),
		EXISTS(SELECT 1 FROM chat_members x WHERE x.chat_id=c.id AND x.user_id=?)
		FROM chats c WHERE c.handle IS NOT NULL AND (c.handle LIKE ? ESCAPE '\' OR c.title LIKE ? ESCAPE '\')
		ORDER BY 7 DESC LIMIT 20`, u.ID, like+"%", "%"+like+"%")
	if err != nil {
		return err
	}
	defer rrows.Close()
	rooms := []roomPreview{}
	for rrows.Next() {
		var p roomPreview
		var member int
		if err := rrows.Scan(&p.ID, &p.Type, &p.Title, &p.Handle, &p.Description, &p.Avatar, &p.Members, &member); err != nil {
			return err
		}
		p.IsMember = member == 1
		rooms = append(rooms, p)
	}
	out["rooms"] = rooms
	writeJSON(w, 200, out)
	return rrows.Err()
}

func (s *Server) handleGetUser(w http.ResponseWriter, r *http.Request, u *User) error {
	var target *User
	var err error
	if name := r.URL.Query().Get("username"); name != "" {
		target, err = s.userByUsername(strings.TrimPrefix(name, "@"))
	} else {
		var id int64
		if id, err = pathID(r, "id"); err == nil {
			target, err = s.userByID(id)
		}
	}
	if err != nil {
		return err
	}
	writeJSON(w, 200, s.public(target, u.ID))
	return nil
}

// handleContacts lists people the user talks to 1:1, online first — the "recently online" strip.
func (s *Server) handleContacts(w http.ResponseWriter, r *http.Request, u *User) error {
	rows, err := s.db.Query(`SELECT `+userCols+` FROM users u WHERE u.id<>? AND u.deleted=0 AND u.id IN (
		SELECT other.user_id FROM chat_members me
		JOIN chats c ON c.id=me.chat_id AND c.type='direct'
		JOIN chat_members other ON other.chat_id=me.chat_id AND other.user_id<>me.user_id
		WHERE me.user_id=?) ORDER BY u.last_seen DESC LIMIT 60`, u.ID, u.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	online, offline := []*User{}, []*User{}
	for rows.Next() {
		uu, err := scanUser(rows)
		if err != nil {
			return err
		}
		p := s.public(uu, u.ID)
		if p.Online {
			online = append(online, p)
		} else {
			offline = append(offline, p)
		}
	}
	writeJSON(w, 200, append(online, offline...))
	return rows.Err()
}

// contactIDs returns everyone who should see this user's presence changes.
func (s *Server) contactIDs(uid int64) []int64 {
	rows, err := s.db.Query(`SELECT DISTINCT other.user_id FROM chat_members me
		JOIN chats c ON c.id=me.chat_id AND c.type IN ('direct','group')
		JOIN chat_members other ON other.chat_id=me.chat_id AND other.user_id<>me.user_id
		WHERE me.user_id=? LIMIT 5000`, uid)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Server) broadcastUserUpdate(u *User) {
	ids := append(s.contactIDs(u.ID), u.ID)
	for _, id := range ids {
		s.hub.sendTo(id, "user_update", s.public(u, id))
	}
}
