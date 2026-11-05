// Package exifmeta reads the camera and lens names from a photo's EXIF data.
//
// It understands the EXIF containers of the formats we accept for upload:
// JPEG (APP1 segment), PNG (eXIf chunk) and WebP (EXIF chunk). Only the few
// ASCII tags we need are decoded. The input is untrusted, so every offset is
// bounds-checked and anything unexpected just yields an empty result: missing
// metadata must never make an upload fail.
package exifmeta

import (
	"bytes"
	"encoding/binary"
	"io"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Gear is the camera and lens recorded in a photo. Fields are empty when unknown.
type Gear struct {
	CameraBody string
	Lens       string
}

// MaxFieldRunes caps the length of each returned value.
const MaxFieldRunes = 100

const (
	tagMake      = 0x010F
	tagModel     = 0x0110
	tagExifIFD   = 0x8769
	tagLensModel = 0xA434

	typeASCII = 2
	typeLong  = 4
	typeIFD   = 13

	// JPEG APP1 segments are at most 64 KiB; PNG/WebP chunks have no such
	// limit, so cap what we are willing to read into memory.
	maxEXIFBytes = 1 << 20
)

var exifHeader = []byte("Exif\x00\x00")

// Read extracts the camera body and lens from the image in r (size bytes long).
// It reads only the metadata, not the whole file, and never returns an error:
// unknown formats, absent EXIF and malformed data all give an empty Gear.
func Read(r io.ReaderAt, size int64) (g Gear) {
	// Belt and braces for untrusted input: a parser bug must not fail the upload.
	defer func() {
		if recover() != nil {
			g = Gear{}
		}
	}()
	return extract(r, size)
}

// extract is Read without the panic guard, so fuzzing can see real panics.
func extract(r io.ReaderAt, size int64) Gear {
	tiff := findEXIF(r, size)
	if tiff == nil {
		return Gear{}
	}
	tags := parseTIFF(tiff)
	return Gear{
		CameraBody: cameraBody(tags.ascii[tagMake], tags.ascii[tagModel]),
		Lens:       clean(tags.ascii[tagLensModel]),
	}
}

// findEXIF returns the raw TIFF-structured EXIF block, or nil.
func findEXIF(r io.ReaderAt, size int64) []byte {
	head := readAt(r, size, 0, 12)
	if head == nil {
		return nil
	}
	var b []byte
	switch {
	case head[0] == 0xFF && head[1] == 0xD8:
		b = findJPEG(r, size)
	case bytes.HasPrefix(head, []byte("\x89PNG\r\n\x1a\n")):
		b = findPNG(r, size)
	case string(head[0:4]) == "RIFF" && string(head[8:12]) == "WEBP":
		b = findWebP(r, size)
	}
	// The JPEG container requires this prefix; some PNG/WebP writers add it too.
	return bytes.TrimPrefix(b, exifHeader)
}

func findJPEG(r io.ReaderAt, size int64) []byte {
	off := int64(2) // after SOI
	for off+4 <= size {
		hdr := readAt(r, size, off, 4)
		if hdr == nil || hdr[0] != 0xFF {
			return nil
		}
		marker := hdr[1]
		switch {
		case marker == 0xFF: // fill byte before a marker
			off++
			continue
		case marker == 0x01 || marker == 0xD8 || (marker >= 0xD0 && marker <= 0xD7): // no payload
			off += 2
			continue
		case marker == 0xDA || marker == 0xD9: // start of scan / end of image: metadata is over
			return nil
		}
		segLen := int64(binary.BigEndian.Uint16(hdr[2:]))
		if segLen < 2 {
			return nil
		}
		if marker == 0xE1 { // APP1: EXIF, or XMP (which we skip)
			if data := readAt(r, size, off+4, segLen-2); bytes.HasPrefix(data, exifHeader) {
				return data
			}
		}
		off += 2 + segLen
	}
	return nil
}

func findPNG(r io.ReaderAt, size int64) []byte {
	off := int64(8) // after the signature
	for off+8 <= size {
		hdr := readAt(r, size, off, 8)
		if hdr == nil {
			return nil
		}
		length := int64(binary.BigEndian.Uint32(hdr[:4]))
		switch string(hdr[4:8]) {
		case "eXIf":
			if length > maxEXIFBytes {
				return nil
			}
			return readAt(r, size, off+8, length)
		case "IEND":
			return nil
		}
		off += 12 + length // length + type + data + CRC
	}
	return nil
}

func findWebP(r io.ReaderAt, size int64) []byte {
	off := int64(12) // after "RIFF" <size> "WEBP"
	for off+8 <= size {
		hdr := readAt(r, size, off, 8)
		if hdr == nil {
			return nil
		}
		length := int64(binary.LittleEndian.Uint32(hdr[4:]))
		if string(hdr[:4]) == "EXIF" {
			if length > maxEXIFBytes {
				return nil
			}
			return readAt(r, size, off+8, length)
		}
		off += 8 + length + length&1 // chunks are padded to an even size
	}
	return nil
}

// readAt reads exactly n bytes at off, or returns nil.
func readAt(r io.ReaderAt, size, off, n int64) []byte {
	if off < 0 || n < 0 || n > maxEXIFBytes || off > size-n {
		return nil
	}
	buf := make([]byte, n)
	// io.EOF alongside a full read is fine; only a short read matters.
	if got, _ := r.ReadAt(buf, off); got != len(buf) {
		return nil
	}
	return buf
}

type tiffTags struct {
	ascii map[uint16]string
}

// parseTIFF collects the tags we care about from IFD0 and the Exif sub-IFD.
func parseTIFF(b []byte) tiffTags {
	tags := tiffTags{ascii: map[uint16]string{}}
	if len(b) < 8 {
		return tags
	}
	var bo binary.ByteOrder
	switch string(b[:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return tags
	}
	if bo.Uint16(b[2:4]) != 42 {
		return tags
	}
	readIFD(b, bo, int64(bo.Uint32(b[4:8])), &tags, true)
	return tags
}

// readIFD reads one IFD; isIFD0 is false for the Exif sub-IFD.
func readIFD(b []byte, bo binary.ByteOrder, off int64, tags *tiffTags, isIFD0 bool) {
	if off < 0 || off+2 > int64(len(b)) {
		return
	}
	n := int64(bo.Uint16(b[off:]))
	for i := range n {
		e := off + 2 + 12*i
		if e+12 > int64(len(b)) {
			return
		}
		tag := bo.Uint16(b[e:])
		typ := bo.Uint16(b[e+2:])
		count := int64(bo.Uint32(b[e+4:]))
		value := b[e+8 : e+12]

		switch tag {
		case tagExifIFD:
			// Only one level deep, so a self-referencing pointer cannot loop.
			if isIFD0 && count == 1 && (typ == typeLong || typ == typeIFD) {
				readIFD(b, bo, int64(bo.Uint32(value)), tags, false)
			}
		case tagMake, tagModel, tagLensModel:
			if typ != typeASCII {
				continue
			}
			if _, seen := tags.ascii[tag]; seen {
				continue
			}
			if count <= 4 {
				tags.ascii[tag] = string(value[:count])
				continue
			}
			start := int64(bo.Uint32(value))
			if start+count <= int64(len(b)) {
				tags.ascii[tag] = string(b[start : start+count])
			}
		}
	}
}

// cameraBody joins make and model the way people write it: "SONY ILCE-7C",
// "Canon EOS R5" (not "Canon Canon EOS R5"), "NIKON Z 6" (not "NIKON
// CORPORATION NIKON Z 6"). A make without a model says too little to use.
func cameraBody(mk, model string) string {
	model = clean(model)
	if model == "" {
		return ""
	}
	brand := ""
	if fields := strings.Fields(clean(mk)); len(fields) > 0 {
		brand = strings.TrimRight(fields[0], ",.")
	}
	if brand == "" || strings.HasPrefix(strings.ToLower(model), strings.ToLower(brand)) {
		return model
	}
	return truncate(brand + " " + model)
}

// clean turns a raw EXIF ASCII value into display text. Values without any
// letter or digit are placeholders (Sony writes "----" for a manual lens) and
// become empty.
func clean(s string) string {
	if i := strings.IndexByte(s, 0); i >= 0 {
		s = s[:i]
	}
	s = strings.ToValidUTF8(s, "")
	s = strings.Join(strings.FieldsFunc(s, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r)
	}), " ")
	if !strings.ContainsFunc(s, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }) {
		return ""
	}
	return truncate(s)
}

func truncate(s string) string {
	if utf8.RuneCountInString(s) <= MaxFieldRunes {
		return s
	}
	return strings.TrimSpace(string([]rune(s)[:MaxFieldRunes]))
}
