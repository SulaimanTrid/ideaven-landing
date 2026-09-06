package project

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// Authenticator resolves a session cookie token to its user. auth.Service
// satisfies this; the indirection keeps this package free of auth imports.
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (*user.User, error)
}

// Handler translates HTTP requests into Service calls.
type Handler struct {
	service *Service
	auth    Authenticator
	cookie  config.CookieConfig
}

// NewHandler builds the project handler.
func NewHandler(service *Service, auth Authenticator, cookie config.CookieConfig) *Handler {
	return &Handler{service: service, auth: auth, cookie: cookie}
}

// ProjectWire is the wire shape of a project. The model document ships as
// stored (validated JSON) so editors can consume it directly.
type ProjectWire struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Slug         string          `json:"slug"`
	Description  string          `json:"description"`
	Type         string          `json:"type"`
	Status       string          `json:"status"`
	Visibility   string          `json:"visibility"`
	Thumbnail    string          `json:"thumbnail"`
	Model        json.RawMessage `json:"model,omitempty"`
	ModelVersion int             `json:"modelVersion"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
	LastOpenedAt *time.Time      `json:"lastOpenedAt"`
}

// Summary is the list shape: everything except the model document, which
// keeps library payloads small.
func wire(p *Project, withModel bool) ProjectWire {
	w := ProjectWire{
		ID: p.ID, Name: p.Name, Slug: p.Slug, Description: p.Description,
		Type: p.Type, Status: p.Status, Visibility: p.Visibility, Thumbnail: p.Thumbnail,
		ModelVersion: p.ModelVersion,
		CreatedAt:    p.CreatedAt, UpdatedAt: p.UpdatedAt, LastOpenedAt: p.LastOpenedAt,
	}
	if withModel && len(p.Model) > 0 {
		w.Model = json.RawMessage(p.Model)
	}
	return w
}

// Create handles POST /api/projects.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	var body struct {
		Type        string `json:"type"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Template    string `json:"template"`
	}
	if err := httpx.DecodeJSON(w, r, &body, maxProjectBody); err != nil {
		httpx.WriteError(w, err)
		return
	}

	created, err := h.service.Create(r.Context(), current.ID, CreateInput{
		Type: body.Type, Name: body.Name, Description: body.Description, Template: body.Template,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]ProjectWire{"project": wire(created, true)})
}

// List handles GET /api/projects.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	projects, total, err := h.service.List(r.Context(), current.ID, ListQuery{
		Query:  r.URL.Query().Get("q"),
		Status: r.URL.Query().Get("status"),
		Sort:   r.URL.Query().Get("sort"),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	summaries := make([]ProjectWire, len(projects))
	for i := range projects {
		summaries[i] = wire(&projects[i], false)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"projects": summaries, "total": total})
}

// Get handles GET /api/projects/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
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
	httpx.WriteJSON(w, http.StatusOK, map[string]ProjectWire{"project": wire(found, true)})
}

// Update handles PATCH /api/projects/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
		Visibility  *string `json:"visibility"`
	}
	if err := httpx.DecodeJSON(w, r, &body, maxProjectBody); err != nil {
		httpx.WriteError(w, err)
		return
	}

	updated, err := h.service.Update(r.Context(), current.ID, r.PathValue("id"), UpdateInput{
		Name: body.Name, Description: body.Description,
		Status: body.Status, Visibility: body.Visibility,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ProjectWire{"project": wire(updated, false)})
}

// Duplicate handles POST /api/projects/{id}/duplicate.
func (h *Handler) Duplicate(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	created, err := h.service.Duplicate(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]ProjectWire{"project": wire(created, false)})
}

// Open handles POST /api/projects/{id}/open.
func (h *Handler) Open(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	found, err := h.service.Open(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ProjectWire{"project": wire(found, true)})
}

// UpdateModel handles PUT /api/projects/{id}/model — the single write path
// for the canonical Project Model from every editor surface.
func (h *Handler) UpdateModel(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	var body struct {
		Model  *Model `json:"model"`
		Origin string `json:"origin,omitempty"`
	}
	if err := httpx.DecodeJSON(w, r, &body, maxModelBody); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if body.Model == nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "The request body must include a model document.").
			WithDetails(httpx.FieldError{Field: "model", Message: "A model document is required."}))
		return
	}

	updated, err := h.service.UpdateModel(r.Context(), current.ID, r.PathValue("id"), body.Model, body.Origin)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ProjectWire{"project": wire(updated, false)})
}

// Delete handles DELETE /api/projects/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.Delete(r.Context(), current.ID, r.PathValue("id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// currentUser resolves the session cookie to a user or a 401.
func (h *Handler) currentUser(r *http.Request) (*user.User, error) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
	}
	found, err := h.auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		return nil, toHTTPX(err)
	}
	return found, nil
}

func toHTTPX(err error) error {
	var apiErr *httpx.Error
	if errors.As(err, &apiErr) {
		return apiErr
	}
	return httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Something went wrong on our side. Try again shortly.")
}

// maxProjectBody bounds project JSON payloads (metadata only for now).
const maxProjectBody = 16 << 10

// maxModelBody bounds canonical model documents. Rich projects stay far
// below this; it exists so a runaway editor cannot stream forever.
const maxModelBody = 1 << 20
