package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func (s *Server) tlsModeName() string {
	if s.tlsm == nil {
		return "off"
	}
	return s.tlsm.status()["mode"].(string)
}

// The admin panel manages infrastructure only: it never exposes message contents.

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request, u *User) error {
	out := map[string]any{}
	count := func(key, q string, args ...any) {
		var n int64
		s.db.QueryRow(q, args...).Scan(&n)
		out[key] = n
	}
	dayAgo := time.Now().Add(-24 * time.Hour).UnixMilli()
	count("users", `SELECT COUNT(*) FROM users WHERE deleted=0`)
	count("bannedUsers", `SELECT COUNT(*) FROM users WHERE banned=1 AND deleted=0`)
	count("newUsers24h", `SELECT COUNT(*) FROM users WHERE created_at>? AND deleted=0`, dayAgo)
	count("active24h", `SELECT COUNT(*) FROM users WHERE last_seen>? AND deleted=0`, dayAgo)
	count("messages", `SELECT COUNT(*) FROM messages`)
	count("messages24h", `SELECT COUNT(*) FROM messages WHERE created_at>?`, dayAgo)
	count("directChats", `SELECT COUNT(*) FROM chats WHERE type='direct'`)
	count("groups", `SELECT COUNT(*) FROM chats WHERE type='group'`)
	count("channels", `SELECT COUNT(*) FROM chats WHERE type='channel'`)
	count("mediaFiles", `SELECT COUNT(*) FROM media`)
	count("mediaBytes", `SELECT COALESCE(SUM(size),0) FROM media`)
	count("calls24h", `SELECT COUNT(*) FROM calls WHERE started_at>?`, dayAgo)
	count("adClicks", `SELECT COALESCE(SUM(clicks),0) FROM ads`)
	count("adImpressions", `SELECT COALESCE(SUM(impressions),0) FROM ads`)
	out["online"] = s.hub.onlineCount()
	out["activeCalls"] = s.calls.activeCount()
	if fi, err := os.Stat(filepath.Join(s.opts.DataDir, "neochat.db")); err == nil {
		out["dbBytes"] = fi.Size()
	}

	// 14-day series for the dashboard charts (local server time).
	type point struct {
		Day      string `json:"day"`
		Messages int64  `json:"messages"`
		Signups  int64  `json:"signups"`
	}
	series := make([]point, 14)
	today := time.Now().Truncate(24 * time.Hour)
	for i := 0; i < 14; i++ {
		start := today.AddDate(0, 0, i-13)
		end := start.AddDate(0, 0, 1)
		series[i].Day = start.Format("2006-01-02")
		s.db.QueryRow(`SELECT COUNT(*) FROM messages WHERE created_at>=? AND created_at<?`, start.UnixMilli(), end.UnixMilli()).Scan(&series[i].Messages)
		s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE created_at>=? AND created_at<?`, start.UnixMilli(), end.UnixMilli()).Scan(&series[i].Signups)
	}
	out["series"] = series
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request, u *User) error {
	q := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("q")), "@")
	page := queryInt(r, "page", 1, 1, 100000)
	const per = 30
	like := "%" + strings.NewReplacer("%", `\%`, "_", `\_`).Replace(q) + "%"
	filter := r.URL.Query().Get("filter")
	where := `u.deleted=0 AND (u.username LIKE ? ESCAPE '\' OR u.display_name LIKE ? ESCAPE '\')`
	switch filter {
	case "admins":
		where += ` AND u.is_admin=1`
	case "banned":
		where += ` AND u.banned=1`
	case "online":
		where += ` AND u.last_seen>` + fmt.Sprint(time.Now().Add(-5*time.Minute).UnixMilli())
	}
	var total int
	s.db.QueryRow(`SELECT COUNT(*) FROM users u WHERE `+where, like, like).Scan(&total)
	rows, err := s.db.Query(`SELECT `+userCols+`, (SELECT COUNT(*) FROM messages m WHERE m.sender_id=u.id) FROM users u WHERE `+where+` ORDER BY u.id DESC LIMIT ? OFFSET ?`,
		like, like, per, (page-1)*per)
	if err != nil {
		return err
	}
	defer rows.Close()
	type row struct {
		*User
		Messages int64 `json:"messages"`
	}
	list := []row{}
	for rows.Next() {
		var x User
		var admin, banned, deleted, hide int
		var msgs int64
		if err := rows.Scan(&x.ID, &x.Username, &x.DisplayName, &x.Bio, &x.Avatar, &admin, &banned, &deleted, &hide, &x.LastSeen, &x.CreatedAt, &msgs); err != nil {
			return err
		}
		x.IsAdmin, x.Banned, x.HideLastSeen = admin == 1, banned == 1, hide == 1
		x.Online = s.hub.online(x.ID)
		list = append(list, row{&x, msgs})
	}
	writeJSON(w, 200, map[string]any{"users": list, "total": total, "page": page, "perPage": per})
	return rows.Err()
}

func (s *Server) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	target, err := s.userByID(id)
	if err != nil {
		return err
	}
	var req struct {
		Banned      *bool   `json:"banned"`
		IsAdmin     *bool   `json:"isAdmin"`
		Password    *string `json:"password"`
		DisplayName *string `json:"displayName"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if target.ID == u.ID && ((req.Banned != nil && *req.Banned) || (req.IsAdmin != nil && !*req.IsAdmin)) {
		return errf(400, "bad_request", "you cannot ban or demote yourself")
	}
	if req.Banned != nil {
		if _, err := s.db.Exec(`UPDATE users SET banned=? WHERE id=?`, boolInt(*req.Banned), id); err != nil {
			return err
		}
		if *req.Banned {
			s.db.Exec(`DELETE FROM sessions WHERE user_id=?`, id)
			s.hub.disconnectUser(id)
		}
	}
	if req.IsAdmin != nil {
		if _, err := s.db.Exec(`UPDATE users SET is_admin=? WHERE id=?`, boolInt(*req.IsAdmin), id); err != nil {
			return err
		}
	}
	if req.DisplayName != nil {
		if name := trimLen(*req.DisplayName, 64); name != "" {
			s.db.Exec(`UPDATE users SET display_name=? WHERE id=?`, name, id)
		}
	}
	if req.Password != nil {
		if err := s.validatePassword(*req.Password); err != nil {
			return err
		}
		hash, err := hashPassword(*req.Password)
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(`UPDATE users SET password_hash=? WHERE id=?`, hash, id); err != nil {
			return err
		}
		s.db.Exec(`DELETE FROM sessions WHERE user_id=?`, id)
		s.hub.disconnectUser(id)
	}
	target, _ = s.userByID(id)
	writeJSON(w, 200, target)
	return nil
}

// handleAdminDeleteUser anonymizes the account: messages stay so chats remain coherent.
func (s *Server) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if id == u.ID {
		return errf(400, "bad_request", "you cannot delete yourself")
	}
	hash, _ := hashPassword(randomToken(24))
	_, err = s.db.Exec(`UPDATE users SET deleted=1, banned=1, is_admin=0, username=?, display_name='Deleted Account', bio='', avatar='', password_hash=? WHERE id=?`,
		fmt.Sprintf("deleted_%d_%s", id, randomHex(3)), hash, id)
	if err != nil {
		return err
	}
	s.db.Exec(`DELETE FROM sessions WHERE user_id=?`, id)
	s.db.Exec(`DELETE FROM chat_members WHERE user_id=? AND chat_id IN (SELECT id FROM chats WHERE type<>'direct')`, id)
	s.hub.disconnectUser(id)
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleAdminRooms(w http.ResponseWriter, r *http.Request, u *User) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	like := "%" + strings.NewReplacer("%", `\%`, "_", `\_`).Replace(strings.TrimPrefix(q, "@")) + "%"
	rows, err := s.db.Query(`SELECT c.id, c.type, c.title, COALESCE(c.handle,''), c.avatar, c.created_at, c.last_msg_at,
		(SELECT COUNT(*) FROM chat_members x WHERE x.chat_id=c.id),
		(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id),
		COALESCE((SELECT username FROM users WHERE id=c.owner_id),'')
		FROM chats c WHERE c.type<>'direct' AND (c.title LIKE ? ESCAPE '\' OR COALESCE(c.handle,'') LIKE ? ESCAPE '\')
		ORDER BY 8 DESC LIMIT 300`, like, like)
	if err != nil {
		return err
	}
	defer rows.Close()
	type room struct {
		ID        int64  `json:"id"`
		Type      string `json:"type"`
		Title     string `json:"title"`
		Handle    string `json:"handle"`
		Avatar    string `json:"avatar"`
		CreatedAt int64  `json:"createdAt"`
		LastMsgAt int64  `json:"lastMessageAt"`
		Members   int64  `json:"memberCount"`
		Messages  int64  `json:"messageCount"`
		Owner     string `json:"owner"`
	}
	list := []room{}
	for rows.Next() {
		var x room
		if err := rows.Scan(&x.ID, &x.Type, &x.Title, &x.Handle, &x.Avatar, &x.CreatedAt, &x.LastMsgAt, &x.Members, &x.Messages, &x.Owner); err != nil {
			return err
		}
		list = append(list, x)
	}
	writeJSON(w, 200, list)
	return rows.Err()
}

func (s *Server) handleAdminDeleteRoom(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if err := s.deleteChat(id); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleAdminGetSettings(w http.ResponseWriter, r *http.Request, u *User) error {
	writeJSON(w, 200, s.cfg())
	return nil
}

func (s *Server) handleAdminSaveSettings(w http.ResponseWriter, r *http.Request, u *User) error {
	st := s.cfg()
	if err := readJSON(r, &st); err != nil {
		return err
	}
	for _, id := range []string{st.LogoMedia, st.BackgroundMedia} {
		if id != "" {
			if m, err := s.mediaByID(id); err != nil || m.Kind != "image" {
				return errf(400, "bad_request", "branding images must be uploaded images")
			}
		}
	}
	if err := s.saveSettings(st); err != nil {
		return err
	}
	go s.applyTURN()
	s.hub.broadcast("config", s.publicConfig())
	writeJSON(w, 200, s.cfg())
	return nil
}

func (s *Server) handleAdminInvites(w http.ResponseWriter, r *http.Request, u *User) error {
	rows, err := s.db.Query(`SELECT code, note, uses, max_uses, expires_at, created_at FROM invites ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type inv struct {
		Code      string `json:"code"`
		Note      string `json:"note"`
		Uses      int    `json:"uses"`
		MaxUses   int    `json:"maxUses"`
		ExpiresAt int64  `json:"expiresAt"`
		CreatedAt int64  `json:"createdAt"`
	}
	list := []inv{}
	for rows.Next() {
		var x inv
		if err := rows.Scan(&x.Code, &x.Note, &x.Uses, &x.MaxUses, &x.ExpiresAt, &x.CreatedAt); err != nil {
			return err
		}
		list = append(list, x)
	}
	writeJSON(w, 200, list)
	return rows.Err()
}

func (s *Server) handleAdminCreateInvite(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		Note      string `json:"note"`
		MaxUses   int    `json:"maxUses"`
		ExpiresIn int    `json:"expiresInDays"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if req.MaxUses < 0 {
		req.MaxUses = 0
	}
	var exp int64
	if req.ExpiresIn > 0 {
		exp = time.Now().AddDate(0, 0, req.ExpiresIn).UnixMilli()
	}
	code := strings.ToUpper(randomHex(5))
	if _, err := s.db.Exec(`INSERT INTO invites(code, note, created_by, max_uses, expires_at, created_at) VALUES(?,?,?,?,?,?)`,
		code, trimLen(req.Note, 100), u.ID, req.MaxUses, exp, nowMs()); err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"code": code})
	return nil
}

func (s *Server) handleAdminDeleteInvite(w http.ResponseWriter, r *http.Request, u *User) error {
	if _, err := s.db.Exec(`DELETE FROM invites WHERE code=?`, r.PathValue("code")); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

// handleAdminBackup streams a consistent snapshot of the database (VACUUM INTO never blocks writers for long).
func (s *Server) handleAdminBackup(w http.ResponseWriter, r *http.Request, u *User) error {
	tmp := filepath.Join(s.opts.DataDir, fmt.Sprintf("backup-%d.db", time.Now().UnixNano()))
	defer os.Remove(tmp)
	if _, err := s.db.Exec(`VACUUM INTO ?`, tmp); err != nil {
		return err
	}
	f, err := os.Open(tmp)
	if err != nil {
		return err
	}
	defer f.Close()
	name := fmt.Sprintf("neochat-backup-%s.db", time.Now().Format("20060102-1504"))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	_, err = io.Copy(w, f)
	return err
}

func (s *Server) handleAdminSystem(w http.ResponseWriter, r *http.Request, u *User) error {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	st := s.cfg()
	relay := st.TurnPublicIP
	if relay == "" {
		relay = s.opts.PublicIP
	}
	if relay == "" {
		relay = detectLocalIP()
	}
	writeJSON(w, 200, map[string]any{
		"version":    version,
		"goVersion":  runtime.Version(),
		"os":         runtime.GOOS + "/" + runtime.GOARCH,
		"uptimeSec":  int64(time.Since(s.started).Seconds()),
		"memoryMB":   mem.Alloc >> 20,
		"goroutines": runtime.NumGoroutine(),
		"dataDir":    s.opts.DataDir,
		"listen":     s.opts.Addr,
		"tls":        s.tlsModeName(),
		"turn":       s.turn.status(),
		"relayIP":    relay,
		"localIP":    detectLocalIP(),
	})
	return nil
}
