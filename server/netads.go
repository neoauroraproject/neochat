package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// NeoAurora ad network: ads come from the NeoAurora license worker. The last successful
// copy is stored in the database, so ads keep showing when the worker is unreachable
// (for example when international internet is cut). Clicks are queued and flushed later.

const netAdsProduct = "neochat"

// placement on the worker → placement in the app
var netAdPlacements = map[string]string{"home": "chatlist", "footer": "channel", "sidebar": "sidebar", "chat": "chattop", "admin": "admin"}

type netAd struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	ButtonText string `json:"buttonText"`
	LinkURL    string `json:"linkUrl"`
	Badge      string `json:"badge"`
	Placement  string `json:"placement"` // worker placement
}

type netAdsState struct {
	Ads       []netAd `json:"ads"`
	FetchedAt int64   `json:"fetchedAt"`
}

type netAdsClient struct {
	s          *Server
	base       string
	httpc      *http.Client
	mu         sync.Mutex
	state      netAdsState
	lastTry    int64
	lastErr    string
	clickQueue []map[string]string
}

func newNetAds(s *Server, base string) *netAdsClient {
	n := &netAdsClient{s: s, base: strings.TrimRight(base, "/"), httpc: &http.Client{Timeout: 12 * time.Second}}
	var raw string
	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key='netads'`).Scan(&raw); err == nil {
		json.Unmarshal([]byte(raw), &n.state)
	} else if !errors.Is(err, sql.ErrNoRows) {
		log.Printf("netads: load cache: %v", err)
	}
	var q string
	if s.db.QueryRow(`SELECT value FROM settings WHERE key='netads_clicks'`).Scan(&q) == nil {
		json.Unmarshal([]byte(q), &n.clickQueue)
	}
	return n
}

func (n *netAdsClient) run() {
	if n.base == "" {
		return
	}
	for {
		n.refresh()
		n.flushClicks()
		// Retry sooner while we have never succeeded.
		n.mu.Lock()
		wait := 30 * time.Minute
		if n.state.FetchedAt == 0 {
			wait = 2 * time.Minute
		}
		n.mu.Unlock()
		time.Sleep(wait)
	}
}

func (n *netAdsClient) refresh() {
	n.mu.Lock()
	n.lastTry = nowMs()
	n.mu.Unlock()
	var all []netAd
	for remote := range netAdPlacements {
		ads, err := n.fetch(remote)
		if err != nil {
			// Keep the previous copy untouched: a partial result would hide working ads.
			n.mu.Lock()
			n.lastErr = err.Error()
			n.mu.Unlock()
			log.Printf("netads: %v (keeping %d cached ads)", err, len(n.cached()))
			return
		}
		all = append(all, ads...)
	}
	st := netAdsState{Ads: all, FetchedAt: nowMs()}
	raw, _ := json.Marshal(st)
	n.s.db.Exec(`INSERT INTO settings(key,value) VALUES('netads',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(raw))
	n.mu.Lock()
	changed := !sameAds(n.state.Ads, all)
	n.state, n.lastErr = st, ""
	n.mu.Unlock()
	if changed {
		n.s.hub.broadcast("ads_changed", nil)
	}
}

func sameAds(a, b []netAd) bool {
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	return bytes.Equal(ja, jb)
}

func (n *netAdsClient) fetch(placement string) ([]netAd, error) {
	u := fmt.Sprintf("%s/v1/ads?product=%s&placement=%s&mode=all", n.base, url.QueryEscape(netAdsProduct), url.QueryEscape(placement))
	resp, err := n.httpc.Get(u)
	if err != nil {
		return nil, fmt.Errorf("ad network unreachable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ad network returned %d", resp.StatusCode)
	}
	var body struct {
		Ads *[]netAd `json:"ads"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil || body.Ads == nil {
		return nil, fmt.Errorf("ad network sent an invalid response")
	}
	out := make([]netAd, 0, len(*body.Ads))
	for _, a := range *body.Ads {
		if a.ID == "" || a.Title == "" {
			continue
		}
		if a.LinkURL != "" && !validLink(a.LinkURL) {
			a.LinkURL = ""
		}
		a.Placement = placement
		a.Title, a.Body, a.ButtonText, a.Badge = trimLen(a.Title, 100), trimLen(a.Body, 500), trimLen(a.ButtonText, 30), trimLen(a.Badge, 20)
		out = append(out, a)
	}
	return out, nil
}

func (n *netAdsClient) cached() []netAd {
	n.mu.Lock()
	defer n.mu.Unlock()
	return append([]netAd(nil), n.state.Ads...)
}

func (n *netAdsClient) find(id string) *netAd {
	for _, a := range n.cached() {
		if a.ID == id {
			return &a
		}
	}
	return nil
}

// queueClick records a click and reports it to the worker; unsent clicks survive restarts.
func (n *netAdsClient) queueClick(a *netAd) {
	n.mu.Lock()
	if len(n.clickQueue) < 5000 {
		n.clickQueue = append(n.clickQueue, map[string]string{"adId": a.ID, "productSlug": netAdsProduct, "placement": a.Placement})
	}
	n.persistClicksLocked()
	n.mu.Unlock()
	go n.flushClicks()
}

func (n *netAdsClient) persistClicksLocked() {
	raw, _ := json.Marshal(n.clickQueue)
	n.s.db.Exec(`INSERT INTO settings(key,value) VALUES('netads_clicks',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(raw))
}

func (n *netAdsClient) flushClicks() {
	if n.base == "" {
		return
	}
	for {
		n.mu.Lock()
		if len(n.clickQueue) == 0 {
			n.mu.Unlock()
			return
		}
		c := n.clickQueue[0]
		n.mu.Unlock()
		body, _ := json.Marshal(c)
		resp, err := n.httpc.Post(n.base+"/v1/ads/click", "application/json", bytes.NewReader(body))
		if err != nil {
			return // offline: try again on the next cycle
		}
		resp.Body.Close()
		if resp.StatusCode >= 500 {
			return
		}
		n.mu.Lock()
		if len(n.clickQueue) > 0 {
			n.clickQueue = n.clickQueue[1:]
		}
		n.persistClicksLocked()
		n.mu.Unlock()
	}
}

func (n *netAdsClient) status() map[string]any {
	n.mu.Lock()
	defer n.mu.Unlock()
	ads := n.state.Ads
	if ads == nil {
		ads = []netAd{} // the admin page lists these; never send null
	}
	return map[string]any{
		"source":        n.base,
		"product":       netAdsProduct,
		"cachedAds":     len(n.state.Ads),
		"fetchedAt":     n.state.FetchedAt,
		"lastAttempt":   n.lastTry,
		"lastError":     n.lastErr,
		"pendingClicks": len(n.clickQueue),
		"ads":           ads,
	}
}

// asAds converts cached network ads into the app's ad shape.
func (n *netAdsClient) asAds() []map[string]any {
	var out []map[string]any
	for _, a := range n.cached() {
		out = append(out, map[string]any{
			"id":        "net:" + a.ID,
			"source":    "network",
			"title":     a.Title,
			"body":      a.Body,
			"image":     "",
			"link":      a.LinkURL,
			"cta":       a.ButtonText,
			"badge":     a.Badge,
			"placement": netAdPlacements[a.Placement],
			"active":    true,
		})
	}
	return out
}

// handleNetAdClick counts a network ad click and redirects to its link.
func (s *Server) handleNetAdClick(w http.ResponseWriter, r *http.Request) {
	a := s.netads.find(r.PathValue("id"))
	if a == nil || a.LinkURL == "" {
		http.NotFound(w, r)
		return
	}
	if s.limiter.allow("netclick:"+clientIP(r)+":"+a.ID, 3, time.Hour) {
		s.netads.queueClick(a)
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, a.LinkURL, http.StatusFound)
}

func (s *Server) handleAdminNetAds(w http.ResponseWriter, r *http.Request, u *User) error {
	if r.Method == http.MethodPost {
		s.netads.refresh()
		go s.netads.flushClicks()
	}
	writeJSON(w, 200, s.netads.status())
	return nil
}
