package main

import (
	"net/http"
	"regexp"
)

// SharedLink is one URL found in a chat's messages.
type SharedLink struct {
	MessageID int64  `json:"messageId"`
	URL       string `json:"url"`
	CreatedAt int64  `json:"createdAt"`
}

// SharedType is one row of the "File type" list: how many files of that kind and their total size.
type SharedType struct {
	Count int   `json:"count"`
	Size  int64 `json:"size"`
}

var linkRe = regexp.MustCompile(`https?://[^\s<]+[^\s<.,:;"')\]!?]`)

const sharedLimit = 60

// Every shared file falls in exactly one group; office files, PDFs and text count as documents.
const sharedClass = `CASE
	WHEN m.kind='image' THEN 'photos'
	WHEN m.kind='video' THEN 'movies'
	WHEN m.kind='file' AND (md.mime='application/pdf' OR md.mime LIKE 'text/%' OR md.mime='application/msword'
		OR md.mime='application/rtf' OR md.mime='application/epub+zip'
		OR (md.mime LIKE 'application/vnd.%' AND md.mime NOT LIKE 'application/vnd.android%')) THEN 'documents'
	ELSE 'other' END`

const sharedLinkCond = `(m.text LIKE '%http://%' OR m.text LIKE '%https://%')`

// handleShared powers the "Shared files" panel. Without ?type it returns the totals per file type;
// with ?type=photos|movies|documents|other|links it returns that group's newest items.
func (s *Server) handleShared(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if _, _, err := s.member(id, u.ID); err != nil {
		return err
	}
	const fromMedia = ` FROM messages m JOIN media md ON md.id=m.media_id
		WHERE m.chat_id=? AND m.media_id<>'' AND md.removed=0 AND m.kind IN ('image','video','audio','voice','file')`

	switch typ := r.URL.Query().Get("type"); typ {
	case "":
		types := map[string]*SharedType{
			"documents": {}, "photos": {}, "movies": {}, "other": {},
		}
		rows, err := s.db.Query(`SELECT `+sharedClass+` AS cls, COUNT(*), COALESCE(SUM(md.size),0)`+fromMedia+` GROUP BY cls`, id)
		if err != nil {
			return err
		}
		defer rows.Close()
		total := SharedType{}
		for rows.Next() {
			var cls string
			var t SharedType
			if err := rows.Scan(&cls, &t.Count, &t.Size); err != nil {
				return err
			}
			if dst, ok := types[cls]; ok {
				*dst = t
			}
			total.Count += t.Count
			total.Size += t.Size
		}
		if err := rows.Err(); err != nil {
			return err
		}
		var links int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM messages m WHERE m.chat_id=? AND `+sharedLinkCond, id).Scan(&links); err != nil {
			return err
		}
		writeJSON(w, 200, map[string]any{"files": total, "links": links, "types": types})
		return nil

	case "links":
		msgs, err := s.sharedMessages(id, sharedLinkCond)
		if err != nil {
			return err
		}
		links := []SharedLink{}
		for _, m := range msgs {
			for _, url := range linkRe.FindAllString(m.Text, -1) {
				links = append(links, SharedLink{MessageID: m.ID, URL: url, CreatedAt: m.CreatedAt})
			}
		}
		writeJSON(w, 200, map[string]any{"links": links})
		return nil

	case "documents", "photos", "movies", "other":
		msgs, err := s.sharedMessages(id, `m.media_id<>'' AND COALESCE(md.removed,0)=0 AND m.kind IN ('image','video','audio','voice','file') AND `+sharedClass+`='`+typ+`'`)
		if err != nil {
			return err
		}
		writeJSON(w, 200, map[string]any{"items": msgs})
		return nil

	default:
		return errf(400, "bad_request", "unknown type")
	}
}

func (s *Server) sharedMessages(chatID int64, where string) ([]*Message, error) {
	rows, err := s.db.Query(messageSelect+` WHERE m.chat_id=? AND `+where+` ORDER BY m.id DESC LIMIT ?`, chatID, sharedLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
