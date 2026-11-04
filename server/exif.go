package main

import (
	"encoding/binary"
	"image"
	"image/draw"
	"io"
)

// Phones save photos sideways and write how to turn them in the EXIF "Orientation" tag. Browsers
// apply it when they show the original, but Go's decoders do not, so previews made on the server
// came out rotated (a portrait phone photo turned 90° counter-clockwise) and the reported width
// and height were swapped. These helpers read the tag and turn decoded images upright.

// exifOrientation returns the EXIF orientation (1–8) of a JPEG, or 1 when there is none.
func exifOrientation(r io.ReadSeeker) int {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 1
	}
	var soi [2]byte
	if _, err := io.ReadFull(r, soi[:]); err != nil || soi[0] != 0xFF || soi[1] != 0xD8 {
		return 1
	}
	for i := 0; i < 64; i++ { // the APP1 block comes first in practice; never scan far
		var hdr [4]byte
		if _, err := io.ReadFull(r, hdr[:]); err != nil || hdr[0] != 0xFF {
			return 1
		}
		marker := hdr[1]
		size := int(binary.BigEndian.Uint16(hdr[2:])) - 2
		if marker == 0xDA || marker == 0xD9 || size < 0 { // start of scan: no EXIF before the image
			return 1
		}
		if marker != 0xE1 || size < 14 || size > 1<<16 {
			if _, err := r.Seek(int64(size), io.SeekCurrent); err != nil {
				return 1
			}
			continue
		}
		seg := make([]byte, size)
		if _, err := io.ReadFull(r, seg); err != nil {
			return 1
		}
		if string(seg[:6]) != "Exif\x00\x00" {
			continue
		}
		return tiffOrientation(seg[6:])
	}
	return 1
}

func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var bo binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return 1
	}
	ifd := int(bo.Uint32(t[4:8]))
	if ifd < 8 || ifd+2 > len(t) {
		return 1
	}
	n := int(bo.Uint16(t[ifd:]))
	for i := 0; i < n; i++ {
		e := ifd + 2 + i*12
		if e+12 > len(t) {
			return 1
		}
		if bo.Uint16(t[e:]) == 0x0112 {
			if o := int(bo.Uint16(t[e+8:])); o >= 1 && o <= 8 {
				return o
			}
			return 1
		}
	}
	return 1
}

// swapsSides reports whether an orientation turns the image by 90° (width and height trade places).
func swapsSides(o int) bool { return o >= 5 && o <= 8 }

// orient returns src turned upright for the given EXIF orientation.
func orient(src image.Image, o int) image.Image {
	if o <= 1 || o > 8 {
		return src
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	rgba, ok := src.(*image.RGBA)
	if !ok {
		rgba = image.NewRGBA(image.Rect(0, 0, w, h))
		draw.Draw(rgba, rgba.Bounds(), src, b.Min, draw.Src)
	}
	dw, dh := w, h
	if swapsSides(o) {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < dh; y++ {
		for x := 0; x < dw; x++ {
			var sx, sy int
			switch o {
			case 2: // mirrored
				sx, sy = w-1-x, y
			case 3: // upside down
				sx, sy = w-1-x, h-1-y
			case 4: // mirrored upside down
				sx, sy = x, h-1-y
			case 5: // mirrored, turned
				sx, sy = y, x
			case 6: // turn 90° clockwise
				sx, sy = y, h-1-x
			case 7: // mirrored, turned the other way
				sx, sy = w-1-y, h-1-x
			case 8: // turn 90° counter-clockwise
				sx, sy = w-1-y, x
			}
			si := rgba.PixOffset(sx+rgba.Rect.Min.X, sy+rgba.Rect.Min.Y)
			di := dst.PixOffset(x, y)
			copy(dst.Pix[di:di+4], rgba.Pix[si:si+4])
		}
	}
	return dst
}
