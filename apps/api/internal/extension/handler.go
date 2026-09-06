package extension

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// Authenticator resolves a session cookie token to its user (satisfied by
// auth.Service; keeps this package free of auth imports).
type Authenticator func(ctx context.Context, token string) (*user.User, error)

// Handler translates HTTP requests into Service calls.
type Handler struct {
	service *Service
	auth    Authenticator
	cookie  config.CookieConfig
}

// NewHandler builds the extension handler.
func NewHandler(service *Service, auth Authenticator, cookie config.CookieConfig) *Handler {
	return &Handler{service: service, auth: auth, cookie: cookie}
}

// currentUser resolves the session, mirroring the project handler.
func (h *Handler) currentUser(r *http.Request) (*user.User, error) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
	}
	found, err := h.auth(r.Context(), cookie.Value)
	if err != nil {
		if apiErr, ok := err.(*httpx.Error); ok {
			return nil, apiErr
		}
		return nil, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Something went wrong on our side. Try again shortly.")
	}
	return found, nil
}

// ExtensionWire is the wire shape of an authored extension.
type ExtensionWire struct {
	ID             string          `json:"id"`
	Slug           string          `json:"slug"`
	Name           string          `json:"name"`
	Summary        string          `json:"summary"`
	Kind           string          `json:"kind"`
	Status         string          `json:"status"`
	Manifest       json.RawMessage `json:"manifest"`
	Docs           string          `json:"docs"`
	Source         string          `json:"source"`
	CurrentVersion string          `json:"currentVersion"`
	CreatedAt      string          `json:"createdAt"`
	UpdatedAt      string          `json:"updatedAt"`
}

func wire(e *Extension) ExtensionWire {
	return ExtensionWire{
		ID: e.ID, Slug: e.Slug, Name: e.Name, Summary: e.Summary,
		Kind: e.Kind, Status: e.Status, Manifest: json.RawMessage(e.Manifest),
		Docs: e.Docs, Source: e.Source, CurrentVersion: e.CurrentVersion,
		CreatedAt: e.CreatedAt.Format(http.TimeFormat), UpdatedAt: e.UpdatedAt.Format(http.TimeFormat),
	}
}

// PublicList handles GET /api/public/extensions — every published
// extension, for the everyone-can-use registry. No auth: published means
// public. Creator names and install counts make it feel like a real
// marketplace shelf without exposing private data.
func (h *Handler) PublicList(w http.ResponseWriter, r *http.Request) {
	rows, err := h.service.PublicExtensions(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	type publicExt struct {
		ID        string `json:"id"`
		Slug      string `json:"slug"`
		Name      string `json:"name"`
		Summary   string `json:"summary"`
		Kind      string `json:"kind"`
		Version   string `json:"version"`
		Creator   string `json:"creator"`
		Installs  int    `json:"installs"`
		UpdatedAt string `json:"updatedAt"`
	}
	out := make([]publicExt, 0, len(rows))
	for _, row := range rows {
		out = append(out, publicExt{
			ID: row.ID, Slug: row.Slug, Name: row.Name, Summary: row.Summary,
			Kind: row.Kind, Version: row.CurrentVersion, Creator: row.Creator,
			Installs: row.Installs, UpdatedAt: row.UpdatedAt.Format(http.TimeFormat),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"extensions": out, "total": len(out)})
}

// Create handles POST /api/extensions.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	var body struct {
		Name     string          `json:"name"`
		Summary  string          `json:"summary"`
		Kind     string          `json:"kind"`
		Manifest json.RawMessage `json:"manifest"`
		Docs     string          `json:"docs"`
		Source   string          `json:"source"`
	}
	if err := decode(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	created, err := h.service.Create(r.Context(), current.ID, CreateInput{
		Name: body.Name, Summary: body.Summary, Kind: body.Kind,
		Manifest: body.Manifest, Docs: body.Docs, Source: body.Source,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]ExtensionWire{"extension": wire(created)})
}

// List handles GET /api/extensions.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	limit := DefaultListLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= MaxListLimit {
			limit = parsed
		}
	}
	items, err := h.service.List(r.Context(), current.ID, limit)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	wired := make([]ExtensionWire, 0, len(items))
	for i := range items {
		wired = append(wired, wire(&items[i]))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"extensions": wired, "total": len(wired)})
}

// Get handles GET /api/extensions/{id}.
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
	httpx.WriteJSON(w, http.StatusOK, map[string]ExtensionWire{"extension": wire(found)})
}

// Update handles PATCH /api/extensions/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	var body struct {
		Name     *string          `json:"name"`
		Summary  *string          `json:"summary"`
		Manifest *json.RawMessage `json:"manifest"`
		Docs     *string          `json:"docs"`
		Source   *string          `json:"source"`
	}
	if err := decode(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	var manifest []byte
	if body.Manifest != nil {
		manifest = *body.Manifest
	}
	updated, err := h.service.Update(r.Context(), current.ID, r.PathValue("id"),
		body.Name, body.Summary, manifest, body.Docs, body.Source)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ExtensionWire{"extension": wire(updated)})
}

// Delete handles DELETE /api/extensions/{id}.
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
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// SaveVersion handles POST /api/extensions/{id}/versions.
func (h *Handler) SaveVersion(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	var body struct {
		Version   string          `json:"version"`
		Manifest  json.RawMessage `json:"manifest"`
		Source    json.RawMessage `json:"source"`
		Changelog string          `json:"changelog"`
	}
	if err := decode(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	saved, err := h.service.SaveVersion(r.Context(), current.ID, r.PathValue("id"), SaveVersionInput{
		Version: body.Version, Manifest: body.Manifest, Source: body.Source, Changelog: body.Changelog,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ExtensionWire{"extension": wire(saved)})
}

// ListVersions handles GET /api/extensions/{id}/versions.
func (h *Handler) ListVersions(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	versions, err := h.service.Versions(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	wired := make([]map[string]any, 0, len(versions))
	for _, v := range versions {
		wired = append(wired, map[string]any{
			"version":   v.Version,
			"manifest":  json.RawMessage(v.Manifest),
			"source":    json.RawMessage(v.Source),
			"changelog": v.Changelog,
			"createdAt": v.CreatedAt,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"versions": wired})
}

// decode bounds and decodes a JSON body (mirrors project's decodeJSON use).
func decode(w http.ResponseWriter, r *http.Request, target any) error {
	return httpx.DecodeJSON(w, r, target, MaxManifestBytes)
}

// Publish handles POST /api/extensions/{id}/publish.
func (h *Handler) Publish(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	found, err := h.service.Publish(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]ExtensionWire{"extension": wire(found)})
}

// Build handles POST /api/extensions/{id}/build — runs the isolated worker
// pipeline and returns the step logs.
func (h *Handler) Build(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	var body struct {
		Version   string `json:"version"`
		Changelog string `json:"changelog"`
	}
	if err := decode(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	result, err := h.service.Build(r.Context(), current.ID, r.PathValue("id"), body.Version, body.Changelog)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"build": result})
}

// AIX handles GET /api/extensions/{id}/aix?version= — owner-only download
// of a verified built package.
func (h *Handler) AIX(w http.ResponseWriter, r *http.Request) {
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
	data, _, err := h.service.AIX(r.Context(), current.ID, r.PathValue("id"), r.URL.Query().Get("version"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", found.Slug+"-"+r.URL.Query().Get("version")+".aix"))
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// Install handles POST /api/extensions/{id}/install — pins the extension
// (free ecosystem) into the caller's installed set.
func (h *Handler) Install(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	found, err := h.service.Install(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"extension": wire(found), "installedVersion": found.CurrentVersion,
	})
}

// Uninstall handles DELETE /api/extensions/{id}/install.
func (h *Handler) Uninstall(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.Uninstall(r.Context(), current.ID, r.PathValue("id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Installed handles GET /api/me/extensions.
func (h *Handler) Installed(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	items, err := h.service.Installed(r.Context(), current.ID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	wired := make([]ExtensionWire, 0, len(items))
	for i := range items {
		wired = append(wired, wire(&items[i]))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"extensions": wired, "total": len(wired)})
}
