package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

// sidewaysJPEG makes a landscape JPEG (left half red, right half blue) carrying the EXIF
// orientation o, the way a phone stores a portrait photo.
func sidewaysJPEG(t *testing.T, w, h, o int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := color.RGBA{220, 20, 20, 255}
			if x >= w/2 {
				c = color.RGBA{20, 20, 220, 255}
			}
			img.SetRGBA(x, y, c)
		}
	}
	var enc bytes.Buffer
	if err := jpeg.Encode(&enc, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	// APP1: "Exif\0\0" + big-endian TIFF header + one IFD entry (0x0112 SHORT = o).
	var tiff bytes.Buffer
	tiff.WriteString("MM\x00\x2a")
	binary.Write(&tiff, binary.BigEndian, uint32(8))
	binary.Write(&tiff, binary.BigEndian, uint16(1))
	binary.Write(&tiff, binary.BigEndian, uint16(0x0112))
	binary.Write(&tiff, binary.BigEndian, uint16(3))
	binary.Write(&tiff, binary.BigEndian, uint32(1))
	binary.Write(&tiff, binary.BigEndian, uint16(o))
	binary.Write(&tiff, binary.BigEndian, uint16(0))
	binary.Write(&tiff, binary.BigEndian, uint32(0))
	payload := append([]byte("Exif\x00\x00"), tiff.Bytes()...)
	var out bytes.Buffer
	out.Write([]byte{0xFF, 0xD8, 0xFF, 0xE1})
	binary.Write(&out, binary.BigEndian, uint16(len(payload)+2))
	out.Write(payload)
	out.Write(enc.Bytes()[2:]) // the encoder's own SOI is replaced by ours
	return out.Bytes()
}

func TestExifOrientationIsRead(t *testing.T) {
	for _, o := range []int{1, 3, 6, 8} {
		got := exifOrientation(bytes.NewReader(sidewaysJPEG(t, 40, 20, o)))
		if got != o {
			t.Fatalf("orientation %d read as %d", o, got)
		}
	}
	if got := exifOrientation(bytes.NewReader([]byte("not a jpeg"))); got != 1 {
		t.Fatalf("non-JPEG should read as 1, got %d", got)
	}
}

func TestThumbOfSidewaysPhotoIsUpright(t *testing.T) {
	s := &Server{}
	path := filepath.Join(t.TempDir(), "photo")
	// 1000×500 stored sideways with "turn 90° clockwise": people see it as 500×1000.
	if err := os.WriteFile(path, sidewaysJPEG(t, 1000, 500, 6), 0o600); err != nil {
		t.Fatal(err)
	}
	w, h, ok := s.makeThumb(path)
	if !ok || w != 500 || h != 1000 {
		t.Fatalf("got %dx%d thumb=%v, want 500x1000 with a thumb", w, h, ok)
	}
	f, err := os.Open(path + "_t")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	thumb, err := jpeg.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	b := thumb.Bounds()
	if b.Dx() != 240 || b.Dy() != 480 {
		t.Fatalf("thumb is %dx%d, want 240x480 (portrait)", b.Dx(), b.Dy())
	}
	// Turned clockwise, the red left half ends up on top and the blue right half at the bottom.
	top := color.RGBAModel.Convert(thumb.At(120, 60)).(color.RGBA)
	bottom := color.RGBAModel.Convert(thumb.At(120, 420)).(color.RGBA)
	if top.R < 150 || top.B > 100 || bottom.B < 150 || bottom.R > 100 {
		t.Fatalf("thumb not upright: top %v bottom %v", top, bottom)
	}
}
