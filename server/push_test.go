package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/crypto/hkdf"
)

// decryptPush is the browser's side of RFC 8291, written from the spec independently of encryptPush.
func decryptPush(t *testing.T, body []byte, uaKey *ecdh.PrivateKey, authSecret []byte) []byte {
	t.Helper()
	salt, rs, idlen := body[:16], binary.BigEndian.Uint32(body[16:20]), int(body[20])
	asPublic, sealed := body[21:21+idlen], body[21+idlen:]
	if rs != 4096 || idlen != 65 {
		t.Fatalf("header: rs=%d idlen=%d", rs, idlen)
	}
	asKey, err := ecdh.P256().NewPublicKey(asPublic)
	if err != nil {
		t.Fatal(err)
	}
	shared, _ := uaKey.ECDH(asKey)
	info := append(append([]byte("WebPush: info\x00"), uaKey.PublicKey().Bytes()...), asPublic...)
	ikm := make([]byte, 32)
	io.ReadFull(hkdf.New(sha256.New, shared, authSecret, info), ikm)
	cek, nonce := make([]byte, 16), make([]byte, 12)
	io.ReadFull(hkdf.New(sha256.New, ikm, salt, []byte("Content-Encoding: aes128gcm\x00")), cek)
	io.ReadFull(hkdf.New(sha256.New, ikm, salt, []byte("Content-Encoding: nonce\x00")), nonce)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if plain[len(plain)-1] != 2 {
		t.Fatal("missing last-record delimiter")
	}
	return plain[:len(plain)-1]
}

func TestSendPushEncryptsAndSigns(t *testing.T) {
	db, err := openDB(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	vapidCached = nil
	s := &Server{db: db}

	uaKey, _ := ecdh.P256().GenerateKey(rand.Reader)
	secret := make([]byte, 16)
	rand.Read(secret)

	status := http.StatusCreated
	var got []byte
	ps := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Encoding") != "aes128gcm" || r.Header.Get("TTL") == "" {
			t.Errorf("headers: %v", r.Header)
		}
		// Authorization: vapid t=<jwt>, k=<public key>; the JWT must verify against k.
		var jwt, k string
		for _, part := range strings.Split(strings.TrimPrefix(r.Header.Get("Authorization"), "vapid "), ", ") {
			if v, ok := strings.CutPrefix(part, "t="); ok {
				jwt = v
			} else if v, ok := strings.CutPrefix(part, "k="); ok {
				k = v
			}
		}
		parts := strings.Split(jwt, ".")
		pub, _ := b64.DecodeString(k)
		sig, _ := b64.DecodeString(parts[2])
		x, y := new(big.Int).SetBytes(pub[1:33]), new(big.Int).SetBytes(pub[33:])
		digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		vk := &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}
		if !ecdsa.Verify(vk, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
			t.Error("VAPID signature does not verify")
		}
		claims, _ := b64.DecodeString(parts[1])
		if !strings.Contains(string(claims), `"aud":"http://127.0.0.1`) {
			t.Errorf("aud claim: %s", claims)
		}
		got, _ = io.ReadAll(r.Body)
		w.WriteHeader(status)
	}))
	defer ps.Close()

	payload, _ := json.Marshal(pushPayload{Title: "Sara", Body: "سلام", ChatID: 7, Tag: "chat-7"})
	gone, err := s.sendPush(ps.URL+"/sub/1", b64.EncodeToString(uaKey.PublicKey().Bytes()), b64.EncodeToString(secret), payload)
	if err != nil || gone {
		t.Fatalf("send: gone=%v err=%v", gone, err)
	}
	if plain := decryptPush(t, got, uaKey, secret); string(plain) != string(payload) {
		t.Fatalf("payload: got %q want %q", plain, payload)
	}

	status = http.StatusGone
	if gone, _ := s.sendPush(ps.URL+"/sub/1", b64.EncodeToString(uaKey.PublicKey().Bytes()), b64.EncodeToString(secret), payload); !gone {
		t.Fatal("410 must report the subscription as gone")
	}
}

func TestPushEndpointAllowlist(t *testing.T) {
	for raw, want := range map[string]bool{
		"https://fcm.googleapis.com/fcm/send/abc":          true,
		"https://updates.push.services.mozilla.com/wpush/": true,
		"https://web.push.apple.com/QAbc":                  true,
		"https://wns2-par02p.notify.windows.com/w/?token=": true,
		"http://fcm.googleapis.com/fcm/send/abc":           false,
		"https://127.0.0.1/admin":                          false,
		"https://evilgoogleapis.com/x":                     false,
		"https://user@fcm.googleapis.com/x":                false,
	} {
		if validPushEndpoint(raw) != want {
			t.Errorf("%s: want %v", raw, want)
		}
	}
}

func TestPushText(t *testing.T) {
	m := &Message{ChatID: 3, Kind: "image", Text: "", Sender: &MessageSender{DisplayName: "Ali"}}
	if p, ok := pushText(m, "group", "Team", "fa"); !ok || p.Title != "Team" || p.Body != "Ali: 📷 عکس" {
		t.Fatalf("group photo: %+v", p)
	}
	m.Kind, m.Text = "text", "hi"
	if p, ok := pushText(m, "direct", "", "en"); !ok || p.Title != "Ali" || p.Body != "hi" {
		t.Fatalf("direct text: %+v", p)
	}

	// Call log lines carry JSON; a missed call reads as one, an answered call does not notify.
	m.Kind, m.Text = "call", `{"duration":0,"status":"missed","video":true}`
	if p, ok := pushText(m, "direct", "", "fa"); !ok || p.Body != "📹 تماس تصویری از دست رفته" || p.Tag != "call-3" {
		t.Fatalf("missed call: %+v", p)
	}
	m.Text = `{"duration":0,"status":"cancelled","video":false}`
	if p, ok := pushText(m, "direct", "", "en"); !ok || p.Body != "📞 Missed call" {
		t.Fatalf("cancelled call: %+v", p)
	}
	m.Text = `{"duration":20,"status":"ended","video":true}`
	if p, ok := pushText(m, "direct", "", "en"); ok {
		t.Fatalf("answered call must not notify, got %+v", p)
	}
}
