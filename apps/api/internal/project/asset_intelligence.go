package project

import (
	"context"
	"encoding/binary"
	"fmt"
	"net/http"
	"sort"

	"ideaven/apps/api/internal/httpx"
)

// Asset Intelligence (roadmap 4.0 M30): derived-only facts about a project's
// stored media — real dimensions decoded from image headers, a decoded
// memory estimate, per-asset usage counts from the canonical model, orphan
// detection, and honest optimization hints. Nothing here is invented.
type AssetIntelligence struct {
	AssetID  string `json:"assetId"`
	Name     string `json:"name"`
	Mime     string `json:"mime"`
	Size     int64  `json:"size"`
	Width    int    `json:"width,omitempty"`
	Height   int    `json:"height,omitempty"`
	Megapixe float64 `json:"megapixels,omitempty"`
	// DecodedMemory is width*height*4 bytes (RGBA in memory), not file size.
	DecodedMemory int64    `json:"decodedMemory,omitempty"`
	Uses          int      `json:"uses"`
	Orphan        bool     `json:"orphan"`
	Hints         []string `json:"hints,omitempty"`
}

type AssetIntelligenceReport struct {
	Assets       []AssetIntelligence `json:"assets"`
	TotalCount   int                 `json:"totalCount"`
	OrphanCount  int                 `json:"orphanCount"`
	TotalSize    int64               `json:"totalSize"`
	TotalDecoded int64               `json:"totalDecodedMemory"`
}

func (h *Handler) AssetIntelligence(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	report, err := h.service.AssetIntelligence(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"intelligence": report})
}

// AssetIntelligence derives the report for one owner's project.
func (s *Service) AssetIntelligence(ctx context.Context, ownerID, projectID string) (*AssetIntelligenceReport, error) {
	if err := validateID(projectID); err != nil {
		return nil, err
	}
	if _, err := s.Get(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	// Assets and the model both live in stores this package already owns
	// (project Store for the model; the asset package's store for media).
	assets, err := s.assetStore.ProjectMediaList(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("project: asset intelligence: %w", err)
	}
	project, err := s.store.FindForOwner(ctx, ownerID, projectID)
	if err != nil {
		return nil, fmt.Errorf("project: asset intelligence: model: %w", err)
	}
	if s.assetStore == nil {
		return &AssetIntelligenceReport{Assets: []AssetIntelligence{}}, nil
	}
	usage := assetUsageFromModel(string(project.Model))

	report := &AssetIntelligenceReport{Assets: []AssetIntelligence{}}
	for _, asset := range assets {
		entry := AssetIntelligence{
			AssetID: asset.ID,
			Name:    asset.Name,
			Mime:    asset.MIME,
			Size:    int64(asset.Size),
			Uses:    usage[asset.ID],
			Orphan:  usage[asset.ID] == 0,
		}
		// Dimensions need the real bytes; image kinds only, owner-scoped.
		var width, height int
		var dimsOK bool
		if isImageMime(asset.MIME) {
			if media, err := s.assetStore.ProjectMediaData(ctx, ownerID, asset.ID); err == nil {
				width, height, dimsOK = imageDimensions(media.Data)
			}
		}
		if width, height, ok := width, height, dimsOK; ok {
			entry.Width, entry.Height = width, height
			entry.Megapixe = float64(width*height) / 1_000_000
			entry.DecodedMemory = int64(width * height * 4)
			if entry.DecodedMemory > 8<<20 {
				entry.Hints = append(entry.Hints, "Large decoded footprint — consider a smaller variant for previews.")
			}
		}
		if entry.Size > 1<<20 {
			entry.Hints = append(entry.Hints, "Over 1 MB — compress or resize before exporting to APK/Web.")
		}
		if entry.Orphan {
			entry.Hints = append(entry.Hints, "Not referenced by any component — delete it to free storage.")
		}
		report.Assets = append(report.Assets, entry)
		report.TotalCount++
		if entry.Orphan {
			report.OrphanCount++
		}
		report.TotalSize += entry.Size
		report.TotalDecoded += entry.DecodedMemory
	}
	sort.Slice(report.Assets, func(i, j int) bool { return report.Assets[i].Size > report.Assets[j].Size })
	return report, nil
}

// assetUsageFromModel counts `asset:<id>` references across every
// component's props and styles, plus model.assets order is irrelevant here.
func assetUsageFromModel(modelJSON string) map[string]int {
	usage := map[string]int{}
	for i := 0; i+len("\"asset:") <= len(modelJSON); i++ {
		if modelJSON[i:i+len("\"asset:")] != "\"asset:" {
			continue
		}
		start := i + len("\"asset:")
		end := start
		for end < len(modelJSON) && isAssetIDChar(modelJSON[end]) {
			end++
		}
		if end > start && end < len(modelJSON) && modelJSON[end] == '"' {
			usage[modelJSON[start:end]]++
		}
		i = end
	}
	return usage
}

func isImageMime(mime string) bool {
	return mime == "image/png" || mime == "image/jpeg" || mime == "image/gif" || mime == "image/webp"
}

func isAssetIDChar(c byte) bool {
	return c == '-' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')
}

// imageDimensions decodes pixel dimensions from image headers without a
// full image library: PNG IHDR, JPEG SOF markers, GIF logical screen
// descriptor, WebP VP8/VP8L/VP8X chunks.
func imageDimensions(data []byte) (width, height int, ok bool) {
	if len(data) >= 24 && string(data[:8]) == "\x89PNG\r\n\x1a\n" {
		return int(binary.BigEndian.Uint32(data[16:20])), int(binary.BigEndian.Uint32(data[20:24])), true
	}
	if len(data) >= 10 && string(data[:3]) == "GIF" {
		return int(binary.LittleEndian.Uint16(data[6:8])), int(binary.LittleEndian.Uint16(data[8:10])), true
	}
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		switch {
		case string(data[12:16]) == "VP8 " && len(data) >= 30:
			return int(binary.LittleEndian.Uint16(data[26:28]) & 0x3fff), int(binary.LittleEndian.Uint16(data[28:30]) & 0x3fff), true
		case string(data[12:16]) == "VP8L" && len(data) >= 25:
			bits := uint32(data[21]) | uint32(data[22])<<8 | uint32(data[23])<<16
			return int(bits&0x3fff) + 1, int((bits>>14)&0x3fff) + 1, true
		case string(data[12:16]) == "VP8X" && len(data) >= 30:
			w := int(data[24]) | int(data[25])<<8 | int(data[26])<<16
			h := int(data[27]) | int(data[28])<<8 | int(data[29])<<16
			return w + 1, h + 1, true
		}
		return 0, 0, false
	}
	// JPEG: scan SOF0–SOF3/SOF9 segments for the frame dimensions.
	if len(data) >= 4 && data[0] == 0xff && data[1] == 0xd8 {
		i := 2
		for i+9 < len(data) {
			if data[i] != 0xff {
				i++
				continue
			}
			marker := data[i+1]
			if marker == 0xd8 || (marker >= 0xd0 && marker <= 0xd9) {
				i += 2
				continue
			}
			if i+3 >= len(data) {
				break
			}
			length := int(binary.BigEndian.Uint16(data[i+2 : i+4]))
			if (marker >= 0xc0 && marker <= 0xc3) || marker == 0xc9 || marker == 0xca {
				if i+9 <= len(data) {
					return int(binary.BigEndian.Uint16(data[i+7 : i+9])), int(binary.BigEndian.Uint16(data[i+5 : i+7])), true
				}
				return 0, 0, false
			}
			i += 2 + length
		}
	}
	return 0, 0, false
}
