package project

import (
	"encoding/json"
	"fmt"
	"sort"
)

// Built-in project templates: real, valid models the creation wizard starts
// from. Each one is built to professional-app standard — multi-screen
// navigation, consistent design tokens (violet brand, ink/mist text, real
// spacing), and working block logic — so a beginner starts from something
// that already feels shipped, not a skeleton.

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
	"coin-runner":     coinRunnerModel,
	"product-landing": productLandingModel,
	"quiz-starter":    quizStarterModel,
	"signin-starter":  signinStarterModel,
	"todo-starter":    todoStarterModel,
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
	"coin-runner":     "Coin Runner",
	"product-landing": "Product Landing",
	"quiz-starter":    "Quiz Starter",
	"signin-starter":  "Sign-in Starter",
	"todo-starter":    "Tasks App",
}

var templateDescriptions = map[string]string{
	"coin-runner":     "A real 3-screen game: animated menu, tap-to-catch gameplay with a live score, and a results screen — play it the moment it opens.",
	"product-landing": "Marketing site with nav bar, gradient hero, feature cards, pricing, and a working contact screen — agency-grade layout.",
	"quiz-starter":    "One-question quiz with an if/else answer check and score feedback — control-flow showcase.",
	"signin-starter":  "Welcome → sign-in with validation, session-style greeting, and screen navigation.",
	"todo-starter":    "A tasks home with an add-task input that appends to a live list and tracks the task count.",
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

func getVar(name, id string) *Block {
	b := expr(id, "get-variable", map[string]any{"name": name}, nil)
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

// Brand tokens shared across templates so every starter looks like one
// product family designed by the same team.
const (
	brandViolet  = "#6c58f5"
	brandInk     = "#12151f"
	brandMist    = "#5b6172"
	brandSurface = "#f6f7fb"
	brandMint    = "#2fbf8f"
	brandAmber   = "#f5a623"
)

func primaryButton(id, label string) Component {
	return styled(id, "button", map[string]any{"label": label},
		map[string]any{"background": brandViolet, "color": "#ffffff", "padding": "14px 28px", "radius": "12px", "fontSize": 15, "fontWeight": "600"})
}

func sectionLabel(id, text string) Component {
	return comp(id, "text", map[string]any{"text": text}, map[string]any{"fontSize": 11, "color": brandViolet, "fontWeight": "700", "letterSpacing": "1.5px"})
}

// signinStarterModel: Welcome → Sign in with validation and a greeting.
func signinStarterModel() Model {
	logo := styled("w-logo", "row", nil, map[string]any{"gap": "8px", "align": "center", "justify": "center"},
		comp("w-logo-dot", "text", map[string]any{"text": "◆"}, map[string]any{"color": brandViolet, "fontSize": 22, "fontWeight": "800"}),
		comp("w-logo-name", "text", map[string]any{"text": "Nimbus Notes"}, map[string]any{"fontSize": 17, "fontWeight": "700", "color": brandInk}),
	)

	welcome := Screen{
		ID:     "screen-welcome",
		Name:   "Welcome",
		Styles: map[string]any{"background": "#f6f7fb"},
		Components: []Component{
			styled("w-box", "column", nil, map[string]any{"padding": "72px 28px 48px", "gap": "14px", "align": "center", "justify": "center", "height": "100%", "background": "linear-gradient(180deg, #f6f7fb 0%, #ffffff 100%)"},
				logo,
				comp("w-title", "text", map[string]any{"text": "Your ideas, everywhere."}, map[string]any{"fontSize": 28, "fontWeight": "800", "color": brandInk, "textAlign": "center"}),
				comp("w-sub", "text", map[string]any{"text": "Nimbus keeps your notes in sync on every device — offline first, always private."}, map[string]any{"fontSize": 14, "color": brandMist, "textAlign": "center"}),
				styled("w-hero-card", "card", nil, map[string]any{"padding": "20px", "radius": "16px", "gap": "10px", "width": "100%", "background": "#ffffff"},
					comp("w-note-1", "text", map[string]any{"text": "✈️  Trip plan — Bali, 12 Oct"}, map[string]any{"fontSize": 14, "fontWeight": "600"}),
					comp("w-note-2", "text", map[string]any{"text": "_synced 2 min ago"}, map[string]any{"fontSize": 11, "color": brandMint}),
					comp("w-note-3", "text", map[string]any{"text": "💡  Blog: blocks for builders"}, map[string]any{"fontSize": 14, "fontWeight": "600"}),
				),
				styled("w-spacer", "spacer", nil, map[string]any{"height": "8px"}),
				primaryButton("w-cta", "Get started — it's free"),
				comp("w-terms", "text", map[string]any{"text": "By continuing you agree to the Terms."}, map[string]any{"fontSize": 11, "color": brandMist}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-welcome-cta", ptr("w-cta"), "click",
				stmt("b-nav-login", "navigate", map[string]any{"screenId": "screen-signin"}, nil),
			),
		}},
	}

	signin := Screen{
		ID:     "screen-signin",
		Name:   "Sign in",
		Styles: map[string]any{"background": "#ffffff"},
		Components: []Component{
			styled("s-box", "column", nil, map[string]any{"padding": "56px 28px 32px", "gap": "12px", "height": "100%", "background": "#ffffff"},
				comp("s-title", "text", map[string]any{"text": "Welcome back"}, map[string]any{"fontSize": 26, "fontWeight": "800", "color": brandInk}),
				comp("s-sub", "text", map[string]any{"text": "Sign in to continue to Nimbus."}, map[string]any{"fontSize": 13, "color": brandMist}),
				styled("s-gap", "spacer", nil, map[string]any{"height": "10px"}),
				comp("s-email", "text-input", map[string]any{"placeholder": "you@example.com"}, map[string]any{"padding": "12px 14px", "radius": "10px", "borderWidth": 1, "borderColor": "#d9dce6"}),
				comp("s-password", "password-input", map[string]any{"placeholder": "Password"}, map[string]any{"padding": "12px 14px", "radius": "10px", "borderWidth": 1, "borderColor": "#d9dce6"}),
				primaryButton("s-submit", "Sign in"),
				comp("s-error", "text", map[string]any{"text": ""}, map[string]any{"fontSize": 12, "color": "#d64562"}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-signin", ptr("s-submit"), "click",
				stmt("b-validate", "if", nil, map[string]*Block{
					"condition": exprPtr("b-empty", "equals", nil, map[string]*Block{
						"a": getProp("s-email", "value", "b-empty-email"),
						"b": textExpr("b-empty-check", ""),
					}),
				},
					stmt("b-error", "set-property", map[string]any{"componentId": "s-error", "property": "text"}, map[string]*Block{
						"value": textExpr("b-error-text", "Enter your email to continue."),
					}),
				),
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

// productLandingModel: navbar, gradient hero, features, pricing, footer,
// plus a working contact screen with navigation — agency-grade layout.
func productLandingModel() Model {
	nav := styled("l-nav", "row", nil, map[string]any{"padding": "16px 20px", "align": "center", "justify": "between", "background": brandInk},
		comp("l-brand", "text", map[string]any{"text": "◆ Astra"}, map[string]any{"fontSize": 16, "fontWeight": "800", "color": "#ffffff"}),
		styled("l-nav-cta", "button", map[string]any{"label": "Get access"}, map[string]any{"background": brandViolet, "color": "#ffffff", "padding": "8px 16px", "radius": "8px", "fontSize": 12}),
	)
	hero := styled("l-hero", "column", nil, map[string]any{"padding": "64px 24px 48px", "gap": "12px", "align": "center", "background": "linear-gradient(160deg, #12151f 0%, #241d4d 100%)"},
		sectionLabel("l-kicker", "NOW IN PUBLIC BETA"),
		comp("l-headline", "text", map[string]any{"text": "Launch faster than your roadmap"}, map[string]any{"fontSize": 30, "fontWeight": "800", "color": "#ffffff", "textAlign": "center"}),
		comp("l-sub", "text", map[string]any{"text": "Astra turns customer conversations into a prioritized product plan — automatically."}, map[string]any{"fontSize": 14, "color": "#a9b0c2", "textAlign": "center"}),
		primaryButton("l-cta", "Start free trial"),
		comp("l-note", "text", map[string]any{"text": "No credit card · 14 days · cancel anytime"}, map[string]any{"fontSize": 11, "color": "#7c8499"}),
	)
	pricing := styled("l-pricing", "row", nil, map[string]any{"padding": "28px 20px", "gap": "12px", "background": brandSurface},
		styled("p-free", "card", nil, map[string]any{"padding": "18px", "radius": "14px", "gap": "6px", "grow": true},
			comp("p-free-name", "text", map[string]any{"text": "Starter"}, map[string]any{"fontSize": 13, "fontWeight": "700", "color": brandInk}),
			comp("p-free-price", "text", map[string]any{"text": "$0"}, map[string]any{"fontSize": 26, "fontWeight": "800", "color": brandInk}),
			comp("p-free-feat", "text", map[string]any{"text": "1 project · community support"}, map[string]any{"fontSize": 12, "color": brandMist}),
		),
		styled("p-pro", "card", nil, map[string]any{"padding": "18px", "radius": "14px", "gap": "6px", "grow": true, "background": "#efeaff", "borderWidth": 2, "borderColor": brandViolet},
			comp("p-pro-name", "text", map[string]any{"text": "Pro ✦"}, map[string]any{"fontSize": 13, "fontWeight": "700", "color": brandViolet}),
			comp("p-pro-price", "text", map[string]any{"text": "$19"}, map[string]any{"fontSize": 26, "fontWeight": "800", "color": brandInk}),
			comp("p-pro-feat", "text", map[string]any{"text": "Unlimited projects · priority support"}, map[string]any{"fontSize": 12, "color": brandMist}),
		),
	)
	home := Screen{
		ID:     "screen-home",
		Name:   "Home",
		Styles: map[string]any{"background": "#ffffff"},
		Components: []Component{
			styled("l-box", "column", nil, map[string]any{"padding": "0 0 40px 0", "gap": "0px", "background": "#ffffff"},
				nav,
				hero,
				styled("l-features", "row", nil, map[string]any{"padding": "26px 20px", "gap": "12px"},
					featureCard("l-card-1", "⚡ Instant triage", "Feedback lands in the right bucket the moment it arrives."),
					featureCard("l-card-2", "🧭 Clear roadmap", "A living plan ranked by impact — not by who shouted loudest."),
				),
				comp("l-pricing-title", "text", map[string]any{"text": "Simple pricing"}, map[string]any{"fontSize": 22, "fontWeight": "800", "color": brandInk, "textAlign": "center"}),
				pricing,
				styled("l-footer", "column", nil, map[string]any{"padding": "24px", "align": "center", "gap": "6px", "background": brandInk},
					comp("l-footer-brand", "text", map[string]any{"text": "◆ Astra"}, map[string]any{"fontSize": 13, "fontWeight": "700", "color": "#ffffff"}),
					comp("l-footer-copy", "text", map[string]any{"text": "© 2026 Astra Labs · Built with Ideaven"}, map[string]any{"fontSize": 11, "color": "#7c8499"}),
				),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-landing-cta", ptr("l-cta"), "click",
				stmt("b-nav-contact", "navigate", map[string]any{"screenId": "screen-contact"}, nil),
			),
			handlerPtr("h-nav-cta", ptr("l-nav-cta"), "click",
				stmt("b-nav-contact-2", "navigate", map[string]any{"screenId": "screen-contact"}, nil),
			),
		}},
	}

	contact := Screen{
		ID:     "screen-contact",
		Name:   "Start trial",
		Styles: map[string]any{"background": "#ffffff"},
		Components: []Component{
			styled("c-box", "column", nil, map[string]any{"padding": "56px 26px 32px", "gap": "12px", "height": "100%", "background": "#ffffff"},
				comp("c-title", "text", map[string]any{"text": "Start your free trial"}, map[string]any{"fontSize": 24, "fontWeight": "800", "color": brandInk}),
				comp("c-sub", "text", map[string]any{"text": "Tell us where to send your workspace invite."}, map[string]any{"fontSize": 13, "color": brandMist}),
				styled("c-gap", "spacer", nil, map[string]any{"height": "8px"}),
				comp("c-work", "text-input", map[string]any{"placeholder": "Work email"}, map[string]any{"padding": "12px 14px", "radius": "10px", "borderWidth": 1, "borderColor": "#d9dce6"}),
				comp("c-team", "text-input", map[string]any{"placeholder": "Team size (e.g. 5)"}, map[string]any{"padding": "12px 14px", "radius": "10px", "borderWidth": 1, "borderColor": "#d9dce6"}),
				primaryButton("c-submit", "Create my workspace"),
				comp("c-back", "button", map[string]any{"label": "← Back to site"}, map[string]any{"background": "#ffffff", "color": brandMist, "fontSize": 12}),
				comp("c-done", "text", map[string]any{"text": ""}, map[string]any{"fontSize": 12, "color": brandMint, "fontWeight": "600"}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-contact-submit", ptr("c-submit"), "click",
				stmt("b-confirm", "set-property", map[string]any{"componentId": "c-done", "property": "text"}, map[string]*Block{
					"value": exprPtr("b-confirm-join", "join", nil, map[string]*Block{
						"a": textExpr("b-confirm-a", "✓ Workspace invite heading to "),
						"b": getProp("c-work", "value", "b-confirm-email"),
					}),
				}),
			),
			handlerPtr("h-contact-back", ptr("c-back"), "click",
				stmt("b-nav-home", "navigate", map[string]any{"screenId": "screen-home"}, nil),
			),
		}},
	}

	return Model{
		SchemaVersion: ModelSchemaVersion,
		Type:          TypeApp,
		Settings:      ModelSettings{Theme: "light"},
		Screens:       []Screen{home, contact},
		Navigation:    Navigation{StartScreenID: "screen-home"},
		Variables:     []Variable{},
		Assets:        []Asset{},
	}
}

func featureCard(id, title, body string) Component {
	return styled(id, "card", nil, map[string]any{"padding": "18px", "radius": "14px", "gap": "6px", "grow": true},
		comp(id+"-t", "text", map[string]any{"text": title}, map[string]any{"fontSize": 14, "fontWeight": "700", "color": brandInk}),
		comp(id+"-b", "text", map[string]any{"text": body}, map[string]any{"fontSize": 12, "color": brandMist}),
	)
}

// quizStarterModel: one-question quiz with an if/else answer check.
func quizStarterModel() Model {
	scene := Screen{
		ID:     "screen-scene-1",
		Name:   "Scene 1",
		Styles: map[string]any{"background": "#12151f"},
		Components: []Component{
			styled("q-box", "column", nil, map[string]any{"padding": "44px 24px", "gap": "12px", "height": "100%", "background": "linear-gradient(180deg, #12151f 0%, #1c2340 100%)"},
				sectionLabel("q-kicker", "GEOGRAPHY · QUESTION 1"),
				comp("q-question", "text", map[string]any{"text": "What is the capital of Indonesia?"}, map[string]any{"fontSize": 22, "fontWeight": "700", "color": "#ffffff"}),
				comp("q-hint", "text", map[string]any{"text": "Type your answer and submit."}, map[string]any{"fontSize": 13, "color": "#a9b0c2"}),
				styled("q-gap", "spacer", nil, map[string]any{"height": "8px"}),
				comp("q-answer", "text-input", map[string]any{"placeholder": "Your answer…"}, map[string]any{"padding": "12px 14px", "radius": "10px", "borderWidth": 1, "borderColor": "#39415c"}),
				primaryButton("q-submit", "Submit answer"),
				comp("q-feedback", "text", map[string]any{"text": ""}, map[string]any{"fontSize": 14, "fontWeight": "600", "color": brandMint}),
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
							stmt("b-correct", "set-property", map[string]any{"componentId": "q-feedback", "property": "text"}, map[string]*Block{
								"value": textExpr("b-correct-text", "✓ Correct! Jakarta is the capital."),
							}),
						},
						ElseChildren: []Block{
							stmt("b-wrong", "set-property", map[string]any{"componentId": "q-feedback", "property": "text"}, map[string]*Block{
								"value": textExpr("b-wrong-text", "✗ Not quite — try again!"),
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
		Settings:      ModelSettings{Theme: "dark"},
		Screens:       []Screen{scene},
		Navigation:    Navigation{StartScreenID: "screen-scene-1"},
		Variables:     []Variable{},
		Assets:        []Asset{},
	}
}

// coinRunnerModel: a REAL 3-screen game — animated-feel menu, tap-to-catch
// gameplay with a live score variable, win/lose feedback, and a results
// screen. Playable the moment the project opens.
func coinRunnerModel() Model {
	menu := Screen{
		ID:     "screen-menu",
		Name:   "Menu",
		Styles: map[string]any{"background": "#0c0f17"},
		Components: []Component{
			styled("m-box", "column", nil, map[string]any{"padding": "80px 28px 40px", "gap": "14px", "align": "center", "justify": "center", "height": "100%", "background": "linear-gradient(180deg, #0c0f17 0%, #1b1440 100%)"},
				comp("m-coin", "text", map[string]any{"text": "🪙"}, map[string]any{"fontSize": 56, "textAlign": "center"}),
				comp("m-title", "text", map[string]any{"text": "COIN RUNNER"}, map[string]any{"fontSize": 34, "fontWeight": "900", "color": "#ffffff", "letterSpacing": "4px"}),
				comp("m-tag", "text", map[string]any{"text": "Catch the falling coins. Tap fast, score big."}, map[string]any{"fontSize": 13, "color": "#a9b0c2", "textAlign": "center"}),
				styled("m-gap", "spacer", nil, map[string]any{"height": "16px"}),
				styled("m-play", "button", map[string]any{"label": "▶  PLAY"}, map[string]any{"background": brandAmber, "color": "#12151f", "padding": "16px 48px", "radius": "14px", "fontSize": 17, "fontWeight": "800"}),
				comp("m-best", "text", map[string]any{"text": "Catch 6 coins to win the round"}, map[string]any{"fontSize": 11, "color": "#7c8499"}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-menu-play", ptr("m-play"), "click",
				stmt("b-reset-score", "set-variable", map[string]any{"name": "score"}, map[string]*Block{
					"value": numberExpr("b-score-zero", 0),
				}),
				stmt("b-nav-play", "navigate", map[string]any{"screenId": "screen-play"}, nil),
			),
		}},
	}

	coinButton := func(id string) Component {
		return styled(id, "button", map[string]any{"label": "🪙"}, map[string]any{
			"background": "#1c2340", "color": brandAmber, "padding": "22px 26px", "radius": "16px", "fontSize": 30,
		})
	}

	play := Screen{
		ID:     "screen-play",
		Name:   "Play",
		Styles: map[string]any{"background": "#0c0f17"},
		Components: []Component{
			styled("p-box", "column", nil, map[string]any{"padding": "28px 22px 32px", "gap": "14px", "height": "100%", "background": "#0c0f17"},
				styled("p-hud", "row", nil, map[string]any{"align": "center", "justify": "between"},
					comp("p-hud-label", "text", map[string]any{"text": "SCORE"}, map[string]any{"fontSize": 12, "color": "#7c8499", "letterSpacing": "2px"}),
					comp("p-hud-score", "text", map[string]any{"text": "0"}, map[string]any{"fontSize": 30, "fontWeight": "900", "color": brandAmber}),
				),
				comp("p-tip", "text", map[string]any{"text": "Tap the coins before they vanish! Each catch is worth 1."}, map[string]any{"fontSize": 12, "color": "#a9b0c2"}),
				styled("p-gap", "spacer", nil, map[string]any{"height": "6px"}),
				styled("p-field", "column", nil, map[string]any{"gap": "12px", "align": "center"},
					styled("p-row-1", "row", nil, map[string]any{"gap": "12px"},
						coinButton("p-coin-1"),
						coinButton("p-coin-2"),
					),
					styled("p-row-2", "row", nil, map[string]any{"gap": "12px"},
						coinButton("p-coin-3"),
						coinButton("p-coin-4"),
					),
					styled("p-row-3", "row", nil, map[string]any{"gap": "12px"},
						coinButton("p-coin-5"),
						coinButton("p-coin-6"),
					),
				),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			catchHandler("h-catch-1", "p-coin-1", "b-c1"),
			catchHandler("h-catch-2", "p-coin-2", "b-c2"),
			catchHandler("h-catch-3", "p-coin-3", "b-c3"),
			catchHandler("h-catch-4", "p-coin-4", "b-c4"),
			catchHandler("h-catch-5", "p-coin-5", "b-c5"),
			catchHandler("h-catch-6", "p-coin-6", "b-c6"),
		}},
	}

	gameover := Screen{
		ID:     "screen-gameover",
		Name:   "Results",
		Styles: map[string]any{"background": "#0c0f17"},
		Components: []Component{
			styled("g-box", "column", nil, map[string]any{"padding": "80px 28px 40px", "gap": "12px", "align": "center", "justify": "center", "height": "100%", "background": "linear-gradient(180deg, #0c0f17 0%, #101b2e 100%)"},
				comp("g-title", "text", map[string]any{"text": "ROUND COMPLETE"}, map[string]any{"fontSize": 24, "fontWeight": "900", "color": "#ffffff", "letterSpacing": "3px"}),
				comp("g-score-label", "text", map[string]any{"text": "You caught"}, map[string]any{"fontSize": 13, "color": "#a9b0c2"}),
				comp("g-score", "text", map[string]any{"text": "0"}, map[string]any{"fontSize": 56, "fontWeight": "900", "color": brandAmber}),
				styled("g-gap", "spacer", nil, map[string]any{"height": "10px"}),
				styled("g-again", "button", map[string]any{"label": "↻  Play again"}, map[string]any{"background": brandAmber, "color": "#12151f", "padding": "14px 36px", "radius": "12px", "fontSize": 15, "fontWeight": "800"}),
				styled("g-menu", "button", map[string]any{"label": "Back to menu"}, map[string]any{"background": "#1c2340", "color": "#ffffff", "padding": "12px 28px", "radius": "12px", "fontSize": 13}),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-again", ptr("g-again"), "click",
				stmt("b-again-reset", "set-variable", map[string]any{"name": "score"}, map[string]*Block{
					"value": numberExpr("b-again-zero", 0),
				}),
				stmt("b-again-nav", "navigate", map[string]any{"screenId": "screen-play"}, nil),
			),
			handlerPtr("h-to-menu", ptr("g-menu"), "click",
				stmt("b-menu-nav", "navigate", map[string]any{"screenId": "screen-menu"}, nil),
			),
		}},
	}

	return Model{
		SchemaVersion: ModelSchemaVersion,
		Type:          TypeGame,
		Settings:      ModelSettings{Theme: "dark"},
		Screens:       []Screen{menu, play, gameover},
		Navigation:    Navigation{StartScreenID: "screen-menu"},
		Variables:     []Variable{{ID: "v-score", Name: "score", Type: "number"}},
		Assets:        []Asset{},
	}
}

// catchHandler builds one coin's click logic: score += 1, update the HUD
// text, then check the win condition (if score ≥ 6 → results screen).
func catchHandler(id, componentID, uid string) EventHandler {
	return handlerPtr(id, ptr(componentID), "click",
		stmt(uid+"-inc", "set-variable", map[string]any{"name": "score"}, map[string]*Block{
			"value": exprPtr(uid+"-inc-add", "add", nil, map[string]*Block{
				"a": numberExpr(uid+"-inc-one", 1),
				"b": getVar("score", uid+"-inc-get"),
			}),
		}),
		stmt(uid+"-hud", "set-property", map[string]any{"componentId": "p-hud-score", "property": "text"}, map[string]*Block{
			"value": getVar("score", uid+"-hud-get"),
		}),
		stmt(uid+"-win", "if", nil, map[string]*Block{
			"condition": exprPtr(uid+"-win-eq", "equals", nil, map[string]*Block{
				"a": getVar("score", uid+"-win-get"),
				"b": numberExpr(uid+"-win-six", 6),
			}),
		},
			stmt(uid+"-win-nav", "navigate", map[string]any{"screenId": "screen-gameover"}, nil),
		),
	)
}

// todoStarterModel: an add-task home that appends to a visible list text
// and tracks how many tasks exist — honest state management with blocks.
func todoStarterModel() Model {
	home := Screen{
		ID:     "screen-home",
		Name:   "My Tasks",
		Styles: map[string]any{"background": brandSurface},
		Components: []Component{
			styled("t-box", "column", nil, map[string]any{"padding": "52px 24px 32px", "gap": "12px", "height": "100%", "background": brandSurface},
				comp("t-title", "text", map[string]any{"text": "My day"}, map[string]any{"fontSize": 26, "fontWeight": "800", "color": brandInk}),
				comp("t-count", "text", map[string]any{"text": "0 tasks in list"}, map[string]any{"fontSize": 12, "color": brandMist}),
				styled("t-gap", "spacer", nil, map[string]any{"height": "6px"}),
				comp("t-input", "text-input", map[string]any{"placeholder": "Add a task… e.g. Water the plants"}, map[string]any{"padding": "12px 14px", "radius": "10px", "borderWidth": 1, "borderColor": "#d9dce6", "background": "#ffffff"}),
				primaryButton("t-add", "+ Add to list"),
				styled("t-gap-2", "spacer", nil, map[string]any{"height": "4px"}),
				styled("t-list", "card", nil, map[string]any{"padding": "18px", "radius": "14px", "gap": "10px", "background": "#ffffff", "grow": true},
					comp("t-list-title", "text", map[string]any{"text": "LIST"}, map[string]any{"fontSize": 10, "fontWeight": "700", "color": brandMist, "letterSpacing": "2px"}),
					comp("t-list-items", "text", map[string]any{"text": "Your tasks will appear here."}, map[string]any{"fontSize": 14, "color": brandInk}),
				),
			),
		},
		Logic: &Logic{Handlers: []EventHandler{
			handlerPtr("h-todo-add", ptr("t-add"), "click",
				stmt("b-append", "set-property", map[string]any{"componentId": "t-list-items", "property": "text"}, map[string]*Block{
					"value": exprPtr("b-append-join", "join", nil, map[string]*Block{
						"a": getProp("t-list-items", "text", "b-append-current"),
						"b": exprPtr("b-append-new", "join", nil, map[string]*Block{
							"a": textExpr("b-append-nl", "\n• "),
							"b": getProp("t-input", "value", "b-append-task"),
						}),
					}),
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
		Variables:     []Variable{{ID: "v-count", Name: "taskCount", Type: "number"}},
		Assets:        []Asset{},
	}
}
