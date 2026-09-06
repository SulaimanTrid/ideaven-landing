// Package project implements Ideaven's project domain: the project library
// (create, list, rename, duplicate, archive, delete) and the canonical
// versioned Project Model every future editor surface renders from.
package project

import (
	"fmt"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// ModelSchemaVersion is the schema version of newly created models. Stored
// models keep the version they were written with; migrations upgrade them.
const ModelSchemaVersion = 1

// Model is the canonical Project Model: the single representation screens,
// components, logic, variables, and assets are stored in. The visual editor,
// block engine, code editor, preview, validators, and AI all read and write
// this structure â€” none of them may fork a private copy of it.
//
// Version 1 intentionally models the minimum the platform can honor today
// (screens with an empty component list). New fields must be optional so old
// models stay valid.
type Model struct {
	SchemaVersion int           `json:"schemaVersion"`
	Type          string        `json:"type"`
	Settings      ModelSettings `json:"settings"`
	Screens       []Screen      `json:"screens"`
	Navigation    Navigation    `json:"navigation"`
	Variables     []Variable    `json:"variables"`
	Assets        []Asset       `json:"assets"`
}

// ModelSettings holds project-wide presentation defaults.
type ModelSettings struct {
	Theme string `json:"theme"`
}

// Screen is one page/scene of the project. Styles is screen-level
// presentation (e.g. background) and is optional in schema v1. Logic holds
// the screen's event handlers as structured block programs. Code, when set,
// is the screen's custom source: the authoritative code for this screen that
// the platform does not (yet) represent as blocks. It must never be
// overwritten by code generation — clearing it is an explicit user action.
type Screen struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Components []Component    `json:"components"`
	Styles     map[string]any `json:"styles,omitempty"`
	Logic      *Logic         `json:"logic,omitempty"`
	Code       *string        `json:"code,omitempty"`
}

// Logic is a screen's event-handler collection. Handlers reference
// components by ID; when a component is later deleted the references are
// allowed to dangle — the validator flags them as diagnostics, it does not
// destroy the user's blocks.
type Logic struct {
	Handlers []EventHandler `json:"handlers"`
}

// EventHandler wires one component event (or a screen event, when ComponentID
// is nil) to a stack of block statements.
type EventHandler struct {
	ID          string  `json:"id"`
	ComponentID *string `json:"componentId,omitempty"`
	Event       string  `json:"event"`
	Body        []Block `json:"body"`
}

// Block is one node of a structured block program: a statement (runs in a
// body) or an expression (fills a slot). Inputs carry literals and
// references; Slots hold nested expressions; Children hold nested statement
// bodies (the "then" branch of an if); ElseChildren holds the optional
// "else" branch. The tree structure IS the connection graph.
type Block struct {
	ID           string            `json:"id"`
	Kind         string            `json:"kind"` // "statement" | "expression"
	Type         string            `json:"type"` // e.g. "set-property", "get-property"
	Inputs       map[string]any    `json:"inputs,omitempty"`
	Slots        map[string]*Block `json:"slots,omitempty"`
	Children     []Block           `json:"children,omitempty"`
	ElseChildren []Block           `json:"elseChildren,omitempty"`
}

// Component is a UI element on a screen. Props/Styles are open maps for now —
// the visual builder phase will replace them with typed descriptors, and a
// migration will normalize stored models.
type Component struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Props    map[string]any `json:"props,omitempty"`
	Styles   map[string]any `json:"styles,omitempty"`
	Children []Component    `json:"children,omitempty"`
}

// Navigation wires screens together; StartScreenID is where the preview boots.
type Navigation struct {
	StartScreenID string `json:"startScreenId"`
}

// Variable is a named piece of project state referenced by logic.
type Variable struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// Asset is a reference to stored media; binaries live in asset storage, never
// inside the model document itself.
type Asset struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Name string `json:"name"`
}

// Project types. The universal vocabulary (7.0 M7) extends the original
// app/game pair; unknown-but-valid types behave as screen-based projects
// (InitialModel gives them a Home screen).
const (
	TypeApp  = "app"
	TypeGame = "game"
)

// typeVocabulary is the closed set of project types (mirrors migration 017).
var typeVocabulary = map[string]bool{
	TypeApp: true, TypeGame: true,
	"website": true, "backend": true, "api": true, "database": true,
	"experience": true, "extension": true, "tool": true, "education": true,
}

// InitialModel returns the valid starting model for a new project of the
// given type: one empty screen so preview and editor always have a target.
func InitialModel(projectType string) Model {
	screen := Screen{ID: "screen-home", Name: "Home", Components: []Component{}}
	if projectType == TypeGame {
		screen = Screen{ID: "screen-scene-1", Name: "Scene 1", Components: []Component{}}
	}
	return Model{
		SchemaVersion: ModelSchemaVersion,
		Type:          projectType,
		Settings:      ModelSettings{Theme: "light"},
		Screens:       []Screen{screen},
		Navigation:    Navigation{StartScreenID: screen.ID},
		Variables:     []Variable{},
		Assets:        []Asset{},
	}
}

// ValidateModel checks the structural invariants the platform relies on:
// a known schema version, at least one screen, unique screen/component IDs,
// and a start screen that exists.
func ValidateModel(m *Model) error {
	if m == nil {
		return invalidModel("The project model is missing.")
	}
	if m.SchemaVersion != ModelSchemaVersion {
		return invalidModel(fmt.Sprintf("Unsupported project model schema version %d (supported: %d).", m.SchemaVersion, ModelSchemaVersion))
	}
	if !typeVocabulary[m.Type] {
		return invalidModel("The project model type must be one of: app, game, website, backend, api, database, experience, extension, tool, education.")
	}
	if len(m.Screens) == 0 {
		return invalidModel("The project needs at least one screen.")
	}

	seenScreens := make(map[string]bool, len(m.Screens))
	for i, screen := range m.Screens {
		if strings.TrimSpace(screen.ID) == "" {
			return invalidModel(fmt.Sprintf("Screen %d is missing an ID.", i+1))
		}
		if seenScreens[screen.ID] {
			return invalidModel(fmt.Sprintf("Screen ID %q is used more than once.", screen.ID))
		}
		seenScreens[screen.ID] = true

		seenComponents := make(map[string]bool)
		if err := validateComponents(screen.Components, seenComponents); err != nil {
			return err
		}

		if err := validateLogic(screen.Logic); err != nil {
			return err
		}
	}

	if m.Navigation.StartScreenID != "" && !seenScreens[m.Navigation.StartScreenID] {
		return invalidModel("The start screen does not exist.")
	}
	return nil
}

// validateLogic checks the structural invariants of a screen's block
// programs: unique handler IDs, named events, and well-formed block trees
// with handler-unique IDs. Dangling component references are intentional â€”
// deleting a component must not destroy the blocks that referenced it.
func validateLogic(logic *Logic) error {
	if logic == nil {
		return nil
	}

	seenHandlers := make(map[string]bool, len(logic.Handlers))
	for i, handler := range logic.Handlers {
		if strings.TrimSpace(handler.ID) == "" {
			return invalidModel(fmt.Sprintf("Handler %d is missing an ID.", i+1))
		}
		if seenHandlers[handler.ID] {
			return invalidModel(fmt.Sprintf("Handler ID %q is used more than once.", handler.ID))
		}
		seenHandlers[handler.ID] = true

		if handler.ComponentID != nil && strings.TrimSpace(*handler.ComponentID) == "" {
			return invalidModel(fmt.Sprintf("Handler %q has an empty component reference.", handler.ID))
		}
		if strings.TrimSpace(handler.Event) == "" {
			return invalidModel(fmt.Sprintf("Handler %q is missing an event name.", handler.ID))
		}

		seenBlocks := make(map[string]bool)
		if err := validateBlocks(handler.Body, seenBlocks); err != nil {
			return err
		}
	}
	return nil
}

func validateBlocks(blocks []Block, seen map[string]bool) error {
	for _, block := range blocks {
		if strings.TrimSpace(block.ID) == "" {
			return invalidModel("A block is missing an ID.")
		}
		if seen[block.ID] {
			return invalidModel(fmt.Sprintf("Block ID %q is used more than once.", block.ID))
		}
		seen[block.ID] = true

		if block.Kind != "statement" && block.Kind != "expression" {
			return invalidModel(fmt.Sprintf("Block %q has an unknown kind %q.", block.ID, block.Kind))
		}
		if strings.TrimSpace(block.Type) == "" {
			return invalidModel(fmt.Sprintf("Block %q is missing a type.", block.ID))
		}

		for slotName, slot := range block.Slots {
			if slot == nil {
				return invalidModel(fmt.Sprintf("Block %q has an empty %q slot.", block.ID, slotName))
			}
			if err := validateBlocks([]Block{*slot}, seen); err != nil {
				return err
			}
		}
		if err := validateBlocks(block.Children, seen); err != nil {
			return err
		}
		if err := validateBlocks(block.ElseChildren, seen); err != nil {
			return err
		}
	}
	return nil
}

func validateComponents(components []Component, seen map[string]bool) error {
	for _, component := range components {
		if strings.TrimSpace(component.ID) == "" {
			return invalidModel(fmt.Sprintf("A %q component is missing an ID.", component.Type))
		}
		if seen[component.ID] {
			return invalidModel(fmt.Sprintf("Component ID %q is used more than once.", component.ID))
		}
		seen[component.ID] = true
		if err := validateComponents(component.Children, seen); err != nil {
			return err
		}
	}
	return nil
}

// invalidModel builds the shared validation error for model violations.
func invalidModel(message string) *httpx.Error {
	return httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, message).
		WithDetails(httpx.FieldError{Field: "model", Message: message})
}

