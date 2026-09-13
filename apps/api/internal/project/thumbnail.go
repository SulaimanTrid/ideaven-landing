package project

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// Deterministic project thumbnails (TASK 07): every published project gets a
// real preview image rendered from its own canonical model — a stylized
// wireframe of the start screen's actual components. No stock photos, no
// random art: the same project always renders the same thumbnail, and two
// projects with different layouts never share one.

const thumbW = 640
const thumbH = 400

// PublicThumbnail handles GET /api/public/projects/{slug}/thumbnail.svg.
func (h *Handler) PublicThumbnail(w http.ResponseWriter, r *http.Request) {
	pub, err := h.service.store.PublicationBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteError(w, notFound())
			return
		}
		httpx.WriteError(w, err)
		return
	}
	svg := renderThumbnailSVG(pub.Slug, pub.Type, pub.Model)
	// The image derives from the immutable published snapshot, so it can be
	// cached; a republish changes the snapshot and the URL content.
	etag := fmt.Sprintf(`"%x"`, sha256.Sum256(svg))
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	_, _ = w.Write(svg)
}

// renderThumbnailSVG parses the model leniently (a broken document still
// renders the deterministic background — never a broken image) and draws
// the start screen's component tree as a wireframe.
func renderThumbnailSVG(slug, projectType string, modelRaw []byte) []byte {
	var b strings.Builder
	hash := fnv.New64a()
	_, _ = hash.Write([]byte(slug))
	seed := hash.Sum64()

	bg, accent := palette(seed)
	b.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img">`, thumbW, thumbH, thumbW, thumbH))
	b.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="%s"/>`, thumbW, thumbH, bg))
	b.WriteString(`<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,0.05)"/></pattern></defs>`)
	b.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="url(#dots)"/>`, thumbW, thumbH))

	var model Model
	_ = json.Unmarshal(modelRaw, &model) // lenient: zero model renders the fallback frame
	screen := startScreen(&model)

	deviceW, deviceH := float64(220), float64(340)
	if projectType == "game" || projectType == "website" {
		deviceW, deviceH = 480, 300
	}
	dx := (thumbW - deviceW) / 2
	dy := (thumbH - deviceH) / 2
	b.WriteString(fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="14" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.14)"/>`, dx, dy, deviceW, deviceH))

	if screen == nil || len(screen.Components) == 0 {
		// Honest empty-state wireframe: a centered title bar + two content
		// blocks derived from the slug (still deterministic, still real
		// geometry — but never pretends to show components it does not have).
		cx, cy := dx+deviceW/2, dy+deviceH/2
		b.WriteString(accentRect(cx-70, cy-46, 140, 16, 8, accent, 0.9))
		b.WriteString(wireRect(cx-90, cy-10, 180, 24, 6))
		b.WriteString(wireRect(cx-90, cy+26, 120, 24, 6))
	} else {
		drawComponents(&b, screen.Components, dx+16, dy+16, deviceW-32, deviceH-32, accent, seed, 0)
	}
	b.WriteString(`</svg>`)
	return []byte(b.String())
}

// startScreen picks the navigation start screen, falling back to the first.
func startScreen(m *Model) *Screen {
	for i := range m.Screens {
		if m.Screens[i].ID == m.Navigation.StartScreenID {
			return &m.Screens[i]
		}
	}
	if len(m.Screens) > 0 {
		return &m.Screens[0]
	}
	return nil
}

// drawComponents lays out components in a simple vertical flow (two columns
// for rows), depth-limited so deep trees stay readable.
func drawComponents(b *strings.Builder, comps []Component, x, y, w, h float64, accent string, seed uint64, depth int) {
	const gap = 12
	cursor := y
	for i, c := range comps {
		if cursor > y+h-24 || i >= 9 {
			break
		}
		switch c.Type {
		case "text":
			hh := 14.0
			b.WriteString(wireRect(x, cursor, w*0.62, hh, 4))
			cursor += hh + gap
		case "button":
			hh := 34.0
			b.WriteString(accentRect(x, cursor, w*0.5, hh, 10, accent, 0.85))
			cursor += hh + gap
		case "image":
			hh := 64.0
			b.WriteString(imageGlyph(x, cursor, w, hh))
			cursor += hh + gap
		case "text-input", "password-input":
			hh := 30.0
			b.WriteString(wireRect(x, cursor, w, hh, 8))
			b.WriteString(accentRect(x+4, cursor+4, 3, hh-8, 2, accent, 0.8))
			cursor += hh + gap
		case "checkbox", "switch":
			hh := 18.0
			if c.Type == "switch" {
				b.WriteString(fmt.Sprintf(`<rect x="%g" y="%g" width="34" height="%g" rx="%g" fill="rgba(255,255,255,0.10)"/><circle cx="%g" cy="%g" r="7" fill="%s"/>`,
					x, cursor, hh, hh/2, x+34-10, cursor+hh/2, accent))
			} else {
				b.WriteString(fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.22)"/><rect x="%g" y="%g" width="%g" height="%g" rx="2" fill="%s"/>`,
					x, cursor, hh, hh, x+4, cursor+4, hh-8, hh-8, accent))
			}
			b.WriteString(wireRect(x+hh+12, cursor+3, w*0.4, 10, 4))
			cursor += hh + gap
		case "card", "container", "column":
			hh := 70.0
			b.WriteString(fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="10" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)"/>`, x, cursor, w, hh))
			if depth < 1 && len(c.Children) > 0 {
				drawComponents(b, c.Children, x+14, cursor+14, w-28, hh-28, accent, seed, depth+1)
			}
			cursor += hh + gap
		case "row":
			hh := 44.0
			b.WriteString(fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="10" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)"/>`, x, cursor, w, hh))
			seg := (w - 24 - float64(len(c.Children)+1)*8) / float64(maxInt(len(c.Children), 2))
			for s := 0; s < maxInt(len(c.Children), 2); s++ {
				b.WriteString(wireRect(x+12+float64(s)*(seg+8), cursor+10, seg, hh-20, 6))
			}
			cursor += hh + gap
		case "list-view":
			for k := 0; k < 3; k++ {
				b.WriteString(wireRect(x, cursor, w, 20, 6))
				cursor += 20 + 6
			}
			cursor += gap
		case "divider":
			b.WriteString(fmt.Sprintf(`<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>`, x, cursor+4, x+w, cursor+4))
			cursor += 4 + gap
		case "canvas", "table":
			hh := 56.0
			b.WriteString(imageGlyph(x, cursor, w, hh))
			cursor += hh + gap
		default:
			hh := 26.0
			b.WriteString(wireRect(x, cursor, w*0.44, hh, 6))
			cursor += hh + gap
		}
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func wireRect(x, y, w, h, rx float64) string {
	return fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="rgba(255,255,255,0.09)"/>`, x, y, w, h, rx)
}

func accentRect(x, y, w, h, rx float64, accent string, opacity float64) string {
	return fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s" fill-opacity="%g"/>`, x, y, w, h, rx, accent, opacity)
}

func imageGlyph(x, y, w, h float64) string {
	return fmt.Sprintf(`<rect x="%g" y="%g" width="%g" height="%g" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)"/><circle cx="%g" cy="%g" r="5" fill="rgba(255,255,255,0.28)"/><path d="M %g %g L %g %g L %g %g Z" fill="rgba(255,255,255,0.20)"/>`,
		x, y, w, h, x+18, y+16, x+10, y+h-10, x+w*0.45, y+14, x+w*0.8, y+h-10)
}

// palette picks one of the brand-derived background/accent pairs from the
// slug hash — deterministic, on-brand, and varied.
func palette(seed uint64) (bg, accent string) {
	switch seed % 4 {
	case 0:
		return "#12101f", "#8b7cff"
	case 1:
		return "#0d1420", "#3fd0f0"
	case 2:
		return "#161120", "#c084fc"
	default:
		return "#0e1416", "#4ade9f"
	}
}
