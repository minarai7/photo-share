package exifmeta_test

import (
	"bytes"
	"encoding/binary"
	"os"
	"strings"
	"testing"

	"backend/internal/exifmeta"
	"backend/internal/testutil/fixtures"
)

func read(b []byte) exifmeta.Gear {
	return exifmeta.Read(bytes.NewReader(b), int64(len(b)))
}

func TestRead_Containers(t *testing.T) {
	tiff := fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")
	want := exifmeta.Gear{CameraBody: "SONY ILCE-7C", Lens: "FE 35mm F1.8"}

	cases := map[string][]byte{
		"jpeg": fixtures.JPEGWithEXIF(tiff),
		"png":  fixtures.PNGWithEXIF(tiff),
		"webp": fixtures.WebPWithEXIF(tiff),
		// Some writers keep the JPEG-style prefix inside the PNG/WebP chunk.
		"png with Exif prefix": fixtures.PNGWithEXIF(append([]byte("Exif\x00\x00"), tiff...)),
	}
	for name, img := range cases {
		t.Run(name, func(t *testing.T) {
			if got := read(img); got != want {
				t.Fatalf("got %+v, want %+v", got, want)
			}
		})
	}
}

// testdata/sony-ilce7c-manual-lens.app1 is the untouched EXIF APP1 segment
// (marker, length, "Exif\0\0", TIFF) of a real photo: Sony α7C with an adapted
// manual lens, exported by Lightroom Classic. It contains no GPS or serial
// number. Unlike the synthetic fixtures it was not written by our own
// builder, so it catches parser assumptions the builder happens to share.
func TestRead_RealCameraFile(t *testing.T) {
	app1, err := os.ReadFile("testdata/sony-ilce7c-manual-lens.app1")
	if err != nil {
		t.Fatal(err)
	}
	img := fixtures.JPEG()
	jpeg := append(append(append([]byte{}, img[:2]...), app1...), img[2:]...)

	// Sony records "----" as the lens model for a lens without electronics.
	want := exifmeta.Gear{CameraBody: "SONY ILCE-7C", Lens: ""}
	if got := read(jpeg); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestRead_BigEndian(t *testing.T) {
	tiff := fixtures.TIFF(binary.BigEndian,
		map[uint16]any{fixtures.TagMake: "NIKON CORPORATION", fixtures.TagModel: "NIKON Z 9", fixtures.TagOrientation: uint16(6)},
		map[uint16]any{fixtures.TagLensModel: "NIKKOR Z 500mm f/5.6 PF"},
	)
	want := exifmeta.Gear{CameraBody: "NIKON Z 9", Lens: "NIKKOR Z 500mm f/5.6 PF"}
	if got := read(fixtures.JPEGWithEXIF(tiff)); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestOrientation(t *testing.T) {
	orientation := func(b []byte) int { return exifmeta.Orientation(bytes.NewReader(b), int64(len(b))) }
	withOrientation := func(order binary.ByteOrder, v uint16) []byte {
		return fixtures.TIFF(order, map[uint16]any{fixtures.TagMake: "Apple", fixtures.TagOrientation: v}, nil)
	}

	for _, order := range []binary.ByteOrder{binary.LittleEndian, binary.BigEndian} {
		for v := uint16(1); v <= 8; v++ {
			if got := orientation(fixtures.JPEGWithEXIF(withOrientation(order, v))); got != int(v) {
				t.Errorf("%v orientation %d: got %d", order, v, got)
			}
		}
	}
	if got := orientation(fixtures.PNGWithEXIF(withOrientation(binary.LittleEndian, 6))); got != 6 {
		t.Errorf("png: got %d, want 6", got)
	}
	if got := orientation(fixtures.WebPWithEXIF(withOrientation(binary.LittleEndian, 8))); got != 8 {
		t.Errorf("webp: got %d, want 8", got)
	}

	// Absent, out of range, or stored as the wrong type all mean "upright".
	for name, img := range map[string][]byte{
		"no exif":     fixtures.JPEG(),
		"no tag":      fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", "")),
		"zero":        fixtures.JPEGWithEXIF(withOrientation(binary.LittleEndian, 0)),
		"nine":        fixtures.JPEGWithEXIF(withOrientation(binary.LittleEndian, 9)),
		"ascii value": fixtures.JPEGWithEXIF(fixtures.TIFF(binary.LittleEndian, map[uint16]any{fixtures.TagOrientation: "6"}, nil)),
		"real file":   nil, // filled below
	} {
		if name == "real file" {
			app1, err := os.ReadFile("testdata/sony-ilce7c-manual-lens.app1")
			if err != nil {
				t.Fatal(err)
			}
			img = append(append([]byte{0xFF, 0xD8}, app1...), fixtures.JPEG()[2:]...)
		}
		if got := orientation(img); got != 1 {
			t.Errorf("%s: got %d, want 1", name, got)
		}
	}
}

// The real image must still decode after the EXIF segment is found, i.e. the
// fixture is realistic; and the XMP APP1 segment that often precedes or
// follows EXIF must be skipped rather than mistaken for it.
func TestRead_SkipsXMPSegment(t *testing.T) {
	img := fixtures.JPEGWithEXIF(fixtures.CameraTIFF("Canon", "Canon EOS R5", "RF24-70mm F2.8 L IS USM"))
	xmp := []byte("http://ns.adobe.com/xap/1.0/\x00<x:xmpmeta/>")
	seg := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(seg[2:], uint16(len(xmp)+2))
	seg = append(seg, xmp...)
	withXMP := append(append(append([]byte{}, img[:2]...), seg...), img[2:]...)

	want := exifmeta.Gear{CameraBody: "Canon EOS R5", Lens: "RF24-70mm F2.8 L IS USM"}
	if got := read(withXMP); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestRead_CameraBodyNaming(t *testing.T) {
	cases := []struct{ mk, model, want string }{
		{"SONY", "ILCE-7C", "SONY ILCE-7C"},
		{"Canon", "Canon EOS R5", "Canon EOS R5"},
		{"NIKON CORPORATION", "NIKON Z 6_2", "NIKON Z 6_2"},
		{"FUJIFILM", "X-T30 III", "FUJIFILM X-T30 III"},
		{"Apple", "iPhone 15 Pro", "Apple iPhone 15 Pro"},
		{"OLYMPUS IMAGING CORP.", "E-M5MarkII", "OLYMPUS E-M5MarkII"},
		{"RICOH IMAGING COMPANY, LTD.", "GR III", "RICOH GR III"},
		{"LEICA CAMERA AG", "leica q2", "leica q2"},
		{"", "X100V", "X100V"},
		{"  SONY  ", "  ILCE-7M4  ", "SONY ILCE-7M4"},
		{"SONY", "", ""}, // a make alone is not a camera
	}
	for _, tc := range cases {
		got := read(fixtures.JPEGWithEXIF(fixtures.CameraTIFF(tc.mk, tc.model, "")))
		if got.CameraBody != tc.want {
			t.Errorf("make %q + model %q: got %q, want %q", tc.mk, tc.model, got.CameraBody, tc.want)
		}
	}
}

func TestRead_CleansValues(t *testing.T) {
	cases := []struct{ name, lens, want string }{
		{"sony manual-lens placeholder", "----", ""},
		{"blank", "    ", ""},
		{"padding and repeated spaces", "  EF50mm   f/1.8 STM   ", "EF50mm f/1.8 STM"},
		{"control characters", "XF23mm\tF2\nR WR", "XF23mm F2 R WR"},
		{"stops at embedded NUL", "XF35mm\x00garbage", "XF35mm"},
		{"invalid UTF-8 dropped", "Summicron\xff 35", "Summicron 35"},
		{"short value stored inline", "50", "50"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := read(fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", tc.lens)))
			if got.Lens != tc.want {
				t.Fatalf("lens %q: got %q, want %q", tc.lens, got.Lens, tc.want)
			}
		})
	}

	long := strings.Repeat("x", 500)
	got := read(fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", long, long)))
	if n := len([]rune(got.Lens)); n != exifmeta.MaxFieldRunes {
		t.Errorf("lens length = %d, want %d", n, exifmeta.MaxFieldRunes)
	}
	if n := len([]rune(got.CameraBody)); n != exifmeta.MaxFieldRunes {
		t.Errorf("camera length = %d, want %d", n, exifmeta.MaxFieldRunes)
	}
}

func TestRead_NoMetadata(t *testing.T) {
	cases := map[string][]byte{
		"plain jpeg": fixtures.JPEG(),
		"plain png":  fixtures.PNG(),
		"plain webp": fixtures.WebP(),
		"gif":        fixtures.GIF(),
		"empty":      nil,
		"text":       []byte("hello, world"),
	}
	for name, img := range cases {
		if got := read(img); got != (exifmeta.Gear{}) {
			t.Errorf("%s: got %+v, want empty", name, got)
		}
	}
}

// Every prefix of a valid file is a plausible truncated upload.
func TestRead_TruncatedNeverPanics(t *testing.T) {
	for _, img := range [][]byte{
		fixtures.JPEGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")),
		fixtures.PNGWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")),
		fixtures.WebPWithEXIF(fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")),
	} {
		for n := range len(img) {
			read(img[:n])
		}
	}
}

func TestRead_HostileOffsets(t *testing.T) {
	tiff := fixtures.CameraTIFF("SONY", "ILCE-7C", "FE 35mm F1.8")

	// Exif sub-IFD pointer aimed back at IFD0: must not loop forever.
	loop := append([]byte{}, tiff...)
	for i := 10; i+12 <= len(loop); i += 12 {
		if binary.LittleEndian.Uint16(loop[i:]) == 0x8769 {
			binary.LittleEndian.PutUint32(loop[i+8:], 8)
		}
	}
	if got := read(fixtures.JPEGWithEXIF(loop)); got.CameraBody != "SONY ILCE-7C" || got.Lens != "" {
		t.Errorf("self-referencing Exif IFD: got %+v", got)
	}

	// Value offsets far past the end of the block.
	far := append([]byte{}, tiff...)
	for i := 10; i+12 <= len(far); i += 12 {
		binary.LittleEndian.PutUint32(far[i+8:], 0xFFFFFFF0)
	}
	if got := read(fixtures.JPEGWithEXIF(far)); got != (exifmeta.Gear{}) {
		t.Errorf("out-of-range offsets: got %+v, want empty", got)
	}
}
