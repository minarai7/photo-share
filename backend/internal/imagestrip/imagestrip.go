// Package imagestrip removes metadata from JPEG, PNG and WebP images without
// re-encoding them, so the pixels are untouched and nothing is lost.
//
// Removed: EXIF (GPS, camera serials, dates, thumbnails...), XMP, IPTC and
// Photoshop blocks, comments, text chunks, and anything appended after the
// image ends (phone "motion photo" videos, extra MPF images, trailers).
//
// Kept: everything needed to display the image the same way, i.e. the image
// data, colour profiles (ICC, sRGB/gamma), transparency and animation. The
// EXIF Orientation is the one metadata value carried over, rewritten as a
// minimal EXIF block containing only that tag, so phone photos stay upright.
package imagestrip

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"io"

	"backend/internal/exifmeta"
)

var (
	// ErrMalformed means the file's structure could not be parsed, so its
	// metadata cannot be removed safely.
	ErrMalformed = errors.New("malformed image")
	// ErrUnsupported means the file is not a JPEG, PNG or WebP.
	ErrUnsupported = errors.New("unsupported image format")
)

// Strip returns the image in r (size bytes long) with its metadata removed.
// The result reads lazily from r; see File.
func Strip(r io.ReaderAt, size int64) (*File, error) {
	head, err := readFull(r, size, 0, min(size, 12))
	if err != nil {
		return nil, err
	}
	orientation := exifmeta.Orientation(r, size)

	b := &builder{}
	switch {
	case len(head) >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF:
		err = stripJPEG(r, size, orientation, b)
	case bytes.HasPrefix(head, pngSignature):
		err = stripPNG(r, size, orientation, b)
	case len(head) == 12 && string(head[0:4]) == "RIFF" && string(head[8:12]) == "WEBP":
		err = stripWebP(r, size, orientation, b)
	default:
		return nil, ErrUnsupported
	}
	if err != nil {
		return nil, err
	}
	return b.file(r), nil
}

// readFull reads exactly n bytes at off. Reading past size is ErrMalformed
// (the file is shorter than its own structure says); anything else that
// stops the read is a real I/O error and is returned as such.
func readFull(r io.ReaderAt, size, off, n int64) ([]byte, error) {
	if off < 0 || n < 0 || off > size-n {
		return nil, ErrMalformed
	}
	buf := make([]byte, n)
	if got, err := r.ReadAt(buf, off); got < len(buf) {
		return nil, fmt.Errorf("imagestrip: read at %d: %w", off, err)
	}
	return buf, nil
}

// orientationTIFF is a complete little-endian EXIF block holding only the
// Orientation tag (IFD0, one SHORT entry, no next IFD): 26 bytes.
func orientationTIFF(o int) []byte {
	return []byte{
		'I', 'I', 42, 0, 8, 0, 0, 0, // header, IFD0 at offset 8
		1, 0, // one entry
		0x12, 0x01, 3, 0, 1, 0, 0, 0, byte(o), 0, 0, 0, // Orientation, SHORT, count 1, value
		0, 0, 0, 0, // no next IFD
	}
}

// ---------- JPEG ----------

func stripJPEG(r io.ReaderAt, size int64, orientation int, b *builder) error {
	b.copy(0, 2) // SOI
	needOrientation := orientation != 1
	sawScan := false
	off := int64(2)

	for {
		if off+2 > size {
			if sawScan {
				return nil // ends without EOI; browsers still show it
			}
			return ErrMalformed
		}
		hdr, err := readFull(r, size, off, 2)
		if err != nil {
			return err
		}
		if hdr[0] != 0xFF {
			return ErrMalformed
		}
		m := hdr[1]
		if m == 0xFF { // fill byte before a marker
			off++
			continue
		}

		// The new EXIF block goes after a leading JFIF APP0, as cameras order them.
		if needOrientation && m != 0xE0 {
			b.literal(jpegOrientationSegment(orientation))
			needOrientation = false
		}

		switch {
		case m == 0xD9: // EOI: whatever follows (videos, MPF images, trailers) is dropped
			b.copy(off, 2)
			return nil
		case m == 0x01 || (m >= 0xD0 && m <= 0xD7): // standalone markers
			b.copy(off, 2)
			off += 2
			continue
		case m == 0xD8 || m == 0x00:
			return ErrMalformed
		}

		if off+4 > size {
			return ErrMalformed
		}
		lb, err := readFull(r, size, off+2, 2)
		if err != nil {
			return err
		}
		segLen := int64(binary.BigEndian.Uint16(lb))
		if segLen < 2 || off+2+segLen > size {
			return ErrMalformed
		}

		keep, err := keepJPEGSegment(r, size, m, off+4, segLen-2)
		if err != nil {
			return err
		}
		if keep {
			b.copy(off, 2+segLen)
		}
		off += 2 + segLen

		if m == 0xDA { // SOS: entropy-coded data follows until the next marker
			sawScan = true
			next, found, err := scanEntropy(r, size, off)
			if err != nil {
				return err
			}
			b.copy(off, next-off)
			if !found {
				return nil // truncated scan; keep what is there
			}
			off = next
		}
	}
}

func jpegOrientationSegment(o int) []byte {
	tiff := orientationTIFF(o)
	seg := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(seg[2:], uint16(2+6+len(tiff)))
	seg = append(seg, "Exif\x00\x00"...)
	return append(seg, tiff...)
}

// keepJPEGSegment decides whether a marker segment survives. Image structure
// (quantisation/Huffman tables, frame and scan headers, restart interval...)
// always does; of the APPn and COM segments, which are where metadata lives,
// only those that affect how the image looks are kept.
func keepJPEGSegment(r io.ReaderAt, size int64, marker byte, payloadOff, payloadLen int64) (bool, error) {
	isApp := marker >= 0xE0 && marker <= 0xEF
	if !isApp && marker != 0xFE {
		return true, nil
	}
	sig, err := readFull(r, size, payloadOff, min(payloadLen, 12))
	if err != nil {
		return false, err
	}
	switch marker {
	case 0xE0: // JFIF / JFXX: pixel density, colour space hints
		return bytes.HasPrefix(sig, []byte("JFIF\x00")) || bytes.HasPrefix(sig, []byte("JFXX\x00")), nil
	case 0xE2: // ICC colour profile (not the MPF index of extra images, also APP2)
		return bytes.HasPrefix(sig, []byte("ICC_PROFILE\x00")), nil
	case 0xEE: // Adobe: colour transform needed to decode CMYK/YCCK correctly
		return bytes.HasPrefix(sig, []byte("Adobe")), nil
	}
	return false, nil // APP1 (EXIF, XMP), APP13 (IPTC), other APPn, COM
}

// scanEntropy finds the next marker after entropy-coded data starting at
// start. In that data 0xFF is followed by 0x00 (byte stuffing), a restart
// marker (D0窶泥7) or another 0xFF (fill); anything else begins a marker. It
// returns size, false when the data runs to the end of the file.
func scanEntropy(r io.ReaderAt, size, start int64) (int64, bool, error) {
	buf := make([]byte, 64<<10)
	pos := start
	for pos < size {
		n := int(min(int64(len(buf)), size-pos))
		if got, err := r.ReadAt(buf[:n], pos); got < n {
			return 0, false, fmt.Errorf("imagestrip: read at %d: %w", pos, err)
		}
		i := 0
		for i < n {
			j := bytes.IndexByte(buf[i:n], 0xFF)
			if j < 0 {
				i = n
				break
			}
			k := i + j
			if k+1 == n { // 0xFF is the last byte of this window
				if pos+int64(n) == size {
					return size, false, nil
				}
				i = k // re-read from it with the next window (k > 0 here)
				break
			}
			switch nx := buf[k+1]; {
			case nx == 0x00 || (nx >= 0xD0 && nx <= 0xD7):
				i = k + 2
			case nx == 0xFF:
				i = k + 1
			default:
				return pos + int64(k), true, nil
			}
		}
		pos += int64(i)
	}
	return size, false, nil
}

// ---------- PNG ----------

var pngSignature = []byte("\x89PNG\r\n\x1a\n")

// Ancillary chunks that affect rendering. Critical chunks (upper-case first
// letter: IHDR, PLTE, IDAT, IEND) are always kept. Everything else, notably
// eXIf, tEXt, zTXt, iTXt (XMP lives there) and tIME, is dropped.
var pngKeep = map[string]bool{
	"tRNS": true, "cHRM": true, "gAMA": true, "iCCP": true, "sBIT": true,
	"sRGB": true, "cICP": true, "mDCV": true, "cLLI": true, "bKGD": true,
	"hIST": true, "pHYs": true, "sPLT": true,
	"acTL": true, "fcTL": true, "fdAT": true, // APNG animation
}

func stripPNG(r io.ReaderAt, size int64, orientation int, b *builder) error {
	b.copy(0, int64(len(pngSignature)))
	off := int64(len(pngSignature))
	first, sawData := true, false

	for {
		if off+12 > size {
			if sawData {
				return nil // ends without IEND; browsers still show it
			}
			return ErrMalformed
		}
		hdr, err := readFull(r, size, off, 8)
		if err != nil {
			return err
		}
		length := int64(binary.BigEndian.Uint32(hdr[:4]))
		typ := string(hdr[4:8])
		if !isChunkType(hdr[4:8]) || (first && typ != "IHDR") {
			return ErrMalformed
		}
		end := off + 12 + length
		if end > size {
			if sawData {
				return nil // a truncated trailing chunk is dropped
			}
			return ErrMalformed
		}

		if critical := hdr[4]&0x20 == 0; critical || pngKeep[typ] {
			b.copy(off, end-off)
		}
		if first {
			first = false
			if orientation != 1 { // eXIf must come before the image data
				b.literal(pngChunk("eXIf", orientationTIFF(orientation)))
			}
		}
		if typ == "IDAT" {
			sawData = true
		}
		if typ == "IEND" {
			return nil // anything after it is dropped
		}
		off = end
	}
}

func isChunkType(t []byte) bool {
	for _, c := range t {
		if (c < 'A' || c > 'Z') && (c < 'a' || c > 'z') {
			return false
		}
	}
	return true
}

func pngChunk(typ string, data []byte) []byte {
	c := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	c = append(c, typ...)
	c = append(c, data...)
	return binary.BigEndian.AppendUint32(c, crc32.ChecksumIEEE(c[4:]))
}

// ---------- WebP ----------

// Chunks that make up the image. EXIF, "XMP " and unknown chunks are dropped.
var webpKeep = map[string]bool{
	"VP8 ": true, "VP8L": true, "VP8X": true, "ALPH": true,
	"ICCP": true, "ANIM": true, "ANMF": true,
}

const (
	vp8xFlagXMP  = 0x04
	vp8xFlagEXIF = 0x08
)

func stripWebP(r io.ReaderAt, size int64, orientation int, b *builder) error {
	head, err := readFull(r, size, 0, 12)
	if err != nil {
		return err
	}
	end := min(8+int64(binary.LittleEndian.Uint32(head[4:8])), size) // bytes past the RIFF are dropped

	riff := append([]byte{}, head...) // size patched below
	b.literal(riff)

	var vp8x []byte
	sawImage := false
	off := int64(12)
	for off+8 <= end {
		hdr, err := readFull(r, size, off, 8)
		if err != nil {
			return err
		}
		fourcc := string(hdr[:4])
		n := int64(binary.LittleEndian.Uint32(hdr[4:]))
		if off+8+n > end {
			return ErrMalformed
		}
		chunkLen := min(8+n+n&1, end-off) // chunks are padded to an even size

		switch {
		case fourcc == "VP8X":
			if n < 10 || vp8x != nil {
				return ErrMalformed
			}
			if vp8x, err = readFull(r, size, off, 18); err != nil {
				return err
			}
			b.literal(vp8x) // flags patched below
			b.copy(off+18, chunkLen-18)
		case webpKeep[fourcc]:
			b.copy(off, chunkLen)
		}
		if fourcc == "VP8 " || fourcc == "VP8L" || fourcc == "ANMF" {
			sawImage = true
		}
		off += chunkLen
	}
	if !sawImage {
		return ErrMalformed
	}

	if vp8x != nil {
		flags := vp8x[8] &^ (vp8xFlagXMP | vp8xFlagEXIF)
		// EXIF needs the extended (VP8X) format; a simple WebP has none to keep.
		if orientation != 1 {
			flags |= vp8xFlagEXIF
			tiff := orientationTIFF(orientation)
			chunk := append([]byte("EXIF"), binary.LittleEndian.AppendUint32(nil, uint32(len(tiff)))...)
			b.literal(append(chunk, tiff...)) // 26 bytes: no padding needed
		}
		vp8x[8] = flags
	}
	binary.LittleEndian.PutUint32(riff[4:8], uint32(b.size-8))
	return nil
}
