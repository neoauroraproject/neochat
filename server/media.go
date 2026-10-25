package main

import (
	"database/sql"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

type Media struct {
	ID       string `json:"id"`
	OwnerID  int64  `json:"-"`
	Kind     string `json:"kind"`
	Mime     string `json:"mime"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Width    int    `json:"width,omitempty"`
	Height   int    `json:"height,omitempty"`
	HasThumb bool   `json:"hasThumb,omitempty"`
}

func (s *Server) mediaPath(id string) string {
	return filepath.Join(s.mediaDir, id[:2], id)
}

func (s *Server) mediaByID(id string) (*Media, error) {
	if len(id) != 32 {
		return nil, errNotFound
	}
	var m Media
	var thumb int
	err := s.db.QueryRow(`SELECT id, owner_id, kind, mime, name, size, width, height, has_thumb FROM media WHERE id=?`, id).
		Scan(&m.ID, &m.OwnerID, &m.Kind, &m.Mime, &m.Name, &m.Size, &m.Width, &m.Height, &thumb)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errNotFound
	}
	m.HasThumb = thumb == 1
	return &m, err
}

func (s *Server) ownsMedia(uid int64, id, kind string) bool {
	m, err := s.mediaByID(id)
	return err == nil && m.OwnerID == uid && (kind == "" || m.Kind == kind)
}

var imageMimes = map[string]bool{"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true}

func classify(mimeType, requested string) string {
	switch {
	case imageMimes[mimeType]:
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	case strings.HasPrefix(mimeType, "audio/"):
		if requested == "voice" {
			return "voice"
		}
		return "audio"
	}
	return "file"
}

func (s *Server) limitFor(kind string) int64 {
	st := s.cfg()
	mb := st.MaxFileMB
	switch kind {
	case "image":
		mb = st.MaxImageMB
	case "video":
		mb = st.MaxVideoMB
	}
	return int64(mb) << 20
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request, u *User) error {
	if !s.limiter.allow("upload:"+itoa(u.ID), 120, time.Hour) {
		return errf(429, "rate_limited", "too many uploads, try again later")
	}
	st := s.cfg()
	maxAny := int64(max(st.MaxImageMB, st.MaxVideoMB, st.MaxFileMB)) << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxAny+(1<<20))
	mr, err := r.MultipartReader()
	if err != nil {
		return errf(400, "bad_request", "expected multipart upload")
	}
	requested := ""
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			return errf(400, "bad_request", "no file in upload")
		}
		if err != nil {
			return errf(413, "too_large", "file is larger than the server allows")
		}
		if part.FormName() == "kind" {
			b, _ := io.ReadAll(io.LimitReader(part, 16))
			requested = string(b)
			continue
		}
		if part.FormName() != "file" {
			continue
		}
		m, err := s.storeUpload(part, u.ID, requested)
		if err != nil {
			return err
		}
		writeJSON(w, 201, m)
		return nil
	}
}

func (s *Server) storeUpload(part *multipart.Part, uid int64, requested string) (*Media, error) {
	name := trimLen(filepath.Base(part.FileName()), 120)
	declared := part.Header.Get("Content-Type")
	id := randomHex(16)
	dir := filepath.Join(s.mediaDir, id[:2])
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, id)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		if !ok {
			os.Remove(path)
		}
	}()
	head := make([]byte, 512)
	n, _ := io.ReadFull(part, head)
	head = head[:n]
	mimeType := http.DetectContentType(head)
	if mimeType == "application/octet-stream" || strings.HasPrefix(mimeType, "text/plain") {
		if byExt := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); byExt != "" {
			mimeType = byExt
		} else if declared != "" {
			mimeType = declared
		}
	}
	// WebM/MP4 voice notes are sniffed as video; trust the client when it says audio.
	if strings.HasPrefix(declared, "audio/") && strings.HasPrefix(mimeType, "video/") {
		mimeType = strings.Split(declared, ";")[0]
	}
	mimeType = strings.TrimSpace(strings.Split(mimeType, ";")[0])
	kind := classify(mimeType, requested)
	limit := s.limitFor(kind)
	written, err := f.Write(head)
	if err != nil {
		f.Close()
		return nil, err
	}
	copied, err := io.Copy(f, io.LimitReader(part, limit-int64(written)+1))
	f.Close()
	size := int64(written) + copied
	if err != nil {
		return nil, errf(413, "too_large", "upload failed or file is larger than the server allows")
	}
	if size > limit {
		return nil, errf(413, "too_large", fmt.Sprintf("%s files may be at most %d MB on this server", kind, limit>>20))
	}
	if size == 0 {
		return nil, errf(400, "bad_request", "file is empty")
	}
	m := &Media{ID: id, OwnerID: uid, Kind: kind, Mime: mimeType, Name: name, Size: size}
	if kind == "image" {
		m.Width, m.Height, m.HasThumb = s.makeThumb(path)
	}
	if _, err := s.db.Exec(`INSERT INTO media(id, owner_id, kind, mime, name, size, width, height, has_thumb, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
		m.ID, uid, m.Kind, m.Mime, m.Name, m.Size, m.Width, m.Height, boolInt(m.HasThumb), nowMs()); err != nil {
		return nil, err
	}
	ok = true
	return m, nil
}

// makeThumb writes a small JPEG preview next to the original so chat lists load fast on mobile data.
func (s *Server) makeThumb(path string) (int, int, bool) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, false
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(f)
	if err != nil {
		return 0, 0, false
	}
	if cfg.Width*cfg.Height > 50_000_000 { // refuse decompression bombs
		return cfg.Width, cfg.Height, false
	}
	const maxSide = 480
	if cfg.Width <= maxSide && cfg.Height <= maxSide {
		return cfg.Width, cfg.Height, false
	}
	f.Seek(0, io.SeekStart)
	img, _, err := image.Decode(f)
	if err != nil {
		return cfg.Width, cfg.Height, false
	}
	w, h := cfg.Width, cfg.Height
	if w > h {
		h, w = h*maxSide/w, maxSide
	} else {
		w, h = w*maxSide/h, maxSide
	}
	dst := image.NewRGBA(image.Rect(0, 0, max(w, 1), max(h, 1)))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Src, nil)
	out, err := os.Create(path + "_t")
	if err != nil {
		return cfg.Width, cfg.Height, false
	}
	defer out.Close()
	if err := jpeg.Encode(out, dst, &jpeg.Options{Quality: 72}); err != nil {
		return cfg.Width, cfg.Height, false
	}
	return cfg.Width, cfg.Height, true
}

func (s *Server) handleServeMedia(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	m, err := s.mediaByID(id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	path := s.mediaPath(m.ID)
	contentType := m.Mime
	if r.PathValue("variant") == "thumb" && m.HasThumb {
		path += "_t"
		contentType = "image/jpeg"
	}
	f, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	h := w.Header()
	// Media IDs are immutable, so clients and proxies may cache them forever.
	h.Set("Cache-Control", "public, max-age=31536000, immutable")
	h.Set("ETag", `"`+m.ID+`"`)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	if m.Kind == "file" {
		contentType = "application/octet-stream"
		h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": m.Name}))
	}
	h.Set("Content-Type", contentType)
	http.ServeContent(w, r, "", stat.ModTime(), f)
}

func (s *Server) removeMediaFiles(id string) {
	p := s.mediaPath(id)
	os.Remove(p)
	os.Remove(p + "_t")
}
