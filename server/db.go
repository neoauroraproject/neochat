package main

import (
	"database/sql"
	"fmt"
	"net/url"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// migrations are applied in order; PRAGMA user_version tracks progress.
var migrations = []string{
	`
CREATE TABLE settings (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE TABLE users (
	id             INTEGER PRIMARY KEY AUTOINCREMENT,
	username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
	display_name   TEXT NOT NULL,
	bio            TEXT NOT NULL DEFAULT '',
	avatar         TEXT NOT NULL DEFAULT '',
	password_hash  TEXT NOT NULL,
	is_admin       INTEGER NOT NULL DEFAULT 0,
	banned         INTEGER NOT NULL DEFAULT 0,
	deleted        INTEGER NOT NULL DEFAULT 0,
	hide_last_seen INTEGER NOT NULL DEFAULT 0,
	last_seen      INTEGER NOT NULL DEFAULT 0,
	created_at     INTEGER NOT NULL
);

CREATE TABLE sessions (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	token_hash TEXT NOT NULL UNIQUE,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	user_agent TEXT NOT NULL DEFAULT '',
	ip         TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	last_used  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE chats (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	type        TEXT NOT NULL CHECK (type IN ('direct','group','channel')),
	title       TEXT NOT NULL DEFAULT '',
	handle      TEXT UNIQUE COLLATE NOCASE,
	description TEXT NOT NULL DEFAULT '',
	avatar      TEXT NOT NULL DEFAULT '',
	invite_code TEXT UNIQUE,
	owner_id    INTEGER NOT NULL DEFAULT 0,
	direct_key  TEXT UNIQUE,
	created_at  INTEGER NOT NULL,
	last_msg_id INTEGER NOT NULL DEFAULT 0,
	last_msg_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE chat_members (
	chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
	user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
	joined_at    INTEGER NOT NULL,
	last_read_id INTEGER NOT NULL DEFAULT 0,
	muted        INTEGER NOT NULL DEFAULT 0,
	archived     INTEGER NOT NULL DEFAULT 0,
	pinned       INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX idx_members_user ON chat_members(user_id);

CREATE TABLE messages (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
	sender_id  INTEGER NOT NULL,
	kind       TEXT NOT NULL DEFAULT 'text',
	text       TEXT NOT NULL DEFAULT '',
	media_id   TEXT NOT NULL DEFAULT '',
	reply_to   INTEGER NOT NULL DEFAULT 0,
	edited_at  INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_chat ON messages(chat_id, id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_messages_media ON messages(media_id) WHERE media_id <> '';

CREATE TABLE media (
	id         TEXT PRIMARY KEY,
	owner_id   INTEGER NOT NULL,
	kind       TEXT NOT NULL,
	mime       TEXT NOT NULL,
	name       TEXT NOT NULL DEFAULT '',
	size       INTEGER NOT NULL,
	width      INTEGER NOT NULL DEFAULT 0,
	height     INTEGER NOT NULL DEFAULT 0,
	has_thumb  INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);
CREATE INDEX idx_media_created ON media(created_at);

CREATE TABLE ads (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	title       TEXT NOT NULL,
	body        TEXT NOT NULL DEFAULT '',
	image       TEXT NOT NULL DEFAULT '',
	link        TEXT NOT NULL DEFAULT '',
	cta         TEXT NOT NULL DEFAULT '',
	placement   TEXT NOT NULL DEFAULT 'all',
	active      INTEGER NOT NULL DEFAULT 1,
	priority    INTEGER NOT NULL DEFAULT 0,
	starts_at   INTEGER NOT NULL DEFAULT 0,
	ends_at     INTEGER NOT NULL DEFAULT 0,
	impressions INTEGER NOT NULL DEFAULT 0,
	clicks      INTEGER NOT NULL DEFAULT 0,
	created_at  INTEGER NOT NULL
);

CREATE TABLE calls (
	id          TEXT PRIMARY KEY,
	chat_id     INTEGER NOT NULL,
	caller_id   INTEGER NOT NULL,
	callee_id   INTEGER NOT NULL,
	video       INTEGER NOT NULL DEFAULT 0,
	status      TEXT NOT NULL,
	started_at  INTEGER NOT NULL,
	answered_at INTEGER NOT NULL DEFAULT 0,
	ended_at    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_calls_caller ON calls(caller_id);
CREATE INDEX idx_calls_callee ON calls(callee_id);

CREATE TABLE invites (
	code       TEXT PRIMARY KEY,
	note       TEXT NOT NULL DEFAULT '',
	created_by INTEGER NOT NULL,
	uses       INTEGER NOT NULL DEFAULT 0,
	max_uses   INTEGER NOT NULL DEFAULT 1,
	expires_at INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);
`,
	`
CREATE TABLE push_subscriptions (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	endpoint   TEXT NOT NULL UNIQUE,
	p256dh     TEXT NOT NULL,
	auth       TEXT NOT NULL,
	lang       TEXT NOT NULL DEFAULT 'en',
	created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_session ON push_subscriptions(session_id);
`,
	// Storage rules: each file carries its own expiry (decided at upload by its size), a file whose
	// bytes were removed keeps its row so the message still shows its name and size, profile and
	// brand images are kept out of expiry and quotas, and each user may get their own quota.
	`
ALTER TABLE media ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media ADD COLUMN keep INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_media_owner ON media(owner_id);
CREATE INDEX idx_media_expires ON media(expires_at) WHERE expires_at > 0 AND removed = 0;
ALTER TABLE users ADD COLUMN quota_mb INTEGER NOT NULL DEFAULT -1;

UPDATE media SET keep = 1 WHERE id IN (
	SELECT avatar FROM users WHERE avatar <> ''
	UNION SELECT avatar FROM chats WHERE avatar <> ''
	UNION SELECT image FROM ads WHERE image <> ''
	UNION SELECT json_extract(value, '$.logoMedia') FROM settings WHERE key = 'settings'
	UNION SELECT json_extract(value, '$.backgroundMedia') FROM settings WHERE key = 'settings');

-- Servers that already had a media retention keep it for their existing files.
UPDATE media SET expires_at = created_at + 86400000 *
	(SELECT CAST(json_extract(value, '$.mediaRetentionDays') AS INTEGER) FROM settings WHERE key = 'settings')
WHERE keep = 0 AND COALESCE(
	(SELECT CAST(json_extract(value, '$.mediaRetentionDays') AS INTEGER) FROM settings WHERE key = 'settings'), 0) > 0;
`,
	// Offline sync, reactions, pins, forwarding and messages that destroy themselves or open once.
	`
CREATE TABLE events (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	chat_id    INTEGER NOT NULL,
	kind       TEXT NOT NULL,
	message_id INTEGER NOT NULL DEFAULT 0,
	user_id    INTEGER NOT NULL DEFAULT 0,
	data       TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_chat ON events(chat_id, id);
CREATE INDEX idx_events_created ON events(created_at);

ALTER TABLE messages ADD COLUMN client_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_messages_client ON messages(sender_id, client_id) WHERE client_id <> '';
ALTER TABLE messages ADD COLUMN ttl INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN destroy_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_messages_destroy ON messages(destroy_at) WHERE destroy_at > 0;
ALTER TABLE messages ADD COLUMN once INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN fwd_name TEXT NOT NULL DEFAULT '';
ALTER TABLE chats ADD COLUMN ttl_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE reactions (
	message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
	user_id    INTEGER NOT NULL,
	emoji      TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (message_id, user_id)
);
CREATE TABLE pins (
	chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
	message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
	pinned_by  INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (chat_id, message_id)
);
`,
}

func openDB(dataDir string) (*sql.DB, error) {
	path := filepath.Join(dataDir, "neochat.db")
	dsn := "file:" + url.PathEscape(filepath.ToSlash(path)) +
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(8000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	if err := db.Ping(); err != nil {
		return nil, err
	}
	if err := migrate(db); err != nil {
		return nil, err
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	for i := version; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", i+1, err)
		}
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
