// Files are stored on disk under storage/uploads.

package storage

import (
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

// ErrInvalidFilename is returned for names that are not a single plain file
// name inside the upload directory (e.g. "../x" or, on Windows, "..\x").
var ErrInvalidFilename = errors.New("invalid filename")

type LocalStorage struct {
	uploadDir string
}

// resolve maps a stored filename to its path on disk, refusing anything that
// could point outside uploadDir. Both separators are rejected on every OS so
// behaviour doesn't differ between Windows dev machines and Linux containers.
func (s *LocalStorage) resolve(filename string) (string, error) {
	if filename == "" || filename == "." || strings.ContainsAny(filename, `/\`) || !filepath.IsLocal(filename) {
		return "", ErrInvalidFilename
	}
	return filepath.Join(s.uploadDir, filename), nil
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
	fullPath, err := s.resolve(filename)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(s.uploadDir, 0755); err != nil {
		return err
	}

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

	fullPath, err := s.resolve(filename)
	if err != nil {
		return nil, err
	}

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
