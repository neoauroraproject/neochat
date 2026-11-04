package main

import (
	"log"
	"os"
	"time"
)

// runJobs performs housekeeping: retention policies, orphaned media and stale sessions.
func (s *Server) runJobs() {
	time.Sleep(30 * time.Second)
	s.repairSidewaysThumbs()
	for {
		s.housekeeping()
		time.Sleep(time.Hour)
	}
}

// repairSidewaysThumbs runs once: previews made before 1.6.2 ignored the phone's orientation tag,
// so portrait photos showed turned 90° in avatars and chat lists. Those previews are made again.
func (s *Server) repairSidewaysThumbs() {
	const key = "repair_exif_thumbs"
	var done string
	if s.db.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&done) == nil && done == "1" {
		return
	}
	rows, err := s.db.Query(`SELECT id FROM media WHERE kind='image' AND mime IN ('image/jpeg','image/jpg','image/pjpeg')`)
	if err != nil {
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	fixed := 0
	for _, id := range ids {
		path := s.mediaPath(id)
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		o := exifOrientation(f)
		f.Close()
		if o <= 1 {
			continue
		}
		w, h, thumb := s.makeThumb(path)
		s.db.Exec(`UPDATE media SET width=?, height=?, has_thumb=? WHERE id=?`, w, h, boolInt(thumb), id)
		fixed++
	}
	s.db.Exec(`INSERT INTO settings(key, value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value='1'`, key)
	if fixed > 0 {
		log.Printf("media: turned %d sideways photo previews upright", fixed)
	}
}

func (s *Server) housekeeping() {
	st := s.cfg()
	now := time.Now()

	if st.MessageRetentionDays > 0 {
		cutoff := now.AddDate(0, 0, -st.MessageRetentionDays).UnixMilli()
		if res, err := s.db.Exec(`DELETE FROM messages WHERE created_at<?`, cutoff); err == nil {
			if n, _ := res.RowsAffected(); n > 0 {
				log.Printf("retention: removed %d old messages", n)
				s.db.Exec(`UPDATE chats SET last_msg_id=COALESCE((SELECT MAX(id) FROM messages WHERE chat_id=chats.id),0)`)
			}
		}
	}

	// Files past their expiry lose their bytes; the messages stay and say the file expired.
	s.expireMedia()
	if st.QuotaMode == "oldest" {
		for _, uid := range s.usersOverQuota() {
			s.makeRoom(uid, "")
		}
	}

	// Collect media nobody references anymore (after a grace period for in-progress sends).
	grace := now.Add(-24 * time.Hour).UnixMilli()
	rows, err := s.db.Query(`SELECT id FROM media WHERE created_at<? AND id NOT IN (
		SELECT media_id FROM messages WHERE media_id<>''
		UNION SELECT avatar FROM users WHERE avatar<>''
		UNION SELECT avatar FROM chats WHERE avatar<>''
		UNION SELECT image FROM ads WHERE image<>'') AND id NOT IN (?, ?)`, grace, st.LogoMedia, st.BackgroundMedia)
	if err == nil {
		var ids []string
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
		for _, id := range ids {
			s.removeMediaFiles(id)
			s.db.Exec(`DELETE FROM media WHERE id=?`, id)
		}
		if len(ids) > 0 {
			log.Printf("storage: removed %d unreferenced media files", len(ids))
		}
	}

	s.pruneEvents()

	idle := now.AddDate(0, 0, -st.SessionDays).UnixMilli()
	s.db.Exec(`DELETE FROM sessions WHERE last_used<?`, idle)
	s.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
	s.db.Exec(`PRAGMA optimize`)
}
