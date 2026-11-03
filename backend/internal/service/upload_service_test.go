package service_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"regexp"
	"testing"

	"backend/internal/service"
	"backend/internal/storage"
	"backend/internal/testutil/fixtures"
)

type memFile struct{ *bytes.Reader }

func (memFile) Close() error { return nil }

func fileOf(b []byte) (multipart.File, *multipart.FileHeader) {
	return memFile{bytes.NewReader(b)}, &multipart.FileHeader{Filename: "whatever.bin", Size: int64(len(b))}
}

type recordingStorage struct {
	saved       map[string][]byte
	contentType map[string]string
	err         error
}

func newRecordingStorage() *recordingStorage {
	return &recordingStorage{saved: map[string][]byte{}, contentType: map[string]string{}}
}

func (s *recordingStorage) Save(_ context.Context, f multipart.File, name, ct string) error {
	if s.err != nil {
		return s.err
	}
	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}
	s.saved[name] = b
	s.contentType[name] = ct
	return nil
}

func (s *recordingStorage) Open(_ context.Context, name string) (*storage.StoredFile, error) {
	b, ok := s.saved[name]
	if !ok {
		return nil, errors.New("not found")
	}
	return &storage.StoredFile{Body: io.NopCloser(bytes.NewReader(b)), ContentType: s.contentType[name]}, nil
}

var uploadPathRE = regexp.MustCompile(`^/uploads/(\d+_[a-z0-9]{8})(\.jpg|\.png|\.webp)$`)

func TestSaveImage_AcceptedTypes(t *testing.T) {
	cases := []struct {
		name    string
		data    []byte
		wantExt string
		wantCT  string
	}{
		{"jpeg", fixtures.JPEG(), ".jpg", "image/jpeg"},
		{"png", fixtures.PNG(), ".png", "image/png"},
		{"webp", fixtures.WebP(), ".webp", "image/webp"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st := newRecordingStorage()
			svc := service.NewUploadService(st, 1<<20)

			path, err := svc.SaveImage(context.Background(), memFile{bytes.NewReader(tc.data)}, &multipart.FileHeader{Size: int64(len(tc.data))})
			if err != nil {
				t.Fatalf("SaveImage: %v", err)
			}
			m := uploadPathRE.FindStringSubmatch(path)
			if m == nil || m[2] != tc.wantExt {
				t.Fatalf("path %q does not match /uploads/<nanos>_<rand8>%s", path, tc.wantExt)
			}
			name := m[1] + m[2]
			// The service sniffs the first 512 bytes; it must rewind so storage gets the whole file.
			if !bytes.Equal(st.saved[name], tc.data) {
				t.Errorf("stored %d bytes, want %d (file not rewound?)", len(st.saved[name]), len(tc.data))
			}
			if st.contentType[name] != tc.wantCT {
				t.Errorf("content type = %q, want %q", st.contentType[name], tc.wantCT)
			}
		})
	}
}

func TestSaveImage_UniqueNames(t *testing.T) {
	svc := service.NewUploadService(newRecordingStorage(), 1<<20)
	seen := map[string]bool{}
	for i := 0; i < 20; i++ {
		f, h := fileOf(fixtures.PNG())
		p, err := svc.SaveImage(context.Background(), f, h)
		if err != nil {
			t.Fatal(err)
		}
		if seen[p] {
			t.Fatalf("duplicate upload path %q", p)
		}
		seen[p] = true
	}
}

func TestSaveImage_Rejects(t *testing.T) {
	t.Run("gif", func(t *testing.T) {
		svc := service.NewUploadService(newRecordingStorage(), 1<<20)
		f, h := fileOf(fixtures.GIF())
		if _, err := svc.SaveImage(context.Background(), f, h); !errors.Is(err, service.ErrInvalidFileType) {
			t.Fatalf("got %v, want ErrInvalidFileType", err)
		}
	})

	t.Run("html disguised as .jpg", func(t *testing.T) {
		svc := service.NewUploadService(newRecordingStorage(), 1<<20)
		data := []byte("<!DOCTYPE html><script>alert(1)</script>")
		f := memFile{bytes.NewReader(data)}
		h := &multipart.FileHeader{Filename: "cat.jpg", Size: int64(len(data))}
		if _, err := svc.SaveImage(context.Background(), f, h); !errors.Is(err, service.ErrInvalidFileType) {
			t.Fatalf("got %v, want ErrInvalidFileType", err)
		}
	})

	t.Run("too large", func(t *testing.T) {
		data := fixtures.JPEG()
		svc := service.NewUploadService(newRecordingStorage(), int64(len(data))-1)
		f, h := fileOf(data)
		if _, err := svc.SaveImage(context.Background(), f, h); !errors.Is(err, service.ErrFileTooLarge) {
			t.Fatalf("got %v, want ErrFileTooLarge", err)
		}
	})

	t.Run("nil file", func(t *testing.T) {
		svc := service.NewUploadService(newRecordingStorage(), 1<<20)
		if _, err := svc.SaveImage(context.Background(), nil, nil); !errors.Is(err, service.ErrFileRequired) {
			t.Fatalf("got %v, want ErrFileRequired", err)
		}
	})

	t.Run("storage failure propagates", func(t *testing.T) {
		st := newRecordingStorage()
		st.err = errors.New("s3 down")
		svc := service.NewUploadService(st, 1<<20)
		f, h := fileOf(fixtures.JPEG())
		if _, err := svc.SaveImage(context.Background(), f, h); err == nil {
			t.Fatal("expected error")
		}
	})
}
