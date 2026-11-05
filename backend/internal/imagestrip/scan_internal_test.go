package imagestrip

import (
	"bytes"
	"testing"
)

func TestScanEntropy(t *testing.T) {
	cases := []struct {
		name      string
		data      []byte
		wantPos   int64
		wantFound bool
	}{
		{"stuffed 0xFF00 is data", []byte{1, 0xFF, 0x00, 2, 0xFF, 0xD9}, 4, true},
		{"restart markers are data", []byte{1, 0xFF, 0xD0, 2, 0xFF, 0xD7, 3, 0xFF, 0xC4}, 7, true},
		{"fill bytes before a marker", []byte{1, 0xFF, 0xFF, 0xFF, 0xD9}, 3, true},
		{"next scan header", []byte{1, 2, 0xFF, 0xDA, 0, 8}, 2, true},
		{"runs to end of file", []byte{1, 0xFF, 0x00, 2}, 4, false},
		{"0xFF as the very last byte", []byte{1, 2, 0xFF}, 3, false},
	}
	for _, tc := range cases {
		pos, found, err := scanEntropy(bytes.NewReader(tc.data), int64(len(tc.data)), 0)
		if err != nil || pos != tc.wantPos || found != tc.wantFound {
			t.Errorf("%s: got (%d, %v, %v), want (%d, %v)", tc.name, pos, found, err, tc.wantPos, tc.wantFound)
		}
	}
}

// A marker split across the 64 KiB read window must still be found, and a
// stuffed byte split across it must not be mistaken for one.
func TestScanEntropyAcrossWindows(t *testing.T) {
	const window = 64 << 10
	for _, at := range []int{window - 2, window - 1, window, 2*window - 1} {
		data := bytes.Repeat([]byte{0x11}, at+10)
		data[window-1], data[window] = 0xFF, 0x00 // stuffing straddling the edge
		data[at], data[at+1] = 0xFF, 0xD9
		pos, found, err := scanEntropy(bytes.NewReader(data), int64(len(data)), 0)
		if err != nil || !found || pos != int64(at) {
			t.Errorf("marker at %d: got (%d, %v, %v)", at, pos, found, err)
		}
	}
}
