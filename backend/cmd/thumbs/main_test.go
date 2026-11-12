package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"backend/internal/repository"
	"backend/internal/storage"
	"backend/internal/testutil/fixtures"
	"backend/internal/thumbnail"
)

// fakePosts mirrors the two PostRepository methods: listing returns posts
// with a NULL thumbnail_path, oldest first; setting a missing post fails.
type fakePosts struct {
	images map[int64]string
	thumbs map[int64]string
	setErr map[int64]error
}

func (f *fakePosts) ListPostsMissingThumbnail(context.Context) ([]repository.PostImage, error) {
	var out []repository.PostImage
	for id := int64(1); id <= int64(len(f.images)); id++ {
		if _, done := f.thumbs[id]; !done {
			out = append(out, repository.PostImage{ID: id, ImagePath: f.images[id]})
		}
	}
	return out, nil
}

func (f *fakePosts) SetThumbnailPath(_ context.Context, id int64, path string) error {
	if err := f.setErr[id]; err != nil {
		return err
	}
	f.thumbs[id] = path
	return nil
}

func TestRun(t *testing.T) {
	dir := t.TempDir()
	orient6 := fixtures.TIFF(binary.LittleEndian, map[uint16]any{fixtures.TagOrientation: uint16(6)}, nil)
	files := map[string][]byte{
		"1_wide.png":    fixtures.EncodePNG(fixtures.Gradient(1600, 800)),
		"2_phone.jpg":   fixtures.AddJPEGEXIF(fixtures.EncodeJPEG(fixtures.Gradient(1200, 900)), orient6),
		"3_anim.webp":   fixtures.AnimatedWebP(),
		"4_broken.webp": fixtures.WebP(), // sniffs as WebP but doesn't decode
		"6_gone.jpg":    fixtures.JPEG(),
	}
	for name, b := range files {
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	posts := &fakePosts{
		images: map[int64]string{
			1: "/uploads/1_wide.png",
			2: "/uploads/2_phone.jpg",
			3: "/uploads/3_anim.webp",
			4: "/uploads/4_broken.webp",
			5: "/demo/test.jpg",      // not a stored upload
			6: "/uploads/6_gone.jpg", // the post disappears before the update
			7: "/uploads/7_lost.jpg", // file missing from storage
		},
		thumbs: map[int64]string{},
		setErr: map[int64]error{6: repository.ErrorPostNotFound},
	}
	st := storage.NewLocalStorage(dir)
	ctx := context.Background()
	apply := options{apply: true, limits: thumbnail.ServerLimits}

	// Dry run: makes each thumbnail in memory, saves and updates nothing.
	var out bytes.Buffer
	sum, err := run(ctx, posts, st, options{limits: thumbnail.ServerLimits}, &out)
	if err != nil {
		t.Fatal(err)
	}
	if sum != (summary{made: 3, skipped: 2, failed: 2}) {
		t.Fatalf("dry run summary = %+v\n%s", sum, out.String())
	}
	if !strings.Contains(out.String(), "would make  post 1 /uploads/1_wide.png -> /uploads/1_wide_w800.jpg") {
		t.Errorf("dry run output:\n%s", out.String())
	}
	if len(posts.thumbs) != 0 {
		t.Errorf("dry run updated posts: %v", posts.thumbs)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != len(files) {
		t.Errorf("dry run wrote files: %d in dir, want %d", len(entries), len(files))
	}

	// Apply.
	out.Reset()
	if sum, err = run(ctx, posts, st, apply, &out); err != nil {
		t.Fatal(err)
	}
	// Post 6 was deleted between listing and updating: skipped, not failed.
	if sum != (summary{made: 2, skipped: 3, failed: 2}) {
		t.Fatalf("apply summary = %+v\n%s", sum, out.String())
	}
	if !strings.Contains(out.String(), "skipped     post 6 /uploads/6_gone.jpg: skipped: post was deleted during the run") {
		t.Errorf("apply output:\n%s", out.String())
	}
	want := map[int64]string{1: "/uploads/1_wide_w800.jpg", 2: "/uploads/2_phone_w800.jpg"}
	for id, p := range want {
		if posts.thumbs[id] != p {
			t.Errorf("post %d thumbnail = %q, want %q", id, posts.thumbs[id], p)
		}
	}
	if len(posts.thumbs) != 2 {
		t.Errorf("thumbnails recorded: %v", posts.thumbs)
	}
	checkJPEG(t, filepath.Join(dir, "1_wide_w800.jpg"), 800, 400)
	checkJPEG(t, filepath.Join(dir, "2_phone_w800.jpg"), 800, 1067) // stored 1200x900, Orientation 6 turns it upright
	for _, name := range []string{"1_wide.png", "2_phone.jpg"} {
		if b, _ := os.ReadFile(filepath.Join(dir, name)); !bytes.Equal(b, files[name]) {
			t.Errorf("original %s was modified", name)
		}
	}

	// Running again only retries what is still missing; nothing new is made.
	out.Reset()
	if sum, err = run(ctx, posts, st, apply, &out); err != nil {
		t.Fatal(err)
	}
	if sum.made != 0 || sum.skipped+sum.failed != 5 {
		t.Fatalf("second run summary = %+v\n%s", sum, out.String())
	}
}

func checkJPEG(t *testing.T, path string, w, h int) {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	cfg, err := jpeg.DecodeConfig(f)
	if err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	if cfg.Width != w || cfg.Height != h {
		t.Errorf("%s is %dx%d, want %dx%d", path, cfg.Width, cfg.Height, w, h)
	}
}

// The backfill's limits are its own: an image over one limit is skipped (and
// stays NULL, so a later run with higher limits picks it up).
func TestRunLimits(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "1_big.png"), fixtures.EncodePNG(fixtures.Gradient(1600, 1200)), 0o644); err != nil {
		t.Fatal(err)
	}
	st := storage.NewLocalStorage(dir)
	ctx := context.Background()

	for _, tc := range []struct {
		name   string
		limits thumbnail.Limits
		want   summary
	}{
		{"memory limit", thumbnail.Limits{MaxBytes: 4 << 20}, summary{skipped: 1}}, // 1.9 MP RGBA alone is 7.3 MiB
		{"pixel limit", thumbnail.Limits{MaxPixels: 1_000_000, MaxBytes: 1 << 30}, summary{skipped: 1}},
		{"within both", thumbnail.Limits{MaxPixels: 2_000_000, MaxBytes: 64 << 20}, summary{made: 1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			posts := &fakePosts{images: map[int64]string{1: "/uploads/1_big.png"}, thumbs: map[int64]string{}}
			var out bytes.Buffer
			sum, err := run(ctx, posts, st, options{apply: true, limits: tc.limits}, &out)
			if err != nil {
				t.Fatal(err)
			}
			if sum != tc.want {
				t.Errorf("summary = %+v, want %+v\n%s", sum, tc.want, out.String())
			}
		})
	}
}

func TestRunListError(t *testing.T) {
	_, err := run(context.Background(), failingPosts{}, storage.NewLocalStorage(t.TempDir()), options{apply: true}, &bytes.Buffer{})
	if err == nil {
		t.Fatal("want an error when posts can't be listed")
	}
}

type failingPosts struct{}

func (failingPosts) ListPostsMissingThumbnail(context.Context) ([]repository.PostImage, error) {
	return nil, errors.New("db down")
}
func (failingPosts) SetThumbnailPath(context.Context, int64, string) error { return nil }
