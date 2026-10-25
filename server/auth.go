package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID             int64  `json:"id"`
	Username       string `json:"username"`
	DisplayName    string `json:"displayName"`
	Bio            string `json:"bio"`
	Avatar         string `json:"avatar"`
	IsAdmin        bool   `json:"isAdmin,omitempty"`
	Banned         bool   `json:"banned,omitempty"`
	Deleted        bool   `json:"deleted,omitempty"`
	HideLastSeen   bool   `json:"hideLastSeen,omitempty"`
	LastSeen       int64  `json:"lastSeen"`
	LastSeenHidden bool   `json:"lastSeenHidden,omitempty"`
	Online         bool   `json:"online"`
	CreatedAt      int64  `json:"createdAt"`
}

const userCols = `u.id, u.username, u.display_name, u.bio, u.avatar, u.is_admin, u.banned, u.deleted, u.hide_last_seen, u.last_seen, u.created_at`

type scanner interface{ Scan(dest ...any) error }

func scanUser(sc scanner) (*User, error) {
	var u User
	var admin, banned, deleted, hide int
	if err := sc.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Bio, &u.Avatar, &admin, &banned, &deleted, &hide, &u.LastSeen, &u.CreatedAt); err != nil {
		return nil, err
	}
	u.IsAdmin, u.Banned, u.Deleted, u.HideLastSeen = admin == 1, banned == 1, deleted == 1, hide == 1
	return &u, nil
}

func (s *Server) userByID(id int64) (*User, error) {
	u, err := scanUser(s.db.QueryRow(`SELECT `+userCols+` FROM users u WHERE u.id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errNotFound
	}
	return u, err
}

// public returns the view of u that viewer is allowed to see.
func (s *Server) public(u *User, viewerID int64) *User {
	c := *u
	c.Online = s.hub.online(u.ID)
	if u.ID != viewerID {
		c.IsAdmin, c.Banned, c.HideLastSeen = false, false, false
		if u.HideLastSeen {
			c.LastSeen, c.LastSeenHidden = 0, true
			// "online" itself stays visible, like Telegram's "last seen recently".
		}
	}
	return &c
}

var usernameRe = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_]{3,31}$`)

var reservedNames = map[string]bool{"admin": false, "api": true, "media": true, "join": true, "support": false, "system": true, "root": true, "go": true}

// handleTaken reports whether a username / public room handle is already used (they share one namespace).
func (s *Server) handleTaken(name string, exceptChat int64) bool {
	var n int
	s.db.QueryRow(`SELECT (SELECT COUNT(*) FROM users WHERE username=?) + (SELECT COUNT(*) FROM chats WHERE handle=? AND id<>?)`, name, name, exceptChat).Scan(&n)
	return n > 0
}

func validateUsername(name string) error {
	if !usernameRe.MatchString(name) {
		return errf(400, "invalid_username", "username must be 4-32 characters: English letters, digits and _ and start with a letter")
	}
	if reservedNames[strings.ToLower(name)] {
		return errf(400, "invalid_username", "this username is reserved")
	}
	return nil
}

func (s *Server) validatePassword(pw string) error {
	if len([]rune(pw)) < s.cfg().MinPasswordLen {
		return errf(400, "weak_password", "password is too short")
	}
	if len(pw) > 72 {
		return errf(400, "weak_password", "password is too long (max 72 bytes)")
	}
	return nil
}

func hashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), 11)
	return string(h), err
}

type authReq struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
	Invite      string `json:"invite"`
	AppName     string `json:"appName"`
}

func (s *Server) createUser(req authReq, admin bool) (*User, error) {
	req.Username = strings.TrimSpace(req.Username)
	if err := validateUsername(req.Username); err != nil {
		return nil, err
	}
	if err := s.validatePassword(req.Password); err != nil {
		return nil, err
	}
	req.DisplayName = trimLen(req.DisplayName, 64)
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	if s.handleTaken(req.Username, 0) {
		return nil, errf(409, "username_taken", "this username is already taken")
	}
	hash, err := hashPassword(req.Password)
	if err != nil {
		return nil, err
	}
	res, err := s.db.Exec(`INSERT INTO users(username, display_name, password_hash, is_admin, created_at, last_seen) VALUES(?,?,?,?,?,?)`,
		req.Username, req.DisplayName, hash, boolInt(admin), nowMs(), nowMs())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, errf(409, "username_taken", "this username is already taken")
		}
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.userByID(id)
}

func (s *Server) newSession(w http.ResponseWriter, r *http.Request, u *User) error {
	token := randomToken(32)
	_, err := s.db.Exec(`INSERT INTO sessions(token_hash, user_id, user_agent, ip, created_at, last_used) VALUES(?,?,?,?,?,?)`,
		sha256Hex(token), u.ID, trimLen(r.UserAgent(), 200), clientIP(r), nowMs(), nowMs())
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]any{"token": token, "user": u})
	return nil
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) error {
	s.setupMu.Lock()
	defer s.setupMu.Unlock()
	if !s.setupRequired() {
		return errf(409, "already_setup", "setup has already been completed")
	}
	var req authReq
	if err := readJSON(r, &req); err != nil {
		return err
	}
	u, err := s.createUser(req, true)
	if err != nil {
		return err
	}
	if name := trimLen(req.AppName, 40); name != "" {
		st := s.cfg()
		st.AppName = name
		if err := s.saveSettings(st); err != nil {
			return err
		}
	}
	return s.newSession(w, r, u)
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) error {
	if !s.limiter.allow("register:"+clientIP(r), 10, time.Hour) {
		return errf(429, "rate_limited", "too many attempts, try again later")
	}
	var req authReq
	if err := readJSON(r, &req); err != nil {
		return err
	}
	st := s.cfg()
	if s.setupRequired() {
		return errf(409, "setup_required", "the server has not been set up yet")
	}
	switch st.Registration {
	case "closed":
		return errf(403, "registration_closed", "registration is closed on this server")
	case "invite":
		if err := s.consumeInvite(strings.TrimSpace(req.Invite)); err != nil {
			return err
		}
	}
	u, err := s.createUser(req, false)
	if err != nil {
		return err
	}
	return s.newSession(w, r, u)
}

func (s *Server) consumeInvite(code string) error {
	if code == "" {
		return errf(403, "invite_required", "an invite code is required")
	}
	res, err := s.db.Exec(`UPDATE invites SET uses=uses+1 WHERE code=? AND (max_uses=0 OR uses<max_uses) AND (expires_at=0 OR expires_at>?)`, code, nowMs())
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errf(403, "invalid_invite", "invite code is invalid or expired")
	}
	return nil
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) error {
	var req authReq
	if err := readJSON(r, &req); err != nil {
		return err
	}
	key := "login:" + clientIP(r) + ":" + strings.ToLower(req.Username)
	if !s.limiter.allow(key, 8, 15*time.Minute) || !s.limiter.allow("loginip:"+clientIP(r), 40, 15*time.Minute) {
		return errf(429, "rate_limited", "too many login attempts, try again in a few minutes")
	}
	var hash string
	var id int64
	err := s.db.QueryRow(`SELECT id, password_hash FROM users WHERE username=? AND deleted=0`, strings.TrimSpace(req.Username)).Scan(&id, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		// Spend comparable time so usernames cannot be enumerated by timing.
		bcrypt.CompareHashAndPassword(s.dummyHash, []byte(req.Password))
		return errf(401, "invalid_credentials", "username or password is incorrect")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		return errf(401, "invalid_credentials", "username or password is incorrect")
	}
	u, err := s.userByID(id)
	if err != nil {
		return err
	}
	if u.Banned {
		return errf(403, "banned", "this account has been suspended")
	}
	s.limiter.reset(key)
	return s.newSession(w, r, u)
}

type ctxKey int

const (
	ctxUser ctxKey = iota
	ctxSession
)

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

// authenticate resolves a session token to its user. It returns errUnauthorized for anything invalid.
func (s *Server) authenticate(token string) (*User, int64, error) {
	if token == "" {
		return nil, 0, errUnauthorized
	}
	var sid, uid, lastUsed int64
	err := s.db.QueryRow(`SELECT id, user_id, last_used FROM sessions WHERE token_hash=?`, sha256Hex(token)).Scan(&sid, &uid, &lastUsed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, errUnauthorized
	}
	if err != nil {
		return nil, 0, err
	}
	maxIdle := time.Duration(s.cfg().SessionDays) * 24 * time.Hour
	if time.Since(time.UnixMilli(lastUsed)) > maxIdle {
		s.db.Exec(`DELETE FROM sessions WHERE id=?`, sid)
		return nil, 0, errUnauthorized
	}
	u, err := s.userByID(uid)
	if err != nil {
		return nil, 0, errUnauthorized
	}
	if u.Banned || u.Deleted {
		return nil, 0, errf(403, "banned", "this account has been suspended")
	}
	if time.Since(time.UnixMilli(lastUsed)) > 5*time.Minute {
		s.db.Exec(`UPDATE sessions SET last_used=? WHERE id=?`, nowMs(), sid)
	}
	return u, sid, nil
}

type authedFn func(w http.ResponseWriter, r *http.Request, u *User) error

func (s *Server) authed(fn authedFn) handlerFn {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, sid, err := s.authenticate(bearer(r))
		if err != nil {
			return err
		}
		ctx := context.WithValue(context.WithValue(r.Context(), ctxUser, u), ctxSession, sid)
		return fn(w, r.WithContext(ctx), u)
	}
}

func (s *Server) admin(fn authedFn) handlerFn {
	return s.authed(func(w http.ResponseWriter, r *http.Request, u *User) error {
		if !u.IsAdmin {
			return errForbidden
		}
		return fn(w, r, u)
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request, u *User) error {
	sid, _ := r.Context().Value(ctxSession).(int64)
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id=?`, sid)
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, u *User) error {
	writeJSON(w, 200, s.public(u, u.ID))
	return nil
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		DisplayName  *string `json:"displayName"`
		Bio          *string `json:"bio"`
		Avatar       *string `json:"avatar"`
		Username     *string `json:"username"`
		HideLastSeen *bool   `json:"hideLastSeen"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if req.DisplayName != nil {
		name := trimLen(*req.DisplayName, 64)
		if name == "" {
			return errf(400, "bad_request", "display name cannot be empty")
		}
		u.DisplayName = name
	}
	if req.Bio != nil {
		u.Bio = trimLen(*req.Bio, 300)
	}
	if req.Avatar != nil {
		if *req.Avatar != "" && !s.ownsMedia(u.ID, *req.Avatar, "image") {
			return errf(400, "bad_request", "invalid avatar")
		}
		u.Avatar = *req.Avatar
	}
	if req.Username != nil && !strings.EqualFold(*req.Username, u.Username) {
		name := strings.TrimSpace(*req.Username)
		if err := validateUsername(name); err != nil {
			return err
		}
		if s.handleTaken(name, 0) {
			return errf(409, "username_taken", "this username is already taken")
		}
		u.Username = name
	} else if req.Username != nil {
		u.Username = strings.TrimSpace(*req.Username)
	}
	if req.HideLastSeen != nil {
		u.HideLastSeen = *req.HideLastSeen
	}
	_, err := s.db.Exec(`UPDATE users SET display_name=?, bio=?, avatar=?, username=?, hide_last_seen=? WHERE id=?`,
		u.DisplayName, u.Bio, u.Avatar, u.Username, boolInt(u.HideLastSeen), u.ID)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return errf(409, "username_taken", "this username is already taken")
		}
		return err
	}
	s.broadcastUserUpdate(u)
	writeJSON(w, 200, s.public(u, u.ID))
	return nil
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if !s.limiter.allow("pw:"+clientIP(r), 10, 15*time.Minute) {
		return errf(429, "rate_limited", "too many attempts")
	}
	var hash string
	if err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id=?`, u.ID).Scan(&hash); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Current)) != nil {
		return errf(401, "invalid_credentials", "current password is incorrect")
	}
	if err := s.validatePassword(req.New); err != nil {
		return err
	}
	newHash, err := hashPassword(req.New)
	if err != nil {
		return err
	}
	sid, _ := r.Context().Value(ctxSession).(int64)
	if _, err := s.db.Exec(`UPDATE users SET password_hash=? WHERE id=?`, newHash, u.ID); err != nil {
		return err
	}
	// Changing the password signs out every other device.
	s.db.Exec(`DELETE FROM sessions WHERE user_id=? AND id<>?`, u.ID, sid)
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request, u *User) error {
	sid, _ := r.Context().Value(ctxSession).(int64)
	rows, err := s.db.Query(`SELECT id, user_agent, ip, created_at, last_used FROM sessions WHERE user_id=? ORDER BY last_used DESC`, u.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type sess struct {
		ID        int64  `json:"id"`
		UserAgent string `json:"userAgent"`
		IP        string `json:"ip"`
		CreatedAt int64  `json:"createdAt"`
		LastUsed  int64  `json:"lastUsed"`
		Current   bool   `json:"current"`
	}
	list := []sess{}
	for rows.Next() {
		var x sess
		if err := rows.Scan(&x.ID, &x.UserAgent, &x.IP, &x.CreatedAt, &x.LastUsed); err != nil {
			return err
		}
		x.Current = x.ID == sid
		list = append(list, x)
	}
	writeJSON(w, 200, list)
	return rows.Err()
}

func (s *Server) handleRevokeSession(w http.ResponseWriter, r *http.Request, u *User) error {
	if r.PathValue("id") == "others" {
		sid, _ := r.Context().Value(ctxSession).(int64)
		_, err := s.db.Exec(`DELETE FROM sessions WHERE user_id=? AND id<>?`, u.ID, sid)
		if err != nil {
			return err
		}
	} else {
		id, err := pathID(r, "id")
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(`DELETE FROM sessions WHERE user_id=? AND id=?`, u.ID, id); err != nil {
			return err
		}
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
