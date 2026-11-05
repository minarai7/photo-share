package exifmeta

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"backend/internal/testutil/fixtures"
)

// Fuzzes extract rather than Read, because Read's recover would hide panics.
// Run longer locally with: go test ./internal/exifmeta -run '^$' -fuzz FuzzExtract -fuzztime 1m
func FuzzExtract(f *testing.F) {
	tiff := fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")
	f.Add(fixtures.JPEGWithEXIF(tiff))
	f.Add(fixtures.PNGWithEXIF(tiff))
	f.Add(fixtures.WebPWithEXIF(tiff))
	f.Add(tiff)
	if real, err := os.ReadFile("testdata/sony-ilce7c-manual-lens.app1"); err == nil {
		f.Add(append([]byte{0xFF, 0xD8}, real...))
	}
	f.Fuzz(func(t *testing.T, b []byte) {
		g := extract(bytes.NewReader(b), int64(len(b)))
		for _, s := range []string{g.CameraBody, g.Lens} {
			if len([]rune(s)) > MaxFieldRunes || strings.ContainsRune(s, 0) {
				t.Fatalf("bad value %q", s)
			}
		}
	})
}
