// Package fixtures builds tiny, valid image files in memory for upload tests.
package fixtures

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"sort"
)

func sample() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for x := 0; x < 8; x++ {
		for y := 0; y < 8; y++ {
			img.Set(x, y, color.RGBA{uint8(x * 30), uint8(y * 30), 128, 255})
		}
	}
	return img
}

func JPEG() []byte {
	var b bytes.Buffer
	if err := jpeg.Encode(&b, sample(), nil); err != nil {
		panic(err)
	}
	return b.Bytes()
}

func PNG() []byte {
	var b bytes.Buffer
	if err := png.Encode(&b, sample()); err != nil {
		panic(err)
	}
	return b.Bytes()
}

func GIF() []byte {
	var b bytes.Buffer
	if err := gif.Encode(&b, sample(), nil); err != nil {
		panic(err)
	}
	return b.Bytes()
}

// WebP returns just enough of a RIFF/WEBP header for http.DetectContentType.
func WebP() []byte {
	b := []byte("RIFF\x24\x00\x00\x00WEBPVP8 ")
	return append(b, make([]byte, 32)...)
}

// EXIF tag numbers used by the fixtures.
const (
	TagMake        = 0x010F
	TagModel       = 0x0110
	TagOrientation = 0x0112
	TagLensModel   = 0xA434
)

// TIFF builds a TIFF-structured EXIF block (what follows "Exif\0\0") holding
// the given tags: ifd0 goes in IFD0, exifIFD in the Exif sub-IFD (linked from
// IFD0 when non-empty). A string value is written as ASCII (NUL-terminated, as
// EXIF requires, so short ones are inline and longer ones in the data area),
// a uint16 as a single SHORT.
func TIFF(order binary.ByteOrder, ifd0, exifIFD map[uint16]any) []byte {
	type entry struct {
		tag   uint16
		typ   uint16
		count uint32
		value []byte // encoded payload, or nil for the sub-IFD pointer
	}
	toEntries := func(m map[uint16]any) []entry {
		var es []entry
		for tag, v := range m {
			switch v := v.(type) {
			case string:
				es = append(es, entry{tag: tag, typ: 2, count: uint32(len(v) + 1), value: append([]byte(v), 0)})
			case uint16:
				b := make([]byte, 2)
				order.PutUint16(b, v)
				es = append(es, entry{tag: tag, typ: 3, count: 1, value: b})
			default:
				panic(fmt.Sprintf("fixtures.TIFF: unsupported value %T for tag %#x", v, tag))
			}
		}
		sort.Slice(es, func(i, j int) bool { return es[i].tag < es[j].tag })
		return es
	}
	e0, e1 := toEntries(ifd0), toEntries(exifIFD)
	if len(e1) > 0 {
		e0 = append(e0, entry{tag: 0x8769, typ: 4, count: 1})
	}
	ifdSize := func(n int) int { return 2 + 12*n + 4 }
	ifd0Off := 8
	exifOff := ifd0Off + ifdSize(len(e0))
	dataOff := exifOff
	if len(e1) > 0 {
		dataOff += ifdSize(len(e1))
	}

	var out, data bytes.Buffer
	u16 := func(v uint16) { _ = binary.Write(&out, order, v) }
	u32 := func(v uint32) { _ = binary.Write(&out, order, v) }
	writeIFD := func(es []entry) {
		u16(uint16(len(es)))
		for _, e := range es {
			u16(e.tag)
			u16(e.typ)
			u32(e.count)
			switch {
			case e.value == nil:
				u32(uint32(exifOff))
			case len(e.value) <= 4:
				out.Write(append(e.value, make([]byte, 4-len(e.value))...))
			default:
				u32(uint32(dataOff + data.Len()))
				data.Write(e.value)
			}
		}
		u32(0) // no next IFD
	}

	if order == binary.LittleEndian {
		out.WriteString("II")
	} else {
		out.WriteString("MM")
	}
	u16(42)
	u32(uint32(ifd0Off))
	writeIFD(e0)
	if len(e1) > 0 {
		writeIFD(e1)
	}
	out.Write(data.Bytes())
	return out.Bytes()
}

// CameraTIFF is TIFF with the usual layout: Make/Model in IFD0, LensModel in
// the Exif sub-IFD. Empty arguments are left out.
func CameraTIFF(mk, model, lens string) []byte {
	ifd0, exif := map[uint16]any{}, map[uint16]any{}
	if mk != "" {
		ifd0[TagMake] = mk
	}
	if model != "" {
		ifd0[TagModel] = model
	}
	if lens != "" {
		exif[TagLensModel] = lens
	}
	return TIFF(binary.LittleEndian, ifd0, exif)
}

// JPEGWithEXIF returns JPEG() with an APP1 EXIF segment holding tiff,
// placed after an APP0 segment as cameras do.
func JPEGWithEXIF(tiff []byte) []byte {
	img := JPEG()
	app0 := []byte("\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
	payload := append([]byte("Exif\x00\x00"), tiff...)
	app1 := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(app1[2:], uint16(len(payload)+2))
	app1 = append(app1, payload...)

	out := append([]byte{}, img[:2]...) // SOI
	out = append(out, app0...)
	out = append(out, app1...)
	return append(out, img[2:]...)
}

// PNGWithEXIF returns PNG() with an eXIf chunk right after IHDR.
func PNGWithEXIF(tiff []byte) []byte {
	img := PNG()
	const afterIHDR = 8 + 4 + 4 + 13 + 4
	chunk := make([]byte, 8, 12+len(tiff))
	binary.BigEndian.PutUint32(chunk, uint32(len(tiff)))
	copy(chunk[4:], "eXIf")
	chunk = append(chunk, tiff...)
	chunk = binary.BigEndian.AppendUint32(chunk, crc32.ChecksumIEEE(chunk[4:]))

	out := append([]byte{}, img[:afterIHDR]...)
	out = append(out, chunk...)
	return append(out, img[afterIHDR:]...)
}

// WebPWithEXIF returns a RIFF/WEBP file (VP8X + empty VP8 + EXIF chunks)
// that http.DetectContentType recognises.
func WebPWithEXIF(tiff []byte) []byte {
	var body bytes.Buffer
	body.WriteString("WEBP")
	writeChunk := func(fourcc string, data []byte) {
		body.WriteString(fourcc)
		_ = binary.Write(&body, binary.LittleEndian, uint32(len(data)))
		body.Write(data)
		if len(data)%2 == 1 {
			body.WriteByte(0)
		}
	}
	writeChunk("VP8X", []byte{0x08, 0, 0, 0, 7, 0, 0, 7, 0, 0}) // EXIF flag, 8x8 canvas
	writeChunk("VP8 ", nil)
	writeChunk("EXIF", tiff)

	out := []byte("RIFF")
	out = binary.LittleEndian.AppendUint32(out, uint32(body.Len()))
	return append(out, body.Bytes()...)
}
