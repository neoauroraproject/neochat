package main

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/crypto/acme"
)

// A failed Let's Encrypt order must not take the server down: requests get the self-signed
// certificate, the failure is recorded, and the next order waits.
func TestLetsEncryptFallsBackToSelfSigned(t *testing.T) {
	dir := t.TempDir()
	var calls atomic.Int32
	ca := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, "bad request", http.StatusBadRequest)
	}))
	defer ca.Close()

	m := &tlsManager{
		s:   &Server{opts: Options{DataDir: dir, HTTPPort: ":80"}},
		dir: filepath.Join(dir, "tls"),
		cfg: tlsSettings{Mode: "letsencrypt", Domain: "chat.example.com"},
	}
	os.MkdirAll(m.dir, 0o700)
	if err := m.apply(); err != nil {
		t.Fatal(err)
	}
	if m.fallback == nil {
		t.Fatal("no self-signed fallback loaded")
	}
	m.acme.Client = &acme.Client{DirectoryURL: ca.URL}

	for _, name := range []string{"", "203.0.113.7", "other.example.com"} {
		c, err := m.getCertificate(&tls.ClientHelloInfo{ServerName: name})
		if err != nil || c != m.fallback {
			t.Fatalf("SNI %q: got %v, %v; want the fallback certificate", name, c, err)
		}
	}
	if m.err != "" {
		t.Fatalf("requests by IP must not start an order, got error %q", m.err)
	}

	c, err := m.getCertificate(&tls.ClientHelloInfo{ServerName: "chat.example.com"})
	if err != nil || c != m.fallback {
		t.Fatalf("failed order: got %v, %v; want the fallback certificate", c, err)
	}
	if m.err == "" || !m.retryAt.After(time.Now()) {
		t.Fatalf("failure not recorded: err=%q retryAt=%v", m.err, m.retryAt)
	}

	before := calls.Load()
	if c, err := m.getCertificate(&tls.ClientHelloInfo{ServerName: "chat.example.com"}); err != nil || c != m.fallback {
		t.Fatalf("during the pause: got %v, %v; want the fallback certificate", c, err)
	}
	if calls.Load() != before {
		t.Fatal("a new order was started during the pause after a failure")
	}
}
