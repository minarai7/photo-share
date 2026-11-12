// Package thumbnail makes the small JPEG previews shown in the feed and
// profile grids, so they don't download full-size originals.
//
// A thumbnail is at most Width pixels wide (never upscaled), with its height
// capped at MaxHeight for very tall images. The EXIF Orientation is applied to
// the pixels and transparency is flattened onto white. It is a fresh JPEG
// encode, so it carries no metadata at all.
//
// Decoding a photo takes far more memory than the file (a 24 MP image is
// about 96 MB as RGBA, a 43 MP progressive JPEG about 420 MB in all), so Make
// estimates what an image needs before decoding it, refuses it above Limits,
// and runs one decode at a time.
package thumbnail

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png" // registers the PNG decoder for image.Decode
	"io"

	"backend/internal/exifmeta"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // registers the WebP decoder for image.Decode
)

const (
	Width     = 800
	MaxHeight = 1600
	Quality   = 80

	// Suffix replaces the original's extension: 1730_abc12345.png gets
	// 1730_abc12345_w800.jpg. Images are served immutable, so a different
	// size must use a different name; that is why the width is in it.
	Suffix = "_w800.jpg"
)

// Limits bounds what Make agrees to decode.
type Limits struct {
	// MaxPixels guards against decompression bombs: a tiny file can claim
	// a huge canvas. 0 means no cap.
	MaxPixels int64
	// MaxBytes caps the estimated memory of one decode + resize (see
	// estimateBytes). Some estimates, with what was really allocated:
	//
	//	24 MP baseline JPEG 4:4:4 (testfiles/sunflower.jpg)   124 MiB   (123 MiB)
	//	43 MP progressive JPEG 4:2:0 (testfiles/snow.jpg)     415 MiB   (414 MiB)
	//	61 MP baseline JPEG 4:2:0 (Sony A7R V)               ~185 MiB   (not measured)
	//
	// Progressive JPEGs cost ~9.6 MiB per MP, so 512 MiB takes them up to
	// about 53 MP; baseline ones reach the 100 MP pixel cap first.
	MaxBytes int64
}

// ServerLimits fit the backend task: 1 GB of memory with GOMEMLIMIT=800MiB
// (backend/Dockerfile), leaving room for the rest of the server. Lower them
// together with the task size.
var ServerLimits = Limits{MaxPixels: 100_000_000, MaxBytes: 512 << 20}

var (
	// ErrTooLarge: the image would need too much memory to decode.
	ErrTooLarge = errors.New("thumbnail: image too large")
	// ErrAnimated: animated WebP/PNG keep their original in the grid, so the
	// animation still plays.
	ErrAnimated = errors.New("thumbnail: animated image")
)

// sem allows one decode+resize at a time across the whole process.
var sem = make(chan struct{}, 1)

// resize scales src (bounds sb) into all of dst. See halveThenCatmullRom.
var resize = halveThenCatmullRom

// Make returns a JPEG thumbnail of the JPEG, PNG or WebP image in r, which is
// size bytes long, within ServerLimits. It waits for its turn (one at a time)
// unless ctx ends first.
func Make(ctx context.Context, r io.ReaderAt, size int64) ([]byte, error) {
	return MakeWithin(ctx, r, size, ServerLimits)
}

// MakeWithin is Make with other limits, for the backfill (cmd/thumbs), which
// runs on a machine with more memory than the server.
func MakeWithin(ctx context.Context, r io.ReaderAt, size int64, lim Limits) ([]byte, error) {
	cfg, format, err := image.DecodeConfig(io.NewSectionReader(r, 0, size))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: read header: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, fmt.Errorf("thumbnail: empty %dx%d image", cfg.Width, cfg.Height)
	}
	pixels := int64(cfg.Width) * int64(cfg.Height)
	if lim.MaxPixels > 0 && pixels > lim.MaxPixels {
		return nil, fmt.Errorf("%w: %dx%d is over %d pixels", ErrTooLarge, cfg.Width, cfg.Height, lim.MaxPixels)
	}
	orientation := exifmeta.Orientation(r, size)
	if need := estimateBytes(format, cfg, orientation, r, size); need > lim.MaxBytes {
		return nil, fmt.Errorf("%w: %dx%d %s needs about %d MB to decode", ErrTooLarge, cfg.Width, cfg.Height, format, need>>20)
	}
	if animated(format, r, size) {
		return nil, ErrAnimated
	}

	select {
	case sem <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	defer func() { <-sem }()

	src, _, err := image.Decode(io.NewSectionReader(r, 0, size))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: decode %s: %w", format, err)
	}
	img := render(src, orientation)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: Quality}); err != nil {
		return nil, fmt.Errorf("thumbnail: encode: %w", err)
	}
	return buf.Bytes(), nil
}

// TargetSize is the thumbnail size for an image displayed at w×h.
func TargetSize(w, h int) (int, int) {
	tw := min(w, Width)
	th := roundDiv(int64(h)*int64(tw), int64(w))
	if th > MaxHeight {
		th = MaxHeight
		tw = roundDiv(int64(w)*MaxHeight, int64(h))
	}
	return max(tw, 1), max(th, 1)
}

func roundDiv(a, b int64) int { return int((a + b/2) / b) }

// render scales src down and applies the EXIF orientation. The scaling
// happens in the stored orientation and the small result is then rotated,
// which is much cheaper than rotating the full-size image.
func render(src image.Image, orientation int) *image.RGBA {
	b := src.Bounds()
	tw, th := storedTarget(b.Dx(), b.Dy(), orientation)
	dst := image.NewRGBA(image.Rect(0, 0, tw, th))
	op := draw.Src
	if !isOpaque(src) {
		draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
		op = draw.Over
	}
	resize(dst, src, b, op)
	return orient(dst, orientation)
}

// storedTarget is the thumbnail size, before orientation is applied, for an
// image stored as w×h.
func storedTarget(w, h, orientation int) (int, int) {
	swap := orientation >= 5 && orientation <= 8 // 90° turns swap width and height
	if swap {
		w, h = h, w
	}
	tw, th := TargetSize(w, h)
	if swap {
		tw, th = th, tw
	}
	return tw, th
}

// halveThenCatmullRom halves src with ApproxBiLinear while it is still at
// least twice the target size, then does the last step with CatmullRom.
//
// At a 2:1 ratio bilinear sampling lands between pixels, so each halving is
// an exact 2×2 box average. Shrinking a 24 MP photo straight to 800 px is
// worse both ways. Measured on testfiles/sunflower.jpg (24 MP) against an
// exact area average (BenchmarkResize in thumbnail_test.go):
//
//	ApproxBiLinear alone      9 ms     0 MB   37.4 dB  (reads 4 of every ~56 pixels: aliasing)
//	CatmullRom alone        545 ms   103 MB   44.3 dB  (buffer: source height × 800 × 32 B)
//	this                    196 ms    56 MB   44.1 dB
//
// The first halving is the biggest buffer: one byte per source pixel.
func halveThenCatmullRom(dst *image.RGBA, src image.Image, sb image.Rectangle, op draw.Op) {
	tw, th := dst.Rect.Dx(), dst.Rect.Dy()
	for sb.Dx() >= 2*tw && sb.Dy() >= 2*th {
		half := image.NewRGBA(image.Rect(0, 0, (sb.Dx()+1)/2, (sb.Dy()+1)/2))
		draw.ApproxBiLinear.Scale(half, half.Rect, src, sb, draw.Src, nil)
		src, sb = half, half.Rect
	}
	draw.CatmullRom.Scale(dst, dst.Rect, src, sb, op, nil)
}

func isOpaque(m image.Image) bool {
	o, ok := m.(interface{ Opaque() bool })
	return ok && o.Opaque()
}

// orient returns m as it should be displayed for an EXIF Orientation value
// (1 = as stored; 2–8 = the flips and rotations; anything else = as stored).
// m must start at (0, 0).
func orient(m *image.RGBA, o int) *image.RGBA {
	if o < 2 || o > 8 {
		return m
	}
	w, h := m.Rect.Dx(), m.Rect.Dy()
	ow, oh := w, h
	if o >= 5 {
		ow, oh = h, w
	}
	out := image.NewRGBA(image.Rect(0, 0, ow, oh))
	for y := range oh {
		for x := range ow {
			// (sx, sy) is the stored pixel shown at (x, y).
			var sx, sy int
			switch o {
			case 2: // mirrored
				sx, sy = w-1-x, y
			case 3: // rotated 180°
				sx, sy = w-1-x, h-1-y
			case 4: // mirrored vertically
				sx, sy = x, h-1-y
			case 5: // transposed
				sx, sy = y, x
			case 6: // needs 90° clockwise
				sx, sy = y, h-1-x
			case 7: // transversed
				sx, sy = w-1-y, h-1-x
			case 8: // needs 90° counter-clockwise
				sx, sy = w-1-y, x
			}
			si := sy*m.Stride + sx*4
			di := y*out.Stride + x*4
			copy(out.Pix[di:di+4], m.Pix[si:si+4])
		}
	}
	return out
}

// estimateBytes estimates the memory Make allocates for an image: the decode
// plus every buffer of render. It counts them as if all were alive at once,
// which slightly overstates the peak (progressive JPEG coefficients are
// garbage once decoding ends) but stays on the safe side.
func estimateBytes(format string, cfg image.Config, orientation int, r io.ReaderAt, size int64) int64 {
	return decodeBytes(format, cfg, r, size) + renderBytes(cfg.Width, cfg.Height, orientation)
}

// renderBytes is what render allocates for an image stored as w×h. It follows
// the steps of halveThenCatmullRom and orient.
func renderBytes(w, h, orientation int) int64 {
	tw, th := storedTarget(w, h, orientation)
	var n int64
	sw, sh := w, h
	for sw >= 2*tw && sh >= 2*th { // each halving: an RGBA image
		sw, sh = (sw+1)/2, (sh+1)/2
		n += int64(sw) * int64(sh) * 4
	}
	n += int64(tw) * int64(sh) * 32 // CatmullRom: a [4]float64 per target column × source row
	n += int64(tw) * int64(th) * 4  // dst
	if orientation >= 2 && orientation <= 8 {
		n += int64(tw) * int64(th) * 4 // orient's copy
	}
	return n + fixedOverhead
}

// fixedOverhead covers the small allocations that don't grow much with the
// image: decoder tables and buffers, kernel weights, the JPEG output.
const fixedOverhead = 1 << 20

// decodeBytes estimates how much memory decoding the image allocates.
func decodeBytes(format string, cfg image.Config, r io.ReaderAt, size int64) int64 {
	pixels := int64(cfg.Width) * int64(cfg.Height)
	switch format {
	case "jpeg":
		// One byte per sample. Progressive files also keep every DCT
		// coefficient (64 int32 per 8×8 block, 4 bytes per sample) until the end.
		// Both are allocated for whole MCUs (at most 16×16 px). CMYK and RGB
		// files are then copied into a 4-byte-per-pixel image.
		f, ok := jpegFrame(r, size)
		if !ok { // unknown: assume the worst, a progressive CMYK file
			f = frameInfo{progressive: true, samplesPerPixel: 4, converted: true}
		}
		perPixel := f.samplesPerPixel
		if f.progressive {
			perPixel *= 5
		}
		if f.converted {
			perPixel += 4
		}
		padded := int64((cfg.Width+15)&^15) * int64((cfg.Height+15)&^15)
		return int64(float64(padded) * perPixel)
	case "png":
		switch cfg.ColorModel {
		case color.GrayModel:
			return pixels
		case color.Gray16Model:
			return pixels * 2
		case color.RGBA64Model, color.NRGBA64Model:
			return pixels * 8
		}
		if _, ok := cfg.ColorModel.(color.Palette); ok {
			return pixels
		}
		return pixels * 4
	default:
		// WebP: lossless decodes into a uint32 buffer and then NRGBA; lossy
		// needs about 2.5 bytes. The header doesn't say which, so assume lossless.
		return pixels * 8
	}
}

type frameInfo struct {
	progressive     bool
	samplesPerPixel float64
	// converted: image/jpeg copies the decoded planes into a 4-byte-per-pixel
	// image (CMYK for 4 components, RGBA for RGB-coded files).
	converted bool
}

// jpegFrame reads the JPEG headers up to the first scan: whether the file is
// progressive, how many samples per pixel its chroma subsampling gives, and
// whether image/jpeg will convert it (see frameInfo.converted).
func jpegFrame(r io.ReaderAt, size int64) (frameInfo, bool) {
	var (
		f              frameInfo
		haveFrame      bool
		nf             int
		ids            []byte
		jfif           bool
		adobe          bool
		adobeTransform byte
		hdr            = make([]byte, 4)
		off            = int64(2) // after SOI
	)
	for off+4 <= size {
		if _, err := r.ReadAt(hdr, off); err != nil || hdr[0] != 0xFF {
			return frameInfo{}, false
		}
		m := hdr[1]
		switch {
		case m == 0xFF: // fill byte
			off++
			continue
		case m == 0x01 || (m >= 0xD0 && m <= 0xD7): // standalone markers
			off += 2
			continue
		case m == 0xD8 || m == 0xD9 || m == 0xDA: // image data (or the end) starts
			if !haveFrame {
				return frameInfo{}, false
			}
			// The same tests as image/jpeg's decoder (applyBlack, isRGB).
			rgb := !jfif && ((adobe && adobeTransform == 0) ||
				(nf == 3 && ids[0] == 'R' && ids[1] == 'G' && ids[2] == 'B'))
			f.converted = nf == 4 || (nf == 3 && rgb)
			return f, true
		}
		n := int64(binary.BigEndian.Uint16(hdr[2:]))
		if n < 2 || off+2+n > size {
			return frameInfo{}, false
		}
		isSOF := m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC
		if !isSOF && m != 0xE0 && m != 0xEE { // only SOFn, APP0 (JFIF) and APP14 (Adobe) matter
			off += 2 + n
			continue
		}
		seg := make([]byte, n-2)
		if _, err := r.ReadAt(seg, off+4); err != nil {
			return frameInfo{}, false
		}
		off += 2 + n
		switch {
		case m == 0xE0:
			jfif = jfif || bytes.HasPrefix(seg, []byte("JFIF\x00"))
		case m == 0xEE:
			if len(seg) >= 12 && bytes.HasPrefix(seg, []byte("Adobe")) {
				adobe, adobeTransform = true, seg[11]
			}
		case !haveFrame:
			// P(1) Y(2) X(2) Nf(1), then Nf × {C, H<<4|V, Tq}.
			if len(seg) < 6 {
				return frameInfo{}, false
			}
			nf = int(seg[5])
			if nf == 0 || len(seg) < 6+3*nf {
				return frameInfo{}, false
			}
			hmax, vmax, sum := 1, 1, 0
			for i := range nf {
				hv := seg[6+3*i+1]
				hmax, vmax = max(hmax, int(hv>>4)), max(vmax, int(hv&0x0F))
				ids = append(ids, seg[6+3*i])
			}
			for i := range nf {
				hv := seg[6+3*i+1]
				sum += int(hv>>4) * int(hv&0x0F)
			}
			f = frameInfo{
				progressive:     m == 0xC2 || m == 0xC6 || m == 0xCA || m == 0xCE,
				samplesPerPixel: float64(sum) / float64(hmax*vmax),
			}
			haveFrame = true
		}
	}
	return frameInfo{}, false
}

// animated reports an animated WebP (VP8X animation flag) or APNG (an acTL
// chunk before the image data).
func animated(format string, r io.ReaderAt, size int64) bool {
	switch format {
	case "webp":
		b := make([]byte, 21)
		if _, err := r.ReadAt(b, 0); err != nil {
			return false
		}
		return string(b[12:16]) == "VP8X" && b[20]&0x02 != 0
	case "png":
		hdr := make([]byte, 8)
		for off := int64(8); off+8 <= size; {
			if _, err := r.ReadAt(hdr, off); err != nil {
				return false
			}
			switch string(hdr[4:]) {
			case "acTL":
				return true
			case "IDAT":
				return false
			}
			off += 12 + int64(binary.BigEndian.Uint32(hdr[:4]))
		}
	}
	return false
}
