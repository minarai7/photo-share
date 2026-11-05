package service_test

import (
	"bytes"
	"context"
	"encoding/base64"
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

			up, err := svc.SaveImage(context.Background(), memFile{bytes.NewReader(tc.data)}, &multipart.FileHeader{Size: int64(len(tc.data))})
			if err != nil {
				t.Fatalf("SaveImage: %v", err)
			}
			m := uploadPathRE.FindStringSubmatch(up.ImagePath)
			if m == nil || m[2] != tc.wantExt {
				t.Fatalf("path %q does not match /uploads/<nanos>_<rand8>%s", up.ImagePath, tc.wantExt)
			}
			if up.CameraBody != "" || up.Lens != "" {
				t.Errorf("no EXIF in fixture, but got camera %q lens %q", up.CameraBody, up.Lens)
			}
			name := m[1] + m[2]
			// The service sniffs the first 512 bytes; it must rewind so storage gets the
			// whole file. These fixtures carry no metadata, so stripping leaves them as is.
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
		up, err := svc.SaveImage(context.Background(), f, h)
		if err != nil {
			t.Fatal(err)
		}
		if seen[up.ImagePath] {
			t.Fatalf("duplicate upload path %q", up.ImagePath)
		}
		seen[up.ImagePath] = true
	}
}

func TestSaveImage_ReadsGearFromEXIF(t *testing.T) {
	tiff := fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")
	for name, data := range map[string][]byte{
		"jpeg": fixtures.JPEGWithEXIF(tiff),
		"png":  fixtures.PNGWithEXIF(tiff),
		"webp": fixtures.WebPWithEXIF(tiff),
	} {
		t.Run(name, func(t *testing.T) {
			svc := service.NewUploadService(newRecordingStorage(), 1<<20)
			f, h := fileOf(data)

			up, err := svc.SaveImage(context.Background(), f, h)
			if err != nil {
				t.Fatalf("SaveImage: %v", err)
			}
			if up.CameraBody != "SONY ILCE-7C" || up.Lens != "FE 35mm F1.8" {
				t.Errorf("got camera %q lens %q", up.CameraBody, up.Lens)
			}
		})
	}
}

func TestSaveImage_StripsMetadataBeforeStoring(t *testing.T) {
	st := newRecordingStorage()
	svc := service.NewUploadService(st, 1<<20)
	f, h := fileOf(fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")))

	up, err := svc.SaveImage(context.Background(), f, h)
	if err != nil {
		t.Fatalf("SaveImage: %v", err)
	}
	m := uploadPathRE.FindStringSubmatch(up.ImagePath)
	stored := st.saved[m[1]+m[2]]
	if bytes.Contains(stored, []byte("ILCE-7C")) || bytes.Contains(stored, []byte("Exif")) {
		t.Error("stored file still has its EXIF data")
	}
	// The gear was read before stripping, so the caller still gets it.
	if up.CameraBody != "SONY ILCE-7C" {
		t.Errorf("camera = %q", up.CameraBody)
	}
}

// The 1×1 JPEG the Playwright core-flow test uploads has no EOI marker;
// browsers show such files, so they must keep being accepted.
func TestSaveImage_AcceptsJPEGWithoutEOI(t *testing.T) {
	tiny, _ := base64.StdEncoding.DecodeString("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=")
	svc := service.NewUploadService(newRecordingStorage(), 1<<20)
	f, h := fileOf(tiny)
	if _, err := svc.SaveImage(context.Background(), f, h); err != nil {
		t.Fatalf("SaveImage: %v", err)
	}
}

func TestSaveImage_RejectsBrokenImage(t *testing.T) {
	st := newRecordingStorage()
	svc := service.NewUploadService(st, 1<<20)
	f, h := fileOf(fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", ""))[:40])
	if _, err := svc.SaveImage(context.Background(), f, h); !errors.Is(err, service.ErrInvalidImage) {
		t.Fatalf("got %v, want ErrInvalidImage", err)
	}
	if len(st.saved) != 0 {
		t.Error("a file was stored")
	}
}

// Sony bodies record "----" as the lens when a manual or adapted lens is mounted.
func TestSaveImage_ManualLensPlaceholderIsDropped(t *testing.T) {
	svc := service.NewUploadService(newRecordingStorage(), 1<<20)
	f, h := fileOf(fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", "----")))

	up, err := svc.SaveImage(context.Background(), f, h)
	if err != nil {
		t.Fatalf("SaveImage: %v", err)
	}
	if up.CameraBody != "SONY ILCE-7C" || up.Lens != "" {
		t.Errorf("got camera %q lens %q, want camera only", up.CameraBody, up.Lens)
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
