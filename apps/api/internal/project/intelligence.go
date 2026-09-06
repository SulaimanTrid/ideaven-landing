package project

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

func timeNowUnix() int64 { return time.Now().Unix() }

// AssetBytesByProject returns the total stored bytes per asset id so the
// performance/security dimensions can reason about real sizes.
func (s *Service) AssetBytesByProject(ctx context.Context, projectID string) map[string]int64 {
	out := map[string]int64{}
	rows, err := s.store.db.QueryContext(ctx,
		`SELECT id, COALESCE(size, 0) FROM assets WHERE project_id = $1`, projectID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var size int64
		if err := rows.Scan(&id, &size); err == nil {
			out[id] = size
		}
	}
	return out
}

// Project Intelligence (roadmap 3.0 M1): a derived-only report over the
// canonical model — never a second model. Graphs (navigation, events,
// dependencies) and seven health dimensions, every issue carrying a pointer
// to its cause so the UI can navigate there.

type IntelIssue struct {
	Severity    string `json:"severity"`  // "critical" | "attention" | "info"
	Dimension   string `json:"dimension"` // build | architecture | performance | accessibility | security | dependency | runtime
	Message     string `json:"message"`
	ScreenID    string `json:"screenId,omitempty"`
	ScreenName  string `json:"screenName,omitempty"`
	ComponentID string `json:"componentId,omitempty"`
	HandlerID   string `json:"handlerId,omitempty"`
	BlockID     string `json:"blockId,omitempty"`
}

type IntelEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"` // navigation | event | dependency | asset
	// Provenance: which handler/block produced this edge, so a dangling
	// target can be traced back to its cause.
	HandlerID string `json:"handlerId,omitempty"`
	BlockID   string `json:"blockId,omitempty"`
}

type IntelReport struct {
	Counts struct {
		Screens       int            `json:"screens"`
		Components    int            `json:"components"`
		ByType        map[string]int `json:"byType"`
		Handlers      int            `json:"handlers"`
		Blocks        int            `json:"blocks"`
		Variables     int            `json:"variables"`
		Assets        int            `json:"assets"`
		AssetBytes    int64          `json:"assetBytes"`
		HandlersWired int            `json:"handlersWired"`
	} `json:"counts"`
	Navigation []IntelEdge  `json:"navigation"`
	Issues     []IntelIssue `json:"issues"`
	Health     struct {
		Build         string `json:"build"` // healthy | attention | critical
		Architecture  string `json:"architecture"`
		Performance   string `json:"performance"`
		Accessibility string `json:"accessibility"`
		Security      string `json:"security"`
		Dependency    string `json:"dependency"`
		Runtime       string `json:"runtime"`
	} `json:"health"`
	GeneratedAt string `json:"generatedAt"`
}

// intelWalker walks components with their depth and screen context.
type intelComponent struct {
	ID    string
	Type  string
	Props map[string]any
}

func IntelligenceFor(m *Model, visibility string, assetBytes int64) *IntelReport {
	report := &IntelReport{
		Navigation: []IntelEdge{},
		Issues:     []IntelIssue{},
	}
	report.Counts.Screens = len(m.Screens)
	report.Counts.ByType = map[string]int{}
	report.Counts.Variables = len(m.Variables)
	report.Counts.AssetBytes = assetBytes

	screenName := map[string]string{}
	screenEmpty := 0
	giantScreens := 0
	deepNesting := false
	missingLabels := 0
	missingAlt := 0
	danglingHandlers := 0
	danglingNavigations := 0
	unknownVariables := 0
	missingAssets := 0
	emptyHandlers := 0

	variableNames := map[string]bool{}
	for _, v := range m.Variables {
		variableNames[v.Name] = true
	}
	assetIDs := map[string]bool{}
	for _, a := range m.Assets {
		assetIDs[a.ID] = true
	}

	for _, screen := range m.Screens {
		screenName[screen.ID] = screen.Name
		if screen.Logic != nil {
			report.Counts.HandlersWired += len(screen.Logic.Handlers)
		}

		var flat []intelComponent
		var walk func(nodes []Component, depth int)
		walk = func(nodes []Component, depth int) {
			for _, node := range nodes {
				flat = append(flat, intelComponent{ID: node.ID, Type: node.Type, Props: node.Props})
				report.Counts.Components++
				report.Counts.ByType[node.Type]++
				if depth >= 6 {
					deepNesting = true
				}
				// Accessibility signals: interactive components need labels/alt.
				if node.Type == "button" {
					if label, _ := node.Props["label"].(string); strings.TrimSpace(label) == "" {
						missingLabels++
						report.Issues = append(report.Issues, IntelIssue{
							Severity: "attention", Dimension: "accessibility",
							Message:  fmt.Sprintf("Button without a label on “%s”.", screen.Name),
							ScreenID: screen.ID, ScreenName: screen.Name, ComponentID: node.ID,
						})
					}
				}
				if node.Type == "image" {
					if alt, _ := node.Props["alt"].(string); strings.TrimSpace(alt) == "" {
						missingAlt++
					}
				}
				if src, _ := node.Props["src"].(string); node.Type == "image" && strings.HasPrefix(src, "asset:") {
					if id := strings.TrimPrefix(src, "asset:"); id != "" && !assetIDs[id] {
						missingAssets++
						report.Issues = append(report.Issues, IntelIssue{
							Severity: "attention", Dimension: "build",
							Message:  fmt.Sprintf("Image references a missing asset on “%s”.", screen.Name),
							ScreenID: screen.ID, ScreenName: screen.Name, ComponentID: node.ID,
						})
					}
				}
				walk(node.Children, depth+1)
			}
		}
		walk(screen.Components, 0)

		if len(screen.Components) == 0 {
			screenEmpty++
			report.Issues = append(report.Issues, IntelIssue{
				Severity: "info", Dimension: "architecture",
				Message:  fmt.Sprintf("Screen “%s” is empty.", screen.Name),
				ScreenID: screen.ID, ScreenName: screen.Name,
			})
		}
		if len(flat) > 40 {
			giantScreens++
			report.Issues = append(report.Issues, IntelIssue{
				Severity: "attention", Dimension: "performance",
				Message:  fmt.Sprintf("Screen “%s” has %d components — consider splitting it.", screen.Name, len(flat)),
				ScreenID: screen.ID, ScreenName: screen.Name,
			})
		}

		componentIDs := map[string]bool{}
		for _, c := range flat {
			componentIDs[c.ID] = true
		}
		if screen.Logic == nil {
			continue
		}

		for _, handler := range screen.Logic.Handlers {
			report.Counts.Handlers++
			report.Counts.Blocks += countBlocks(handler.Body)
			if handler.ComponentID != nil && !componentIDs[*handler.ComponentID] {
				danglingHandlers++
				report.Issues = append(report.Issues, IntelIssue{
					Severity: "critical", Dimension: "build",
					Message:  fmt.Sprintf("Handler references a deleted component on “%s”.", screen.Name),
					ScreenID: screen.ID, ScreenName: screen.Name, HandlerID: handler.ID,
				})
			}
			if len(handler.Body) == 0 {
				emptyHandlers++
			}
			walkIntelBlocks(handler.Body, screen, handler.ID, variableNames, &danglingNavigations, &unknownVariables,
				&report.Navigation, &report.Issues, screenName)
		}
	}

	// Navigation edges: keep only those whose target exists.
	valid := []IntelEdge{}
	for _, edge := range report.Navigation {
		if _, ok := screenName[edge.To]; ok {
			valid = append(valid, edge)
		} else {
			danglingNavigations++
			report.Issues = append(report.Issues, IntelIssue{
				Severity: "critical", Dimension: "build",
				Message:  fmt.Sprintf("Navigation targets a missing screen “%s”.", edge.To),
				ScreenID: edge.From, ScreenName: screenName[edge.From],
				HandlerID: edge.HandlerID, BlockID: edge.BlockID,
			})
		}
	}
	report.Navigation = valid

	// Asset/dependency summary.
	report.Counts.Assets = len(m.Assets)

	// Health roll-ups.
	set := func(target *string, level string) {
		if rank(level) > rank(*target) {
			*target = level
		}
	}
	report.Health.Build = "healthy"
	report.Health.Architecture = "healthy"
	report.Health.Performance = "healthy"
	report.Health.Accessibility = "healthy"
	report.Health.Security = "healthy"
	report.Health.Dependency = "healthy"
	report.Health.Runtime = "healthy"

	if danglingHandlers > 0 || danglingNavigations > 0 || unknownVariables > 0 || missingAssets > 0 {
		set(&report.Health.Build, "critical")
	}
	if emptyHandlers > 0 {
		set(&report.Health.Runtime, "attention")
	}
	if screenEmpty > 0 {
		set(&report.Health.Architecture, "attention")
	}
	if giantScreens > 0 || deepNesting {
		set(&report.Health.Performance, "attention")
	}
	if missingLabels > 0 || missingAlt > 0 {
		set(&report.Health.Accessibility, "attention")
	}
	if visibility == "public" && report.Counts.AssetBytes > 8<<20 {
		set(&report.Health.Security, "attention")
	}

	return report
}

func rank(level string) int {
	switch level {
	case "attention":
		return 1
	case "critical":
		return 2
	}
	return 0
}

func countBlocks(blocks []Block) int {
	total := 0
	for _, b := range blocks {
		total++
		total += countBlocks(b.Children)
		total += countBlocks(b.ElseChildren)
		for _, slot := range b.Slots {
			if slot != nil {
				total += countBlocks([]Block{*slot})
			}
		}
	}
	return total
}

func walkIntelBlocks(blocks []Block, screen Screen, handlerID string, variableNames map[string]bool,
	danglingNav, unknownVar *int, edges *[]IntelEdge, issues *[]IntelIssue, screenName map[string]string) {
	for _, b := range blocks {
		switch b.Type {
		case "navigate":
			if target, _ := b.Inputs["screenId"].(string); target != "" {
				*edges = append(*edges, IntelEdge{
					From: screen.ID, To: target, Kind: "navigation",
					HandlerID: handlerID, BlockID: b.ID,
				})
			}
		case "set-variable", "get-variable":
			if name, _ := b.Inputs["name"].(string); name != "" && !variableNames[name] {
				*unknownVar++
				*issues = append(*issues, IntelIssue{
					Severity: "critical", Dimension: "build",
					Message:  fmt.Sprintf("Variable “%s” does not exist — create it in the Variables panel.", name),
					ScreenID: screen.ID, ScreenName: screenName[screen.ID],
					HandlerID: handlerID, BlockID: b.ID,
				})
			}
		}
		walkIntelBlocks(b.Children, screen, handlerID, variableNames, danglingNav, unknownVar, edges, issues, screenName)
		walkIntelBlocks(b.ElseChildren, screen, handlerID, variableNames, danglingNav, unknownVar, edges, issues, screenName)
		for _, slot := range b.Slots {
			if slot != nil {
				walkIntelBlocks([]Block{*slot}, screen, handlerID, variableNames, danglingNav, unknownVar, edges, issues, screenName)
			}
		}
	}
}

// Intelligence handles GET /api/projects/{id}/intelligence.
func (h *Handler) Intelligence(w http.ResponseWriter, r *http.Request) {
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
	report := IntelligenceFor(&model, found.Visibility, assetBytes)
	report.GeneratedAt = fmt.Sprintf("%d", timeNowUnix())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"intelligence": report})
}
