// Copyright © 2026 NeoAurora. All rights reserved.
//
// NeoChat is a self-hosted messenger shipped as a single binary:
// HTTP API + WebSocket realtime + embedded web/mobile client + SQLite + TURN relay for calls.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var version = "1.0.0"

// defaultAdFeed is the NeoAurora license worker that serves network ads (override with -ad-feed).
var defaultAdFeed = "https://license.hossein-m466.workers.dev"

const copyright = "Copyright © 2026 NeoAurora. All rights reserved."

type Options struct {
	Addr       string
	DataDir    string
	TLSCert    string
	TLSKey     string
	SelfSigned bool
	Hosts      string
	PublicIP   string
	HTTPPort   string
	AdFeed     string
}

type handlerFn func(w http.ResponseWriter, r *http.Request) error

func (fn handlerFn) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := fn(w, r); err != nil {
		writeErr(w, err)
	}
}

type Server struct {
	opts      Options
	db        *sql.DB
	mediaDir  string
	settings  atomic.Pointer[Settings]
	hub       *Hub
	calls     *CallManager
	limiter   *limiter
	turn      *turnServer
	netads    *netAdsClient
	tlsm      *tlsManager
	httpsOn   bool
	started   time.Time
	setupMu   sync.Mutex
	dummyHash []byte
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log.SetFlags(log.LstdFlags)
	args := os.Args[1:]
	cmd := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}

	fs := flag.NewFlagSet("neochat", flag.ExitOnError)
	var o Options
	fs.StringVar(&o.Addr, "addr", env("NEOCHAT_ADDR", ":8443"), "listen address (host:port)")
	fs.StringVar(&o.DataDir, "data", env("NEOCHAT_DATA", "./neochat-data"), "data directory (database, media, certificates)")
	fs.StringVar(&o.TLSCert, "tls-cert", env("NEOCHAT_TLS_CERT", ""), "TLS certificate file (PEM)")
	fs.StringVar(&o.TLSKey, "tls-key", env("NEOCHAT_TLS_KEY", ""), "TLS private key file (PEM)")
	selfSigned := fs.String("self-signed", env("NEOCHAT_SELF_SIGNED", "true"), "generate a self-signed certificate when no cert is given (true/false)")
	fs.StringVar(&o.Hosts, "hosts", env("NEOCHAT_HOSTS", ""), "extra hostnames/IPs for the self-signed certificate, comma separated")
	fs.StringVar(&o.PublicIP, "public-ip", env("NEOCHAT_PUBLIC_IP", ""), "IP address advertised by the TURN relay (default: auto-detect)")
	fs.StringVar(&o.AdFeed, "ad-feed", env("NEOCHAT_AD_FEED", defaultAdFeed), "NeoAurora ad network endpoint")
	fs.StringVar(&o.HTTPPort, "http-redirect", env("NEOCHAT_HTTP_REDIRECT", ""), "also listen on this address with plain HTTP and redirect to HTTPS (e.g. :80)")
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, `NeoChat %s — self-hosted messenger by NeoAurora
`+copyright+`

Usage:
  neochat [serve] [flags]                    start the server
  neochat reset-password <username> <pass>   set a user's password
  neochat make-admin <username>              grant admin rights
  neochat version

Flags:
`, version)
		fs.PrintDefaults()
	}
	fs.Parse(args)
	o.SelfSigned = *selfSigned == "true" || *selfSigned == "1"

	switch cmd {
	case "version":
		fmt.Println("neochat", version)
		fmt.Println(copyright)
		return
	case "serve":
	case "reset-password", "make-admin":
		runAdminCommand(cmd, o, fs.Args())
		return
	default:
		fs.Usage()
		os.Exit(2)
	}

	if err := serve(o); err != nil {
		log.Fatal(err)
	}
}

func runAdminCommand(cmd string, o Options, args []string) {
	db, err := openDB(o.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if len(args) < 1 {
		log.Fatal("username required")
	}
	var res sql.Result
	switch cmd {
	case "reset-password":
		if len(args) < 2 || len(args[1]) < 6 {
			log.Fatal("usage: neochat reset-password <username> <new-password (min 6 chars)>")
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(args[1]), 11)
		res, err = db.Exec(`UPDATE users SET password_hash=?, banned=0 WHERE username=?`, string(hash), args[0])
		if err == nil {
			db.Exec(`DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)`, args[0])
		}
	case "make-admin":
		res, err = db.Exec(`UPDATE users SET is_admin=1, banned=0 WHERE username=?`, args[0])
	}
	if err != nil {
		log.Fatal(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		log.Fatalf("user %q not found", args[0])
	}
	fmt.Println("done")
}

func serve(o Options) error {
	abs, err := filepath.Abs(o.DataDir)
	if err == nil {
		o.DataDir = abs
	}
	if err := os.MkdirAll(filepath.Join(o.DataDir, "media"), 0o750); err != nil {
		return err
	}
	db, err := openDB(o.DataDir)
	if err != nil {
		return fmt.Errorf("database: %w", err)
	}
	defer db.Close()

	s := &Server{
		opts:     o,
		db:       db,
		mediaDir: filepath.Join(o.DataDir, "media"),
		limiter:  newLimiter(),
		turn:     &turnServer{},
		started:  time.Now(),
	}
	s.dummyHash, _ = bcrypt.GenerateFromPassword([]byte(randomToken(16)), 11)
	s.hub = newHub(s)
	s.calls = newCallManager(s)
	if err := s.loadSettings(); err != nil {
		return fmt.Errorf("settings: %w", err)
	}
	s.applyTURN()
	s.netads = newNetAds(s, o.AdFeed)
	go s.netads.run()
	go s.runJobs()

	srv := &http.Server{
		Addr:              o.Addr,
		Handler:           securityHeaders(s.routes()),
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// HTTPS is on unless explicitly disabled (-self-signed=false without a certificate, for development).
	s.httpsOn = o.SelfSigned || o.TLSCert != ""
	scheme := "http"
	if s.httpsOn {
		scheme = "https"
		s.tlsm = newTLSManager(s)
		srv.TLSConfig = s.tlsm.tlsConfig()
	}

	if o.HTTPPort != "" && scheme == "https" {
		go func() {
			_, port, _ := net.SplitHostPort(o.Addr)
			redirect := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				host := requestHostname(r)
				if port != "443" && port != "" {
					host = net.JoinHostPort(host, port)
				}
				http.Redirect(w, r, "https://"+host+r.URL.RequestURI(), http.StatusMovedPermanently)
			})
			log.Printf("http redirect listening on %s", o.HTTPPort)
			if err := http.ListenAndServe(o.HTTPPort, s.tlsm.httpHandler(redirect)); err != nil {
				log.Printf("http redirect: %v", err)
			}
		}()
	}

	go func() {
		_, port, _ := net.SplitHostPort(o.Addr)
		log.Printf("NeoChat %s ready — %s", version, copyright)
		log.Printf("  web app:     %s://%s:%s/", scheme, detectLocalIP(), port)
		log.Printf("  admin panel: %s://%s:%s/admin", scheme, detectLocalIP(), port)
		log.Printf("  data dir:    %s", o.DataDir)
		if scheme == "http" {
			log.Printf("  warning: TLS is off — browsers only allow calls (microphone/camera) on https or localhost")
		}
		var err error
		if scheme == "https" {
			err = srv.ListenAndServeTLS("", "")
		} else {
			err = srv.ListenAndServe()
		}
		if err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Printf("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
	return nil
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	h := func(pattern string, fn handlerFn) { mux.Handle(pattern, fn) }

	h("GET /api/config", s.handleConfig)
	h("POST /api/setup", s.handleSetup)
	h("POST /api/auth/register", s.handleRegister)
	h("POST /api/auth/login", s.handleLogin)
	h("POST /api/auth/logout", s.authed(s.handleLogout))

	h("GET /api/me", s.authed(s.handleMe))
	h("PATCH /api/me", s.authed(s.handleUpdateMe))
	h("POST /api/me/password", s.authed(s.handleChangePassword))
	h("GET /api/me/sessions", s.authed(s.handleSessions))
	h("DELETE /api/me/sessions/{id}", s.authed(s.handleRevokeSession))

	h("GET /api/search", s.authed(s.handleSearch))
	h("GET /api/users/{id}", s.authed(s.handleGetUser))
	h("GET /api/contacts", s.authed(s.handleContacts))

	h("GET /api/chats", s.authed(s.handleListChats))
	h("POST /api/chats", s.authed(s.handleCreateRoom))
	h("POST /api/chats/direct", s.authed(s.handleDirect))
	h("GET /api/chats/{id}", s.authed(s.handleGetChat))
	h("PATCH /api/chats/{id}", s.authed(s.handleUpdateRoom))
	h("DELETE /api/chats/{id}", s.authed(s.handleDeleteRoom))
	h("PATCH /api/chats/{id}/prefs", s.authed(s.handlePrefs))
	h("POST /api/chats/{id}/read", s.authed(s.handleRead))
	h("POST /api/chats/{id}/join", s.authed(s.handleJoinPublic))
	h("POST /api/chats/{id}/leave", s.authed(s.handleLeave))
	h("GET /api/chats/{id}/members", s.authed(s.handleMembers))
	h("POST /api/chats/{id}/members", s.authed(s.handleAddMember))
	h("PATCH /api/chats/{id}/members/{uid}", s.authed(s.handleUpdateMember))
	h("DELETE /api/chats/{id}/members/{uid}", s.authed(s.handleRemoveMember))
	h("GET /api/chats/{id}/messages", s.authed(s.handleListMessages))
	h("POST /api/chats/{id}/messages", s.authed(s.handleSendMessage))
	h("PATCH /api/messages/{id}", s.authed(s.handleEditMessage))
	h("DELETE /api/messages/{id}", s.authed(s.handleDeleteMessage))
	h("GET /api/invite/{code}", s.authed(s.handleInvitePreview))
	h("POST /api/invite/{code}", s.authed(s.handleInviteJoin))

	h("POST /api/media", s.authed(s.handleUpload))
	mux.HandleFunc("GET /media/{id}", s.handleServeMedia)
	mux.HandleFunc("GET /media/{id}/{variant}", s.handleServeMedia)

	h("GET /api/calls", s.authed(s.handleCallHistory))
	h("GET /api/calls/ice", s.authed(s.handleICE))

	h("GET /api/ads", s.authed(s.handleActiveAds))
	h("POST /api/ads/{id}/impression", s.authed(s.handleAdImpression))
	mux.HandleFunc("GET /go/ad/{id}", s.handleAdClick)
	mux.HandleFunc("GET /go/net/{id}", s.handleNetAdClick)

	h("GET /api/admin/stats", s.admin(s.handleAdminStats))
	h("GET /api/admin/system", s.admin(s.handleAdminSystem))
	h("GET /api/admin/users", s.admin(s.handleAdminUsers))
	h("PATCH /api/admin/users/{id}", s.admin(s.handleAdminUpdateUser))
	h("DELETE /api/admin/users/{id}", s.admin(s.handleAdminDeleteUser))
	h("GET /api/admin/rooms", s.admin(s.handleAdminRooms))
	h("DELETE /api/admin/rooms/{id}", s.admin(s.handleAdminDeleteRoom))
	h("GET /api/admin/settings", s.admin(s.handleAdminGetSettings))
	h("PUT /api/admin/settings", s.admin(s.handleAdminSaveSettings))
	h("GET /api/admin/ads", s.admin(s.handleAdminAds))
	h("POST /api/admin/ads", s.admin(s.handleAdminSaveAd))
	h("PUT /api/admin/ads/{id}", s.admin(s.handleAdminSaveAd))
	h("DELETE /api/admin/ads/{id}", s.admin(s.handleAdminDeleteAd))
	h("GET /api/admin/invites", s.admin(s.handleAdminInvites))
	h("POST /api/admin/invites", s.admin(s.handleAdminCreateInvite))
	h("DELETE /api/admin/invites/{code}", s.admin(s.handleAdminDeleteInvite))
	h("GET /api/admin/backup", s.admin(s.handleAdminBackup))
	h("GET /api/admin/netads", s.admin(s.handleAdminNetAds))
	h("GET /api/admin/tls", s.admin(s.tlsAvailable(s.handleAdminTLS)))
	h("PUT /api/admin/tls", s.admin(s.tlsAvailable(s.handleAdminSaveTLS)))
	h("POST /api/admin/netads", s.admin(s.handleAdminNetAds))

	mux.HandleFunc("GET /api/ws", s.handleWS)
	mux.HandleFunc("GET /manifest.webmanifest", s.handleManifest)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.Handle("GET /api/", handlerFn(func(w http.ResponseWriter, r *http.Request) error { return errNotFound }))
	mux.Handle("GET /", s.staticHandler())
	return mux
}
