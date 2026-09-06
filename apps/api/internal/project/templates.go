package project

import (
	"encoding/json"
	"fmt"
	"sort"
)

// Built-in project templates (roadmap 4/32): real, valid models the creation
// wizard can start from — each exercises a different part of the platform
// (layout, navigation, logic blocks, control flow). They are code, not data,
// so they stay compilable and testable.

// Template is one built-in starting point.
type Template struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
	Screens     int    `json:"screens"`
}

// TemplateBrief is the list shape (no model document).
type TemplateBrief = Template

var templateRegistry = map[string]func() Model{
	"signin-starter":  signinStarterModel,
	"product-landing": productLandingModel,
	"quiz-starter":    quizStarterModel,
}

// Templates lists the built-ins, stable order.
func Templates() []TemplateBrief {
	ids := make([]string, 0, len(templateRegistry))
	for id := range templateRegistry {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	out := []TemplateBrief{}
	for _, id := range ids {
		model := templateRegistry[id]()
		out = append(out, TemplateBrief{
			ID:          id,
			Name:        templateNames[id],
			Description: templateDescriptions[id],
			Type:        model.Type,
			Screens:     len(model.Screens),
		})
	}
	return out
}

// TemplateModel returns a fresh copy of a template's model for a new
// project of the given type (the template's own type must match).
func TemplateModel(id, projectType string) (Model, error) {
	build, ok := templateRegistry[id]
	if !ok {
		return Model{}, fmt.Errorf("project: unknown template %q", id)
	}
	model := build()
	if model.Type != projectType {
		return Model{}, fmt.Errorf("project: template %q is a %s template, not a %s template", id, model.Type, projectType)
	}
	return model, nil
}

var templateNames = map[string]string{
	"signin-starter":  "Sign-in Starter",
	"product-landing": "Product Landing",
	"quiz-starter":    "Quiz Starter",
}

var templateDescriptions = map[string]string{
	"signin-starter":  "Welcome + sign-in screens with navigation and a greeting built from blocks.",
	"product-landing": "A clean hero, feature cards, and a call-to-action — pure layout showcase.",
	"quiz-starter":    "One-question quiz with an if/else answer check — control-flow showcase.",
}

// ---- helpers -----------------------------------------------------------------------

// comp builds a component; optional args are a styles map and/or children.
func comp(id, typ string, props map[string]any, args ...any) Component {
	c := Component{ID: id, Type: typ, Props: props}
	for _, arg := range args {
		switch v := arg.(type) {
		case map[string]any:
			c.Styles = v
		case Component:
			c.Children = append(c.Children, v)
		case []Component:
			c.Children = append(c.Children, v...)
		}
	}
	return c
}

func styled(id, typ string, props, styles map[string]any, children ...Component) Component {
	return comp(id, typ, props, styles, children)
}

func stmt(id, typ string, inputs map[string]any, slots map[string]*Block, children ...Block) Block {
	return Block{ID: id, Kind: "statement", Type: typ, Inputs: inputs, Slots: slots, Children: children}
}

func expr(id, typ string, inputs map[string]any, slots map[string]*Block) Block {
	return Block{ID: id, Kind: "expression", Type: typ, Inputs: inputs, Slots: slots}
}

func textExpr(id, value string) *Block {
	b := expr(id, "text", map[string]any{"value": value}, nil)
	return &b
}

func numberExpr(id string, value float64) *Block {
	b := expr(id, "number", map[string]any{"value": value}, nil)
	return &b
}

func getProp(componentID, property, id string) *Block {
	b := expr(id, "get-property", map[string]any{"componentId": componentID, "property": property}, nil)
	return &b
}

func handler(id string, componentID *string, event string, body ...Block) EventHandler {
	return EventHandler{ID: id, ComponentID: componentID, Event: event, Body: body}
}

func handlerPtr(id string, componentID *string, event string, body ...Block) EventHandler {
	return handler(id, componentID, event, body...)
}

func exprPtr(id, typ string, inputs map[string]any, slots map[string]*Block) *Block {
	b := expr(id, typ, inputs, slots)
	return &b
}

func ptr(s string) *string { return &s }

func mustMarshal(m Model) []byte {
	data, err := json.Marshal(m)
	if err != nil {
		panic(fmt.Sprintf("project: template model %v", err))
	}
	return data
}

// ---- template models ----------------------------------------------------------------

// signinStarterModel: Welcome → Sign in, with navigation and a join-based
// greeting on submit.
func signinStarterModel() Model {
	welcome := Screen{
		ID:   "screen-welcome",
		Name: "Welcome",
		Components: []Component{
			styled("w-box", "column", nil, map[string]any{"padding": "48px 24px", "gap": "16px", "align": "center", "justify": "center", "height": "100%"},
				comp("w-title", "text", map[string]any{"text": "Welcome to Nimbus"}, map[string]any{"fontSize": 28, "fontWeight": "700", "textAlign": "center"}),
				comp("w-sub", "text", map[string]any{"text": "The friendly notes app. Sign in to get started."}, map[string]any{"fontSize": 15, "color": "#5b6172", "textAlign": "center"}),
				styled("w-spacer", "spacer", nil, map[string]any{"height": "8px"}),
				styled("w-cta", "button", map[string]any{"label": "Get started"}, map[string]any{"background": "#6c58f5", "color": "#ffffff", "padding": "12px 28px", "radius": "10px", "fontSize": 15}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-welcome-cta", ptr("w-cta"), "click",
				stmt("b-nav-login", "navigate", map[string]any{"screenId": "screen-signin"}, nil),
			),
		}},
	}

	signin := Screen{
		ID:   "screen-signin",
		Name: "Sign in",
		Components: []Component{
			styled("s-box", "column", nil, map[string]any{"padding": "48px 24px", "gap": "12px", "height": "100%"},
				comp("s-title", "text", map[string]any{"text": "Sign in"}, map[string]any{"fontSize": 24, "fontWeight": "700"}),
				comp("s-email", "text-input", map[string]any{"placeholder": "Email address"}),
				comp("s-password", "password-input", map[string]any{"placeholder": "Password"}),
				styled("s-submit", "button", map[string]any{"label": "Sign in"}, map[string]any{"background": "#6c58f5", "color": "#ffffff", "padding": "12px 20px", "radius": "10px"}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-signin", ptr("s-submit"), "click",
				stmt("b-greet", "show-message", nil, map[string]*Block{
					"message": exprPtr("b-greet-join", "join",
						nil,
						map[string]*Block{
							"a": textExpr("b-greet-a", "Signed in as "),
							"b": getProp("s-email", "value", "b-greet-email"),
						}),
				}),
				stmt("b-nav-home", "navigate", map[string]any{"screenId": "screen-welcome"}, nil),
			),
		}},
	}

	return Model{
		SchemaVersion: ModelSchemaVersion,
		Type:          TypeApp,
		Settings:      ModelSettings{Theme: "light"},
		Screens:       []Screen{welcome, signin},
		Navigation:    Navigation{StartScreenID: "screen-welcome"},
		Variables:     []Variable{},
		Assets:        []Asset{},
	}
}

// productLandingModel: hero + feature cards + CTA, no logic — layout focus.
func productLandingModel() Model {
	home := Screen{
		ID:   "screen-home",
		Name: "Home",
		Components: []Component{
			styled("l-box", "column", nil, map[string]any{"padding": "0 0 32px 0", "gap": "0px"},
				styled("l-hero", "column", nil, map[string]any{"padding": "56px 24px", "gap": "12px", "background": "#12151f", "align": "center"},
					comp("l-kicker", "text", map[string]any{"text": "IDEAVEN SHOWCASE"}, map[string]any{"fontSize": 12, "color": "#8f7bff", "fontWeight": "600"}),
					comp("l-headline", "text", map[string]any{"text": "Ship your idea this weekend"}, map[string]any{"fontSize": 26, "fontWeight": "700", "color": "#ffffff", "textAlign": "center"}),
					comp("l-sub", "text", map[string]any{"text": "Design it, wire the logic, publish it. All in the browser."}, map[string]any{"fontSize": 14, "color": "#a9b0c2", "textAlign": "center"}),
				),
				styled("l-features", "row", nil, map[string]any{"padding": "24px", "gap": "12px"},
					featureCard("l-card-1", "Visual", "Drag real components onto the canvas — what you see is the app."),
					featureCard("l-card-2", "Logic", "Snap blocks together to make buttons, inputs, and screens come alive."),
				),
				styled("l-cta-wrap", "column", nil, map[string]any{"padding": "0 24px", "align": "center"},
					styled("l-cta", "button", map[string]any{"label": "Try it now"}, map[string]any{"background": "#6c58f5", "color": "#ffffff", "padding": "12px 32px", "radius": "10px"}),
				),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-landing-cta", ptr("l-cta"), "click",
				stmt("b-cta-msg", "show-message", nil, map[string]*Block{
					"message": textExpr("b-cta-text", "Thanks for your interest!"),
				}),
			),
		}},
	}

	return Model{
		SchemaVersion: ModelSchemaVersion,
		Type:          TypeApp,
		Settings:      ModelSettings{Theme: "light"},
		Screens:       []Screen{home},
		Navigation:    Navigation{StartScreenID: "screen-home"},
		Variables:     []Variable{},
		Assets:        []Asset{},
	}
}

func featureCard(id, title, body string) Component {
	return styled(id, "card", nil, map[string]any{"padding": "16px", "radius": "12px", "gap": "6px", "grow": true},
		comp(id+"-t", "text", map[string]any{"text": title}, map[string]any{"fontSize": 16, "fontWeight": "600"}),
		comp(id+"-b", "text", map[string]any{"text": body}, map[string]any{"fontSize": 13, "color": "#5b6172"}),
	)
}

// quizStarterModel: one-question quiz with an if/else answer check.
func quizStarterModel() Model {
	scene := Screen{
		ID:   "screen-scene-1",
		Name: "Scene 1",
		Components: []Component{
			styled("q-box", "column", nil, map[string]any{"padding": "40px 24px", "gap": "12px", "height": "100%"},
				comp("q-question", "text", map[string]any{"text": "What is the capital of Indonesia?"}, map[string]any{"fontSize": 20, "fontWeight": "600"}),
				comp("q-hint", "text", map[string]any{"text": "Type your answer below and submit."}, map[string]any{"fontSize": 13, "color": "#5b6172"}),
				comp("q-answer", "text-input", map[string]any{"placeholder": "Your answer…"}),
				styled("q-submit", "button", map[string]any{"label": "Submit"}, map[string]any{"background": "#6c58f5", "color": "#ffffff", "padding": "12px 20px", "radius": "10px"}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			{
				ID: "h-quiz", ComponentID: ptr("q-submit"), Event: "click",
				Body: []Block{
					{
						ID: "b-check", Kind: "statement", Type: "if",
						Slots: map[string]*Block{
							"condition": exprPtr("b-eq", "equals", nil, map[string]*Block{
								"a": getProp("q-answer", "value", "b-eq-answer"),
								"b": textExpr("b-eq-jakarta", "Jakarta"),
							}),
						},
						Children: []Block{
							stmt("b-correct", "show-message", nil, map[string]*Block{
								"message": textExpr("b-correct-text", "Correct! Great job."),
							}),
						},
						ElseChildren: []Block{
							stmt("b-wrong", "show-message", nil, map[string]*Block{
								"message": textExpr("b-wrong-text", "Not quite — try again!"),
							}),
						},
					},
				},
			},
		}},
	}

	return Model{
		SchemaVersion: ModelSchemaVersion,
		Type:          TypeGame,
		Settings:      ModelSettings{Theme: "light"},
		Screens:       []Screen{scene},
		Navigation:    Navigation{StartScreenID: "screen-scene-1"},
		Variables:     []Variable{},
		Assets:        []Asset{},
	}
}
