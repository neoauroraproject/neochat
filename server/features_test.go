package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// call runs an authed handler as user uid and decodes the JSON answer.
func call(t *testing.T, s *Server, fn func(http.ResponseWriter, *http.Request, *User) error, uid int64, method, path, body string, vals map[string]string) (int, map[string]any) {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	for k, v := range vals {
		r.SetPathValue(k, v)
	}
	w := httptest.NewRecorder()
	u, err := s.userByID(uid)
	if err != nil {
		t.Fatal(err)
	}
	if err := fn(w, r, u); err != nil {
		if e, ok := err.(*apiError); ok {
			return e.Status, map[string]any{"error": e.Code}
		}
		t.Fatalf("%s %s: %v", method, path, err)
	}
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func newChatTestServer(t *testing.T) (*Server, int64) {
	s := newStorageTestServer(t)
	s.db.Exec(`INSERT INTO users(username, display_name, password_hash, created_at) VALUES('sara','Sara','x',0)`)
	chatID, _, err := s.ensureDirect(1, 2)
	if err != nil {
		t.Fatal(err)
	}
	return s, chatID
}

func TestSendDedupesOutboxRetries(t *testing.T) {
	s, chat := newChatTestServer(t)
	vals := map[string]string{"id": itoa(chat)}
	body := `{"text":"hi","clientId":"c-1"}`
	code1, m1 := call(t, s, s.handleSendMessage, 1, "POST", "/x", body, vals)
	code2, m2 := call(t, s, s.handleSendMessage, 1, "POST", "/x", body, vals)
	if code1 != 201 || code2 != 200 || m1["id"] != m2["id"] {
		t.Fatalf("retry created a second message: %d %v / %d %v", code1, m1["id"], code2, m2["id"])
	}
}

func TestSyncReturnsMissedMessagesAndChanges(t *testing.T) {
	s, chat := newChatTestServer(t)
	_, cur := call(t, s, s.handleSync, 2, "GET", "/api/sync", "", nil)
	c := cur["cursor"].(map[string]any)
	msgCur, evCur := int64(c["msg"].(float64)), int64(c["ev"].(float64))

	m, _ := s.insertMessage(chat, 1, "text", "one", "", 0, "")
	m2, _ := s.insertMessage(chat, 1, "text", "two", "", 0, "")
	call(t, s, s.handleEditMessage, 1, "PATCH", "/x", `{"text":"one!"}`, map[string]string{"id": itoa(m.ID)})
	s.deleteMessage(chat, m2.ID)

	_, out := call(t, s, s.handleSync, 2, "GET", "/api/sync?msg="+itoa(msgCur)+"&ev="+itoa(max(evCur, 0)+0), "", nil)
	if n := len(out["messages"].([]any)); n != 1 {
		t.Fatalf("want the one surviving message, got %d", n)
	}
	kinds := map[string]bool{}
	for _, e := range out["events"].([]any) {
		ev := e.(map[string]any)
		kinds[ev["kind"].(string)] = true
		if ev["kind"] == "edit" && ev["message"].(map[string]any)["text"] != "one!" {
			t.Fatalf("edit event without the new text: %v", ev)
		}
	}
	if !kinds["edit"] || !kinds["delete"] {
		t.Fatalf("events %v", kinds)
	}
}

func TestReactionsForwardAndPins(t *testing.T) {
	s, chat := newChatTestServer(t)
	m, _ := s.insertMessage(chat, 1, "text", "hello", "", 0, "")
	vals := map[string]string{"id": itoa(m.ID)}
	if code, _ := call(t, s, s.handleReaction, 2, "PUT", "/x", `{"emoji":"💩"}`, vals); code != 400 {
		t.Fatal("a reaction outside the admin's list was accepted")
	}
	_, r := call(t, s, s.handleReaction, 2, "PUT", "/x", `{"emoji":"❤️"}`, vals)
	if g := r["reactions"].([]any); len(g) != 1 {
		t.Fatalf("reactions %v", r)
	}
	got, _ := s.messageByID(m.ID)
	if len(got.Reactions) != 1 || got.Reactions[0].Users[0] != 2 {
		t.Fatalf("message reactions %+v", got.Reactions)
	}

	s.db.Exec(`INSERT INTO chats(type, title, created_at) VALUES('group','G',0)`)
	var gid int64
	s.db.QueryRow(`SELECT MAX(id) FROM chats`).Scan(&gid)
	s.db.Exec(`INSERT INTO chat_members(chat_id, user_id, role, joined_at) VALUES(?,1,'owner',0)`, gid)
	_, f := call(t, s, s.handleForward, 1, "POST", "/x", `{"ids":[`+itoa(m.ID)+`],"to":[`+itoa(gid)+`]}`, nil)
	if f["count"] != float64(1) {
		t.Fatalf("forward %v", f)
	}
	var fwd string
	s.db.QueryRow(`SELECT fwd_name FROM messages WHERE chat_id=?`, gid).Scan(&fwd)
	if fwd != "Owner" {
		t.Fatalf("forwarded label %q", fwd)
	}

	call(t, s, s.handlePin, 2, "POST", "/x", "", vals)
	if ids := s.pinIDs(chat); len(ids) != 1 || ids[0] != m.ID {
		t.Fatalf("pins %v", ids)
	}
}

func TestSelfDestructStartsWhenSeen(t *testing.T) {
	s, chat := newChatTestServer(t)
	call(t, s, s.handleSetTTL, 1, "PATCH", "/x", `{"seconds":30}`, map[string]string{"id": itoa(chat)})
	_, m := call(t, s, s.handleSendMessage, 1, "POST", "/x", `{"text":"secret"}`, map[string]string{"id": itoa(chat)})
	id := int64(m["id"].(float64))
	if m["ttl"] != float64(30) || m["destroyAt"] != nil {
		t.Fatalf("new message %v", m)
	}
	// The sender reading their own chat does not start the clock; the recipient does.
	s.startCountdown(chat, 1, id)
	var at int64
	s.db.QueryRow(`SELECT destroy_at FROM messages WHERE id=?`, id).Scan(&at)
	if at != 0 {
		t.Fatal("countdown started by the sender")
	}
	s.startCountdown(chat, 2, id)
	s.db.QueryRow(`SELECT destroy_at FROM messages WHERE id=?`, id).Scan(&at)
	if at < nowMs()+25_000 {
		t.Fatalf("destroy_at %d", at)
	}
	s.db.Exec(`UPDATE messages SET destroy_at=? WHERE id=?`, nowMs()-1, id)
	s.destroyDue()
	if _, err := s.messageByID(id); err == nil {
		t.Fatal("message survived its timer")
	}
	_ = time.Second
}

func TestViewOnceIsGoneAfterOpening(t *testing.T) {
	s, chat := newChatTestServer(t)
	addMedia(t, s, "dd000000000000000000000000000001", 1000, 0)
	s.db.Exec(`UPDATE media SET kind='image' WHERE id='dd000000000000000000000000000001'`)
	_, m := call(t, s, s.handleSendMessage, 1, "POST", "/x", `{"mediaId":"dd000000000000000000000000000001","once":true}`, map[string]string{"id": itoa(chat)})
	id := itoa(int64(m["id"].(float64)))
	call(t, s, s.handleOpened, 1, "POST", "/x", "", map[string]string{"id": id}) // the sender cannot consume it
	if got, _ := s.messageByID(int64(m["id"].(float64))); got.Once != 1 {
		t.Fatal("sender opening consumed it")
	}
	_, opened := call(t, s, s.handleOpened, 2, "POST", "/x", "", map[string]string{"id": id})
	if opened["once"] != float64(2) || opened["media"] != nil {
		t.Fatalf("after opening %v", opened)
	}
	if _, err := s.mediaByID("dd000000000000000000000000000001"); err == nil {
		t.Fatal("file still on the server")
	}
}

func TestLockboxShape(t *testing.T) {
	if !validLockbox(`{"v":1,"salt":"AAAA","iv":"AAAA","ct":"AAAA","hint":"cat"}`) {
		t.Fatal("valid envelope refused")
	}
	if validLockbox(`plain text`) || validLockbox(`{"v":1,"salt":"","iv":"AAAA","ct":"AAAA"}`) {
		t.Fatal("invalid envelope accepted")
	}
}
