// Package tint computes a post's page colour: a pale version of its cover's
// average colour, which the frontend uses as the page background behind the
// work (DESIGN-SYSTEM.md §4, "Colour comes from the work").
//
// The colour keeps the photo's hue, caps its saturation and sets a high
// lightness, the range of the prototype's hand-picked tints (lightness about
// 0.88–0.91, saturation up to 0.45). It is then lifted toward white until
// the interface's secondary text (--muted: black at 55%) keeps a WCAG
// contrast of at least MinMutedContrast on it.
package tint

import (
	"fmt"
	"image"
	"math"
	"regexp"
)

const (
	// Lightness and MaxSaturation are the HSL targets of a tint.
	Lightness     = 0.9
	MaxSaturation = 0.45
	// SaturationBoost makes up for averaging, which greys a photo's colour.
	SaturationBoost = 1.3

	// MutedAlpha is --muted's black alpha in frontend/src/design/tokens.css.
	// Change both together.
	MutedAlpha = 0.55
	// MinMutedContrast is the WCAG AA minimum for normal text.
	MinMutedContrast = 4.5
)

// valid is the stored form: lowercase #rrggbb (also the DB check constraint).
var valid = regexp.MustCompile(`^#[0-9a-f]{6}$`)

// Valid reports whether s is a tint in its stored form.
func Valid(s string) bool { return valid.MatchString(s) }

// FromImage returns the tint of img as "#rrggbb". It samples at most about
// 40 000 pixels, so it is cheap even for a full-size photo.
func FromImage(img image.Image) string {
	r, g, b := average(img)
	return FromColor(r, g, b)
}

// FromColor turns an average colour (sRGB, 0–1 per channel) into a tint.
func FromColor(r, g, b float64) string {
	h, s, _ := rgbToHSL(r, g, b)
	s = math.Min(s*SaturationBoost, MaxSaturation)
	for l := Lightness; ; l += 0.005 {
		l = math.Min(l, 1)
		tr, tg, tb := hslToRGB(h, s, l)
		hex := toHex(tr, tg, tb)
		// Check the colour as stored (8 bits per channel), not the float.
		if l >= 1 || MutedContrast(hex) >= MinMutedContrast {
			return hex
		}
	}
}

// MutedContrast is the WCAG contrast ratio of --muted text (black at
// MutedAlpha) on the colour hex ("#rrggbb").
func MutedContrast(hex string) float64 {
	var ri, gi, bi int
	if _, err := fmt.Sscanf(hex, "#%02x%02x%02x", &ri, &gi, &bi); err != nil {
		return 0
	}
	r, g, b := float64(ri)/255, float64(gi)/255, float64(bi)/255
	keep := 1 - MutedAlpha // black at MutedAlpha over the colour, composited in sRGB like browsers do
	bg := luminance(r, g, b)
	fg := luminance(r*keep, g*keep, b*keep)
	return (bg + 0.05) / (fg + 0.05)
}

// average is the mean sRGB colour of img over a grid of samples.
func average(img image.Image) (r, g, b float64) {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w <= 0 || h <= 0 {
		return 0.5, 0.5, 0.5
	}
	const samplesPerSide = 200
	stepX, stepY := max(1, w/samplesPerSide), max(1, h/samplesPerSide)
	var sr, sg, sb, n float64
	for y := bounds.Min.Y; y < bounds.Max.Y; y += stepY {
		for x := bounds.Min.X; x < bounds.Max.X; x += stepX {
			cr, cg, cb, ca := img.At(x, y).RGBA()
			if ca == 0 {
				continue
			}
			// RGBA() is alpha-premultiplied: summing it and dividing by the
			// summed alpha gives the alpha-weighted mean, so transparent parts
			// don't darken the average.
			sr += float64(cr) / 0xffff
			sg += float64(cg) / 0xffff
			sb += float64(cb) / 0xffff
			n += float64(ca) / 0xffff
		}
	}
	if n == 0 {
		return 0.5, 0.5, 0.5
	}
	return sr / n, sg / n, sb / n
}

func luminance(r, g, b float64) float64 {
	return 0.2126*linear(r) + 0.7152*linear(g) + 0.0722*linear(b)
}

func linear(c float64) float64 {
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

func toHex(r, g, b float64) string {
	return fmt.Sprintf("#%02x%02x%02x", to8(r), to8(g), to8(b))
}

func to8(c float64) int { return int(math.Round(math.Max(0, math.Min(1, c)) * 255)) }

func rgbToHSL(r, g, b float64) (h, s, l float64) {
	hi, lo := math.Max(r, math.Max(g, b)), math.Min(r, math.Min(g, b))
	l = (hi + lo) / 2
	d := hi - lo
	if d == 0 {
		return 0, 0, l
	}
	s = d / (1 - math.Abs(2*l-1))
	switch hi {
	case r:
		h = math.Mod((g-b)/d, 6)
	case g:
		h = (b-r)/d + 2
	default:
		h = (r-g)/d + 4
	}
	h *= 60
	if h < 0 {
		h += 360
	}
	return h, s, l
}

func hslToRGB(h, s, l float64) (r, g, b float64) {
	c := (1 - math.Abs(2*l-1)) * s
	x := c * (1 - math.Abs(math.Mod(h/60, 2)-1))
	m := l - c/2
	switch {
	case h < 60:
		r, g, b = c, x, 0
	case h < 120:
		r, g, b = x, c, 0
	case h < 180:
		r, g, b = 0, c, x
	case h < 240:
		r, g, b = 0, x, c
	case h < 300:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}
	return r + m, g + m, b + m
}
