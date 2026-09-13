package ai

import (
	"encoding/json"

	"ideaven/apps/api/internal/httpx"
)

// The user message is assembled by assembleContext (context_engine.go) —
// the single context pipeline: ranked, budgeted, sanitized, deterministic.

// Context builders shared with tests — the client sends these pre-built; the
// server only embeds them. Kept here so the shape has one documented home.

// ProjectContext is the compact project header item.
type ProjectContext struct {
	Name         string   `json:"name"`
	Type         string   `json:"type"`
	Screens      []string `json:"screens"`
	StartScreenID string  `json:"startScreenId"`
	Variables    []string `json:"variables"`
}

// ScreenContext is the compact screen item (components are tree JSON).
type ScreenContext struct {
	ScreenID   string          `json:"screenId"`
	Name       string          `json:"name"`
	Components json.RawMessage `json:"components"`
	Handlers   []string        `json:"handlers"`
}

// SelectionContext names what the user has selected in the builder.
type SelectionContext struct {
	ComponentID string `json:"componentId,omitempty"`
	HandlerID   string `json:"handlerId,omitempty"`
}

var (
	_ = httpx.CodeValidation
	_ = json.Marshal
)
