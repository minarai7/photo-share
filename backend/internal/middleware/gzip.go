package middleware

import (
	"compress/gzip"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// gzipWriters reuses gzip.Writers (each holds ~800 KB of compressor state).
var gzipWriters = sync.Pool{
	New: func() any {
		w, _ := gzip.NewWriterLevel(nil, gzip.DefaultCompression)
		return w
	},
}

// GzipJSON compresses JSON responses for clients that accept gzip. The
// decision is made per response, from its Content-Type when the handler
// writes the header, so images (/uploads, already compressed, served with
// Content-Length, ranges and 304s) pass through untouched. Responses without
// a body (204, 304, 1xx) are never compressed.
func GzipJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gw := &gzipResponseWriter{ResponseWriter: w, accepts: acceptsGzip(r.Header.Get("Accept-Encoding"))}
		defer gw.finish()
		next.ServeHTTP(gw, r)
	})
}

type gzipResponseWriter struct {
	http.ResponseWriter
	accepts     bool
	wroteHeader bool
	gz          *gzip.Writer
}

func (w *gzipResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true

	h := w.Header()
	if isJSON(h.Get("Content-Type")) {
		// Caches must key the response on Accept-Encoding, compressed or not.
		h.Add("Vary", "Accept-Encoding")
		if w.accepts && h.Get("Content-Encoding") == "" && hasBody(status) {
			h.Set("Content-Encoding", "gzip")
			h.Del("Content-Length") // the compressed length is not known yet
			gz := gzipWriters.Get().(*gzip.Writer)
			gz.Reset(w.ResponseWriter)
			w.gz = gz
		}
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if w.gz != nil {
		return w.gz.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

// Flush sends what has been compressed so far, for handlers that stream.
func (w *gzipResponseWriter) Flush() {
	if w.gz != nil {
		_ = w.gz.Flush()
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (w *gzipResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// finish writes the gzip trailer and returns the compressor to the pool.
func (w *gzipResponseWriter) finish() {
	if w.gz == nil {
		return
	}
	_ = w.gz.Close()
	w.gz.Reset(nil)
	gzipWriters.Put(w.gz)
	w.gz = nil
}

func isJSON(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	return err == nil && mediaType == "application/json"
}

func hasBody(status int) bool {
	return status >= 200 && status != http.StatusNoContent && status != http.StatusNotModified
}

// acceptsGzip reports whether an Accept-Encoding header allows gzip, i.e.
// lists gzip (or *) without q=0.
func acceptsGzip(header string) bool {
	for part := range strings.SplitSeq(header, ",") {
		coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		coding = strings.ToLower(strings.TrimSpace(coding))
		if coding != "gzip" && coding != "*" {
			continue
		}
		q := 1.0
		for param := range strings.SplitSeq(params, ";") {
			name, value, ok := strings.Cut(strings.TrimSpace(param), "=")
			if ok && strings.EqualFold(strings.TrimSpace(name), "q") {
				if v, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil {
					q = v
				}
			}
		}
		if q > 0 {
			return true
		}
	}
	return false
}
