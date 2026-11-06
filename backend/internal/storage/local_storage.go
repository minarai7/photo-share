// Files are stored on disk under storage/uploads.

package storage

import (
	"context"
	"errors"
	"io"
	"io/fs"
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

	// Write to a temp file and rename it into place, so a reader never sees a
	// half-written image, including when an existing file is replaced (the
	// metadata backfill in cmd/stripmeta rewrites files the server is serving).
	tmp, err := os.CreateTemp(s.uploadDir, ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op once renamed

	// CreateTemp uses 0600; keep the permissions os.Create used to give.
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if _, err := io.Copy(tmp, file); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), fullPath)
}

// List returns the names of all stored files. Dotfiles (.gitkeep, in-progress
// temp files) are not uploads and are left out.
func (s *LocalStorage) List(ctx context.Context) ([]string, error) {
	entries, err := os.ReadDir(s.uploadDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.Type().IsRegular() && !strings.HasPrefix(e.Name(), ".") {
			names = append(names, e.Name())
		}
	}
	return names, nil
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

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	if !info.Mode().IsRegular() {
		file.Close()
		return nil, fs.ErrNotExist
	}

	contentType := mime.TypeByExtension(
		filepath.Ext(filename),
	)

	return &StoredFile{
		Body:          file,
		ContentType:   contentType,
		ContentLength: info.Size(),
		LastModified:  info.ModTime(),
	}, nil
}
