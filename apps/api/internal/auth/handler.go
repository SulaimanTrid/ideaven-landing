package auth

import (
	"net/http"
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
	Bio           string     `json:"bio"`
	AvatarURL     string     `json:"avatarUrl"`
	Locale        string     `json:"locale"`
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
		Bio:           u.Bio,
		AvatarURL:     u.AvatarURL,
		Locale:        u.Locale,
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

// UpdateProfile handles PATCH /api/profile. Authorization is implicit: the
// target user is always the one behind the session cookie, and the request
// body carries no user ID at all.
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue."))
		return
	}
	current, err := h.service.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	var body struct {
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
		Bio         string `json:"bio"`
		AvatarURL   string `json:"avatarUrl"`
		Locale      string `json:"locale"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}

	updated, err := h.service.UpdateProfile(r.Context(), current.ID, UpdateProfileInput{
		Username: body.Username, DisplayName: body.DisplayName, Bio: body.Bio, AvatarURL: body.AvatarURL,
		Locale:   body.Locale,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]SafeUser{"user": toSafeUser(updated)})
}

// ChangePassword handles POST /api/auth/change-password. Verifies the current
// password, stores the new one, and signs every other device out.
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue."))
		return
	}

	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, err)
		return
	}

	if err := h.service.ChangePassword(r.Context(), cookie.Value, body.CurrentPassword, body.NewPassword); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Password updated. Other devices have been signed out.",
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

// decodeJSON enforces a bounded, strictly-typed JSON body via the shared
// helper. Every auth POST requires an explicit application/json Content-Type:
// HTML forms cannot set it without a CORS preflight, which complements the
// SameSite cookie and origin checks as CSRF defense.
func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	return httpx.DecodeJSON(w, r, target, maxRequestBody)
}
