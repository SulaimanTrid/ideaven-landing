package project

import (
	"strings"
	"testing"
)

func TestInitialModelIsValid(t *testing.T) {
	for _, projectType := range []string{TypeApp, TypeGame} {
		model := InitialModel(projectType)
		if err := ValidateModel(&model); err != nil {
			t.Fatalf("%s: initial model invalid: %v", projectType, err)
		}
		if model.SchemaVersion != ModelSchemaVersion {
			t.Fatalf("%s: schema version = %d", projectType, model.SchemaVersion)
		}
		if model.Type != projectType {
			t.Fatalf("%s: model type = %q", projectType, model.Type)
		}
		if model.Navigation.StartScreenID != model.Screens[0].ID {
			t.Fatalf("%s: start screen does not point at the initial screen", projectType)
		}
		if len(model.Screens[0].Components) != 0 {
			t.Fatalf("%s: initial screen should have no components", projectType)
		}
	}
}

func TestValidateModelRejections(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(m *Model)
	}{
		{"unknown schema version", func(m *Model) { m.SchemaVersion = 99 }},
		{"bad type", func(m *Model) { m.Type = "hologram" }},
		{"no screens", func(m *Model) { m.Screens = nil }},
		{"duplicate screen ids", func(m *Model) {
			m.Screens = []Screen{
				{ID: "s1", Name: "A", Components: []Component{}},
				{ID: "s1", Name: "B", Components: []Component{}},
			}
		}},
		{"missing start screen", func(m *Model) { m.Navigation.StartScreenID = "ghost" }},
		{"duplicate component ids", func(m *Model) {
			m.Screens[0].Components = []Component{
				{ID: "c1", Type: "button"},
				{ID: "c1", Type: "text"},
			}
		}},
		{"duplicate nested component ids", func(m *Model) {
			m.Screens[0].Components = []Component{
				{ID: "c1", Type: "column", Children: []Component{{ID: "c1", Type: "text"}}},
			}
		}},
		{"component without id", func(m *Model) {
			m.Screens[0].Components = []Component{{Type: "text"}}
		}},
		{"duplicate handler ids", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click"},
				{ID: "h1", Event: "click"},
			}}
		}},
		{"handler without event", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{{ID: "h1", Event: "  "}}}
		}},
		{"duplicate block ids within one handler", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click", Body: []Block{
					{ID: "b1", Kind: "statement", Type: "show-message"},
					{ID: "b1", Kind: "statement", Type: "show-message"},
				}},
			}}
		}},
		{"duplicate block id in nested children", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click", Body: []Block{
					{ID: "b1", Kind: "statement", Type: "if", Children: []Block{
						{ID: "b1", Kind: "statement", Type: "show-message"},
					}},
				}},
			}}
		}},
		{"duplicate block id in else children", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click", Body: []Block{
					{ID: "b1", Kind: "statement", Type: "if",
						Children:     []Block{{ID: "b2", Kind: "statement", Type: "show-message"}},
						ElseChildren: []Block{{ID: "b2", Kind: "statement", Type: "show-message"}},
					},
				}},
			}}
		}},
		{"block with unknown kind", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click", Body: []Block{{ID: "b1", Kind: "widget", Type: "show-message"}}},
			}}
		}},
		{"empty expression slot", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click", Body: []Block{{
					ID: "b1", Kind: "statement", Type: "set-property",
					Inputs: map[string]any{"componentId": "c-text-1", "property": "text"},
					Slots:  map[string]*Block{"value": nil},
				}}},
			}}
		}},
		{"invalid nested slot block", func(m *Model) {
			m.Screens[0].Logic = &Logic{Handlers: []EventHandler{
				{ID: "h1", Event: "click", Body: []Block{{
					ID: "b1", Kind: "statement", Type: "set-property",
					Slots: map[string]*Block{"value": {ID: "s1", Kind: "expression", Type: ""}},
				}}},
			}}
		}},
	}
	for _, tc := range cases {
		model := InitialModel(TypeApp)
		tc.mutate(&model)
		if err := ValidateModel(&model); err == nil {
			t.Fatalf("%s: expected rejection", tc.name)
		}
	}
}

func TestValidateModelAcceptsNestedComponents(t *testing.T) {
	model := InitialModel(TypeApp)
	model.Screens[0].Components = []Component{
		{
			ID: "c-column", Type: "column",
			Children: []Component{
				{ID: "c-text", Type: "text"},
				{ID: "c-button", Type: "button"},
			},
		},
	}
	if err := ValidateModel(&model); err != nil {
		t.Fatalf("valid nested model rejected: %v", err)
	}
}

func TestValidateModelAcceptsBlockLogic(t *testing.T) {
	model := InitialModel(TypeApp)
	model.Screens[0].Components = []Component{{ID: "c-button-1", Type: "button"}}
	model.Screens[0].Logic = &Logic{
		Handlers: []EventHandler{
			{
				ID:          "h-1",
				ComponentID: strPtr("c-button-1"),
				Event:       "click",
				Body: []Block{
					{
						ID: "b-1", Kind: "statement", Type: "if",
						Inputs: map[string]any{},
						Slots: map[string]*Block{
							"condition": {ID: "b-2", Kind: "expression", Type: "equals",
								Slots: map[string]*Block{
									"a": {ID: "b-3", Kind: "expression", Type: "get-property",
										Inputs: map[string]any{"componentId": "c-button-1", "property": "label"}},
									"b": {ID: "b-4", Kind: "expression", Type: "text", Inputs: map[string]any{"value": ""}},
								}},
						},
						Children: []Block{
							{ID: "b-5", Kind: "statement", Type: "show-message",
								Slots: map[string]*Block{"message": {ID: "b-6", Kind: "expression", Type: "text",
									Inputs: map[string]any{"value": "Empty"}}}},
						},
					},
					// A dangling component reference must be accepted here:
					// component deletion surfaces diagnostics, it never
					// destroys blocks.
					{ID: "b-7", Kind: "statement", Type: "set-property",
						Inputs: map[string]any{"componentId": "c-deleted", "property": "text"},
						Slots:  map[string]*Block{"value": {ID: "b-8", Kind: "expression", Type: "text", Inputs: map[string]any{"value": "x"}}}},
				},
			},
			{ID: "h-2", Event: "initialize"}, // screen event, no component
		},
	}
	if err := ValidateModel(&model); err != nil {
		t.Fatalf("valid block logic rejected: %v", err)
	}
}

func strPtr(s string) *string { return &s }

func TestValidateModelAcceptsCustomScreenCode(t *testing.T) {
	model := InitialModel(TypeApp)
	model.Screens[0].Code = strPtr("export function registerHome(api) { /* custom */ }")
	if err := ValidateModel(&model); err != nil {
		t.Fatalf("custom screen code rejected: %v", err)
	}
}

func TestNewSlug(t *testing.T) {
	slug, err := newSlug("My First App!")
	if err != nil {
		t.Fatalf("newSlug: %v", err)
	}
	if !strings.HasPrefix(slug, "my-first-app-") {
		t.Fatalf("slug = %q, want a readable prefix", slug)
	}
	if len(slug) != len("my-first-app-")+6 {
		t.Fatalf("slug = %q, want a 6-char suffix", slug)
	}

	// A name of only symbols falls back to a safe prefix.
	slug, err = newSlug("???")
	if err != nil {
		t.Fatalf("newSlug symbols: %v", err)
	}
	if !strings.HasPrefix(slug, "project-") {
		t.Fatalf("symbol-only slug = %q", slug)
	}

	// Long names are truncated to keep URLs sane.
	long := strings.Repeat("a", 100)
	slug, err = newSlug(long)
	if err != nil {
		t.Fatalf("newSlug long: %v", err)
	}
	if len(slug) > 55 {
		t.Fatalf("long slug = %q (%d chars)", slug, len(slug))
	}
}
