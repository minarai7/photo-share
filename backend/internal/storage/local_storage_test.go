package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

type memFile struct{ *bytes.Reader }

func (memFile) Close() error { return nil }

func TestLocalStorage_RoundTrip(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "uploads") // created on first Save
	s := NewLocalStorage(dir)
	data := []byte("\xff\xd8\xff fake jpeg")

	if err := s.Save(context.Background(), memFile{bytes.NewReader(data)}, "a.jpg", "image/jpeg"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	f, err := s.Open(context.Background(), "a.jpg")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer f.Body.Close()
	got, _ := io.ReadAll(f.Body)
	if !bytes.Equal(got, data) {
		t.Error("bytes differ")
	}
	if f.ContentType != "image/jpeg" {
		t.Errorf("content type = %q", f.ContentType)
	}
}

func TestLocalStorage_SaveReplacesAndList(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)
	ctx := context.Background()
	save := func(name, body string) {
		t.Helper()
		if err := s.Save(ctx, memFile{bytes.NewReader([]byte(body))}, name, "image/jpeg"); err != nil {
			t.Fatalf("Save(%q): %v", name, err)
		}
	}

	if names, err := NewLocalStorage(filepath.Join(dir, "missing")).List(ctx); err != nil || len(names) != 0 {
		t.Fatalf("List on a missing dir = %v, %v; want empty", names, err)
	}

	save("a.jpg", "a much longer original body")
	save("b.png", "b")
	save("a.jpg", "short") // replacing must not leave the old tail behind
	if err := os.WriteFile(filepath.Join(dir, ".gitkeep"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "subdir"), 0o755); err != nil {
		t.Fatal(err)
	}

	got, err := os.ReadFile(filepath.Join(dir, "a.jpg"))
	if err != nil || string(got) != "short" {
		t.Fatalf("a.jpg = %q, %v; want %q", got, err, "short")
	}
	names, err := s.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 || names[0] != "a.jpg" || names[1] != "b.png" {
		t.Fatalf("List = %v, want [a.jpg b.png] (no dotfiles, dirs or temp files)", names)
	}
}

func TestLocalStorage_RejectsNamesOutsideUploadDir(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "secret.txt"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	s := NewLocalStorage(dir)

	for _, name := range []string{"", ".", "..", "../secret.txt", `..\secret.txt`, "sub/a.jpg", `sub\a.jpg`, "/etc/passwd", `C:\Windows\win.ini`} {
		t.Run(name, func(t *testing.T) {
			if _, err := s.Open(context.Background(), name); !errors.Is(err, ErrInvalidFilename) {
				t.Errorf("Open(%q) err = %v, want ErrInvalidFilename", name, err)
			}
			if err := s.Save(context.Background(), memFile{bytes.NewReader(nil)}, name, "image/jpeg"); !errors.Is(err, ErrInvalidFilename) {
				t.Errorf("Save(%q) err = %v, want ErrInvalidFilename", name, err)
			}
		})
	}
}

func TestLocalStorage_OpenMissing(t *testing.T) {
	s := NewLocalStorage(t.TempDir())
	if _, err := s.Open(context.Background(), "nope.jpg"); err == nil {
		t.Fatal("expected error")
	}
}

func TestNew_ConfigValidation(t *testing.T) {
	cases := map[string]Config{
		"unknown driver":    {Driver: "ftp"},
		"local without dir": {Driver: "local"},
		"s3 without bucket": {Driver: "s3", AWSRegion: "ap-northeast-1"},
		"s3 without region": {Driver: "s3", S3Bucket: "b"},
		"empty driver":      {},
	}
	for name, cfg := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := New(context.Background(), cfg); err == nil {
				t.Fatal("expected error")
			}
		})
	}

	if _, err := New(context.Background(), Config{Driver: "local", UploadDir: t.TempDir()}); err != nil {
		t.Fatalf("valid local config: %v", err)
	}
}
