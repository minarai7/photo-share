package server

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"backend/internal/storage"
	"backend/internal/testutil/fixtures"
)

const immutableCache = "public, max-age=31536000, immutable"

// uploadPNG uploads the PNG fixture and returns its public path and bytes.
func uploadPNG(t *testing.T, app *testApp) (string, []byte) {
	t.Helper()
	_, tok := app.userWithToken("alice")
	data := fixtures.PNG()
	rec := app.upload(tok, "pic.png", data)
	expectStatus(t, rec, http.StatusCreated)
	var up struct {
		ImagePath string `json:"image_path"`
	}
	decodeOne(t, rec, &up)
	return up.ImagePath, data
}

func TestServeUploadCacheHeaders_Local(t *testing.T) {
	app := newTestApp(t)
	p, data := uploadPNG(t, app)

	rec := app.do(req{method: http.MethodGet, path: p})
	expectStatus(t, rec, http.StatusOK)
	h := rec.Header()
	if got := h.Get("Cache-Control"); got != immutableCache {
		t.Errorf("Cache-Control = %q, want %q", got, immutableCache)
	}
	if got := h.Get("Content-Length"); got != strconv.Itoa(len(data)) {
		t.Errorf("Content-Length = %q, want %d", got, len(data))
	}
	if got := h.Get("Content-Type"); got != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", got)
	}
	lastModified := h.Get("Last-Modified")
	if _, err := http.ParseTime(lastModified); err != nil {
		t.Fatalf("Last-Modified = %q: %v", lastModified, err)
	}

	t.Run("If-Modified-Since gives 304", func(t *testing.T) {
		rec := app.do(req{method: http.MethodGet, path: p, header: map[string]string{"If-Modified-Since": lastModified}})
		expectStatus(t, rec, http.StatusNotModified)
		if rec.Body.Len() != 0 {
			t.Errorf("304 has a body of %d bytes", rec.Body.Len())
		}
		if got := rec.Header().Get("Cache-Control"); got != immutableCache {
			t.Errorf("304 Cache-Control = %q, want %q", got, immutableCache)
		}
	})

	t.Run("older If-Modified-Since gives 200", func(t *testing.T) {
		old := time.Unix(0, 0).UTC().Format(http.TimeFormat)
		rec := app.do(req{method: http.MethodGet, path: p, header: map[string]string{"If-Modified-Since": old}})
		expectStatus(t, rec, http.StatusOK)
		if !bytes.Equal(rec.Body.Bytes(), data) {
			t.Error("served bytes differ from uploaded bytes")
		}
	})

	t.Run("Range gives 206", func(t *testing.T) {
		rec := app.do(req{method: http.MethodGet, path: p, header: map[string]string{"Range": "bytes=0-3"}})
		expectStatus(t, rec, http.StatusPartialContent)
		if !bytes.Equal(rec.Body.Bytes(), data[:4]) {
			t.Errorf("range body = %x, want %x", rec.Body.Bytes(), data[:4])
		}
		if got := rec.Header().Get("Content-Range"); got != "bytes 0-3/"+strconv.Itoa(len(data)) {
			t.Errorf("Content-Range = %q", got)
		}
	})
}

func TestServeUploadMissingIsNotCached(t *testing.T) {
	app := newTestApp(t)
	rec := app.do(req{method: http.MethodGet, path: "/uploads/missing.jpg"})
	expectStatus(t, rec, http.StatusNotFound)
	if got := rec.Header().Get("Cache-Control"); strings.Contains(got, "immutable") {
		t.Errorf("404 is cached forever: Cache-Control = %q", got)
	}
}

// streamStorage behaves like S3Storage: the body can't seek, and the size,
// ETag and Last-Modified come from the object metadata.
type streamStorage struct {
	data         []byte
	etag         string
	lastModified time.Time
}

func (s *streamStorage) Save(context.Context, multipart.File, string, string) error {
	return errors.New("read-only")
}

func (s *streamStorage) Open(_ context.Context, name string) (*storage.StoredFile, error) {
	if name != "photo.jpg" {
		return nil, errors.New("NoSuchKey")
	}
	return &storage.StoredFile{
		// io.NopCloser over a Reader (not a ReadSeeker) hides Seek.
		Body:          io.NopCloser(struct{ io.Reader }{bytes.NewReader(s.data)}),
		ContentType:   "image/jpeg",
		ContentLength: int64(len(s.data)),
		ETag:          s.etag,
		LastModified:  s.lastModified,
	}, nil
}

func TestServeUploadCacheHeaders_Stream(t *testing.T) {
	st := &streamStorage{
		data:         []byte("not really a jpeg, but bytes are bytes"),
		etag:         `"0123abcd"`,
		lastModified: time.Date(2026, 11, 1, 12, 30, 15, 500_000_000, time.UTC),
	}
	app := newTestApp(t, appOptions{storage: st})
	lastModified := "Sun, 01 Nov 2026 12:30:15 GMT"

	rec := app.do(req{method: http.MethodGet, path: "/uploads/photo.jpg"})
	expectStatus(t, rec, http.StatusOK)
	h := rec.Header()
	for k, want := range map[string]string{
		"Cache-Control":  immutableCache,
		"Content-Type":   "image/jpeg",
		"Content-Length": strconv.Itoa(len(st.data)),
		"ETag":           st.etag,
		"Last-Modified":  lastModified,
	} {
		if got := h.Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
	if !bytes.Equal(rec.Body.Bytes(), st.data) {
		t.Errorf("body = %q", rec.Body.String())
	}

	cases := []struct {
		name   string
		header map[string]string
		want   int
	}{
		{"matching If-None-Match", map[string]string{"If-None-Match": st.etag}, http.StatusNotModified},
		{"weak, listed If-None-Match", map[string]string{"If-None-Match": `"zzz", W/"0123abcd"`}, http.StatusNotModified},
		{"star If-None-Match", map[string]string{"If-None-Match": "*"}, http.StatusNotModified},
		{"other If-None-Match", map[string]string{"If-None-Match": `"zzz"`}, http.StatusOK},
		// If-None-Match wins over If-Modified-Since when both are sent.
		{"other If-None-Match + fresh If-Modified-Since", map[string]string{"If-None-Match": `"zzz"`, "If-Modified-Since": lastModified}, http.StatusOK},
		{"same If-Modified-Since", map[string]string{"If-Modified-Since": lastModified}, http.StatusNotModified},
		{"older If-Modified-Since", map[string]string{"If-Modified-Since": "Sat, 31 Oct 2026 00:00:00 GMT"}, http.StatusOK},
		{"garbage If-Modified-Since", map[string]string{"If-Modified-Since": "yesterday"}, http.StatusOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := app.do(req{method: http.MethodGet, path: "/uploads/photo.jpg", header: c.header})
			expectStatus(t, rec, c.want)
			if c.want == http.StatusNotModified {
				if rec.Body.Len() != 0 {
					t.Errorf("304 has a body: %q", rec.Body.String())
				}
				if got := rec.Header().Get("ETag"); got != st.etag {
					t.Errorf("304 ETag = %q, want %q", got, st.etag)
				}
				if got := rec.Header().Get("Cache-Control"); got != immutableCache {
					t.Errorf("304 Cache-Control = %q", got)
				}
			}
		})
	}

	t.Run("HEAD has headers but no body", func(t *testing.T) {
		rec := app.do(req{method: http.MethodHead, path: "/uploads/photo.jpg"})
		expectStatus(t, rec, http.StatusOK)
		if rec.Body.Len() != 0 {
			t.Errorf("HEAD body = %q", rec.Body.String())
		}
		if got := rec.Header().Get("Content-Length"); got != strconv.Itoa(len(st.data)) {
			t.Errorf("HEAD Content-Length = %q", got)
		}
	})
}
