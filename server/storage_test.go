package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func newStorageTestServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	db, err := openDB(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := &Server{db: db, limiter: newLimiter(), mediaDir: filepath.Join(dir, "media")}
	s.hub = newHub(s)
	s.calls = newCallManager(s)
	if err := s.loadSettings(); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO users(username, display_name, password_hash, created_at) VALUES('owner','Owner','x',0)`); err != nil {
		t.Fatal(err)
	}
	return s
}

// addMedia stores a fake file of the given size, uploaded createdAgo days ago.
func addMedia(t *testing.T, s *Server, id string, size int64, createdAgo int) {
	t.Helper()
	created := nowMs() - int64(createdAgo)*dayMs
	exp := s.cfg().retention().expiry(size, created)
	if _, err := s.db.Exec(`INSERT INTO media(id, owner_id, kind, mime, name, size, created_at, expires_at) VALUES(?,1,'file','application/pdf','f.pdf',?,?,?)`,
		id, size, created, exp); err != nil {
		t.Fatal(err)
	}
	p := s.mediaPath(id)
	os.MkdirAll(filepath.Dir(p), 0o755)
	os.WriteFile(p, []byte("x"), 0o644)
}

func TestRetentionBySize(t *testing.T) {
	r := retention{LargeFileMB: 20, LargeFileDays: 30, MediaRetentionDays: 365}
	if got := r.expiry(21<<20, 0); got != 30*dayMs {
		t.Fatalf("large file expiry %d", got)
	}
	if got := r.expiry(1<<20, 0); got != 365*dayMs {
		t.Fatalf("small file expiry %d", got)
	}
	if got := (retention{LargeFileMB: 20, LargeFileDays: 0, MediaRetentionDays: 0}).expiry(50<<20, 5); got != 0 {
		t.Fatalf("0 days must mean forever, got %d", got)
	}
}

func TestExpireKeepsMessageAndPreviewMatches(t *testing.T) {
	s := newStorageTestServer(t)
	big := "aa" + "000000000000000000000000000001"
	small := "bb" + "000000000000000000000000000002"
	addMedia(t, s, big, 25<<20, 40)  // large, past 30 days
	addMedia(t, s, small, 1<<20, 40) // small, well inside 365 days
	s.db.Exec(`INSERT INTO chats(type, created_at) VALUES('group', 0)`)
	s.db.Exec(`INSERT INTO messages(chat_id, sender_id, kind, media_id, created_at) VALUES(1, 1, 'file', ?, 0)`, big)

	if files, bytes := s.previewRetention(s.cfg().retention()); files != 1 || bytes != 25<<20 {
		t.Fatalf("preview: %d files, %d bytes", files, bytes)
	}
	if files, _ := s.expireMedia(); files != 1 {
		t.Fatalf("expired %d files, want 1", files)
	}
	if _, err := os.Stat(s.mediaPath(big)); !os.IsNotExist(err) {
		t.Fatal("expired file still on disk")
	}
	m, err := s.messageByID(1)
	if err != nil || m.Media == nil || !m.Media.Expired || m.Media.Name != "f.pdf" {
		t.Fatalf("message after expiry: %+v %v", m, err)
	}
	// Stricter rules reach the files already there once the admin applies them.
	strict := retention{LargeFileMB: 20, LargeFileDays: 30, MediaRetentionDays: 10}
	if files, _ := s.previewRetention(strict); files != 1 {
		t.Fatalf("strict preview %d, want the small file", files)
	}
	if err := s.reapplyRetention(strict); err != nil {
		t.Fatal(err)
	}
	st := s.cfg()
	st.MediaRetentionDays = 10
	s.settings.Store(&st)
	if files, _ := s.expireMedia(); files != 1 {
		t.Fatalf("after reapply expired %d", files)
	}
}

func TestQuotaBlocksAndOldestMakesRoom(t *testing.T) {
	s := newStorageTestServer(t)
	st := s.cfg()
	st.UserQuotaMB = 10
	s.settings.Store(&st)
	addMedia(t, s, "cc000000000000000000000000000001", 6<<20, 3)
	addMedia(t, s, "cc000000000000000000000000000002", 3<<20, 2)

	if err := s.checkQuota(1, 2<<20); err == nil {
		t.Fatal("upload past the quota was allowed")
	}
	if err := s.checkQuota(1, 512<<10); err != nil {
		t.Fatalf("upload that fits was refused: %v", err)
	}
	if err := s.checkQuota(1, 11<<20); err == nil {
		t.Fatal("a file bigger than the whole quota was allowed")
	}
	s.db.Exec(`UPDATE users SET quota_mb=0 WHERE id=1`)
	if err := s.checkQuota(1, 50<<20); err != nil {
		t.Fatalf("per-user unlimited quota refused: %v", err)
	}
	s.db.Exec(`UPDATE users SET quota_mb=-1 WHERE id=1`)

	st.QuotaMode = "oldest"
	s.settings.Store(&st)
	addMedia(t, s, "cc000000000000000000000000000003", 4<<20, 0)
	s.makeRoom(1, "cc000000000000000000000000000003")
	if used := s.usedBytes(1); used > 10<<20 {
		t.Fatalf("still over quota: %d", used)
	}
	var removed int
	s.db.QueryRow(`SELECT removed FROM media WHERE id='cc000000000000000000000000000001'`).Scan(&removed)
	if removed != 1 {
		t.Fatal("oldest file was not the one removed")
	}
}

// Servers upgrading with a media retention already set keep it for the files they have.
func TestMigrationKeepsOldRetention(t *testing.T) {
	// A database as version 2 left it, before the storage migration.
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "old.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i := 0; i < 2; i++ {
		if _, err := db.Exec(migrations[i]); err != nil {
			t.Fatal(err)
		}
	}
	db.Exec(`PRAGMA user_version = 2`)
	db.Exec(`INSERT INTO settings(key, value) VALUES('settings', '{"mediaRetentionDays": 7}')`)
	db.Exec(`INSERT INTO users(username, display_name, password_hash, avatar, created_at) VALUES('a','A','x','av000000000000000000000000000001',0)`)
	db.Exec(`INSERT INTO media(id, owner_id, kind, mime, size, created_at) VALUES('av000000000000000000000000000001',1,'image','image/png',1,1000)`)
	db.Exec(`INSERT INTO media(id, owner_id, kind, mime, size, created_at) VALUES('ff000000000000000000000000000001',1,'file','x',1,1000)`)
	if err := migrate(db); err != nil {
		t.Fatal(err)
	}
	var exp, keep int64
	db.QueryRow(`SELECT expires_at FROM media WHERE id='ff000000000000000000000000000001'`).Scan(&exp)
	if exp != 1000+7*dayMs {
		t.Fatalf("file expiry %d", exp)
	}
	db.QueryRow(`SELECT keep FROM media WHERE id='av000000000000000000000000000001'`).Scan(&keep)
	if keep != 1 {
		t.Fatal("avatar not kept")
	}
}

func TestAttachmentHeaderKeepsPersianName(t *testing.T) {
	got := attachmentHeader("گزارش.pdf", "file")
	want := `attachment; filename="_____.pdf"; filename*=UTF-8''%DA%AF%D8%B2%D8%A7%D8%B1%D8%B4.pdf`
	if got != want {
		t.Fatalf("got %s", got)
	}
	if got := attachmentHeader("photo.jpg", "image"); got != `attachment; filename=photo.jpg` {
		t.Fatalf("ascii name: %s", got)
	}
}
