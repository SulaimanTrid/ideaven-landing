// Package ai implements Ideaven's AI command system: a provider-agnostic
// router (API keys live only in env), a structured context builder, and a
// validated operation changeset the client applies to the canonical model.
// The server never mutates models here — the client owns persistence through
// its existing validated PUT path, and the whole changeset is one undoable
// step on the client.
package ai

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// Provider turns a system prompt + user message into model output text.
type Provider interface {
	Complete(ctx context.Context, system, user string) (string, error)
	Name() string
	Model() string
}

// AuthenticateFunc resolves a session cookie token to its user; auth.Service
// satisfies it. Kept as an interface to avoid an import cycle.
type AuthenticateFunc func(ctx context.Context, token string) (*user.User, error)

// CookieConfig mirrors config.CookieConfig without importing the config package.
type CookieConfig struct {
	Name string
}

// Handler serves the AI command endpoint.
type Handler struct {
	provider Provider
	auth     AuthenticateFunc
	usage    *usageStore
	db       *sql.DB
	cookie   CookieConfig
}

// NewHandler builds the AI handler. provider may be nil (AI not configured).
func NewHandler(provider Provider, auth AuthenticateFunc, db *sql.DB, cookie CookieConfig) *Handler {
	return &Handler{provider: provider, auth: auth, usage: &usageStore{db: db}, db: db, cookie: cookie}
}

// projectRules loads the caller's durable project rules (5.0 M5). The JOIN
// enforces ownership; a missing project, empty rules, or no db yield nil —
// planning proceeds without them rather than failing.
func (h *Handler) projectRules(ctx context.Context, userID, projectID string) []string {
	if projectID == "" || h.db == nil {
		return nil
	}
	rows, err := h.db.QueryContext(ctx,
		`SELECT m.content FROM project_memory m
		 JOIN projects p ON p.id = m.project_id
		 WHERE m.project_id = $1 AND p.owner_id = $2
		 ORDER BY m.created_at, m.id`, projectID, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	rules := []string{}
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err == nil && strings.TrimSpace(content) != "" {
			rules = append(rules, content)
		}
	}
	return rules
}

// usageStore records every AI request for future credits accounting.
type usageStore struct {
	db *sql.DB
}

func (s *usageStore) record(ctx context.Context, userID, projectID, provider, model string, promptChars, outputChars int, ok bool) {
	const q = `INSERT INTO ai_usage (user_id, project_id, provider, model, prompt_chars, output_chars, ok)
	           VALUES ($1, $2, $3, $4, $5, $6, $7)`
	var pid *string
	if projectID != "" {
		pid = &projectID
	}
	if _, err := s.db.ExecContext(ctx, q, userID, pid, provider, model, promptChars, outputChars, ok); err != nil {
		// Usage logging must never break the request path.
		fmt.Println("ai: usage log failed:", err.Error())
	}
}

// commandRequest is the wire shape of POST /api/ai/command.
type commandRequest struct {
	ProjectID string        `json:"projectId"`
	Prompt    string        `json:"prompt"`
	Context   []ContextItem `json:"context"`
}

// ContextItem is one compact piece of project context the client extracts.
type ContextItem struct {
	Kind string          `json:"kind"` // "project" | "screen" | "component" | "selection"
	Data json.RawMessage `json:"data,omitempty"`
}

// Operation is one validated change the AI proposes for the model. The set
// is deliberately closed; parseAndValidateOperations rejects anything else.
type Operation struct {
	Op string `json:"op"`
	// Ref lets the model chain placements: a createComponent may declare a
	// reference other operations address as "ref:<name>" in ParentID.
	Ref           string         `json:"ref,omitempty"`
	Name          string         `json:"name,omitempty"`
	ScreenID      string         `json:"screenId,omitempty"`
	ComponentID   string         `json:"componentId,omitempty"`
	ParentID      string         `json:"parentId,omitempty"`
	ComponentType string         `json:"componentType,omitempty"`
	Index         *int           `json:"index,omitempty"`
	Props         map[string]any `json:"props,omitempty"`
	Styles        map[string]any `json:"styles,omitempty"`
	Code          string         `json:"code,omitempty"`
	VariableName  string         `json:"variableName,omitempty"`
	VariableType  string         `json:"variableType,omitempty"`
	// Block-level edits: deleteHandler removes a screen handler; updateBlockInput
	// retargets one literal input (a screen/component reference or variable name).
	HandlerID string `json:"handlerId,omitempty"`
	BlockID   string `json:"blockId,omitempty"`
	Input     string `json:"input,omitempty"`
	Value     any    `json:"value,omitempty"`
}

// maxAIBody bounds AI command payloads (context documents can be sizable).
const maxAIBody = 512 << 10

type commandResponse struct {
	Explanation string      `json:"explanation"`
	Operations  []Operation `json:"operations"`
}

// Command handles POST /api/ai/command.
func (h *Handler) Command(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue."))
		return
	}
	current, err := h.auth(r.Context(), cookie.Value)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	if h.provider == nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusServiceUnavailable, "AI_NOT_CONFIGURED",
			"AI is not configured on this server. Set AI_PROVIDER, AI_API_KEY and AI_MODEL to enable Ask AI."))
		return
	}

	// Free-credit gate (roadmap: usage & cost control): the derived daily
	// allowance is checked before the provider is ever touched.
	if h.creditsExhausted(r.Context(), current.ID) {
		httpx.WriteError(w, httpx.Errorf(http.StatusTooManyRequests, "AI_CREDITS_EXHAUSTED",
			"You have used all of today's free AI commands. The allowance resets at midnight."))
		return
	}

	body, err := decodeCommand(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	prompt := strings.TrimSpace(body.Prompt)
	if prompt == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "Write a request for the AI first.").
			WithDetails(httpx.FieldError{Field: "prompt", Message: "A prompt is required."}))
		return
	}

	rules := h.projectRules(r.Context(), current.ID, body.ProjectID)
	var intent []string
	if body.ProjectID != "" && h.db != nil {
		rows, err := h.db.QueryContext(r.Context(),
			`SELECT i.goal, i.audience, i.platforms, i."constraints", i.success
			 FROM project_intent i JOIN projects p ON p.id = i.project_id
			 WHERE i.project_id = $1 AND p.owner_id = $2`, body.ProjectID, current.ID)
		if err == nil {
			var goal, audience, platforms, constraint, success string
			if rows.Next() {
				if rows.Scan(&goal, &audience, &platforms, &constraint, &success) == nil {
					pairs := []struct{ label, value string }{
						{"Goal", goal}, {"Target users", audience}, {"Platforms", platforms},
						{"Constraints", constraint}, {"Success criteria", success},
					}
					for _, pair := range pairs {
						if pair.value != "" {
							intent = append(intent, pair.label+": "+pair.value)
						}
					}
				}
			}
			rows.Close()
		}
	}
	userMessage := buildUserMessage(prompt, body.Context, rules, intent)

	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()

	output, completeErr := h.provider.Complete(ctx, systemPrompt, userMessage)
	h.usage.record(r.Context(), current.ID, body.ProjectID, h.provider.Name(), h.provider.Model(),
		len(userMessage), len(output), completeErr == nil)
	if completeErr != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadGateway, "AI_PROVIDER_ERROR",
			"The AI provider could not complete the request. Try again shortly."))
		return
	}

	response, err := parseAndValidateOperations(output)
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadGateway, "AI_PROVIDER_ERROR",
			"The AI returned a response Ideaven could not use. Try rephrasing the request."))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, response)
}

func decodeCommand(r *http.Request) (*commandRequest, error) {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(strings.ToLower(ct), "application/json") {
		return nil, httpx.Errorf(http.StatusUnsupportedMediaType, httpx.CodeInvalidBody, "Requests must be JSON (Content-Type: application/json).")
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxAIBody+1))
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "Could not read the request body.")
	}
	if int64(len(raw)) > maxAIBody {
		return nil, httpx.Errorf(http.StatusRequestEntityTooLarge, httpx.CodeInvalidBody, "Request body is too large.")
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	var body commandRequest
	if err := dec.Decode(&body); err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "The request body is not valid JSON.")
	}
	return &body, nil
}
