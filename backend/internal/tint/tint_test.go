package tint_test

import (
	"image"
	"image/color"
	"math"
	"testing"

	"backend/internal/tint"
)

func uniform(c color.Color) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 64, 48))
	for y := range 48 {
		for x := range 64 {
			img.Set(x, y, c)
		}
	}
	return img
}

// Every tint, whatever the photo, is valid and keeps --muted text readable
// (DESIGN-SYSTEM.md §9): black, white, saturated primaries and the dull
// colours photos average to.
func TestTintIsPaleAndKeepsMutedTextReadable(t *testing.T) {
	colors := map[string]color.Color{
		"black":       color.Black,
		"white":       color.White,
		"red":         color.RGBA{255, 0, 0, 255},
		"green":       color.RGBA{0, 255, 0, 255},
		"blue":        color.RGBA{0, 0, 255, 255},
		"yellow":      color.RGBA{255, 230, 0, 255},
		"deep navy":   color.RGBA{10, 20, 60, 255},
		"forest":      color.RGBA{40, 70, 30, 255},
		"sunset":      color.RGBA{200, 110, 60, 255},
		"mid grey":    color.RGBA{128, 128, 128, 255},
		"transparent": color.RGBA{0, 0, 0, 0},
	}
	for name, c := range colors {
		t.Run(name, func(t *testing.T) {
			got := tint.FromImage(uniform(c))
			if !tint.Valid(got) {
				t.Fatalf("tint %q is not #rrggbb", got)
			}
			if cr := tint.MutedContrast(got); cr < tint.MinMutedContrast {
				t.Errorf("tint %s: muted text contrast %.2f < %.1f", got, cr, tint.MinMutedContrast)
			}
		})
	}
}

// A tint keeps the photo's hue: a red photo gets a pinkish page, a blue
// one a bluish page, and grey stays neutral.
func TestTintKeepsHue(t *testing.T) {
	parse := func(hex string) (r, g, b int) {
		t.Helper()
		var v [3]int
		for i := range 3 {
			var n int
			for _, ch := range hex[1+2*i : 3+2*i] {
				n *= 16
				switch {
				case ch >= '0' && ch <= '9':
					n += int(ch - '0')
				default:
					n += int(ch-'a') + 10
				}
			}
			v[i] = n
		}
		return v[0], v[1], v[2]
	}

	r, g, b := parse(tint.FromImage(uniform(color.RGBA{200, 40, 40, 255})))
	if !(r > g && r > b) {
		t.Errorf("red photo tint = %d,%d,%d, want red highest", r, g, b)
	}
	r, g, b = parse(tint.FromImage(uniform(color.RGBA{30, 60, 200, 255})))
	if !(b > r && b > g) {
		t.Errorf("blue photo tint = %d,%d,%d, want blue highest", r, g, b)
	}
	r, g, b = parse(tint.FromImage(uniform(color.RGBA{90, 90, 90, 255})))
	if r != g || g != b {
		t.Errorf("grey photo tint = %d,%d,%d, want neutral", r, g, b)
	}
}

// The average weighs pixels by alpha: a half-transparent red image is
// as red as an opaque one.
func TestTintIgnoresTransparentPixels(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 10, 10))
	for y := range 10 {
		for x := range 10 {
			if x < 5 {
				img.Set(x, y, color.NRGBA{200, 40, 40, 255})
			} // the right half stays fully transparent
		}
	}
	if got, want := tint.FromImage(img), tint.FromImage(uniform(color.RGBA{200, 40, 40, 255})); got != want {
		t.Errorf("tint with transparency = %s, want %s like the opaque part", got, want)
	}
}

// The prototype's default page colour (--tint-default) passes the same
// check, so the frontend's fallback is no worse than a computed tint.
func TestMutedContrastOfDefaultTint(t *testing.T) {
	if cr := tint.MutedContrast("#ece9e2"); cr < tint.MinMutedContrast || math.IsNaN(cr) {
		t.Errorf("--tint-default contrast = %.2f", cr)
	}
	if cr := tint.MutedContrast("not a colour"); cr != 0 {
		t.Errorf("bad input contrast = %v, want 0", cr)
	}
}

func TestValid(t *testing.T) {
	for s, want := range map[string]bool{"#a0b1c2": true, "#A0B1C2": false, "a0b1c2": false, "#abc": false, "": false, "#a0b1c2 ": false} {
		if got := tint.Valid(s); got != want {
			t.Errorf("Valid(%q) = %v, want %v", s, got, want)
		}
	}
}
