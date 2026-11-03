// Package fixtures builds tiny, valid image files in memory for upload tests.
package fixtures

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
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
