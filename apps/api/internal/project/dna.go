package project

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Project DNA (roadmap 4.0 M3): a derived understanding document over the
// canonical model — what the project IS, factually. Every field comes from
// real model data; nothing is invented and nothing here mutates the model.
// Where the intelligence report (M1) answers "how healthy is it?", DNA
// answers "what is it and how is it put together?".

type DNAVariable struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Writes int    `json:"writes"`
	Reads  int    `json:"reads"`
}

type DNAAsset struct {
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	UsedBy int   `json:"usedBy"`
	Orphan bool  `json:"orphan"`
}

type DNAReport struct {
	Purpose struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Type        string `json:"type"`
		Visibility  string `json:"visibility"`
	} `json:"purpose"`
	Architecture struct {
		Screens      int               `json:"screens"`
		Components   int               `json:"components"`
		ByType       map[string]int    `json:"byType"`
		Handlers     int               `json:"handlers"`
		Blocks       int               `json:"blocks"`
		StartScreen  string            `json:"startScreen"`
		EmptyScreens []string          `json:"emptyScreens"`
		Navigation   map[string]string `json:"navigation"`
	} `json:"architecture"`
	State struct {
		Variables []DNAVariable `json:"variables"`
	} `json:"state"`
	Assets []DNAAsset `json:"assets"`
	Logic  struct {
		EventsUsed map[string]int `json:"eventsUsed"`
	} `json:"logic"`
	Extensions []string `json:"extensions"`
	Health     struct {
		Critical   int               `json:"critical"`
		Attention  int               `json:"attention"`
		Info       int               `json:"info"`
		Dimensions map[string]string `json:"dimensions"`
	} `json:"health"`
	GeneratedAt string `json:"generatedAt"`
}

// DNAFor derives the DNA document. visibility/assetBytes come from the
// owning project row; health dimensions are reused from the intelligence
// pass so both reports always agree.
func DNAFor(m *Model, name, description, visibility string, assetBytes int64) *DNAReport {
	report := &DNAReport{}
	report.Purpose.Name = name
	report.Purpose.Description = description
	report.Purpose.Type = m.Type
	report.Purpose.Visibility = visibility

	arch := &report.Architecture
	arch.ByType = map[string]int{}
	arch.EmptyScreens = []string{}
	arch.Navigation = map[string]string{}
	report.Logic.EventsUsed = map[string]int{}
	report.Extensions = []string{}
	report.Assets = []DNAAsset{}
	report.State.Variables = []DNAVariable{}

	writes := map[string]int{}
	reads := map[string]int{}
	extensions := map[string]bool{}

	var countComponents func(components []Component) int
	countComponents = func(components []Component) int {
		total := 0
		for _, component := range components {
			total += 1
			arch.ByType[component.Type] += 1
			total += countComponents(component.Children)
		}
		return total
	}

	// Asset usage: image srcs reference "asset:<id>".
	assetUses := map[string]int{}
	var walkAssetRefs func(components []Component)
	walkAssetRefs = func(components []Component) {
		for _, component := range components {
			if src, _ := component.Props["src"].(string); strings.HasPrefix(src, "asset:") {
				id := src[len("asset:"):]
				if id != "" {
					assetUses[id] += 1
				}
			}
			walkAssetRefs(component.Children)
		}
	}

	screenNames := map[string]string{}
	for _, screen := range m.Screens {
		screenNames[screen.ID] = screen.Name
		arch.Screens += 1
		arch.Components += countComponents(screen.Components)
		walkAssetRefs(screen.Components)
		if len(screen.Components) == 0 {
			arch.EmptyScreens = append(arch.EmptyScreens, screen.Name)
		}
		if screen.Logic == nil {
			continue
		}
		for _, handler := range screen.Logic.Handlers {
			arch.Handlers += 1
			arch.Blocks += countBlocks(handler.Body)
			report.Logic.EventsUsed[handler.Event] += 1

			var walkVars func(blocks []Block)
			walkVars = func(blocks []Block) {
				for _, block := range blocks {
					switch block.Type {
					case "set-variable":
						if name, _ := block.Inputs["name"].(string); name != "" {
							writes[name] += 1
						}
					case "get-variable":
						if name, _ := block.Inputs["name"].(string); name != "" {
							reads[name] += 1
						}
					}
					if slug := extensionSlugOf(block.Type); slug != "" {
						extensions[slug] = true
					}
					walkVars(block.Children)
					walkVars(block.ElseChildren)
					for _, slot := range block.Slots {
						if slot != nil {
							walkVars([]Block{*slot})
						}
					}
				}
			}
			walkVars(handler.Body)
		}
	}

	for _, variable := range m.Variables {
		report.State.Variables = append(report.State.Variables, DNAVariable{
			Name: variable.Name, Type: variable.Type,
			Writes: writes[variable.Name], Reads: reads[variable.Name],
		})
	}
	sort.Slice(report.State.Variables, func(i, j int) bool {
		return report.State.Variables[i].Name < report.State.Variables[j].Name
	})

	for _, asset := range m.Assets {
		used := assetUses[asset.ID]
		report.Assets = append(report.Assets, DNAAsset{
			Name: asset.Name, Kind: asset.Kind, UsedBy: used, Orphan: used == 0,
		})
	}

	if start, ok := screenNames[m.Navigation.StartScreenID]; ok {
		arch.StartScreen = start
	}

	intel := IntelligenceFor(m, visibility, assetBytes)
	for _, edge := range intel.Navigation {
		arch.Navigation[screenNames[edge.From]] = screenNames[edge.To]
	}

	report.Health.Dimensions = map[string]string{}
	for _, issue := range intel.Issues {
		switch issue.Severity {
		case "critical":
			report.Health.Critical += 1
		case "attention":
			report.Health.Attention += 1
		case "info":
			report.Health.Info += 1
		}
	}
	for dimension, level := range map[string]string{
		"build": intel.Health.Build, "architecture": intel.Health.Architecture,
		"performance": intel.Health.Performance, "accessibility": intel.Health.Accessibility,
		"security": intel.Health.Security, "dependency": intel.Health.Dependency,
		"runtime": intel.Health.Runtime,
	} {
		report.Health.Dimensions[dimension] = level
	}

	for slug := range extensions {
		report.Extensions = append(report.Extensions, slug)
	}
	sort.Strings(report.Extensions)

	report.GeneratedAt = fmt.Sprintf("%d", time.Now().Unix())
	return report
}

func extensionSlugOf(blockType string) string {
	const prefix = "ext:"
	if len(blockType) <= len(prefix) {
		return ""
	}
	if blockType[:len(prefix)] != prefix {
		return ""
	}
	rest := blockType[len(prefix):]
	for i := 0; i < len(rest); i++ {
		if rest[i] == ':' {
			return rest[:i]
		}
	}
	return rest
}

// DNA handles GET /api/projects/{id}/dna.
func (h *Handler) DNA(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	found, err := h.service.Get(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	model := Model{}
	if err := json.Unmarshal(found.Model, &model); err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Could not read the project model."))
		return
	}
	var assetBytes int64
	for _, row := range h.service.AssetBytesByProject(r.Context(), found.ID) {
		assetBytes += row
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"dna": DNAFor(&model, found.Name, found.Description, found.Visibility, assetBytes)})
}
