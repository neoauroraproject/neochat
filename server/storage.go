package main

import (
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"
)

// Storage rules for a private server: unlike Telegram, the disk is small and finite. Each user
// has a quota, large files expire sooner, and the server refuses uploads (but keeps text and
// calls working) before the disk can fill up and take the database down with it.

const dayMs = int64(24 * time.Hour / time.Millisecond)

// retention is the part of the settings that decides how long files stay.
type retention struct {
	LargeFileMB        int `json:"largeFileMB"`
	LargeFileDays      int `json:"largeFileDays"`
	MediaRetentionDays int `json:"mediaRetentionDays"`
}

func (st Settings) retention() retention {
	return retention{st.LargeFileMB, st.LargeFileDays, st.MediaRetentionDays}
}

// expiry returns when a file of this size, uploaded at created (ms), leaves the server; 0 = never.
func (r retention) expiry(size, created int64) int64 {
	days := r.MediaRetentionDays
	if r.LargeFileMB > 0 && size > int64(r.LargeFileMB)<<20 {
		days = r.LargeFileDays
	}
	if days <= 0 {
		return 0
	}
	return created + int64(days)*dayMs
}

// expirySQL is the same rule as expiry, as an SQL expression over a media row.
func (r retention) expirySQL() (string, []any) {
	return `CASE WHEN size > ? THEN (CASE WHEN ? > 0 THEN created_at + ? * ? ELSE 0 END)
		ELSE (CASE WHEN ? > 0 THEN created_at + ? * ? ELSE 0 END) END`,
		[]any{int64(r.LargeFileMB) << 20, r.LargeFileDays, r.LargeFileDays, dayMs,
			r.MediaRetentionDays, r.MediaRetentionDays, dayMs}
}

// keepMedia takes a file out of expiry and quotas (profile photos, room avatars, brand, ads).
func (s *Server) keepMedia(id string) {
	if id != "" {
		s.db.Exec(`UPDATE media SET keep=1, expires_at=0 WHERE id=?`, id)
	}
}

// --- disk guard ---------------------------------------------------------------------------

func (s *Server) diskFree() (total, free uint64, ok bool) {
	t, f, err := diskUsage(s.mediaDir)
	if err != nil {
		return 0, 0, false
	}
	return t, f, true
}

func (s *Server) minFreeBytes() uint64 { return uint64(s.cfg().MinFreeDiskMB) << 20 }

// checkDisk refuses an upload of about `incoming` bytes when it would leave less than the safe
// minimum free. Text messages and calls never touch this, so they keep working.
func (s *Server) checkDisk(incoming int64) error {
	_, free, ok := s.diskFree()
	if !ok {
		return nil
	}
	if incoming < 0 {
		incoming = 0
	}
	if free < s.minFreeBytes()+uint64(incoming) {
		return errf(507, "storage_full", "the server is almost out of disk space; uploads are paused for now")
	}
	return nil
}

// --- quotas -------------------------------------------------------------------------------

// quotaFor returns a user's quota in bytes; 0 = unlimited.
func (s *Server) quotaFor(uid int64) int64 {
	var q int64 = -1
	s.db.QueryRow(`SELECT quota_mb FROM users WHERE id=?`, uid).Scan(&q)
	if q < 0 {
		q = int64(s.cfg().UserQuotaMB)
	}
	return q << 20
}

// usedBytes is what a user's files occupy on the server (kept images don't count).
func (s *Server) usedBytes(uid int64) int64 {
	var n int64
	s.db.QueryRow(`SELECT COALESCE(SUM(size),0) FROM media WHERE owner_id=? AND removed=0 AND keep=0`, uid).Scan(&n)
	return n
}

// checkQuota is asked before an upload of about `incoming` bytes starts, so a full quota is
// reported at once and not after minutes of uploading.
func (s *Server) checkQuota(uid, incoming int64) error {
	quota := s.quotaFor(uid)
	if quota <= 0 {
		return nil
	}
	if incoming > quota {
		return errf(413, "quota_file", fmt.Sprintf("this file is larger than your whole storage on this server (%d MB)", quota>>20))
	}
	if s.cfg().QuotaMode == "oldest" {
		return nil // room is made after the upload by removing the oldest files
	}
	if s.usedBytes(uid)+incoming > quota {
		return errf(403, "quota_full", fmt.Sprintf("your storage on this server is full (%d MB); delete some files in Settings → My storage", quota>>20))
	}
	return nil
}

// makeRoom removes the user's oldest files until they fit their quota again ("oldest" mode).
func (s *Server) makeRoom(uid int64, except string) {
	quota := s.quotaFor(uid)
	if quota <= 0 {
		return
	}
	over := s.usedBytes(uid) - quota
	if over <= 0 {
		return
	}
	rows, err := s.db.Query(`SELECT id, size FROM media WHERE owner_id=? AND removed=0 AND keep=0 AND id<>? ORDER BY created_at ASC`, uid, except)
	if err != nil {
		return
	}
	var ids []string
	for rows.Next() && over > 0 {
		var id string
		var size int64
		if rows.Scan(&id, &size) == nil {
			ids = append(ids, id)
			over -= size
		}
	}
	rows.Close()
	for _, id := range ids {
		s.dropMedia(id)
	}
}

// dropMedia deletes a file's bytes but keeps its row, so messages show "expired on the server".
func (s *Server) dropMedia(id string) {
	s.removeMediaFiles(id)
	s.db.Exec(`UPDATE media SET removed=1 WHERE id=?`, id)
}

// --- expiry -------------------------------------------------------------------------------

const exemptMedia = `SELECT avatar FROM users WHERE avatar<>'' UNION SELECT avatar FROM chats WHERE avatar<>''
	UNION SELECT image FROM ads WHERE image<>''`

// expireMedia removes every file past its expiry and reports how much was freed.
func (s *Server) expireMedia() (files int, bytes int64) {
	st := s.cfg()
	rows, err := s.db.Query(`SELECT id, size FROM media WHERE removed=0 AND keep=0 AND expires_at>0 AND expires_at<?
		AND id NOT IN (`+exemptMedia+`) AND id NOT IN (?, ?)`, nowMs(), st.LogoMedia, st.BackgroundMedia)
	if err != nil {
		return 0, 0
	}
	var ids []string
	for rows.Next() {
		var id string
		var size int64
		if rows.Scan(&id, &size) == nil {
			ids = append(ids, id)
			bytes += size
		}
	}
	rows.Close()
	for _, id := range ids {
		s.dropMedia(id)
	}
	if len(ids) > 0 {
		log.Printf("storage: %d expired files removed (%d MB)", len(ids), bytes>>20)
	}
	return len(ids), bytes
}

// reapplyRetention recomputes every file's expiry after the admin changed the rules.
func (s *Server) reapplyRetention(r retention) error {
	expr, args := r.expirySQL()
	_, err := s.db.Exec(`UPDATE media SET expires_at=`+expr+` WHERE removed=0 AND keep=0`, args...)
	return err
}

// previewRetention counts what new rules would remove right away, for the admin's confirmation.
func (s *Server) previewRetention(r retention) (files int64, bytes int64) {
	expr, args := r.expirySQL()
	st := s.cfg()
	args = append(args, st.LogoMedia, st.BackgroundMedia, nowMs())
	s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size),0) FROM (
		SELECT size, `+expr+` AS e FROM media WHERE removed=0 AND keep=0
			AND id NOT IN (`+exemptMedia+`) AND id NOT IN (?, ?)) WHERE e > 0 AND e < ?`, args...).Scan(&files, &bytes)
	return
}

// --- user endpoints -----------------------------------------------------------------------

type storageFile struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	HasThumb  bool   `json:"hasThumb,omitempty"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt,omitempty"`
	ChatID    int64  `json:"chatId,omitempty"`
	ChatTitle string `json:"chatTitle,omitempty"`
}

func (s *Server) handleMyStorage(w http.ResponseWriter, r *http.Request, u *User) error {
	st := s.cfg()
	rows, err := s.db.Query(`SELECT md.id, md.kind, md.name, md.size, md.has_thumb, md.created_at, md.expires_at,
			COALESCE((SELECT m.chat_id FROM messages m WHERE m.media_id=md.id LIMIT 1), 0)
		FROM media md WHERE md.owner_id=? AND md.removed=0 AND md.keep=0 ORDER BY md.size DESC LIMIT 30`, u.ID)
	if err != nil {
		return err
	}
	files := []storageFile{}
	for rows.Next() {
		var f storageFile
		var thumb int
		if err := rows.Scan(&f.ID, &f.Kind, &f.Name, &f.Size, &thumb, &f.CreatedAt, &f.ExpiresAt, &f.ChatID); err != nil {
			rows.Close()
			return err
		}
		f.HasThumb = thumb == 1
		files = append(files, f)
	}
	rows.Close()
	for i := range files {
		if files[i].ChatID > 0 {
			if c, err := s.chatView(files[i].ChatID, u.ID); err == nil {
				files[i].ChatTitle = c.Title
				if c.Peer != nil {
					files[i].ChatTitle = c.Peer.DisplayName // private chats are named after the other person
				}
			}
		}
	}
	var count int64
	s.db.QueryRow(`SELECT COUNT(*) FROM media WHERE owner_id=? AND removed=0 AND keep=0`, u.ID).Scan(&count)
	writeJSON(w, 200, map[string]any{
		"used":      s.usedBytes(u.ID),
		"quota":     s.quotaFor(u.ID),
		"count":     count,
		"quotaMode": st.QuotaMode,
		"rules":     st.retention(),
		"largest":   files,
	})
	return nil
}

// handleDeleteMyMedia frees a file the user uploaded; the messages that showed it say it is gone.
func (s *Server) handleDeleteMyMedia(w http.ResponseWriter, r *http.Request, u *User) error {
	m, err := s.mediaByID(r.PathValue("id"))
	if err != nil {
		return err
	}
	if m.OwnerID != u.ID {
		return errForbidden
	}
	if m.Keep {
		return errf(400, "bad_request", "this image is in use as a profile or room photo")
	}
	s.dropMedia(m.ID)
	writeJSON(w, 200, map[string]any{"used": s.usedBytes(u.ID)})
	return nil
}

// --- admin dashboard ----------------------------------------------------------------------

func (s *Server) handleAdminStorage(w http.ResponseWriter, r *http.Request, u *User) error {
	st := s.cfg()
	out := map[string]any{"rules": st.retention(), "userQuotaMB": st.UserQuotaMB, "quotaMode": st.QuotaMode,
		"minFreeMB": st.MinFreeDiskMB}
	total, free, ok := s.diskFree()
	if ok {
		out["diskTotal"] = total
		out["diskFree"] = free
		out["diskLow"] = free < s.minFreeBytes()
	}

	type kindRow struct {
		Kind  string `json:"kind"`
		Files int64  `json:"files"`
		Bytes int64  `json:"bytes"`
	}
	kinds := []kindRow{}
	if rows, err := s.db.Query(`SELECT kind, COUNT(*), COALESCE(SUM(size),0) FROM media WHERE removed=0 GROUP BY kind ORDER BY 3 DESC`); err == nil {
		for rows.Next() {
			var k kindRow
			if rows.Scan(&k.Kind, &k.Files, &k.Bytes) == nil {
				kinds = append(kinds, k)
			}
		}
		rows.Close()
	}
	out["byKind"] = kinds

	type userRow struct {
		ID          int64  `json:"id"`
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
		Avatar      string `json:"avatar"`
		Files       int64  `json:"files"`
		Bytes       int64  `json:"bytes"`
		QuotaMB     int64  `json:"quotaMB"`
	}
	top := []userRow{}
	if rows, err := s.db.Query(`SELECT u.id, u.username, u.display_name, u.avatar, COUNT(*), SUM(md.size), u.quota_mb
		FROM media md JOIN users u ON u.id=md.owner_id WHERE md.removed=0 AND md.keep=0
		GROUP BY md.owner_id ORDER BY 6 DESC LIMIT 10`); err == nil {
		for rows.Next() {
			var x userRow
			if rows.Scan(&x.ID, &x.Username, &x.DisplayName, &x.Avatar, &x.Files, &x.Bytes, &x.QuotaMB) == nil {
				top = append(top, x)
			}
		}
		rows.Close()
	}
	out["topUsers"] = top

	// 30 days of uploads, and how long the free space lasts at that pace.
	type dayRow struct {
		Day   string `json:"day"`
		Bytes int64  `json:"bytes"`
	}
	series := make([]dayRow, 30)
	today := time.Now().Truncate(24 * time.Hour)
	var sum int64
	for i := range series {
		start := today.AddDate(0, 0, i-29)
		series[i].Day = start.Format("2006-01-02")
		s.db.QueryRow(`SELECT COALESCE(SUM(size),0) FROM media WHERE created_at>=? AND created_at<?`,
			start.UnixMilli(), start.AddDate(0, 0, 1).UnixMilli()).Scan(&series[i].Bytes)
		sum += series[i].Bytes
	}
	out["growth"] = series
	out["daysLeft"] = -1
	if ok && sum > 0 {
		room := int64(free) - int64(s.minFreeBytes())
		if room < 0 {
			room = 0
		}
		out["daysLeft"] = room / (sum / 30)
	}
	var soonFiles, soonBytes int64
	s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size),0) FROM media WHERE removed=0 AND keep=0 AND expires_at>0 AND expires_at<?`,
		nowMs()+7*dayMs).Scan(&soonFiles, &soonBytes)
	out["expiringFiles"], out["expiringBytes"] = soonFiles, soonBytes
	var used int64
	s.db.QueryRow(`SELECT COALESCE(SUM(size),0) FROM media WHERE removed=0`).Scan(&used)
	out["mediaBytes"] = used
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) handleAdminStoragePreview(w http.ResponseWriter, r *http.Request, u *User) error {
	rt := s.cfg().retention()
	if err := readJSON(r, &rt); err != nil {
		return err
	}
	st := s.cfg()
	st.LargeFileMB, st.LargeFileDays, st.MediaRetentionDays = rt.LargeFileMB, rt.LargeFileDays, rt.MediaRetentionDays
	st.normalize()
	files, bytes := s.previewRetention(st.retention())
	writeJSON(w, 200, map[string]int64{"files": files, "bytes": bytes})
	return nil
}

func (s *Server) handleAdminStorageCleanup(w http.ResponseWriter, r *http.Request, u *User) error {
	files, bytes := s.expireMedia()
	for _, uid := range s.usersOverQuota() {
		if s.cfg().QuotaMode == "oldest" {
			s.makeRoom(uid, "")
		}
	}
	writeJSON(w, 200, map[string]any{"files": files, "bytes": bytes})
	return nil
}

// usersOverQuota lists users whose files exceed their quota (e.g. after the admin lowered it).
func (s *Server) usersOverQuota() []int64 {
	def := int64(s.cfg().UserQuotaMB)
	rows, err := s.db.Query(`SELECT md.owner_id, SUM(md.size), COALESCE(u.quota_mb, -1) FROM media md
		LEFT JOIN users u ON u.id=md.owner_id WHERE md.removed=0 AND md.keep=0 GROUP BY md.owner_id`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var uid, used, q int64
		if rows.Scan(&uid, &used, &q) != nil {
			continue
		}
		if q < 0 {
			q = def
		}
		if q > 0 && used > q<<20 {
			out = append(out, uid)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
