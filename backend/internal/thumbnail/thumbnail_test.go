package thumbnail

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"testing"

	"backend/internal/testutil/fixtures"

	"golang.org/x/image/draw"
)

func make_(t *testing.T, data []byte) image.Image {
	t.Helper()
	out, err := Make(context.Background(), bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("Make: %v", err)
	}
	img, format, err := image.Decode(bytes.NewReader(out))
	if err != nil || format != "jpeg" {
		t.Fatalf("thumbnail is not a JPEG (%q): %v", format, err)
	}
	return img
}

func TestTargetSize(t *testing.T) {
	cases := []struct{ w, h, tw, th int }{
		{4000, 3000, 800, 600},  // landscape
		{3000, 4000, 800, 1067}, // portrait
		{640, 480, 640, 480},    // already small: never upscaled
		{1000, 4000, 400, 1600}, // very tall: height capped
		{500, 3000, 267, 1600},  // narrow and very tall
		{8000, 10, 800, 1},      // panorama keeps at least 1 px
		{1, 1, 1, 1},
	}
	for _, c := range cases {
		if tw, th := TargetSize(c.w, c.h); tw != c.tw || th != c.th {
			t.Errorf("TargetSize(%d, %d) = %dx%d, want %dx%d", c.w, c.h, tw, th, c.tw, c.th)
		}
	}
}

// A 3ﾃ・ image with a distinct colour per pixel, named a窶吐:
//
//	a b c
//	d e f
func labelled() (*image.RGBA, map[color.RGBA]byte) {
	m := image.NewRGBA(image.Rect(0, 0, 3, 2))
	names := map[color.RGBA]byte{}
	for i, name := range "abcdef" {
		c := color.RGBA{uint8(40 * (i + 1)), 0, 0, 255}
		m.SetRGBA(i%3, i/3, c)
		names[c] = byte(name)
	}
	return m, names
}

func TestOrientAllEight(t *testing.T) {
	want := map[int]string{
		1: "abc/def",
		2: "cba/fed",  // mirrored
		3: "fed/cba",  // rotated 180ﾂｰ
		4: "def/abc",  // mirrored vertically
		5: "ad/be/cf", // transposed
		6: "da/eb/fc", // turned 90ﾂｰ clockwise
		7: "fc/eb/da", // transversed
		8: "cf/be/ad", // turned 90ﾂｰ counter-clockwise
		0: "abc/def",  // invalid values leave it as stored
		9: "abc/def",
	}
	for o, w := range want {
		m, names := labelled()
		out := orient(m, o)
		var rows []string
		for y := range out.Rect.Dy() {
			var row []byte
			for x := range out.Rect.Dx() {
				row = append(row, names[out.RGBAAt(x, y)])
			}
			rows = append(rows, string(row))
		}
		if got := strings.Join(rows, "/"); got != w {
			t.Errorf("orientation %d: got %s, want %s", o, got, w)
		}
	}
}

func TestMake_Sizes(t *testing.T) {
	cases := []struct {
		name   string
		data   []byte
		tw, th int
	}{
		{"wide jpeg is shrunk to 800", fixtures.EncodeJPEG(fixtures.Gradient(2000, 1000)), 800, 400},
		{"tall png is capped at 1600 high", fixtures.EncodePNG(fixtures.Gradient(1000, 4000)), 400, 1600},
		{"small webp is not upscaled", fixtures.DecodableWebP(), 64, 48},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b := make_(t, tc.data).Bounds()
			if b.Dx() != tc.tw || b.Dy() != tc.th {
				t.Errorf("thumbnail is %dx%d, want %dx%d", b.Dx(), b.Dy(), tc.tw, tc.th)
			}
		})
	}
}

func TestMake_AppliesOrientation(t *testing.T) {
	// Stored landscape, Orientation 6: a phone held upright. Left half red,
	// right half blue, so after a clockwise turn red is on top.
	src := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for y := range 20 {
		for x := range 40 {
			c := color.RGBA{255, 0, 0, 255}
			if x >= 20 {
				c = color.RGBA{0, 0, 255, 255}
			}
			src.SetRGBA(x, y, c)
		}
	}
	tiff := fixtures.TIFF(binary.LittleEndian, map[uint16]any{fixtures.TagOrientation: uint16(6)}, nil)
	img := make_(t, fixtures.AddJPEGEXIF(fixtures.EncodeJPEG(src), tiff))

	if b := img.Bounds(); b.Dx() != 20 || b.Dy() != 40 {
		t.Fatalf("thumbnail is %dx%d, want portrait 20x40", b.Dx(), b.Dy())
	}
	if r, _, bl, _ := img.At(10, 5).RGBA(); r < bl {
		t.Error("top of the thumbnail is not red: orientation not applied clockwise")
	}
	if r, _, bl, _ := img.At(10, 35).RGBA(); bl < r {
		t.Error("bottom of the thumbnail is not blue")
	}
}

func TestMake_HasNoMetadata(t *testing.T) {
	tiff := fixtures.TIFF(binary.LittleEndian,
		map[uint16]any{fixtures.TagMake: "SONY", fixtures.TagImageDescription: "GPS 35.6586N 139.7454E", fixtures.TagOrientation: uint16(3)}, nil)
	data := fixtures.AddJPEGEXIF(fixtures.EncodeJPEG(fixtures.Gradient(100, 50)), tiff)
	out, err := Make(context.Background(), bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{"Exif", "SONY", "GPS", "http://ns.adobe.com/xap"} {
		if bytes.Contains(out, []byte(s)) {
			t.Errorf("thumbnail contains %q", s)
		}
	}
}

func TestMake_FlattensTransparencyOntoWhite(t *testing.T) {
	clear := image.NewNRGBA(image.Rect(0, 0, 16, 16)) // all transparent
	for name, data := range map[string][]byte{
		"png":  fixtures.EncodePNG(clear),
		"webp": fixtures.TransparentWebP(),
	} {
		t.Run(name, func(t *testing.T) {
			img := make_(t, data)
			r, g, b, _ := img.At(8, 8).RGBA()
			if r < 0xF000 || g < 0xF000 || b < 0xF000 {
				t.Errorf("transparent pixel became %04x %04x %04x, want white", r, g, b)
			}
		})
	}
}

// pngWithChunkAfterIHDR inserts a chunk right after the IHDR of a PNG.
func pngWithChunkAfterIHDR(img []byte, typ string, data []byte) []byte {
	const afterIHDR = 8 + 4 + 4 + 13 + 4
	c := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	c = append(append(c, typ...), data...)
	c = binary.BigEndian.AppendUint32(c, crc32.ChecksumIEEE(c[4:]))
	out := append([]byte{}, img[:afterIHDR]...)
	return append(append(out, c...), img[afterIHDR:]...)
}

// pngClaiming patches a PNG's IHDR to claim wﾃ揺 (the pixel data stays small).
func pngClaiming(w, h uint32) []byte {
	b := fixtures.PNG()
	binary.BigEndian.PutUint32(b[16:], w)
	binary.BigEndian.PutUint32(b[20:], h)
	binary.BigEndian.PutUint32(b[29:], crc32.ChecksumIEEE(b[12:29]))
	return b
}

func TestMake_Refuses(t *testing.T) {
	cases := []struct {
		name string
		data []byte
		want error // nil: any error
	}{
		{"animated webp", fixtures.AnimatedWebP(), ErrAnimated},
		{"animated png", pngWithChunkAfterIHDR(fixtures.PNG(), "acTL", []byte{0, 0, 0, 2, 0, 0, 0, 0}), ErrAnimated},
		{"decompression bomb", pngClaiming(20000, 20000), ErrTooLarge},
		{"over the memory budget", pngClaiming(10000, 9900), ErrTooLarge}, // 99 MP, under the pixel cap, but ~556 MiB
		{"undecodable webp", fixtures.WebP(), nil},
		{"not an image", []byte("hello"), nil},
		{"truncated jpeg", fixtures.EncodeJPEG(fixtures.Gradient(64, 64))[:300], nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, err := Make(context.Background(), bytes.NewReader(tc.data), int64(len(tc.data)))
			if err == nil {
				t.Fatalf("made a %d-byte thumbnail, want an error", len(out))
			}
			if tc.want != nil && !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

// The memory limit is only as good as the estimate behind it: it must cover
// what decode + render really allocate, without overstating it by much.
func TestEstimateBytesCoversRealAllocations(t *testing.T) {
	big := fixtures.Gradient(2400, 3600)
	cases := []struct {
		name        string
		data        []byte
		orientation int
	}{
		{"baseline jpeg", fixtures.EncodeJPEG(big), 1},
		{"baseline jpeg, orientation 6", fixtures.EncodeJPEG(big), 6},
		{"progressive jpeg", fixtures.ProgressiveJPEG(), 1},
		{"cmyk jpeg", fixtures.CMYKJPEG(), 1},
		{"rgb-coded jpeg", rgbCoded(t, fixtures.EncodeJPEG(big)), 1},
		{"png", fixtures.EncodePNG(big), 1},
		{"webp", fixtures.DecodableWebP(), 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := bytes.NewReader(tc.data)
			size := int64(len(tc.data))
			cfg, format, err := image.DecodeConfig(r)
			if err != nil {
				t.Fatal(err)
			}
			est := estimateBytes(format, cfg, tc.orientation, r, size)

			// With the GC off, TotalAlloc counts every byte allocated.
			defer debug.SetGCPercent(debug.SetGCPercent(-1))
			var before, after runtime.MemStats
			runtime.ReadMemStats(&before)
			src, _, err := image.Decode(io.NewSectionReader(r, 0, size))
			if err != nil {
				t.Fatal(err)
			}
			render(src, tc.orientation)
			runtime.ReadMemStats(&after)
			got := int64(after.TotalAlloc - before.TotalAlloc)

			t.Logf("%s %dx%d: estimate %d KiB, allocated %d KiB", format, cfg.Width, cfg.Height, est>>10, got>>10)
			if est < got {
				t.Errorf("estimate %d is below the %d bytes allocated", est, got)
			}
			if est > got*5/4+fixedOverhead {
				t.Errorf("estimate %d overstates the %d bytes allocated by more than 25%%", est, got)
			}
		})
	}
}

func TestMakeWithin_UsesTheGivenLimits(t *testing.T) {
	data := fixtures.EncodeJPEG(fixtures.Gradient(1600, 1200))
	for _, tc := range []struct {
		name string
		lim  Limits
		ok   bool
	}{
		{"pixel cap", Limits{MaxPixels: 1_000_000, MaxBytes: 1 << 30}, false},
		{"memory limit", Limits{MaxBytes: 1 << 20}, false},
		{"no pixel cap, enough memory", Limits{MaxBytes: 64 << 20}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := MakeWithin(context.Background(), bytes.NewReader(data), int64(len(data)), tc.lim)
			if tc.ok && err != nil {
				t.Fatal(err)
			}
			if !tc.ok && !errors.Is(err, ErrTooLarge) {
				t.Fatalf("err = %v, want ErrTooLarge", err)
			}
		})
	}
}

func TestMake_WaitsForItsTurnButRespectsContext(t *testing.T) {
	sem <- struct{}{} // another resize is running
	defer func() { <-sem }()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	data := fixtures.JPEG()
	if _, err := Make(ctx, bytes.NewReader(data), int64(len(data))); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestJPEGFrame(t *testing.T) {
	color420 := fixtures.EncodeJPEG(fixtures.Gradient(32, 32)) // Go encodes colour as 4:2:0
	f, ok := jpegFrame(bytes.NewReader(color420), int64(len(color420)))
	if !ok || f.progressive || f.samplesPerPixel != 1.5 {
		t.Errorf("colour: %+v ok=%v, want baseline 1.5 samples/px", f, ok)
	}

	var gray bytes.Buffer
	if err := jpeg.Encode(&gray, image.NewGray(image.Rect(0, 0, 8, 8)), nil); err != nil {
		t.Fatal(err)
	}
	f, ok = jpegFrame(bytes.NewReader(gray.Bytes()), int64(gray.Len()))
	if !ok || f.samplesPerPixel != 1 {
		t.Errorf("gray: %+v ok=%v, want 1 sample/px", f, ok)
	}

	// Progressive: same file with SOF0 relabelled SOF2 (only the header is read).
	prog := bytes.Replace(color420, []byte{0xFF, 0xC0}, []byte{0xFF, 0xC2}, 1)
	if f, ok = jpegFrame(bytes.NewReader(prog), int64(len(prog))); !ok || !f.progressive {
		t.Errorf("progressive: %+v ok=%v", f, ok)
	}
	if f.converted {
		t.Errorf("YCbCr file marked as converted: %+v", f)
	}

	// image/jpeg copies these into a 4-byte-per-pixel image.
	cmyk := fixtures.CMYKJPEG()
	if f, ok = jpegFrame(bytes.NewReader(cmyk), int64(len(cmyk))); !ok || !f.converted || f.samplesPerPixel != 4 {
		t.Errorf("cmyk: %+v ok=%v, want converted, 4 samples/px", f, ok)
	}
	rgb := rgbCoded(t, color420)
	if f, ok = jpegFrame(bytes.NewReader(rgb), int64(len(rgb))); !ok || !f.converted {
		t.Errorf("rgb-coded: %+v ok=%v, want converted", f, ok)
	}
	// A JFIF marker means YCbCr whatever the component IDs say.
	jfif := append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0}, rgb[2:]...)
	if f, ok = jpegFrame(bytes.NewReader(jfif), int64(len(jfif))); !ok || f.converted {
		t.Errorf("rgb ids with JFIF: %+v ok=%v, want not converted", f, ok)
	}
}

// rgbCoded relabels a Go-encoded JPEG's components 1, 2, 3 as 'R', 'G', 'B'
// in its frame and scan headers, which makes image/jpeg treat it as RGB.
func rgbCoded(t *testing.T, b []byte) []byte {
	t.Helper()
	b = bytes.Clone(b)
	sof := bytes.Index(b, []byte{0xFF, 0xC0})
	sos := bytes.Index(b, []byte{0xFF, 0xDA})
	if sof < 0 || sos < 0 || b[sof+9] != 3 || b[sos+4] != 3 {
		t.Fatal("not a 3-component baseline JPEG")
	}
	for i, id := range []byte("RGB") {
		b[sof+10+3*i] = id // SOF: Nf at +9, then {C, HV, Tq}
		b[sos+5+2*i] = id  // SOS: Ns at +4, then {Cs, Td<<4|Ta}
	}
	return b
}

func TestHalveThenCatmullRom_MatchesAreaAverage(t *testing.T) {
	// Fine 1-px stripes are where a sampling filter aliases: the true
	// average at 1/8 scale is flat mid-gray.
	src := image.NewRGBA(image.Rect(0, 0, 1600, 1200))
	for y := range 1200 {
		for x := range 1600 {
			v := uint8(0)
			if x%2 == 0 {
				v = 255
			}
			src.SetRGBA(x, y, color.RGBA{v, v, v, 255})
		}
	}
	dst := image.NewRGBA(image.Rect(0, 0, 200, 150))
	halveThenCatmullRom(dst, src, src.Rect, draw.Src)
	if p := psnr(dst, areaAverage(src, 200, 150)); p < 40 {
		t.Errorf("PSNR vs area average = %.1f dB, want 竕･ 40 (aliasing?)", p)
	}
}

// areaAverage is the reference downscale: every output pixel is the mean of
// the source pixels that fall into it.
func areaAverage(src image.Image, w, h int) *image.RGBA {
	b := src.Bounds()
	sum := make([][4]uint64, w*h)
	cnt := make([]uint64, w*h)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		oy := (y - b.Min.Y) * h / b.Dy()
		for x := b.Min.X; x < b.Max.X; x++ {
			i := oy*w + (x-b.Min.X)*w/b.Dx()
			r, g, bl, a := src.At(x, y).RGBA()
			sum[i][0] += uint64(r)
			sum[i][1] += uint64(g)
			sum[i][2] += uint64(bl)
			sum[i][3] += uint64(a)
			cnt[i]++
		}
	}
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := range sum {
		n := cnt[i] * 257
		out.Pix[4*i], out.Pix[4*i+1], out.Pix[4*i+2], out.Pix[4*i+3] =
			uint8(sum[i][0]/n), uint8(sum[i][1]/n), uint8(sum[i][2]/n), uint8(sum[i][3]/n)
	}
	return out
}

func psnr(a, b *image.RGBA) float64 {
	var se float64
	for i := range a.Pix {
		d := float64(a.Pix[i]) - float64(b.Pix[i])
		se += d * d
	}
	mse := se / float64(len(a.Pix))
	if mse == 0 {
		return 99
	}
	return 10 * math.Log10(255*255/mse)
}

// Times the resize strategies on a real 9.6 MB, 24 MP camera photo and
// reports each one's PSNR against an exact area average. Run with:
//
//	go test ./internal/thumbnail -run '^$' -bench Resize -benchtime 3x -benchmem
func BenchmarkResize(b *testing.B) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "testfiles", "sunflower.jpg"))
	if err != nil {
		b.Skip("testfiles/sunflower.jpg not found")
	}
	b.Run("decode", func(b *testing.B) {
		for b.Loop() {
			if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
				b.Fatal(err)
			}
		}
	})
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		b.Fatal(err)
	}
	tw, th := TargetSize(src.Bounds().Dx(), src.Bounds().Dy())
	ref := areaAverage(src, tw, th)

	direct := func(s draw.Scaler) func(*image.RGBA, image.Image, image.Rectangle, draw.Op) {
		return func(dst *image.RGBA, src image.Image, sb image.Rectangle, op draw.Op) {
			s.Scale(dst, dst.Rect, src, sb, op, nil)
		}
	}
	for _, s := range []struct {
		name string
		fn   func(*image.RGBA, image.Image, image.Rectangle, draw.Op)
	}{
		{"ApproxBiLinear", direct(draw.ApproxBiLinear)},
		{"CatmullRom", direct(draw.CatmullRom)},
		{"HalveThenCatmullRom", halveThenCatmullRom},
	} {
		b.Run(s.name, func(b *testing.B) {
			dst := image.NewRGBA(image.Rect(0, 0, tw, th))
			for b.Loop() {
				s.fn(dst, src, src.Bounds(), draw.Src)
			}
			b.ReportMetric(psnr(dst, ref), "dB")
		})
	}
}
