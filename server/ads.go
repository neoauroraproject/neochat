package main

import (
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Ad struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	Body        string `json:"body"`
	Image       string `json:"image"`
	Link        string `json:"link"`
	CTA         string `json:"cta"`
	Placement   string `json:"placement"` // all | chatlist | channel
	Active      bool   `json:"active"`
	Priority    int    `json:"priority"`
	StartsAt    int64  `json:"startsAt"`
	EndsAt      int64  `json:"endsAt"`
	Impressions int64  `json:"impressions,omitempty"`
	Clicks      int64  `json:"clicks,omitempty"`
	CreatedAt   int64  `json:"createdAt,omitempty"`
}

const adCols = `id, title, body, image, link, cta, placement, active, priority, starts_at, ends_at, impressions, clicks, created_at`

func scanAd(sc scanner) (*Ad, error) {
	var a Ad
	var active int
	err := sc.Scan(&a.ID, &a.Title, &a.Body, &a.Image, &a.Link, &a.CTA, &a.Placement, &active, &a.Priority, &a.StartsAt, &a.EndsAt, &a.Impressions, &a.Clicks, &a.CreatedAt)
	a.Active = active == 1
	return &a, err
}

func (s *Server) queryAds(where string, args ...any) ([]*Ad, error) {
	rows, err := s.db.Query(`SELECT `+adCols+` FROM ads `+where, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []*Ad{}
	for rows.Next() {
		a, err := scanAd(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

// handleActiveAds returns the ads users should currently see. Counters are hidden from them.
// handleActiveAds returns the ads users should see: NeoAurora network ads (always, from the
// persistent cache) followed by the server's own ads when the admin has them enabled.
func (s *Server) handleActiveAds(w http.ResponseWriter, r *http.Request, u *User) error {
	out := []any{}
	for _, a := range s.netads.asAds() {
		out = append(out, a)
	}
	if s.cfg().AdsEnabled {
		now := nowMs()
		list, err := s.queryAds(`WHERE active=1 AND (starts_at=0 OR starts_at<=?) AND (ends_at=0 OR ends_at>?) ORDER BY priority DESC, id DESC LIMIT 20`, now, now)
		if err != nil {
			return err
		}
		for _, a := range list {
			a.Impressions, a.Clicks, a.CreatedAt = 0, 0, 0
			out = append(out, a)
		}
	}
	writeJSON(w, 200, out)
	return nil
}

func (s *Server) handleAdImpression(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	// One counted impression per user per ad per hour keeps the numbers honest.
	if s.limiter.allow("adimp:"+itoa(u.ID)+":"+itoa(id), 1, time.Hour) {
		s.db.Exec(`UPDATE ads SET impressions=impressions+1 WHERE id=?`, id)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// handleAdClick counts the click and redirects to the advertiser's link.
func (s *Server) handleAdClick(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	var link string
	if err := s.db.QueryRow(`SELECT link FROM ads WHERE id=?`, id).Scan(&link); err != nil || link == "" {
		http.NotFound(w, r)
		return
	}
	if s.limiter.allow("adclick:"+clientIP(r)+":"+itoa(id), 3, time.Hour) {
		s.db.Exec(`UPDATE ads SET clicks=clicks+1 WHERE id=?`, id)
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, link, http.StatusFound)
}

func validLink(link string) bool {
	if link == "" {
		return true
	}
	u, err := url.Parse(link)
	if err != nil {
		return false
	}
	if strings.HasPrefix(link, "/") && !strings.HasPrefix(link, "//") {
		return true // internal link, e.g. /join/abc or /@channel
	}
	return (u.Scheme == "http" || u.Scheme == "https" || u.Scheme == "tg") && u.Host != ""
}

func (s *Server) handleAdminAds(w http.ResponseWriter, r *http.Request, u *User) error {
	list, err := s.queryAds(`ORDER BY id DESC`)
	if err != nil {
		return err
	}
	writeJSON(w, 200, list)
	return nil
}

func (s *Server) handleAdminSaveAd(w http.ResponseWriter, r *http.Request, u *User) error {
	var a Ad
	if err := readJSON(r, &a); err != nil {
		return err
	}
	a.Title = trimLen(a.Title, 100)
	a.Body = trimLen(a.Body, 500)
	a.CTA = trimLen(a.CTA, 30)
	a.Link = strings.TrimSpace(a.Link)
	if a.Title == "" {
		return errf(400, "bad_request", "title is required")
	}
	if !validLink(a.Link) {
		return errf(400, "bad_request", "link must be an http(s) URL or an internal path")
	}
	switch a.Placement {
	case "chatlist", "channel", "chattop", "sidebar", "admin":
	default:
		a.Placement = "all"
	}
	if a.Image != "" {
		if m, err := s.mediaByID(a.Image); err != nil || m.Kind != "image" {
			return errf(400, "bad_request", "invalid image")
		}
	}
	if r.PathValue("id") != "" {
		id, err := pathID(r, "id")
		if err != nil {
			return err
		}
		_, err = s.db.Exec(`UPDATE ads SET title=?, body=?, image=?, link=?, cta=?, placement=?, active=?, priority=?, starts_at=?, ends_at=? WHERE id=?`,
			a.Title, a.Body, a.Image, a.Link, a.CTA, a.Placement, boolInt(a.Active), a.Priority, a.StartsAt, a.EndsAt, id)
		if err != nil {
			return err
		}
		a.ID = id
	} else {
		res, err := s.db.Exec(`INSERT INTO ads(title, body, image, link, cta, placement, active, priority, starts_at, ends_at, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
			a.Title, a.Body, a.Image, a.Link, a.CTA, a.Placement, boolInt(a.Active), a.Priority, a.StartsAt, a.EndsAt, nowMs())
		if err != nil {
			return err
		}
		a.ID, _ = res.LastInsertId()
	}
	s.hub.broadcast("ads_changed", nil)
	writeJSON(w, 200, a)
	return nil
}

func (s *Server) handleAdminDeleteAd(w http.ResponseWriter, r *http.Request, u *User) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(`DELETE FROM ads WHERE id=?`, id); err != nil {
		return err
	}
	s.hub.broadcast("ads_changed", nil)
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
