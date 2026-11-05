package imagestrip_test

import (
	"bytes"
	"encoding/binary"
	"io"
	"os"
	"testing"

	"backend/internal/imagestrip"
	"backend/internal/testutil/fixtures"
)

// Run longer locally with: go test ./internal/imagestrip -run '^$' -fuzz FuzzStrip -fuzztime 1m
func FuzzStrip(f *testing.F) {
	tiff := fixtures.TIFF(binary.BigEndian, map[uint16]any{fixtures.TagMake: "SONY", fixtures.TagOrientation: uint16(6)}, nil)
	f.Add(fixtures.JPEGWithEXIF(tiff))
	f.Add(fixtures.PNGWithEXIF(tiff))
	f.Add(fixtures.WebPWithEXIF(tiff))
	f.Add(insertAfterSOI(fixtures.JPEG(), jpegSegment(0xFE, []byte("c")), []byte{0xFF, 0xFF}))
	if app1, err := os.ReadFile("../exifmeta/testdata/sony-ilce7c-manual-lens.app1"); err == nil {
		f.Add(insertAfterSOI(fixtures.JPEG(), app1))
	}

	stripBytes := func(in []byte) ([]byte, error) {
		sf, err := imagestrip.Strip(bytes.NewReader(in), int64(len(in)))
		if err != nil {
			return nil, err
		}
		return io.ReadAll(sf)
	}

	f.Fuzz(func(t *testing.T, in []byte) {
		out, err := stripBytes(in)
		if err != nil {
			return
		}
		// At most one small orientation block (38 bytes for PNG) is ever added.
		if len(out) > len(in)+38 {
			t.Fatalf("output grew from %d to %d bytes", len(in), len(out))
		}
		// Stripping is idempotent: the output is already clean.
		again, err := stripBytes(out)
		if err != nil {
			t.Fatalf("stripped output is not strippable: %v", err)
		}
		if !bytes.Equal(again, out) {
			t.Fatalf("second strip changed the output (%d -> %d bytes)", len(out), len(again))
		}
	})
}
