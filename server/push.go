package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
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

	"golang.org/x/crypto/hkdf"
)

// Web Push for new messages (RFC 8030 delivery, RFC 8291 encryption, RFC 8292 VAPID), with no
// third-party service of our own: the server signs with a key pair kept in the settings table and
// sends straight to the browser vendor's push service. Payloads are encrypted for the device, so
// the push service never sees message text.

var b64 = base64.RawURLEncoding

// Push services of the browsers that support Web Push. Subscriptions elsewhere are refused, so a
// user cannot make the server send requests to arbitrary addresses.
var pushHosts = []string{".googleapis.com", ".mozilla.com", ".push.apple.com", ".notify.windows.com"}

func validPushEndpoint(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || len(raw) > 1024 {
		return false
	}
	host := "." + strings.ToLower(u.Hostname())
	for _, h := range pushHosts {
		if strings.HasSuffix(host, h) {
			return true
		}
	}
	return false
}

type vapidKey struct {
	priv *ecdsa.PrivateKey
	pub  []byte // uncompressed P-256 point, the browser's applicationServerKey
}

var (
	vapidMu     sync.Mutex
	vapidCached *vapidKey
)

// vapid loads the server's signing key, creating it on first use.
func (s *Server) vapid() (*vapidKey, error) {
	vapidMu.Lock()
	defer vapidMu.Unlock()
	if vapidCached != nil {
		return vapidCached, nil
	}
	var raw string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key='vapid'`).Scan(&raw)
	var priv *ecdsa.PrivateKey
	if err == nil {
		der, derr := b64.DecodeString(raw)
		if derr != nil {
			return nil, derr
		}
		k, perr := x509.ParsePKCS8PrivateKey(der)
		if perr != nil {
			return nil, perr
		}
		var ok bool
		if priv, ok = k.(*ecdsa.PrivateKey); !ok {
			return nil, errors.New("vapid: stored key is not ECDSA")
		}
	} else if errors.Is(err, sql.ErrNoRows) {
		if priv, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader); err != nil {
			return nil, err
		}
		der, err := x509.MarshalPKCS8PrivateKey(priv)
		if err != nil {
			return nil, err
		}
		if _, err := s.db.Exec(`INSERT INTO settings(key,value) VALUES('vapid',?)`, b64.EncodeToString(der)); err != nil {
			return nil, err
		}
	} else {
		return nil, err
	}
	pk, err := priv.PublicKey.ECDH()
	if err != nil {
		return nil, err
	}
	vapidCached = &vapidKey{priv: priv, pub: pk.Bytes()}
	return vapidCached, nil
}

// vapidAuth builds the Authorization header for one push service origin (RFC 8292).
func (k *vapidKey) auth(endpoint string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	header := b64.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, _ := json.Marshal(map[string]any{
		"aud": u.Scheme + "://" + u.Host,
		"exp": time.Now().Add(12 * time.Hour).Unix(),
		"sub": "https://github.com/neoauroraproject/neochat",
	})
	signing := header + "." + b64.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signing))
	r, sg, err := ecdsa.Sign(rand.Reader, k.priv, digest[:])
	if err != nil {
		return "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	sg.FillBytes(sig[32:])
	return fmt.Sprintf("vapid t=%s.%s, k=%s", signing, b64.EncodeToString(sig), b64.EncodeToString(k.pub)), nil
}

// encryptPush seals a payload for one browser subscription with aes128gcm (RFC 8291, RFC 8188).
func encryptPush(payload, uaPublic, authSecret []byte) ([]byte, error) {
	curve := ecdh.P256()
	uaKey, err := curve.NewPublicKey(uaPublic)
	if err != nil {
		return nil, fmt.Errorf("bad p256dh key: %w", err)
	}
	asKey, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	shared, err := asKey.ECDH(uaKey)
	if err != nil {
		return nil, err
	}
	asPublic := asKey.PublicKey().Bytes()

	keyInfo := append(append([]byte("WebPush: info\x00"), uaPublic...), asPublic...)
	ikm := make([]byte, 32)
	if _, err := io.ReadFull(hkdf.New(sha256.New, shared, authSecret, keyInfo), ikm); err != nil {
		return nil, err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	prk := hkdf.Extract(sha256.New, ikm, salt)
	cek := make([]byte, 16)
	nonce := make([]byte, 12)
	if _, err := io.ReadFull(hkdf.Expand(sha256.New, prk, []byte("Content-Encoding: aes128gcm\x00")), cek); err != nil {
		return nil, err
	}
	if _, err := io.ReadFull(hkdf.Expand(sha256.New, prk, []byte("Content-Encoding: nonce\x00")), nonce); err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	// A single record: the payload followed by the 0x02 "last record" delimiter, no padding.
	sealed := gcm.Seal(nil, nonce, append(append([]byte{}, payload...), 2), nil)

	var out bytes.Buffer
	out.Write(salt)
	binary.Write(&out, binary.BigEndian, uint32(4096))
	out.WriteByte(byte(len(asPublic)))
	out.Write(asPublic)
	out.Write(sealed)
	return out.Bytes(), nil
}

var pushClient = &http.Client{Timeout: 15 * time.Second}

// sendPush delivers one notification. gone reports a subscription the browser has dropped.
func (s *Server) sendPush(endpoint, p256dh, auth string, payload []byte) (gone bool, err error) {
	k, err := s.vapid()
	if err != nil {
		return false, err
	}
	ua, err := b64.DecodeString(strings.TrimRight(p256dh, "="))
	if err != nil {
		return true, err
	}
	secret, err := b64.DecodeString(strings.TrimRight(auth, "="))
	if err != nil {
		return true, err
	}
	body, err := encryptPush(payload, ua, secret)
	if err != nil {
		return true, err
	}
	authz, err := k.auth(endpoint)
	if err != nil {
		return false, err
	}
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return true, err
	}
	req.Header.Set("Authorization", authz)
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", "86400")
	req.Header.Set("Urgency", "high")
	res, err := pushClient.Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
	switch {
	case res.StatusCode == 404 || res.StatusCode == 410:
		return true, nil
	case res.StatusCode >= 400:
		return false, fmt.Errorf("push service answered %s", res.Status)
	}
	return false, nil
}

type pushPayload struct {
	Title  string `json:"title"`
	Body   string `json:"body"`
	ChatID int64  `json:"chatId"`
	Tag    string `json:"tag"`
	// Ring marks an incoming call: the notification stays up and vibrates like a ringtone.
	Ring bool `json:"ring,omitempty"`
}

var mediaLabels = map[string][2]string{ // kind -> {en, fa}
	"image": {"📷 Photo", "📷 عکس"},
	"video": {"🎥 Video", "🎥 ویدیو"},
	"voice": {"🎤 Voice message", "🎤 پیام صوتی"},
	"audio": {"🎵 Audio", "🎵 صوت"},
	"file":  {"📎 File", "📎 فایل"},
}

var callLabels = map[string][2]string{ // "<state>:<video>" -> {en, fa}
	"incoming:false": {"📞 Incoming call…", "📞 تماس ورودی…"},
	"incoming:true":  {"📹 Incoming video call…", "📹 تماس تصویری ورودی…"},
	"missed:false":   {"📞 Missed call", "📞 تماس از دست رفته"},
	"missed:true":    {"📹 Missed video call", "📹 تماس تصویری از دست رفته"},
}

func pick(l [2]string, lang string) string {
	if lang == "fa" {
		return l[1]
	}
	return l[0]
}

// callTag is shared by the ringing and the missed-call notification of a chat, so the
// "missed call" replaces "incoming call" instead of stacking under it.
func callTag(chatID int64) string { return fmt.Sprintf("call-%d", chatID) }

// pushText is the notification for one reader, in their language. ok is false for messages
// that should not notify, such as the log line of a call that was answered.
func pushText(m *Message, chatType, chatTitle, lang string) (p pushPayload, ok bool) {
	if m.Kind == "call" {
		// The text of a call message is {"status":..., "video":..., "duration":...}.
		var c struct {
			Status string `json:"status"`
			Video  bool   `json:"video"`
		}
		json.Unmarshal([]byte(m.Text), &c)
		if c.Status != "missed" && c.Status != "cancelled" {
			return p, false
		}
		label := callLabels[fmt.Sprintf("missed:%v", c.Video)]
		return pushPayload{Title: m.Sender.DisplayName, Body: pick(label, lang), ChatID: m.ChatID, Tag: callTag(m.ChatID)}, true
	}
	body := m.Text
	switch {
	case m.Kind == "locked":
		body = pick([2]string{"🔒 Locked message", "🔒 پیام قفل‌دار"}, lang) // never the envelope
	case m.Once > 0:
		body = pick([2]string{"⏱ View-once media", "⏱ رسانه‌ی یک‌بار دیدنی"}, lang)
	}
	if l, ok := mediaLabels[m.Kind]; ok && m.Once == 0 {
		if body == "" {
			body = pick(l, lang)
		} else {
			body = pick(l, lang) + " " + body
		}
	}
	if r := []rune(body); len(r) > 180 {
		body = string(r[:180]) + "…"
	}
	title := m.Sender.DisplayName
	switch chatType {
	case "group":
		title, body = chatTitle, m.Sender.DisplayName+": "+body
	case "channel":
		title = chatTitle
	}
	return pushPayload{Title: title, Body: body, ChatID: m.ChatID, Tag: fmt.Sprintf("chat-%d", m.ChatID)}, true
}

type pushSub struct {
	id                           int64
	endpoint, p256dh, auth, lang string
}

// subscriptions of active users; the query selects id, endpoint, p256dh, auth, lang.
func (s *Server) pushSubs(query string, args ...any) []pushSub {
	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("push: %v", err)
		return nil
	}
	defer rows.Close()
	var subs []pushSub
	for rows.Next() {
		var x pushSub
		if rows.Scan(&x.id, &x.endpoint, &x.p256dh, &x.auth, &x.lang) == nil {
			subs = append(subs, x)
		}
	}
	return subs
}

// deliver sends one notification per subscription, a few at a time, and forgets the dead ones.
func (s *Server) deliver(subs []pushSub, build func(lang string) (pushPayload, bool)) {
	work := make(chan pushSub)
	var wg sync.WaitGroup
	for i := 0; i < min(8, len(subs)); i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for x := range work {
				p, ok := build(x.lang)
				if !ok {
					continue
				}
				payload, _ := json.Marshal(p)
				gone, err := s.sendPush(x.endpoint, x.p256dh, x.auth, payload)
				if gone {
					s.db.Exec(`DELETE FROM push_subscriptions WHERE id=?`, x.id)
				} else if err != nil {
					log.Printf("push: %v", err)
				}
			}
		}()
	}
	for _, x := range subs {
		work <- x
	}
	close(work)
	wg.Wait()
}

func (s *Server) hasPush(uid int64) bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM push_subscriptions WHERE user_id=?`, uid).Scan(&n)
	return n > 0
}

// pushMessage notifies every member's subscribed devices, except the sender and muted chats.
func (s *Server) pushMessage(m *Message) {
	if m.Kind == "system" || m.Sender == nil {
		return
	}
	var chatType, chatTitle string
	if err := s.db.QueryRow(`SELECT type, title FROM chats WHERE id=?`, m.ChatID).Scan(&chatType, &chatTitle); err != nil {
		return
	}
	subs := s.pushSubs(`
SELECT p.id, p.endpoint, p.p256dh, p.auth, p.lang FROM push_subscriptions p
JOIN chat_members cm ON cm.user_id=p.user_id AND cm.chat_id=?
JOIN users u ON u.id=p.user_id
WHERE cm.muted=0 AND p.user_id<>? AND u.banned=0 AND u.deleted=0`, m.ChatID, m.SenderID)
	s.deliver(subs, func(lang string) (pushPayload, bool) { return pushText(m, chatType, chatTitle, lang) })
}

// pushCall rings the callee's devices; calls ring even in a muted chat, like a phone.
func (s *Server) pushCall(call *Call, from *User) {
	subs := s.pushSubs(`SELECT id, endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id=?`, call.CalleeID)
	label := fmt.Sprintf("incoming:%v", call.Video)
	s.deliver(subs, func(lang string) (pushPayload, bool) {
		return pushPayload{Title: from.DisplayName, Body: pick(callLabels[label], lang), ChatID: call.ChatID, Tag: callTag(call.ChatID), Ring: true}, true
	})
}

func (s *Server) handlePushKey(w http.ResponseWriter, r *http.Request, u *User) error {
	k, err := s.vapid()
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]string{"key": b64.EncodeToString(k.pub)})
	return nil
}

// handlePushSubscribe ties this browser's subscription to the current session, so signing out
// or terminating the session from another device also stops its notifications.
func (s *Server) handlePushSubscribe(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
		Lang string `json:"lang"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if !validPushEndpoint(req.Endpoint) || req.Keys.P256dh == "" || req.Keys.Auth == "" ||
		len(req.Keys.P256dh) > 200 || len(req.Keys.Auth) > 100 {
		return errf(400, "bad_request", "unsupported push subscription")
	}
	if req.Lang != "fa" {
		req.Lang = "en"
	}
	sid, _ := r.Context().Value(ctxSession).(int64)
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM push_subscriptions WHERE session_id=? AND endpoint<>?`, sid, req.Endpoint); err != nil {
		return err
	}
	if _, err := tx.Exec(`
INSERT INTO push_subscriptions(user_id, session_id, endpoint, p256dh, auth, lang, created_at) VALUES(?,?,?,?,?,?,?)
ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, session_id=excluded.session_id,
	p256dh=excluded.p256dh, auth=excluded.auth, lang=excluded.lang`,
		u.ID, sid, req.Endpoint, req.Keys.P256dh, req.Keys.Auth, req.Lang, nowMs()); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) handlePushUnsubscribe(w http.ResponseWriter, r *http.Request, u *User) error {
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := readJSON(r, &req); err != nil {
		return err
	}
	if _, err := s.db.Exec(`DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?`, req.Endpoint, u.ID); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
