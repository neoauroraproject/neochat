package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"html"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:web/dist
var webFS embed.FS

func (s *Server) staticHandler() http.Handler {
	dist, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		panic(err)
	}
	files := http.FileServer(http.FS(dist))
	index, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		index = []byte("<!doctype html><meta charset=utf-8><title>%APP_NAME%</title><p>The web client was not embedded. Build with scripts/build-binary.sh (or .ps1).</p>")
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean(r.URL.Path)
		if p != "/" && p != "/index.html" {
			if f, err := dist.Open(strings.TrimPrefix(p, "/")); err == nil {
				stat, _ := f.Stat()
				f.Close()
				if stat != nil && !stat.IsDir() {
					if strings.HasPrefix(p, "/assets/") {
						// Vite fingerprints asset names, so they never change.
						w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					} else {
						w.Header().Set("Cache-Control", "no-cache")
					}
					files.ServeHTTP(w, r)
					return
				}
			}
		}
		// SPA fallback: every other route renders the app shell with the instance branding.
		st := s.cfg()
		page := bytes.ReplaceAll(index, []byte("%APP_NAME%"), []byte(html.EscapeString(st.AppName)))
		page = bytes.ReplaceAll(page, []byte("%ACCENT%"), []byte(st.AccentColor))
		page = bytes.ReplaceAll(page, []byte("__LOGO__"), []byte(st.LogoMedia))
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(page)
	})
}

// handleManifest makes the web app installable on phones with the admin's branding.
func (s *Server) handleManifest(w http.ResponseWriter, r *http.Request) {
	st := s.cfg()
	// PNG sizes made from the admin's logo (see appicon.go); the version makes phones refetch
	// the icon when the logo changes.
	v := "?v=" + st.LogoMedia
	icons := []map[string]string{
		{"src": "/app-icon/192.png" + v, "sizes": "192x192", "type": "image/png", "purpose": "any"},
		{"src": "/app-icon/512.png" + v, "sizes": "512x512", "type": "image/png", "purpose": "any"},
		{"src": "/app-icon/maskable.png" + v, "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
	}
	dir := "rtl"
	if st.DefaultLang == "en" {
		dir = "ltr"
	}
	manifest := map[string]any{
		"name":             st.AppName,
		"short_name":       st.AppName,
		"description":      st.Tagline,
		"start_url":        "/",
		"scope":            "/",
		"display":          "standalone",
		"background_color": "#16110e",
		"theme_color":      "#16110e",
		"lang":             st.DefaultLang,
		"dir":              dir,
		"icons":            icons,
	}
	w.Header().Set("Content-Type", "application/manifest+json")
	w.Header().Set("Cache-Control", "no-cache")
	json.NewEncoder(w).Encode(manifest)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Powered-By", "NeoChat by NeoAurora")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")
		if !strings.HasPrefix(r.URL.Path, "/media/") {
			h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; "+
				"connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; "+
				"worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		}
		if r.TLS != nil {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}
