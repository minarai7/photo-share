package imagestrip

import (
	"errors"
	"io"
	"sort"
)

// piece is either a byte range of the source image or a literal we generated.
type piece struct {
	off int64  // source offset (ranges only)
	n   int64  // length
	lit []byte // non-nil for literals
}

// builder assembles the output, merging adjacent source ranges.
type builder struct {
	pieces []piece
	size   int64
}

func (b *builder) copy(off, n int64) {
	if n <= 0 {
		return
	}
	if k := len(b.pieces) - 1; k >= 0 && b.pieces[k].lit == nil && b.pieces[k].off+b.pieces[k].n == off {
		b.pieces[k].n += n
	} else {
		b.pieces = append(b.pieces, piece{off: off, n: n})
	}
	b.size += n
}

// literal appends p. The slice is kept, not copied, so a caller may still
// patch it (e.g. a size field) before the File is read.
func (b *builder) literal(p []byte) {
	if len(p) == 0 {
		return
	}
	b.pieces = append(b.pieces, piece{n: int64(len(p)), lit: p})
	b.size += int64(len(p))
}

func (b *builder) file(src io.ReaderAt) *File {
	starts := make([]int64, len(b.pieces))
	var at int64
	for i, p := range b.pieces {
		starts[i] = at
		at += p.n
	}
	return &File{src: src, pieces: b.pieces, starts: starts, size: b.size}
}

// File is the stripped image. It reads lazily from the source image, so large
// uploads are never copied into memory; the source must stay open until the
// File has been consumed. It satisfies multipart.File (Read, ReadAt, Seek,
// Close), which is what storage.Storage.Save takes.
type File struct {
	src    io.ReaderAt
	pieces []piece
	starts []int64 // output offset of each piece
	size   int64
	pos    int64
}

// Size is the length of the stripped image in bytes.
func (f *File) Size() int64 { return f.size }

func (f *File) ReadAt(p []byte, off int64) (int, error) {
	if off < 0 {
		return 0, errors.New("imagestrip: negative offset")
	}
	if off >= f.size {
		return 0, io.EOF
	}
	i := sort.Search(len(f.starts), func(i int) bool { return f.starts[i] > off }) - 1
	n := 0
	for n < len(p) && i < len(f.pieces) {
		pc := f.pieces[i]
		within := off + int64(n) - f.starts[i]
		want := int(min(int64(len(p)-n), pc.n-within))
		if pc.lit != nil {
			copy(p[n:n+want], pc.lit[within:])
		} else if got, err := f.src.ReadAt(p[n:n+want], pc.off+within); got < want {
			if err == nil || err == io.EOF {
				err = io.ErrUnexpectedEOF // the source shrank under us
			}
			return n + got, err
		}
		n += want
		i++
	}
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func (f *File) Read(p []byte) (int, error) {
	n, err := f.ReadAt(p, f.pos)
	f.pos += int64(n)
	if err == io.EOF && n > 0 {
		err = nil
	}
	return n, err
}

func (f *File) Seek(offset int64, whence int) (int64, error) {
	var abs int64
	switch whence {
	case io.SeekStart:
		abs = offset
	case io.SeekCurrent:
		abs = f.pos + offset
	case io.SeekEnd:
		abs = f.size + offset
	default:
		return 0, errors.New("imagestrip: invalid whence")
	}
	if abs < 0 {
		return 0, errors.New("imagestrip: negative position")
	}
	f.pos = abs
	return abs, nil
}

// Close is a no-op: the source belongs to the caller.
func (f *File) Close() error { return nil }
