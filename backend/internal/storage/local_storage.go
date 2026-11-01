// Files are stored on disk under storage/uploads.

package storage

import (
	"context"
	"io"
	"mime"
	"mime/multipart"
	"os"
	"path/filepath"
)

type LocalStorage struct {
	uploadDir string
}

func NewLocalStorage(uploadDir string) *LocalStorage {
	return &LocalStorage{
		uploadDir: uploadDir,
	}
}

func (s *LocalStorage) Save(
	ctx context.Context,
	file multipart.File,
	filename string,
	contentType string,
) error {
	if err := os.MkdirAll(s.uploadDir, 0755); err != nil {
		return err
	}

	fullPath := filepath.Join(s.uploadDir, filename)

	dst, err := os.Create(fullPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		return err
	}

	return nil
}

func (s *LocalStorage) Open(
	ctx context.Context,
	filename string,
) (*StoredFile, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	fullPath := filepath.Join(s.uploadDir, filename)

	file, err := os.Open(fullPath)
	if err != nil {
		return nil, err
	}

	contentType := mime.TypeByExtension(
		filepath.Ext(filename),
	)

	return &StoredFile{
		Body:        file,
		ContentType: contentType,
	}, nil
}
