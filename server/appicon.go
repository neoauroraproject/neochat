package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io/fs"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/image/draw"
	"golang.org/x/image/vector"
)

// The app's icon wherever the system asks for one: the browser tab, the phone's home screen,
// the install prompt and notifications. With a logo uploaded in Branding, every size is made
// from that logo; without one, the built-in mark is drawn. iOS cannot use an SVG for the home
// screen and Android cannot show one in a notification, so the sizes are real PNG files.
//
//	/app-icon/any          the logo file itself (or the built-in SVG)
//	/app-icon/180.png      iPhone home screen (no transparency: iOS would fill it with black)
//	/app-icon/192.png      Android launcher and notifications
//	/app-icon/512.png      install prompt and splash
//	/app-icon/maskable.png Android adaptive icon (artwork inside the safe zone)

var iconCache = struct {
	sync.Mutex
	m map[string][]byte
}{m: map[string][]byte{}}

func (s *Server) handleAppIcon(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("file")
	logo := s.cfg().LogoMedia
	etag := `"` + logo + "-" + file + `"`
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	if file == "any" {
		if logo != "" {
			if m, err := s.mediaByID(logo); err == nil {
				if data, err := os.ReadFile(s.mediaPath(m.ID)); err == nil {
					w.Header().Set("Content-Type", m.Mime)
					w.Write(data)
					return
				}
			}
		}
		svg, err := fs.ReadFile(webFS, "web/dist/icon.svg")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Write(svg)
		return
	}

	size, maskable, solid := 0, false, false
	switch file {
	case "180.png":
		size, solid = 180, true
	case "192.png":
		size = 192
	case "512.png":
		size = 512
	case "maskable.png":
		size, maskable, solid = 512, true, true
	default:
		http.NotFound(w, r)
		return
	}

	key := logo + "|" + file
	iconCache.Lock()
	data, ok := iconCache.m[key]
	iconCache.Unlock()
	if !ok {
		img := s.logoImage(logo)
		var out image.Image
		if img != nil {
			out = fitIcon(img, size, maskable, solid)
		} else {
			out = drawDefaultIcon(size, maskable || solid)
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, out); err != nil {
			http.Error(w, "icon", http.StatusInternalServerError)
			return
		}
		data = buf.Bytes()
		iconCache.Lock()
		if len(iconCache.m) > 32 { // logos changed many times: start over
			iconCache.m = map[string][]byte{}
		}
		iconCache.m[key] = data
		iconCache.Unlock()
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

// logoImage decodes the uploaded logo, or returns nil when there is none or it is not a raster
// image (an SVG logo is still used as is for /app-icon/any).
func (s *Server) logoImage(id string) image.Image {
	if id == "" {
		return nil
	}
	m, err := s.mediaByID(id)
	if err != nil || strings.Contains(m.Mime, "svg") {
		return nil
	}
	f, err := os.Open(s.mediaPath(m.ID))
	if err != nil {
		return nil
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(f)
	if err != nil || cfg.Width*cfg.Height > 50_000_000 {
		return nil
	}
	if _, err := f.Seek(0, 0); err != nil {
		return nil
	}
	img, _, err := image.Decode(f)
	if err != nil {
		return nil
	}
	return img
}

// fitIcon centers the logo on a square: it fills the square (cropping the longer side), or for a
// maskable icon sits inside the middle 80% so Android's mask never cuts it. `solid` puts it on
// white, for platforms that do not keep transparency.
func fitIcon(src image.Image, size int, maskable, solid bool) image.Image {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	if solid {
		draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	}
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	if sw == 0 || sh == 0 {
		return dst
	}
	if maskable {
		inner := size * 8 / 10
		// Fit inside (no cropping) for the safe zone.
		w, h := inner, inner
		if sw > sh {
			h = inner * sh / sw
		} else {
			w = inner * sw / sh
		}
		x, y := (size-w)/2, (size-h)/2
		draw.CatmullRom.Scale(dst, image.Rect(x, y, x+w, y+h), src, b, draw.Over, nil)
		return dst
	}
	// Cover: crop the longer side to a centered square.
	side := min(sw, sh)
	crop := image.Rect(b.Min.X+(sw-side)/2, b.Min.Y+(sh-side)/2, 0, 0)
	crop.Max = crop.Min.Add(image.Pt(side, side))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, crop, draw.Over, nil)
	return dst
}

// drawDefaultIcon draws the built-in mark (client/public/icon.svg) at any size: a teal tile with a
// white speech bubble and three dots. `square` drops the rounded corners for platforms that apply
// their own mask.
func drawDefaultIcon(size int, square bool) image.Image {
	sc := float32(size) / 512
	top := color.RGBA{0x33, 0xc9, 0xad, 0xff}
	bot := color.RGBA{0x00, 0xa3, 0x88, 0xff}
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	// Diagonal gradient, as in the SVG.
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			t := float64(x+y) / float64(2*size)
			dst.SetRGBA(x, y, color.RGBA{
				uint8(float64(top.R) + (float64(bot.R)-float64(top.R))*t),
				uint8(float64(top.G) + (float64(bot.G)-float64(top.G))*t),
				uint8(float64(top.B) + (float64(bot.B)-float64(top.B))*t),
				0xff,
			})
		}
	}
	if !square {
		// Rounded tile: clear the corners outside a radius of 120/512.
		mask := vector.NewRasterizer(size, size)
		roundRect(mask, 0, 0, 512*sc, 512*sc, 120*sc)
		tile := image.NewRGBA(dst.Bounds())
		mask.Draw(tile, tile.Bounds(), dst, image.Point{})
		dst = tile
	}
	white := image.NewUniform(color.White)
	bubble := vector.NewRasterizer(size, size)
	p := func(x, y float32) (float32, float32) { return x * sc, y * sc }
	bubble.MoveTo(p(256, 118))
	cube := func(ax, ay, bx, by, cx, cy float32) {
		x1, y1 := p(ax, ay)
		x2, y2 := p(bx, by)
		x3, y3 := p(cx, cy)
		bubble.CubeTo(x1, y1, x2, y2, x3, y3)
	}
	cube(174, 118, 108, 176, 108, 248)
	cube(108, 289, 129, 325, 163, 349)
	bubble.LineTo(p(151, 401))
	cube(149, 410, 159, 417, 167, 412)
	bubble.LineTo(p(227, 377))
	cube(236, 379, 246, 379, 256, 379)
	cube(338, 379, 404, 321, 404, 248)
	cube(404, 175, 338, 118, 256, 118)
	bubble.ClosePath()
	bubble.Draw(dst, dst.Bounds(), white, image.Point{})
	dots := vector.NewRasterizer(size, size)
	for _, cx := range []float32{196, 256, 316} {
		circle(dots, cx*sc, 249*sc, 20*sc)
	}
	dots.Draw(dst, dst.Bounds(), image.NewUniform(bot), image.Point{})
	return dst
}

// bezierK is the control-point distance that makes a cubic Bézier match a quarter circle.
const bezierK = 0.5522847

func circle(r *vector.Rasterizer, cx, cy, rad float32) {
	c := rad * bezierK
	r.MoveTo(cx+rad, cy)
	r.CubeTo(cx+rad, cy+c, cx+c, cy+rad, cx, cy+rad)
	r.CubeTo(cx-c, cy+rad, cx-rad, cy+c, cx-rad, cy)
	r.CubeTo(cx-rad, cy-c, cx-c, cy-rad, cx, cy-rad)
	r.CubeTo(cx+c, cy-rad, cx+rad, cy-c, cx+rad, cy)
	r.ClosePath()
}

func roundRect(r *vector.Rasterizer, x, y, w, h, rad float32) {
	c := rad * bezierK
	r.MoveTo(x+rad, y)
	r.LineTo(x+w-rad, y)
	r.CubeTo(x+w-rad+c, y, x+w, y+rad-c, x+w, y+rad)
	r.LineTo(x+w, y+h-rad)
	r.CubeTo(x+w, y+h-rad+c, x+w-rad+c, y+h, x+w-rad, y+h)
	r.LineTo(x+rad, y+h)
	r.CubeTo(x+rad-c, y+h, x, y+h-rad+c, x, y+h-rad)
	r.LineTo(x, y+rad)
	r.CubeTo(x, y+rad-c, x+rad-c, y, x+rad, y)
	r.ClosePath()
}
