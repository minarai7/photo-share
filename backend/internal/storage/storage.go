package storage

import (
	"context"
	"io"
	"mime/multipart"
)

type StoredFile struct {
	Body        io.ReadCloser
	ContentType string
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
