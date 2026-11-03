package main

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/acme"
	"golang.org/x/crypto/acme/autocert"
)

// TLS is managed from the admin panel and hot-swapped: certificates are served through
// GetCertificate, so switching mode or uploading a certificate needs no restart.
//
// Modes:
//   self-signed  generated locally (works fully offline; browsers show a warning once)
//   custom       PEM certificate + key uploaded by the admin (e.g. from your own CA)
//   letsencrypt  automatic certificates for a domain (needs the domain to reach this server)

type tlsSettings struct {
	Mode   string `json:"mode"`
	Domain string `json:"domain"`
	Email  string `json:"email"`
	Hosts  string `json:"hosts"` // extra names/IPs for the self-signed certificate
}

type tlsManager struct {
	s    *Server
	dir  string
	mu   sync.RWMutex
	cfg  tlsSettings
	cert *tls.Certificate
	acme *autocert.Manager
	err  string
	// In Let's Encrypt mode the self-signed certificate still answers requests by IP or another name,
	// and covers the pause after a failed order, so a DNS or firewall mistake never takes the app down.
	fallback *tls.Certificate
	retryAt  time.Time
	issued   bool
}

func newTLSManager(s *Server) *tlsManager {
	m := &tlsManager{s: s, dir: filepath.Join(s.opts.DataDir, "tls")}
	os.MkdirAll(m.dir, 0o700)
	var raw string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key='tls'`).Scan(&raw)
	switch {
	case err == nil:
		json.Unmarshal([]byte(raw), &m.cfg)
	case errors.Is(err, sql.ErrNoRows):
		// First start: command-line flags decide the initial mode.
		m.cfg = tlsSettings{Mode: "self-signed", Hosts: s.opts.Hosts}
		if s.opts.TLSCert != "" {
			if err := m.importFiles(s.opts.TLSCert, s.opts.TLSKey); err != nil {
				log.Printf("tls: %v", err)
			} else {
				m.cfg.Mode = "custom"
			}
		}
	}
	if err := m.apply(); err != nil {
		log.Printf("tls: %v — falling back to self-signed", err)
		m.cfg.Mode = "self-signed"
		if err := m.apply(); err != nil {
			log.Printf("tls: %v", err)
		}
	}
	return m
}

func (m *tlsManager) customPaths() (string, string) {
	return filepath.Join(m.dir, "custom-cert.pem"), filepath.Join(m.dir, "custom-key.pem")
}

func (m *tlsManager) importFiles(certPath, keyPath string) error {
	c, err := os.ReadFile(certPath)
	if err != nil {
		return err
	}
	k, err := os.ReadFile(keyPath)
	if err != nil {
		return err
	}
	return m.saveCustom(c, k)
}

func (m *tlsManager) saveCustom(certPEM, keyPEM []byte) error {
	if _, err := tls.X509KeyPair(certPEM, keyPEM); err != nil {
		return errf(400, "bad_certificate", "certificate and key do not match or are not valid PEM: "+err.Error())
	}
	cp, kp := m.customPaths()
	if err := os.WriteFile(cp, certPEM, 0o644); err != nil {
		return err
	}
	return os.WriteFile(kp, keyPEM, 0o600)
}

// apply loads the certificate for the current mode.
func (m *tlsManager) apply() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.err = ""
	m.acme = nil
	m.fallback = nil
	m.retryAt = time.Time{}
	m.issued = false
	switch m.cfg.Mode {
	case "custom":
		cp, kp := m.customPaths()
		c, err := tls.LoadX509KeyPair(cp, kp)
		if err != nil {
			m.err = err.Error()
			return fmt.Errorf("custom certificate: %w", err)
		}
		m.cert = &c
	case "letsencrypt":
		if m.cfg.Domain == "" {
			return errf(400, "bad_request", "a domain is required for Let's Encrypt")
		}
		m.acme = &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			Cache:      autocert.DirCache(filepath.Join(m.dir, "acme")),
			HostPolicy: autocert.HostWhitelist(m.cfg.Domain),
			Email:      m.cfg.Email,
		}
		// autocert only offers http-01 after HTTPHandler has been called; without this, a server that is
		// not on port 443 could only be validated once some request happened to reach port 80.
		if m.s.opts.HTTPPort != "" {
			m.acme.HTTPHandler(nil)
		}
		m.cert = nil
		hosts := append(strings.Split(m.cfg.Hosts, ","), m.cfg.Domain)
		if cp, kp, err := ensureSelfSigned(m.s.opts.DataDir, hosts); err == nil {
			if c, err := tls.LoadX509KeyPair(cp, kp); err == nil {
				m.fallback = &c
			}
		}
	default:
		m.cfg.Mode = "self-signed"
		cp, kp, err := ensureSelfSigned(m.s.opts.DataDir, strings.Split(m.cfg.Hosts, ","))
		if err != nil {
			return err
		}
		c, err := tls.LoadX509KeyPair(cp, kp)
		if err != nil {
			return err
		}
		m.cert = &c
	}
	return nil
}

func (m *tlsManager) getCertificate(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	m.mu.RLock()
	am, cert, fb, domain, retryAt := m.acme, m.cert, m.fallback, m.cfg.Domain, m.retryAt
	m.mu.RUnlock()
	if am == nil {
		return cert, nil
	}
	name := strings.TrimSuffix(strings.ToLower(hello.ServerName), ".")
	challenge := len(hello.SupportedProtos) == 1 && hello.SupportedProtos[0] == acme.ALPNProto
	if !challenge && fb != nil && (name != domain || time.Now().Before(retryAt)) {
		return fb, nil
	}
	c, err := am.GetCertificate(hello)
	m.mu.Lock()
	if err != nil && !challenge {
		// Let's Encrypt allows only a few failed validations per hour; wait before ordering again.
		m.retryAt = time.Now().Add(10 * time.Minute)
		if m.err != err.Error() {
			log.Printf("tls: let's encrypt for %s failed: %v", domain, err)
		}
		m.err = err.Error()
	} else if err == nil && !challenge && !m.issued {
		m.issued, m.err = true, ""
		log.Printf("tls: let's encrypt certificate ready for %s", domain)
	}
	m.mu.Unlock()
	if err != nil && !challenge && fb != nil {
		return fb, nil
	}
	return c, err
}

func (m *tlsManager) tlsConfig() *tls.Config {
	return &tls.Config{
		MinVersion:     tls.VersionTLS12,
		GetCertificate: m.getCertificate,
		// acme-tls/1 lets Let's Encrypt validate over the HTTPS port itself (no port 80 needed).
		NextProtos: []string{"h2", "http/1.1", acme.ALPNProto},
	}
}

// httpHandler wraps the plain-HTTP listener so Let's Encrypt HTTP-01 challenges also work.
func (m *tlsManager) httpHandler(fallback http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.mu.RLock()
		am := m.acme
		m.mu.RUnlock()
		if am != nil {
			am.HTTPHandler(fallback).ServeHTTP(w, r)
			return
		}
		fallback.ServeHTTP(w, r)
	})
}

func (m *tlsManager) status() map[string]any {
	m.mu.RLock()
	cfg, cert, am, errText := m.cfg, m.cert, m.acme, m.err
	m.mu.RUnlock()
	out := map[string]any{"mode": cfg.Mode, "domain": cfg.Domain, "email": cfg.Email, "hosts": cfg.Hosts, "error": errText, "https": m.s.httpsOn}
	if am != nil && cfg.Domain != "" {
		// Through getCertificate, so viewing the page honours the pause after a failed order.
		if c, err := m.getCertificate(&tls.ClientHelloInfo{ServerName: cfg.Domain}); err == nil {
			cert = c
		}
	}
	if cert != nil && len(cert.Certificate) > 0 {
		if x, err := x509.ParseCertificate(cert.Certificate[0]); err == nil {
			names := append([]string{}, x.DNSNames...)
			for _, ip := range x.IPAddresses {
				names = append(names, ip.String())
			}
			out["certificate"] = map[string]any{
				"subject":  x.Subject.CommonName,
				"issuer":   x.Issuer.CommonName,
				"notAfter": x.NotAfter.UnixMilli(),
				"names":    names,
				"daysLeft": int(time.Until(x.NotAfter).Hours() / 24),
			}
		}
	}
	return out
}

func (m *tlsManager) save() error {
	m.mu.RLock()
	raw, _ := json.Marshal(m.cfg)
	m.mu.RUnlock()
	_, err := m.s.db.Exec(`INSERT INTO settings(key,value) VALUES('tls',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(raw))
	return err
}

// tlsAvailable rejects TLS management when the server runs in plain-HTTP development mode.
func (s *Server) tlsAvailable(fn authedFn) authedFn {
	return func(w http.ResponseWriter, r *http.Request, u *User) error {
		if s.tlsm == nil {
			writeJSON(w, 200, map[string]any{"mode": "off", "https": false})
			return nil
		}
		return fn(w, r, u)
	}
}

func (s *Server) handleAdminTLS(w http.ResponseWriter, r *http.Request, u *User) error {
	writeJSON(w, 200, s.tlsm.status())
	return nil
}

func (s *Server) handleAdminSaveTLS(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		tlsSettings
		Cert       string `json:"cert"`
		Key        string `json:"key"`
		Regenerate bool   `json:"regenerate"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	m := s.tlsm
	req.Domain = strings.ToLower(strings.TrimSpace(req.Domain))
	switch req.Mode {
	case "custom":
		if req.Cert != "" || req.Key != "" {
			if err := m.saveCustom([]byte(strings.TrimSpace(req.Cert)+"\n"), []byte(strings.TrimSpace(req.Key)+"\n")); err != nil {
				return err
			}
		} else if _, err := os.Stat(func() string { c, _ := m.customPaths(); return c }()); err != nil {
			return errf(400, "bad_request", "paste a certificate and private key first")
		}
	case "letsencrypt":
		if req.Domain == "" || !strings.Contains(req.Domain, ".") {
			return errf(400, "bad_request", "enter the domain that points to this server")
		}
	case "self-signed":
		if req.Regenerate || req.Hosts != m.cfg.Hosts {
			os.Remove(filepath.Join(m.dir, "cert.pem"))
			os.Remove(filepath.Join(m.dir, "key.pem"))
		}
	default:
		return errf(400, "bad_request", "unknown mode")
	}
	prev := m.cfg
	m.mu.Lock()
	m.cfg = req.tlsSettings
	m.mu.Unlock()
	if err := m.apply(); err != nil {
		m.mu.Lock()
		m.cfg = prev
		m.mu.Unlock()
		m.apply()
		return err
	}
	if err := m.save(); err != nil {
		return err
	}
	writeJSON(w, 200, m.status())
	return nil
}

// runTLSCommand switches the certificate mode from the terminal (used by the installer):
//
//	neochat tls [-data DIR] status | self-signed | letsencrypt <domain> [email]
//
// The server reads the mode when it starts, so restart it afterwards.
func runTLSCommand(o Options, args []string) {
	if err := os.MkdirAll(o.DataDir, 0o750); err != nil {
		log.Fatal(err)
	}
	db, err := openDB(o.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	cfg := tlsSettings{Mode: "self-signed"}
	var raw string
	if err := db.QueryRow(`SELECT value FROM settings WHERE key='tls'`).Scan(&raw); err == nil {
		json.Unmarshal([]byte(raw), &cfg)
	}
	mode := "status"
	if len(args) > 0 {
		mode = args[0]
	}
	switch mode {
	case "status":
		fmt.Println(cfg.Mode, cfg.Domain)
		return
	case "self-signed":
		cfg.Mode = "self-signed"
	case "letsencrypt":
		if len(args) < 2 || !strings.Contains(args[1], ".") {
			log.Fatal("usage: neochat tls letsencrypt <domain> [email]")
		}
		cfg.Mode = "letsencrypt"
		cfg.Domain = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(args[1])), ".")
		if len(args) > 2 {
			cfg.Email = strings.TrimSpace(args[2])
		}
	default:
		log.Fatal("usage: neochat tls status | self-signed | letsencrypt <domain> [email]")
	}
	b, _ := json.Marshal(cfg)
	if _, err := db.Exec(`INSERT INTO settings(key,value) VALUES('tls',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(b)); err != nil {
		log.Fatal(err)
	}
	fmt.Println("done; restart NeoChat to apply")
}
