package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
)

// Settings is everything the admin can change at runtime from the panel.
type Settings struct {
	// Branding
	AppName         string `json:"appName"`
	Tagline         string `json:"tagline"`
	LogoMedia       string `json:"logoMedia"`
	BackgroundMedia string `json:"backgroundMedia"`
	AccentColor     string `json:"accentColor"`
	DefaultLang     string `json:"defaultLang"`
	DefaultTheme    string `json:"defaultTheme"`
	WelcomeText     string `json:"welcomeText"`

	// Registration & security
	Registration      string `json:"registration"` // open | invite | closed
	MinPasswordLen    int    `json:"minPasswordLen"`
	AllowUserRooms    bool   `json:"allowUserRooms"`
	MessagesPerMinute int    `json:"messagesPerMinute"`
	SessionDays       int    `json:"sessionDays"`

	// Limits
	MaxImageMB      int `json:"maxImageMB"`
	MaxVideoMB      int `json:"maxVideoMB"`
	MaxFileMB       int `json:"maxFileMB"`
	MaxMessageLen   int `json:"maxMessageLen"`
	MaxGroupMembers int `json:"maxGroupMembers"`

	// Storage & cache
	MediaRetentionDays   int `json:"mediaRetentionDays"`
	MessageRetentionDays int `json:"messageRetentionDays"`
	ClientCacheMessages  int `json:"clientCacheMessages"`
	MediaCacheDays       int `json:"mediaCacheDays"`

	// Calls & network
	CallsEnabled      bool     `json:"callsEnabled"`
	VideoCallsEnabled bool     `json:"videoCallsEnabled"`
	TurnEnabled       bool     `json:"turnEnabled"`
	TurnPublicIP      string   `json:"turnPublicIP"`
	TurnPort          int      `json:"turnPort"`
	ExtraICEServers   []string `json:"extraIceServers"`
	CallRingSeconds   int      `json:"callRingSeconds"`

	// Advertising
	AdsEnabled      bool `json:"adsEnabled"`
	AdsChannelEvery int  `json:"adsChannelEvery"`
}

func defaultSettings() Settings {
	return Settings{
		AppName:              "NeoChat",
		Tagline:              "پیام‌رسان امن و خصوصی",
		AccentColor:          "#0a84ff",
		DefaultLang:          "fa",
		DefaultTheme:         "dark",
		WelcomeText:          "به پیام‌رسان خصوصی خوش آمدید. بدون شماره تلفن، فقط با نام کاربری.",
		Registration:         "open",
		MinPasswordLen:       8,
		AllowUserRooms:       true,
		MessagesPerMinute:    60,
		SessionDays:          90,
		MaxImageMB:           10,
		MaxVideoMB:           100,
		MaxFileMB:            50,
		MaxMessageLen:        4096,
		MaxGroupMembers:      2000,
		MediaRetentionDays:   0,
		MessageRetentionDays: 0,
		ClientCacheMessages:  200,
		MediaCacheDays:       30,
		CallsEnabled:         true,
		VideoCallsEnabled:    true,
		TurnEnabled:          true,
		TurnPort:             3478,
		CallRingSeconds:      45,
		AdsEnabled:           true,
		AdsChannelEvery:      20,
	}
}

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// normalize clamps values so a bad admin input can never break the server.
func (st *Settings) normalize() {
	d := defaultSettings()
	st.AppName = trimLen(st.AppName, 40)
	if st.AppName == "" {
		st.AppName = d.AppName
	}
	st.Tagline = trimLen(st.Tagline, 120)
	st.WelcomeText = trimLen(st.WelcomeText, 500)
	if !hexColorRe.MatchString(st.AccentColor) {
		st.AccentColor = d.AccentColor
	}
	if st.DefaultLang != "fa" && st.DefaultLang != "en" {
		st.DefaultLang = d.DefaultLang
	}
	if st.DefaultTheme != "dark" && st.DefaultTheme != "light" && st.DefaultTheme != "auto" {
		st.DefaultTheme = d.DefaultTheme
	}
	if st.Registration != "open" && st.Registration != "invite" && st.Registration != "closed" {
		st.Registration = d.Registration
	}
	clamp := func(v *int, min, max int) {
		if *v < min {
			*v = min
		}
		if *v > max {
			*v = max
		}
	}
	clamp(&st.MinPasswordLen, 6, 64)
	clamp(&st.MessagesPerMinute, 0, 10000)
	clamp(&st.SessionDays, 1, 3650)
	clamp(&st.MaxImageMB, 1, 1024)
	clamp(&st.MaxVideoMB, 1, 8192)
	clamp(&st.MaxFileMB, 1, 8192)
	clamp(&st.MaxMessageLen, 100, 65536)
	clamp(&st.MaxGroupMembers, 2, 1000000)
	clamp(&st.MediaRetentionDays, 0, 36500)
	clamp(&st.MessageRetentionDays, 0, 36500)
	clamp(&st.ClientCacheMessages, 0, 5000)
	clamp(&st.MediaCacheDays, 0, 3650)
	clamp(&st.TurnPort, 1, 65535)
	clamp(&st.CallRingSeconds, 10, 180)
	clamp(&st.AdsChannelEvery, 3, 1000)
	st.TurnPublicIP = strings.TrimSpace(st.TurnPublicIP)
	var ice []string
	for _, s := range st.ExtraICEServers {
		s = strings.TrimSpace(s)
		if strings.HasPrefix(s, "stun:") || strings.HasPrefix(s, "turn:") || strings.HasPrefix(s, "turns:") {
			ice = append(ice, s)
		}
	}
	st.ExtraICEServers = ice
}

func (s *Server) cfg() Settings { return *s.settings.Load() }

func (s *Server) loadSettings() error {
	st := defaultSettings()
	var raw string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key='settings'`).Scan(&raw)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &st); err != nil {
			return err
		}
	}
	st.normalize()
	s.settings.Store(&st)
	return nil
}

func (s *Server) saveSettings(st Settings) error {
	st.normalize()
	raw, err := json.Marshal(st)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(`INSERT INTO settings(key,value) VALUES('settings',?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`, string(raw)); err != nil {
		return err
	}
	s.settings.Store(&st)
	return nil
}

// secret returns a persistent random secret stored under key, creating it on first use.
func (s *Server) secret(key string) (string, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&v)
	if err == nil {
		return v, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	v = randomToken(32)
	_, err = s.db.Exec(`INSERT INTO settings(key,value) VALUES(?,?)`, key, v)
	return v, err
}

// publicConfig is what every client (even logged-out) may know about the instance.
func (s *Server) publicConfig() map[string]any {
	st := s.cfg()
	return map[string]any{
		"appName":             st.AppName,
		"tagline":             st.Tagline,
		"logoMedia":           st.LogoMedia,
		"backgroundMedia":     st.BackgroundMedia,
		"accentColor":         st.AccentColor,
		"defaultLang":         st.DefaultLang,
		"defaultTheme":        st.DefaultTheme,
		"welcomeText":         st.WelcomeText,
		"registration":        st.Registration,
		"minPasswordLen":      st.MinPasswordLen,
		"allowUserRooms":      st.AllowUserRooms,
		"maxImageMB":          st.MaxImageMB,
		"maxVideoMB":          st.MaxVideoMB,
		"maxFileMB":           st.MaxFileMB,
		"maxMessageLen":       st.MaxMessageLen,
		"clientCacheMessages": st.ClientCacheMessages,
		"mediaCacheDays":      st.MediaCacheDays,
		"callsEnabled":        st.CallsEnabled,
		"videoCallsEnabled":   st.VideoCallsEnabled,
		"adsEnabled":          st.AdsEnabled,
		"adsChannelEvery":     st.AdsChannelEvery,
		"setupRequired":       s.setupRequired(),
		"version":             version,
		"copyright":           copyright,
	}
}

func (s *Server) setupRequired() bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin=1`).Scan(&n)
	return n == 0
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) error {
	writeJSON(w, 200, s.publicConfig())
	return nil
}
