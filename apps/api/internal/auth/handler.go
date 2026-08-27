package auth

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// Handler translates HTTP requests into Service calls.
type Handler struct {
	service *Service
	cookie  config.CookieConfig
}

// NewHandler builds the auth handler.
func NewHandler(service *Service, cookie config.CookieConfig) *Handler {
	return &Handler{service: service, cookie: cookie}
}

// maxRequestBody bounds JSON payloads (requests are tiny by design).
const maxRequestBody = 4 << 10

// SafeUser is the wire shape of a user. The password hash and internal
// timestamps that clients never need are excluded by construction.
type SafeUser struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	Username      string     `json:"username"`
	DisplayName   string     `json:"displayName"`
	AvatarURL     string     `json:"avatarUrl"`
	EmailVerified bool       `json:"emailVerified"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	LastLoginAt   *time.Time `json:"lastLoginAt"`
}

func toSafeUser(u *user.User) SafeUser {
	return SafeUser{
		ID:            u.ID,
		Email:         u.Email,
		Username:      u.Username,
		DisplayName:   u.DisplayName,
		AvatarURL:     u.AvatarURL,
		EmailVerified: u.EmailVerified,
		CreatedAt:     u.CreatedAt,
		UpdatedAt:     u.UpdatedAt,
		LastLoginAt:   u.LastLoginAt,
	}
}

// Register handles POST /api/auth/register.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		Username    string `json:"username"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}

	created, token, err := h.service.Register(r.Context(), RegisterInput{
		Email: body.Email, Username: body.Username, Password: body.Password, DisplayName: body.DisplayName,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.setSessionCookie(w, token, int(h.cookie.MaxAge.Seconds()))
	httpx.WriteJSON(w, http.StatusCreated, map[string]SafeUser{"user": toSafeUser(created)})
}

// Login handles POST /api/auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}

	found, token, err := h.service.Login(r.Context(), body.Identifier, body.Password)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.setSessionCookie(w, token, int(h.cookie.MaxAge.Seconds()))
	httpx.WriteJSON(w, http.StatusOK, map[string]SafeUser{"user": toSafeUser(found)})
}

// Logout handles POST /api/auth/logout. Always 200 — logout is idempotent.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(h.cookie.Name); err == nil {
		if err := h.service.Logout(r.Context(), cookie.Value); err != nil {
			httpx.WriteError(w, err)
			return
		}
	}
	h.clearSessionCookie(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me handles GET /api/auth/me.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue."))
		return
	}
	found, err := h.service.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]SafeUser{"user": toSafeUser(found)})
}

// ForgotPassword handles POST /api/auth/forgot-password. The response is
// identical whether or not the address has an account.
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.ForgotPassword(r.Context(), body.Email); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "If an account exists for that address, a reset link is on its way.",
	})
}

// ValidateResetToken handles POST /api/auth/validate-reset-token — lets the
// reset page reject a dead link before asking for a new password. It does not
// consume the token.
func (h *Handler) ValidateResetToken(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.ValidateResetToken(r.Context(), body.Token); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"valid": true})
}

// ResetPassword handles POST /api/auth/reset-password.
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.ResetPassword(r.Context(), body.Token, body.Password); err != nil {
		httpx.WriteError(w, err)
		return
	}
	h.clearSessionCookie(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Your password has been updated. Sign in with your new password.",
	})
}

// VerifyEmail handles POST /api/auth/verify-email.
func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.VerifyEmail(r.Context(), body.Token); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"message": "Your email is verified. Welcome to Ideaven!"})
}

// ResendVerification handles POST /api/auth/resend-verification.
func (h *Handler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.ResendVerification(r.Context(), body.Email); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "If that address needs verification, a new link is on its way.",
	})
}

// setSessionCookie writes the hardened session cookie.
func (h *Handler) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookie.Name,
		Value:    token,
		Path:     h.cookie.Path,
		MaxAge:   maxAge,
		HttpOnly: h.cookie.HTTPOnly,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// clearSessionCookie expires the session cookie immediately.
func (h *Handler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cookie.Name,
		Value:    "",
		Path:     h.cookie.Path,
		MaxAge:   -1,
		HttpOnly: h.cookie.HTTPOnly,
		Secure:   h.cookie.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// decodeJSON enforces a bounded, strictly-typed JSON body. Every auth POST
// also requires an explicit application/json Content-Type: HTML forms cannot
// set it without a CORS preflight, which complements the SameSite cookie and
// origin checks as CSRF defense.
func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(strings.ToLower(ct), "application/json") {
		return httpx.Errorf(http.StatusUnsupportedMediaType, httpx.CodeInvalidBody, "Requests must be JSON (Content-Type: application/json).")
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBody+1))
	if err != nil {
		return httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "Could not read the request body.")
	}
	if len(body) > maxRequestBody {
		return httpx.Errorf(http.StatusRequestEntityTooLarge, httpx.CodeInvalidBody, "Request body is too large.")
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "The request body is not valid JSON.")
	}
	if err := ensureConsumed(decoder); err != nil {
		return err
	}
	return nil
}

func ensureConsumed(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "The request body must contain a single JSON object.")
	}
	return nil
}
