package asset

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// AuthenticateFunc resolves a session cookie token to its user; auth.Service
// satisfies it. Kept as an interface to avoid an import cycle.
type AuthenticateFunc func(ctx context.Context, token string) (*user.User, error)

// CookieConfig mirrors config.CookieConfig without importing the config package.
type CookieConfig struct {
	Name string
}

// Handler serves the asset endpoints.
type Handler struct {
	service *Service
	auth    AuthenticateFunc
	cookie  CookieConfig
}

// NewHandler builds the asset handler.
func NewHandler(service *Service, auth AuthenticateFunc, cookie CookieConfig) *Handler {
	return &Handler{service: service, auth: auth, cookie: cookie}
}

// AssetWire is the metadata wire shape (never the bytes).
type AssetWire struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Kind      string    `json:"kind"`
	Name      string    `json:"name"`
	MIME      string    `json:"mime"`
	Size      int       `json:"size"`
	SHA256    string    `json:"sha256"`
	CreatedAt time.Time `json:"createdAt"`
}

func wire(a *Asset) AssetWire {
	return AssetWire{
		ID: a.ID, ProjectID: a.ProjectID, Kind: a.Kind,
		Name: a.Name, MIME: a.MIME, Size: a.Size, SHA256: a.SHA256,
		CreatedAt: a.CreatedAt,
	}
}

// currentUser resolves the session from the cookie.
func (h *Handler) currentUser(r *http.Request) (*user.User, error) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
	}
	current, err := h.auth(r.Context(), cookie.Value)
	if err != nil {
		return nil, err
	}
	return current, nil
}

// Upload handles POST /api/projects/{id}/assets (multipart/form-data, field
// "file"; an optional "name" field overrides the display name).
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	file, fileName, err := readFileField(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	created, err := h.service.Create(r.Context(), current.ID, r.PathValue("id"), fileName, file)
	if err != nil {
		httpx.WriteError(w, h.serviceError(err))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]AssetWire{"asset": wire(created)})
}

// List handles GET /api/projects/{id}/assets.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	assets, err := h.service.List(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, h.serviceError(err))
		return
	}
	wires := make([]AssetWire, len(assets))
	for i := range assets {
		wires[i] = wire(&assets[i])
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"assets": wires})
}

// Raw handles GET /api/assets/{id}/raw — the authenticated image source the
// canvas and preview render.
func (h *Handler) Raw(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		// No valid session: an asset is still readable when — and only when —
		// its project is currently published (public page support). Otherwise
		// the original auth error stands and nothing is leaked.
		found, data, pubErr := h.service.PublicRawData(r.Context(), r.PathValue("id"))
		if pubErr != nil {
			httpx.WriteError(w, err)
			return
		}
		h.serveRaw(w, r, found, data, "public, max-age=31536000, immutable")
		return
	}

	found, data, err := h.service.RawData(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, h.serviceError(err))
		return
	}
	h.serveRaw(w, r, found, data, "private, max-age=86400, immutable")
}

// serveRaw writes the sniffed, allowlisted image bytes. Cache scope differs
// by audience: private for owner sessions, public for published projects.
func (h *Handler) serveRaw(w http.ResponseWriter, r *http.Request, found *Asset, data []byte, cache string) {
	// Asset IDs are stable and uploads never mutate content in place, so the
	// sha256 is a strong validator: cached copies stay correct forever and
	// revalidations answer 304 without resending bytes.
	etag := `"` + found.SHA256 + `"`
	w.Header().Set("ETag", etag)
	if etag != `""` && r.Header.Get("If-None-Match") == etag {
		w.Header().Set("Cache-Control", cache)
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", found.MIME)
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.Header().Set("Cache-Control", cache)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// Delete handles DELETE /api/assets/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	if err := h.service.Delete(r.Context(), current.ID, r.PathValue("id")); err != nil {
		httpx.WriteError(w, h.serviceError(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// serviceError maps service errors to HTTP responses. Errors that already
// carry an HTTP shape (the project authorizer's 404s) pass through;
// asset validation errors get their specific responses; anything else is an
// internal failure, never a silent 404.
func (h *Handler) serviceError(err error) *httpx.Error {
	var apiErr *httpx.Error
	if errors.As(err, &apiErr) {
		return apiErr
	}
	switch {
	case errors.Is(err, ErrNotFound):
		return httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "That asset does not exist.")
	case errors.Is(err, ErrTooLarge):
		return httpx.Errorf(http.StatusRequestEntityTooLarge, httpx.CodeValidation,
			fmt.Sprintf("Files must be %d MiB or smaller.", MaxAssetSize>>20))
	case errors.Is(err, ErrUnsupportedType):
		return httpx.Errorf(http.StatusUnsupportedMediaType, httpx.CodeValidation,
			"Only PNG, JPEG, WebP, and GIF images are supported.")
	case errors.Is(err, ErrTooMany):
		return httpx.Errorf(http.StatusForbidden, httpx.CodeValidation,
			fmt.Sprintf("A project can hold up to %d assets. Delete some first.", MaxAssetsPerProject))
	default:
		return httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Something went wrong on our side. Try again shortly.")
	}
}

// readFileField reads the single "file" field of a multipart request with a
// bounded in-memory buffer. maxUpload bounds the decoded file bytes; the
// reader fails (rather than truncates) past it.
const maxUpload = MaxAssetSize + 1<<20 // payload headroom for the form wrapper

func readFileField(r *http.Request) ([]byte, string, error) {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "multipart/form-data") {
		return nil, "", httpx.Errorf(http.StatusUnsupportedMediaType, httpx.CodeInvalidBody,
			"Uploads must be multipart/form-data.")
	}
	r.Body = http.MaxBytesReader(nil, r.Body, maxUpload)
	reader, err := r.MultipartReader()
	if err != nil {
		return nil, "", httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody,
			"Could not read the upload.")
	}

	var data []byte
	var name string
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, "", httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody,
				"Could not read the upload.")
		}
		if part.FormName() == "file" {
			data, err = io.ReadAll(io.LimitReader(part, maxUpload+1))
			if err != nil {
				return nil, "", httpx.Errorf(http.StatusRequestEntityTooLarge, httpx.CodeValidation,
					"Upload is too large.")
			}
			// The browser-supplied filename is the natural display name; an
			// optional separate "name" field, if present, wins below.
			name = strings.TrimSpace(part.FileName())
		} else if part.FormName() == "name" {
			raw, _ := io.ReadAll(io.LimitReader(part, 2*MaxNameLength))
			if explicit := strings.TrimSpace(string(raw)); explicit != "" {
				name = explicit
			}
		}
		part.Close()
	}
	if data == nil {
		return nil, "", httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation,
			"Choose a file to upload.")
	}
	return data, name, nil
}
