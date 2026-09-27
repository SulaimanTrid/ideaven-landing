package credits

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// maxWebhookBody bounds provider callbacks.
const maxWebhookBody = 64 << 10

// AuthenticateFunc resolves a session cookie token to its user; auth.Service
// satisfies it. Kept as an interface to avoid an import cycle.
type AuthenticateFunc func(ctx context.Context, token string) (*user.User, error)

// CookieConfig mirrors config.CookieConfig without importing the config package.
type CookieConfig struct {
	Name string
}

// Handler serves the credit purchase endpoints.
type Handler struct {
	service *Service
	auth    AuthenticateFunc
	cookie  CookieConfig
}

// NewHandler builds the credits handler.
func NewHandler(service *Service, auth AuthenticateFunc, cookie CookieConfig) *Handler {
	return &Handler{service: service, auth: auth, cookie: cookie}
}

// currentUser resolves the session user or writes the 401 and returns nil.
func (h *Handler) currentUser(w http.ResponseWriter, r *http.Request) (*user.User, error) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		err := httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
		httpx.WriteError(w, err)
		return nil, err
	}
	current, err := h.auth(r.Context(), cookie.Value)
	if err != nil {
		httpx.WriteError(w, err)
		return nil, err
	}
	return current, nil
}

// Packages handles GET /api/credits/packages — the server-authoritative pack
// list for both the pricing surface and the contextual purchase modal.
// Sensitive routing is unnecessary here: packages are public product data.
func (h *Handler) Packages(w http.ResponseWriter, r *http.Request) {
	packages, err := h.service.Packages(r.Context())
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Could not load credit packs. Try again shortly."))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"packages":         packages,
		"purchaseAvailable": h.service.PurchaseAvailable(),
	})
}

// CreatePurchase handles POST /api/credits/purchases — starts one purchase.
// The client sends ONLY the package id and an app return path; everything
// money-shaped (price, currency, credits) is resolved from the server's own
// package table.
func (h *Handler) CreatePurchase(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(w, r)
	if err != nil {
		return
	}
	var body struct {
		PackageID  string `json:"packageId"`
		ReturnPath string `json:"returnPath"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 4<<10); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if strings.TrimSpace(body.PackageID) == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation,
			"Choose a credit pack first.").WithDetails(httpx.FieldError{
			Field: "packageId", Message: "A credit pack is required.",
		}))
		return
	}

	p, err := h.service.CreatePurchase(r.Context(), current.ID, body.PackageID, body.ReturnPath)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"purchase": p})
}

// GetPurchase handles GET /api/credits/purchases/{id} — owner-scoped status,
// polled after returning from hosted checkout.
func (h *Handler) GetPurchase(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(w, r)
	if err != nil {
		return
	}
	p, err := h.service.GetPurchase(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"purchase": p})
}

// Webhook handles POST /api/credits/webhook — the single provider callback
// endpoint. The raw body + headers go to the provider's Verify; nothing is
// trusted from the payload shape itself. Every acknowledged event answers
// 200 (replays included, as no-ops) so the provider stops retrying.
func (h *Handler) Webhook(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookBody+1))
	if err != nil || len(raw) > maxWebhookBody {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody,
			"Could not read the payment event."))
		return
	}
	if err := h.service.HandleWebhook(r.Context(), r.PathValue("provider"), raw, r.Header); err != nil {
		if errors.Is(err, ErrProviderUnavailable) {
			httpx.WriteError(w, httpx.Errorf(http.StatusServiceUnavailable, "PURCHASE_UNAVAILABLE",
				"Credit purchases are coming soon — the payment integration is not live yet."))
			return
		}
		var apiErr *httpx.Error
		if errors.As(err, &apiErr) && apiErr.Code == "PURCHASE_NOT_FOUND" {
			// Unknown event for this provider: acknowledge so it is not retried
			// forever, but record it — it may indicate misconfiguration.
			slog.Warn("credits: webhook did not match a purchase", "err", err.Error())
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
			return
		}
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
