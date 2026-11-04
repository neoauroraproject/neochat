package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newCallTestServer(t *testing.T) *Server {
	t.Helper()
	db, err := openDB(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	vapidCached = nil
	s := &Server{db: db, limiter: newLimiter()}
	s.hub = newHub(s)
	s.calls = newCallManager(s)
	if err := s.loadSettings(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"caller", "pushable", "unreachable"} {
		if _, err := db.Exec(`INSERT INTO users(username, display_name, password_hash, created_at) VALUES(?,?,'x',?)`, name, strings.ToUpper(name[:1])+name[1:], nowMs()); err != nil {
			t.Fatal(err)
		}
	}
	return s
}

// nextEvent reads the next event of the given type a test client received.
func nextEvent(t *testing.T, c *Client, want string) map[string]any {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case b := <-c.send:
			var ev struct {
				T string         `json:"t"`
				D map[string]any `json:"d"`
			}
			json.Unmarshal(b, &ev)
			if ev.T == want {
				return ev.D
			}
			if ev.T == "call_failed" {
				t.Fatalf("waiting for %s, got call_failed %v", want, ev.D)
			}
		case <-deadline:
			t.Fatalf("no %s event", want)
		}
	}
}

// A callee whose app is in the background has no connection but can be woken by a push:
// the call must ring (not fail as "offline"), push an "incoming call", and reach the app
// as soon as it connects.
func TestCallRingsOfflineUserThroughPush(t *testing.T) {
	s := newCallTestServer(t)

	uaKey, _ := ecdh.P256().GenerateKey(rand.Reader)
	secret := make([]byte, 16)
	rand.Read(secret)
	got := make(chan []byte, 4)
	ps := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got <- b
		w.WriteHeader(http.StatusCreated)
	}))
	defer ps.Close()
	res, _ := s.db.Exec(`INSERT INTO sessions(token_hash, user_id, created_at, last_used) VALUES('h',2,0,0)`)
	sid, _ := res.LastInsertId()
	if _, err := s.db.Exec(`INSERT INTO push_subscriptions(user_id, session_id, endpoint, p256dh, auth, lang, created_at) VALUES(2,?,?,?,?,'fa',0)`,
		sid, ps.URL+"/sub", b64.EncodeToString(uaKey.PublicKey().Bytes()), b64.EncodeToString(secret)); err != nil {
		t.Fatal(err)
	}

	caller := &Client{hub: s.hub, userID: 1, send: make(chan []byte, 32)}
	s.hub.add(caller)
	s.calls.invite(caller, 2, true, "r1")
	created := nextEvent(t, caller, "call_created")

	select {
	case body := <-got:
		var p pushPayload
		json.Unmarshal(decryptPush(t, body, uaKey, secret), &p)
		if !p.Ring || p.Title != "Caller" || p.Body != "📹 تماس تصویری ورودی…" {
			t.Fatalf("incoming call push: %+v", p)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no incoming-call push")
	}

	callee := &Client{hub: s.hub, userID: 2, send: make(chan []byte, 32)}
	s.hub.add(callee)
	s.calls.ringIfWaiting(callee)
	incoming := nextEvent(t, callee, "call_incoming")
	if incoming["callId"] != created["callId"] || incoming["video"] != true {
		t.Fatalf("call_incoming %v does not match call %v", incoming, created)
	}
	s.calls.finish(created["callId"].(string), 1, "ended")
}

func TestCallFailsForUnreachableUser(t *testing.T) {
	s := newCallTestServer(t)
	caller := &Client{hub: s.hub, userID: 1, send: make(chan []byte, 32)}
	s.hub.add(caller)
	s.calls.invite(caller, 3, false, "r2")
	for {
		select {
		case b := <-caller.send:
			if strings.Contains(string(b), `"call_failed"`) {
				if !strings.Contains(string(b), `"offline"`) {
					t.Fatalf("want offline, got %s", b)
				}
				return
			}
		case <-time.After(2 * time.Second):
			t.Fatal("no call_failed for a user with no connection and no push")
		}
	}
}

// A participant whose socket drops (Wi-Fi → mobile data) keeps the call: the other side hears
// they are away, and a new connection within the grace period resumes it.
func TestCallSurvivesShortDisconnect(t *testing.T) {
	s := newCallTestServer(t)
	caller := &Client{hub: s.hub, userID: 1, send: make(chan []byte, 32)}
	callee := &Client{hub: s.hub, userID: 2, send: make(chan []byte, 32)}
	s.hub.add(caller)
	s.hub.add(callee)
	s.calls.invite(caller, 2, true, "r3")
	id := nextEvent(t, caller, "call_created")["callId"].(string)
	nextEvent(t, callee, "call_incoming")
	s.calls.accept(callee, id)
	nextEvent(t, caller, "call_accepted")

	s.calls.clientGone(callee)
	s.hub.remove(callee)
	if got := nextEvent(t, caller, "call_peer_away"); got["callId"] != id {
		t.Fatalf("call_peer_away %v", got)
	}
	if s.calls.activeCount() != 1 {
		t.Fatal("call ended on a dropped socket")
	}

	again := &Client{hub: s.hub, userID: 2, send: make(chan []byte, 32)}
	s.hub.add(again)
	s.calls.reattach(again)
	resume := nextEvent(t, again, "call_resume")
	if resume["callId"] != id || resume["status"] != "active" || resume["caller"] != false {
		t.Fatalf("call_resume %v", resume)
	}
	nextEvent(t, caller, "call_peer_back")

	// Signaling flows to the new connection.
	s.calls.signal(caller, id, json.RawMessage(`{"type":"offer"}`))
	nextEvent(t, again, "call_signal")
	s.calls.finish(id, 1, "ended")
}

func TestCallEndsWhenPeerNeverReturns(t *testing.T) {
	old := callGrace
	callGrace = 50 * time.Millisecond
	defer func() { callGrace = old }()
	s := newCallTestServer(t)
	caller := &Client{hub: s.hub, userID: 1, send: make(chan []byte, 32)}
	callee := &Client{hub: s.hub, userID: 2, send: make(chan []byte, 32)}
	s.hub.add(caller)
	s.hub.add(callee)
	s.calls.invite(caller, 2, false, "r4")
	id := nextEvent(t, caller, "call_created")["callId"].(string)
	s.calls.accept(callee, id)
	s.calls.clientGone(callee)
	s.hub.remove(callee)
	if got := nextEvent(t, caller, "call_ended"); got["callId"] != id {
		t.Fatalf("call_ended %v", got)
	}
}

// A call left over on the server (its hang-up lost with a dropped connection) must not make every
// new call fail: starting a call ends the caller's earlier one first.
func TestNewCallEndsLeftoverCall(t *testing.T) {
	s := newCallTestServer(t)
	caller := &Client{hub: s.hub, userID: 1, session: 7, send: make(chan []byte, 32)}
	callee := &Client{hub: s.hub, userID: 2, session: 8, send: make(chan []byte, 32)}
	s.hub.add(caller)
	s.hub.add(callee)
	s.calls.invite(caller, 2, true, "first")
	first := nextEvent(t, caller, "call_created")["callId"].(string)
	nextEvent(t, callee, "call_incoming")

	s.calls.invite(caller, 2, true, "second")
	if got := nextEvent(t, caller, "call_ended"); got["callId"] != first {
		t.Fatalf("leftover call not ended: %v", got)
	}
	created := nextEvent(t, caller, "call_created")
	if created["ref"] != "second" || created["callId"] == first {
		t.Fatalf("new call not started: %v", created)
	}
	if s.calls.activeCount() != 1 {
		t.Fatalf("%d calls on the server, want 1", s.calls.activeCount())
	}
}

// The same person's other device (a laptop left open) connecting during a dropped phone's grace
// period must not take the phone's place in the call.
func TestOtherDeviceDoesNotTakeOverCall(t *testing.T) {
	old := callGrace
	callGrace = 80 * time.Millisecond
	defer func() { callGrace = old }()
	s := newCallTestServer(t)
	caller := &Client{hub: s.hub, userID: 1, session: 7, send: make(chan []byte, 32)}
	callee := &Client{hub: s.hub, userID: 2, session: 8, send: make(chan []byte, 32)}
	s.hub.add(caller)
	s.hub.add(callee)
	s.calls.invite(caller, 2, true, "r")
	id := nextEvent(t, caller, "call_created")["callId"].(string)
	nextEvent(t, callee, "call_incoming")
	s.calls.accept(callee, id)
	nextEvent(t, caller, "call_accepted")

	s.calls.clientGone(callee)
	s.hub.remove(callee)
	laptop := &Client{hub: s.hub, userID: 2, session: 9, send: make(chan []byte, 32)}
	s.hub.add(laptop)
	s.calls.reattach(laptop)
	select {
	case b := <-laptop.send:
		t.Fatalf("another device was put into the call: %s", b)
	case <-time.After(30 * time.Millisecond):
	}
	// The phone never came back, so the call ends after the grace period.
	if got := nextEvent(t, caller, "call_ended"); got["callId"] != id {
		t.Fatalf("call_ended %v", got)
	}
}
