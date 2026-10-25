package main

import (
	"log"
	"time"
)

// runJobs performs housekeeping: retention policies, orphaned media and stale sessions.
func (s *Server) runJobs() {
	time.Sleep(30 * time.Second)
	for {
		s.housekeeping()
		time.Sleep(time.Hour)
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

	// Media past retention is dropped from messages (they keep their text) before being collected below.
	if st.MediaRetentionDays > 0 {
		cutoff := now.AddDate(0, 0, -st.MediaRetentionDays).UnixMilli()
		s.db.Exec(`UPDATE messages SET media_id='' WHERE media_id IN (SELECT id FROM media WHERE created_at<?)
			AND media_id NOT IN (SELECT avatar FROM users UNION SELECT avatar FROM chats UNION SELECT image FROM ads)`, cutoff)
		s.db.Exec(`DELETE FROM messages WHERE media_id='' AND text='' AND kind IN ('image','video','file','audio','voice')`)
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

	idle := now.AddDate(0, 0, -st.SessionDays).UnixMilli()
	s.db.Exec(`DELETE FROM sessions WHERE last_used<?`, idle)
	s.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
	s.db.Exec(`PRAGMA optimize`)
}
