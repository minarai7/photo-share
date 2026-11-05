package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"backend/internal/exifmeta"
	"backend/internal/storage"
	"backend/internal/testutil/fixtures"
)

func TestRun(t *testing.T) {
	dir := t.TempDir()
	const gps = "GPS 35.6586N 139.7454E"
	tiff := fixtures.TIFF(binary.LittleEndian,
		map[uint16]any{fixtures.TagMake: "SONY", fixtures.TagImageDescription: gps, fixtures.TagOrientation: uint16(6)}, nil)
	files := map[string][]byte{
		"dirty.jpg":  fixtures.JPEGWithEXIF(tiff),
		"dirty.webp": fixtures.WebPWithEXIF(tiff),
		"clean.png":  fixtures.PNG(),
		"broken.jpg": fixtures.JPEGWithEXIF(tiff)[:40],
		"notes.txt":  []byte("not an image"),
		".gitkeep":   nil,
	}
	for name, b := range files {
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	read := func(name string) []byte {
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	st := storage.NewLocalStorage(dir)
	ctx := context.Background()

	// Dry run: reports, changes nothing.
	var out bytes.Buffer
	sum, err := run(ctx, st, false, &out)
	if err != nil {
		t.Fatal(err)
	}
	if sum != (summary{clean: 1, stripped: 2, failed: 2}) {
		t.Fatalf("dry run summary = %+v\n%s", sum, out.String())
	}
	if !strings.Contains(out.String(), "would strip dirty.jpg") {
		t.Errorf("dry run output:\n%s", out.String())
	}
	for name, b := range files {
		if !bytes.Equal(read(name), b) {
			t.Errorf("dry run modified %s", name)
		}
	}

	// Apply: dirty files are rewritten, everything else is untouched.
	out.Reset()
	if sum, err = run(ctx, st, true, &out); err != nil {
		t.Fatal(err)
	}
	if sum != (summary{clean: 1, stripped: 2, failed: 2}) {
		t.Fatalf("apply summary = %+v\n%s", sum, out.String())
	}
	for _, name := range []string{"dirty.jpg", "dirty.webp"} {
		b := read(name)
		if bytes.Contains(b, []byte(gps)) || bytes.Contains(b, []byte("SONY")) {
			t.Errorf("%s still has metadata", name)
		}
		if o := exifmeta.Orientation(bytes.NewReader(b), int64(len(b))); o != 6 {
			t.Errorf("%s orientation = %d, want 6", name, o)
		}
	}
	for _, name := range []string{"clean.png", "broken.jpg", "notes.txt"} {
		if !bytes.Equal(read(name), files[name]) {
			t.Errorf("apply modified %s", name)
		}
	}

	// Running again finds nothing left to do.
	out.Reset()
	if sum, err = run(ctx, st, true, &out); err != nil {
		t.Fatal(err)
	}
	if sum != (summary{clean: 3, failed: 2}) {
		t.Fatalf("second run summary = %+v\n%s", sum, out.String())
	}
}
