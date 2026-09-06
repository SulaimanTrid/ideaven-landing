package ai

import (
	"encoding/json"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// buildUserMessage assembles the compact, structured context the model sees.
// The client extracts context items so the full project is never sent
// blindly (token cost + accuracy), per the platform's AI context rules.
func buildUserMessage(prompt string, items []ContextItem, rules []string, intent []string) string {
	var b strings.Builder
	b.WriteString("Project context:\n")
	if len(items) == 0 {
		b.WriteString("(none provided — empty project)\n")
	}
	for _, item := range items {
		data := strings.TrimSpace(string(item.Data))
		if data == "" {
			data = "{}"
		}
		b.WriteString("- ")
		b.WriteString(item.Kind)
		b.WriteString(": ")
		b.WriteString(data)
		b.WriteString("\n")
	}
	// Project Memory (5.0 M5): durable rules the user wrote for this
	// project. They constrain planning; the closed operation vocabulary
	// remains the hard boundary regardless of their content.
	if len(intent) > 0 {
		// Project Intent (7.0 M11): what the project is FOR.
		b.WriteString("\nProject intent:\n")
		for _, line := range intent {
			b.WriteString("- ")
			b.WriteString(line)
			b.WriteString("\n")
		}
	}
	if len(rules) > 0 {
		b.WriteString("\nProject rules (must be respected):\n")
		for _, rule := range rules {
			b.WriteString("- ")
			b.WriteString(rule)
			b.WriteString("\n")
		}
	}
	b.WriteString("\nUser request:\n")
	b.WriteString(prompt)
	return b.String()
}

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
