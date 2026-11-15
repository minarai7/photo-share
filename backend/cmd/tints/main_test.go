package main

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"backend/internal/repository"
	"backend/internal/storage"
	"backend/internal/testutil/fixtures"
	"backend/internal/thumbnail"
	"backend/internal/tint"
)

// fakePosts mirrors the two PostRepository methods: listing returns posts
// without a tint in ID order; setting a missing post fails.
type fakePosts struct {
	posts  []repository.PostMissingTint
	tints  map[int64]string
	setErr map[int64]error
}

func (f *fakePosts) ListPostsMissingTint(context.Context) ([]repository.PostMissingTint, error) {
	var out []repository.PostMissingTint
	for _, p := range f.posts {
		if _, done := f.tints[p.ID]; !done {
			out = append(out, p)
		}
	}
	return out, nil
}

func (f *fakePosts) SetPostTint(_ context.Context, id int64, t string) error {
	if err := f.setErr[id]; err != nil {
		return err
	}
	f.tints[id] = t
	return nil
}

func solid(c color.Color, w, h int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, c)
		}
	}
	return img
}

func strPtr(s string) *string { return &s }

func TestRun(t *testing.T) {
	dir := t.TempDir()
	red, blue := color.RGBA{200, 30, 30, 255}, color.RGBA{30, 40, 200, 255}
	files := map[string][]byte{
		"1_w800.jpg":      fixtures.EncodeJPEG(solid(red, 80, 60)),    // the thumbnail of post 1
		"2_cover.png":     fixtures.EncodePNG(solid(blue, 1200, 900)), // no thumbnail: the original
		"3_anim.webp":     fixtures.AnimatedWebP(),                    // no thumbnail, animated
		"5_gone_w800.jpg": fixtures.EncodeJPEG(solid(red, 80, 60)),    // the post disappears
	}
	for name, b := range files {
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	posts := &fakePosts{
		posts: []repository.PostMissingTint{
			{ID: 1, ImagePath: "/uploads/1.jpg", ThumbnailPath: strPtr("/uploads/1_w800.jpg")},
			{ID: 2, ImagePath: "/uploads/2_cover.png"},
			{ID: 3, ImagePath: "/uploads/3_anim.webp"},
			{ID: 4, ImagePath: "/uploads/4_lost.jpg"}, // missing from storage
			{ID: 5, ImagePath: "/uploads/5_gone.jpg", ThumbnailPath: strPtr("/uploads/5_gone_w800.jpg")},
			{ID: 6, ImagePath: "/demo/x.jpg"}, // not a stored upload
		},
		tints:  map[int64]string{},
		setErr: map[int64]error{5: repository.ErrorPostNotFound},
	}
	st := storage.NewLocalStorage(dir)
	ctx := context.Background()

	var out bytes.Buffer
	sum, err := run(ctx, posts, st, options{limits: thumbnail.ServerLimits}, &out)
	if err != nil {
		t.Fatal(err)
	}
	if sum != (summary{tinted: 3, skipped: 2, failed: 1}) {
		t.Fatalf("dry run summary = %+v\n%s", sum, out.String())
	}
	if len(posts.tints) != 0 {
		t.Errorf("dry run recorded tints: %v", posts.tints)
	}

	out.Reset()
	if sum, err = run(ctx, posts, st, options{apply: true, limits: thumbnail.ServerLimits}, &out); err != nil {
		t.Fatal(err)
	}
	if sum != (summary{tinted: 2, skipped: 3, failed: 1}) {
		t.Fatalf("apply summary = %+v\n%s", sum, out.String())
	}
	if !strings.Contains(out.String(), "post 5 /uploads/5_gone.jpg: skipped: post was deleted during the run") {
		t.Errorf("apply output:\n%s", out.String())
	}
	for id, c := range map[int64]color.Color{1: red, 2: blue} {
		got := posts.tints[id]
		if !tint.Valid(got) {
			t.Errorf("post %d tint = %q", id, got)
			continue
		}
		if want := tint.FromImage(solid(c, 4, 4)); got != want {
			t.Errorf("post %d tint = %s, want %s (from its photo's colour)", id, got, want)
		}
	}

	// Running again only retries what is still missing.
	out.Reset()
	if sum, err = run(ctx, posts, st, options{apply: true, limits: thumbnail.ServerLimits}, &out); err != nil {
		t.Fatal(err)
	}
	if sum.tinted != 0 {
		t.Errorf("second run tinted %d posts\n%s", sum.tinted, out.String())
	}
}

type failingPosts struct{}

func (failingPosts) ListPostsMissingTint(context.Context) ([]repository.PostMissingTint, error) {
	return nil, errors.New("db down")
}
func (failingPosts) SetPostTint(context.Context, int64, string) error { return nil }

func TestRunListError(t *testing.T) {
	if _, err := run(context.Background(), failingPosts{}, storage.NewLocalStorage(t.TempDir()), options{apply: true}, &bytes.Buffer{}); err == nil {
		t.Fatal("want an error when posts can't be listed")
	}
}
