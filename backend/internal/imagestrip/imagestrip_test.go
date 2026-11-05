package imagestrip_test

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"math/rand"
	"os"
	"testing"
	"testing/iotest"

	"backend/internal/exifmeta"
	"backend/internal/imagestrip"
	"backend/internal/testutil/fixtures"
)

const secret = "SECRET-35.6586N-139.7454E"

func strip(t *testing.T, in []byte) []byte {
	t.Helper()
	f, err := imagestrip.Strip(bytes.NewReader(in), int64(len(in)))
	if err != nil {
		t.Fatalf("Strip: %v", err)
	}
	out, err := io.ReadAll(f)
	if err != nil {
		t.Fatalf("read stripped: %v", err)
	}
	if int64(len(out)) != f.Size() {
		t.Fatalf("read %d bytes, Size() = %d", len(out), f.Size())
	}
	return out
}

func gearOf(b []byte) exifmeta.Gear { return exifmeta.Read(bytes.NewReader(b), int64(len(b))) }
func orientationOf(b []byte) int    { return exifmeta.Orientation(bytes.NewReader(b), int64(len(b))) }

func secretTIFF(extra map[uint16]any) []byte {
	ifd0 := map[uint16]any{
		fixtures.TagMake:             "SONY",
		fixtures.TagModel:            "ILCE-7C",
		fixtures.TagImageDescription: secret,
		fixtures.TagArtist:           "Jane Doe " + secret,
	}
	for k, v := range extra {
		ifd0[k] = v
	}
	return fixtures.TIFF(binary.LittleEndian, ifd0, map[uint16]any{fixtures.TagLensModel: "FE 35mm F1.8"})
}

func jpegSegment(marker byte, payload []byte) []byte {
	s := []byte{0xFF, marker, 0, 0}
	binary.BigEndian.PutUint16(s[2:], uint16(len(payload)+2))
	return append(s, payload...)
}

// insertAfterSOI puts segments right after the SOI marker of img.
func insertAfterSOI(img []byte, segs ...[]byte) []byte {
	out := append([]byte{}, img[:2]...)
	for _, s := range segs {
		out = append(out, s...)
	}
	return append(out, img[2:]...)
}

func decode(t *testing.T, b []byte) image.Image {
	t.Helper()
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatalf("stripped image does not decode: %v", err)
	}
	return img
}

func samePixels(t *testing.T, a, b image.Image) {
	t.Helper()
	if a.Bounds() != b.Bounds() {
		t.Fatalf("bounds %v != %v", a.Bounds(), b.Bounds())
	}
	for y := a.Bounds().Min.Y; y < a.Bounds().Max.Y; y++ {
		for x := a.Bounds().Min.X; x < a.Bounds().Max.X; x++ {
			if a.At(x, y) != b.At(x, y) {
				t.Fatalf("pixel (%d,%d) differs", x, y)
			}
		}
	}
}

func noSecret(t *testing.T, out []byte) {
	t.Helper()
	for _, s := range []string{secret, "ILCE-7C", "FE 35mm", "xmpmeta", "Photoshop 3.0"} {
		if bytes.Contains(out, []byte(s)) {
			t.Errorf("stripped output still contains %q", s)
		}
	}
	if g := gearOf(out); g != (exifmeta.Gear{}) {
		t.Errorf("stripped output still has gear %+v", g)
	}
}

// ---------- JPEG ----------

func TestJPEG_RemovesAllMetadata(t *testing.T) {
	plain := fixtures.JPEG()
	jfif := jpegSegment(0xE0, []byte("JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"))
	icc := jpegSegment(0xE2, []byte("ICC_PROFILE\x00\x01\x01fake-profile"))
	adobe := jpegSegment(0xEE, []byte("Adobe\x00\x64\x00\x00\x00\x00\x01"))
	in := insertAfterSOI(plain,
		jfif,
		jpegSegment(0xE1, append([]byte("Exif\x00\x00"), secretTIFF(nil)...)),
		jpegSegment(0xE1, []byte("http://ns.adobe.com/xap/1.0/\x00<x:xmpmeta>"+secret+"</x:xmpmeta>")),
		jpegSegment(0xE2, []byte("MPF\x00"+secret)),
		icc,
		jpegSegment(0xED, []byte("Photoshop 3.0\x008BIM"+secret)),
		jpegSegment(0xEE, []byte("NotAdobe"+secret)),
		adobe,
		jpegSegment(0xFE, []byte("comment "+secret)),
	)
	// A phone "motion photo" appends a video (and its own metadata) after EOI.
	in = append(in, []byte("ftypmp42...."+secret)...)

	out := strip(t, in)

	noSecret(t, out)
	for name, seg := range map[string][]byte{"JFIF": jfif, "ICC": icc, "Adobe": adobe} {
		if !bytes.Contains(out, seg) {
			t.Errorf("%s segment was dropped", name)
		}
	}
	if !bytes.HasSuffix(out, []byte{0xFF, 0xD9}) {
		t.Error("output does not end at EOI")
	}
	if orientationOf(out) != 1 || bytes.Contains(out, []byte("Exif\x00\x00")) {
		t.Error("upright image got an EXIF block")
	}
	samePixels(t, decode(t, plain), decode(t, out))
}

func TestJPEG_KeepsOrientationOnly(t *testing.T) {
	for o := uint16(2); o <= 8; o++ {
		in := fixtures.JPEGWithEXIF(secretTIFF(map[uint16]any{fixtures.TagOrientation: o}))
		out := strip(t, in)
		noSecret(t, out)
		if got := orientationOf(out); got != int(o) {
			t.Errorf("orientation %d: got %d after stripping", o, got)
		}
		// The rewritten EXIF block follows the leading JFIF segment.
		if i, j := bytes.Index(out, []byte("JFIF")), bytes.Index(out, []byte("Exif")); i < 0 || j < i {
			t.Errorf("EXIF at %d, JFIF at %d: want EXIF after JFIF", j, i)
		}
		decode(t, out)
	}
}

func TestJPEG_WithoutMetadataIsUnchanged(t *testing.T) {
	// Big enough that the entropy scan crosses several 64 KiB read windows,
	// and noisy enough to contain plenty of stuffed 0xFF 0x00 bytes.
	rng := rand.New(rand.NewSource(1))
	img := image.NewRGBA(image.Rect(0, 0, 400, 400))
	for i := range img.Pix {
		img.Pix[i] = byte(rng.Intn(256))
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	in := buf.Bytes()
	if len(in) < 3*(64<<10) {
		t.Fatalf("fixture too small (%d bytes) to cross read windows", len(in))
	}
	if out := strip(t, in); !bytes.Equal(out, in) {
		t.Fatalf("a JPEG with no metadata changed (%d -> %d bytes)", len(in), len(out))
	}
}

func TestJPEG_RealCameraFile(t *testing.T) {
	app1, err := os.ReadFile("../exifmeta/testdata/sony-ilce7c-manual-lens.app1")
	if err != nil {
		t.Fatal(err)
	}
	in := insertAfterSOI(fixtures.JPEG(), app1)
	out := strip(t, in)
	for _, s := range []string{"SONY", "ILCE-7C", "Lightroom", "2023:08:10"} {
		if bytes.Contains(out, []byte(s)) {
			t.Errorf("still contains %q", s)
		}
	}
	samePixels(t, decode(t, fixtures.JPEG()), decode(t, out))
}

func TestJPEG_Truncated(t *testing.T) {
	in := fixtures.JPEGWithEXIF(secretTIFF(nil))
	sos := bytes.Index(in, []byte{0xFF, 0xDA})

	// Cut inside the scan data: browsers render the part that arrived, so keep it.
	out := strip(t, in[:len(in)-10])
	noSecret(t, out)

	// Cut before any image data: there is nothing to show and the structure is broken.
	for _, n := range []int{3, 10, sos - 1, sos + 3} {
		if _, err := imagestrip.Strip(bytes.NewReader(in[:n]), int64(n)); !errors.Is(err, imagestrip.ErrMalformed) {
			t.Errorf("cut at %d: got %v, want ErrMalformed", n, err)
		}
	}
}

// ---------- PNG ----------

func pngChunk(typ string, data []byte) []byte {
	c := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	c = append(c, typ...)
	c = append(c, data...)
	return binary.BigEndian.AppendUint32(c, crc32.ChecksumIEEE(c[4:]))
}

func TestPNG_RemovesAllMetadata(t *testing.T) {
	plain := fixtures.PNG()
	const afterIHDR = 8 + 25
	gama := pngChunk("gAMA", []byte{0, 0, 0xB1, 0x8F})
	var in []byte
	in = append(in, plain[:afterIHDR]...)
	in = append(in, gama...)
	in = append(in, pngChunk("eXIf", secretTIFF(nil))...)
	in = append(in, pngChunk("tEXt", []byte("Comment\x00"+secret))...)
	in = append(in, pngChunk("iTXt", []byte("XML:com.adobe.xmp\x00\x00\x00\x00\x00<x:xmpmeta>"+secret))...)
	in = append(in, pngChunk("tIME", []byte{0x07, 0xE9, 1, 2, 3, 4, 5})...)
	in = append(in, pngChunk("prVt", []byte(secret))...) // unknown private chunk
	in = append(in, plain[afterIHDR:]...)
	in = append(in, []byte("trailing "+secret)...)

	out := strip(t, in)

	noSecret(t, out)
	if !bytes.Contains(out, gama) {
		t.Error("gAMA chunk was dropped")
	}
	if bytes.Contains(out, []byte("tIME")) {
		t.Error("tIME chunk was kept")
	}
	samePixels(t, decode(t, plain), decode(t, out)) // png.Decode also checks every CRC
}

func TestPNG_KeepsOrientationOnly(t *testing.T) {
	out := strip(t, fixtures.PNGWithEXIF(secretTIFF(map[uint16]any{fixtures.TagOrientation: uint16(6)})))
	noSecret(t, out)
	if got := orientationOf(out); got != 6 {
		t.Errorf("orientation = %d, want 6", got)
	}
	if _, err := png.Decode(bytes.NewReader(out)); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

func TestPNG_Malformed(t *testing.T) {
	plain := fixtures.PNG()
	for name, in := range map[string][]byte{
		"signature only": plain[:8],
		"no IHDR first":  append(append([]byte{}, plain[:8]...), pngChunk("tEXt", []byte("a\x00b"))...),
		"cut in IHDR":    plain[:20],
	} {
		if _, err := imagestrip.Strip(bytes.NewReader(in), int64(len(in))); !errors.Is(err, imagestrip.ErrMalformed) {
			t.Errorf("%s: got %v, want ErrMalformed", name, err)
		}
	}
}

// ---------- WebP ----------

type webpChunk struct {
	fourcc string
	data   []byte
}

func riffChunks(t *testing.T, b []byte) []webpChunk {
	t.Helper()
	if string(b[:4]) != "RIFF" || string(b[8:12]) != "WEBP" {
		t.Fatal("not a RIFF/WEBP file")
	}
	if got := binary.LittleEndian.Uint32(b[4:8]); int(got) != len(b)-8 {
		t.Fatalf("RIFF size %d, want %d", got, len(b)-8)
	}
	var cs []webpChunk
	for off := 12; off+8 <= len(b); {
		n := int(binary.LittleEndian.Uint32(b[off+4:]))
		cs = append(cs, webpChunk{string(b[off : off+4]), b[off+8 : off+8+n]})
		off += 8 + n + n&1
	}
	return cs
}

func TestWebP_RemovesAllMetadata(t *testing.T) {
	for _, o := range []uint16{1, 6} {
		tiff := secretTIFF(map[uint16]any{fixtures.TagOrientation: o})
		in := fixtures.WebPWithEXIF(tiff)
		// Add an XMP chunk and set its flag, as a real extended WebP would.
		xmp := []byte("XMP ")
		xmp = binary.LittleEndian.AppendUint32(xmp, uint32(len(secret)+1))
		xmp = append(append(xmp, secret...), 0, 0) // odd length + pad byte
		in = append(in, xmp...)
		binary.LittleEndian.PutUint32(in[4:8], uint32(len(in)-8))
		in[20] |= 0x04
		in = append(in, []byte("after RIFF "+secret)...)

		out := strip(t, in)
		noSecret(t, out)

		var fourccs []string
		var flags byte
		for _, c := range riffChunks(t, out) {
			fourccs = append(fourccs, c.fourcc)
			if c.fourcc == "VP8X" {
				flags = c.data[0]
			}
		}
		if flags&0x04 != 0 {
			t.Errorf("orientation %d: XMP flag still set", o)
		}
		wantEXIF := o != 1
		if (flags&0x08 != 0) != wantEXIF || bytes.Contains(out, []byte("EXIF")) != wantEXIF {
			t.Errorf("orientation %d: EXIF flag %v, chunks %v", o, flags&0x08 != 0, fourccs)
		}
		if got := orientationOf(out); got != int(o) {
			t.Errorf("orientation %d: got %d", o, got)
		}
	}
}

// ---------- general ----------

func TestUnsupportedFormats(t *testing.T) {
	for name, in := range map[string][]byte{
		"gif":   fixtures.GIF(),
		"empty": nil,
		"text":  []byte("hello, world, this is not an image"),
	} {
		if _, err := imagestrip.Strip(bytes.NewReader(in), int64(len(in))); !errors.Is(err, imagestrip.ErrUnsupported) {
			t.Errorf("%s: got %v, want ErrUnsupported", name, err)
		}
	}
}

func TestFileImplementsReaderContracts(t *testing.T) {
	in := insertAfterSOI(fixtures.JPEGWithEXIF(secretTIFF(map[uint16]any{fixtures.TagOrientation: uint16(3)})),
		jpegSegment(0xFE, []byte("comment")))
	f, err := imagestrip.Strip(bytes.NewReader(in), int64(len(in)))
	if err != nil {
		t.Fatal(err)
	}
	want, err := io.ReadAll(io.NewSectionReader(f, 0, f.Size()))
	if err != nil {
		t.Fatal(err)
	}
	// Exercises Read, ReadAt and Seek against the expected content.
	if err := iotest.TestReader(f, want); err != nil {
		t.Fatal(err)
	}
}

// A source that fails mid-read must surface as an I/O error, not ErrMalformed
// (that would turn a disk problem into a 400 for the user).
func TestIOErrorsAreNotMalformed(t *testing.T) {
	in := fixtures.JPEGWithEXIF(secretTIFF(nil))
	boom := errors.New("disk on fire")
	_, err := imagestrip.Strip(failingReaderAt{bytes.NewReader(in), 40, boom}, int64(len(in)))
	if !errors.Is(err, boom) {
		t.Fatalf("got %v, want the I/O error", err)
	}
}

type failingReaderAt struct {
	r     io.ReaderAt
	after int64
	err   error
}

func (f failingReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off+int64(len(p)) > f.after {
		return 0, f.err
	}
	return f.r.ReadAt(p, off)
}
