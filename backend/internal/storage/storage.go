package storage

import (
	"context"
	"io"
	"mime/multipart"
	"time"
)

// StoredFile is an opened upload. The metadata fields are best-effort: a zero
// value means "unknown" and the header is simply not sent.
type StoredFile struct {
	// Body is an io.ReadSeeker for local files (the handler then uses
	// http.ServeContent for conditional and Range requests); S3 bodies are not.
	Body        io.ReadCloser
	ContentType string

	// ContentLength is the size in bytes; zero or negative means unknown
	// (no upload is ever empty).
	ContentLength int64
	// ETag is the quoted entity tag as S3 returns it (e.g. `"abc123"`).
	ETag         string
	LastModified time.Time
}

type Storage interface {
	Save(
		ctx context.Context,
		file multipart.File,
		filename string,
		contentType string,
	) error

	Open(
		ctx context.Context,
		filename string,
	) (*StoredFile, error)
}
