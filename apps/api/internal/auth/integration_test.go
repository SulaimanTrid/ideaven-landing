package auth_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"ideaven/apps/api/internal/auth"
	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/database"
)

// ---- test environment ------------------------------------------------------

// testDSN points at a scratch database; tests create and migrate it.
func testDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test?sslmode=disable"
}

var testSecret = bytes.Repeat([]byte{0x5a}, 32)

// captureMailer records outgoing links so tests can walk the email flows.
type captureMailer struct {
	verificationLinks []string
	resetLinks        []string
}

func (m *captureMailer) SendEmailVerification(ctx context.Context, to, link string) error {
	m.verificationLinks = append(m.verificationLinks, link)
	return nil
}

func (m *captureMailer) SendPasswordReset(ctx context.Context, to, link string) error {
	m.resetLinks = append(m.resetLinks, link)
	return nil
}

func (m *captureMailer) lastVerificationToken() string {
	if len(m.verificationLinks) == 0 {
		return ""
	}
	link := m.verificationLinks[len(m.verificationLinks)-1]
	if _, token, found := strings.Cut(link, "token="); found {
		return token
	}
	return ""
}

func (m *captureMailer) lastResetToken() string {
	if len(m.resetLinks) == 0 {
		return ""
	}
	link := m.resetLinks[len(m.resetLinks)-1]
	if _, token, found := strings.Cut(link, "token="); found {
		return token
	}
	return ""
}

type harness struct {
	db      *sql.DB
	mailer  *captureMailer
	handler http.Handler
	server  *httptest.Server
}

func newHarness(t *testing.T) *harness {
	t.Helper()

	dsn := testDSN()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := database.EnsureDatabase(ctx, dsn); err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	db, err := database.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Fresh data per test; FK cascades cover sessions and tokens.
	if _, err := db.Exec(`TRUNCATE users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	cfg := config.Config{
		Env:            config.EnvDevelopment,
		Addr:           ":0",
		ReadTimeout:    5 * time.Second,
		WriteTimeout:   5 * time.Second,
		AllowedOrigins: []string{"http://localhost:3000"},
		DatabaseURL:    dsn,
		SessionSecret:  testSecret,
		AppURL:         "http://localhost:3000",
		SessionTTL:     7 * 24 * time.Hour,
		ResetTokenTTL:  time.Hour,
		VerifyTokenTTL: 24 * time.Hour,
		Cookie: config.CookieConfig{
			Name: "ideaven_session", Secure: false, HTTPOnly: true,
			SameSite: "Lax", Path: "/", MaxAge: 7 * 24 * time.Hour,
		},
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	mailer := &captureMailer{}
	authHandler := auth.NewHandler(auth.NewService(db, cfg, mailer, logger), cfg.Cookie)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/auth/me", authHandler.Me)
	mux.HandleFunc("POST /api/auth/forgot-password", authHandler.ForgotPassword)
	mux.HandleFunc("POST /api/auth/validate-reset-token", authHandler.ValidateResetToken)
	mux.HandleFunc("POST /api/auth/reset-password", authHandler.ResetPassword)
	mux.HandleFunc("POST /api/auth/verify-email", authHandler.VerifyEmail)
	mux.HandleFunc("POST /api/auth/resend-verification", authHandler.ResendVerification)
	mux.HandleFunc("PATCH /api/profile", authHandler.UpdateProfile)
	mux.HandleFunc("POST /api/auth/change-password", authHandler.ChangePassword)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return &harness{db: db, mailer: mailer, handler: mux, server: server}
}

// call performs a JSON request against the harness server.
func call(t *testing.T, h *harness, method, path string, body any, cookie *http.Cookie) (*http.Response, map[string]any) {
	t.Helper()

	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, h.server.URL+path, reader)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}

	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	payload := map[string]any{}
	if res.ContentLength != 0 {
		raw, _ := io.ReadAll(res.Body)
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &payload); err != nil {
				t.Fatalf("%s %s: response is not JSON: %q", method, path, raw)
			}
		}
	}
	return res, payload
}

func sessionCookie(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if cookie.Name == "ideaven_session" && cookie.Value != "" {
			return cookie
		}
	}
	return nil
}

func errorCode(payload map[string]any) string {
	errObj, _ := payload["error"].(map[string]any)
	if errObj == nil {
		return ""
	}
	code, _ := errObj["code"].(string)
	return code
}

func userOf(payload map[string]any) map[string]any {
	user, _ := payload["user"].(map[string]any)
	return user
}

func register(t *testing.T, h *harness, email, username, password string) (*http.Response, map[string]any) {
	return call(t, h, http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "username": username, "password": password,
	}, nil)
}

// ---- registration ----------------------------------------------------------

func TestRegisterSuccess(t *testing.T) {
	h := newHarness(t)
	res, payload := register(t, h, "ada@example.com", "ada", "correct horse")

	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, body %v", res.StatusCode, payload)
	}
	user := userOf(payload)
	if user["email"] != "ada@example.com" || user["username"] != "ada" {
		t.Fatalf("unexpected user %v", user)
	}
	if user["displayName"] != "ada" {
		t.Fatalf("displayName should default to username, got %v", user["displayName"])
	}
	if user["emailVerified"] != false {
		t.Fatal("new accounts must start unverified")
	}
	if _, exists := user["passwordHash"]; exists {
		t.Fatal("password hash leaked in register response")
	}
	if user["id"] == "" || len(user["id"].(string)) != 36 {
		t.Fatalf("expected UUID id, got %v", user["id"])
	}

	cookie := sessionCookie(t, res)
	if cookie == nil {
		t.Fatal("register must set the session cookie")
	}
	for _, attribute := range []string{"HttpOnly", "SameSite=Lax"} {
		if !strings.Contains(cookie.String(), attribute) {
			t.Fatalf("cookie missing %s: %s", attribute, cookie.String())
		}
	}
	if cookie.Secure {
		t.Fatal("Secure must be off in development (http://localhost)")
	}
	if !strings.Contains(cookie.Value, ".") {
		t.Fatal("session cookie must be selector.verifier")
	}

	if len(h.mailer.verificationLinks) != 1 {
		t.Fatalf("expected exactly one verification email, got %d", len(h.mailer.verificationLinks))
	}
	if !strings.HasPrefix(h.mailer.lastVerificationToken(), "http://localhost:3000/verify-email?token=") {
		if h.mailer.verificationLinks[0] == "" {
			t.Fatal("empty verification link")
		}
	}
}

func TestRegisterDuplicateEmail(t *testing.T) {
	h := newHarness(t)
	register(t, h, "dup@example.com", "dup", "correct horse")
	res, payload := register(t, h, "dup@example.com", "other", "correct horse")

	if res.StatusCode != http.StatusConflict || errorCode(payload) != "EMAIL_TAKEN" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestRegisterDuplicateEmailCaseInsensitive(t *testing.T) {
	h := newHarness(t)
	register(t, h, "case@example.com", "case", "correct horse")
	res, payload := register(t, h, "CASE@example.com", "other", "correct horse")

	if res.StatusCode != http.StatusConflict || errorCode(payload) != "EMAIL_TAKEN" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestRegisterDuplicateUsername(t *testing.T) {
	h := newHarness(t)
	register(t, h, "one@example.com", "taken", "correct horse")
	res, payload := register(t, h, "two@example.com", "TAKEN", "correct horse")

	if res.StatusCode != http.StatusConflict || errorCode(payload) != "USERNAME_TAKEN" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestRegisterValidation(t *testing.T) {
	h := newHarness(t)
	cases := []struct {
		name, email, username, password, wantField string
	}{
		{"invalid email", "not-an-email", "validuser", "correct horse", "email"},
		{"short username", "a@example.com", "ab", "correct horse", "username"},
		{"bad username chars", "a@example.com", "has space", "correct horse", "username"},
		{"weak password", "a@example.com", "validuser", "short", "password"},
		{"padded password", "a@example.com", "validuser", " padded pw ", "password"},
	}
	for _, tc := range cases {
		res, payload := register(t, h, tc.email, tc.username, tc.password)
		if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "VALIDATION_ERROR" {
			t.Fatalf("%s: status=%d code=%s", tc.name, res.StatusCode, errorCode(payload))
		}
		errObj := payload["error"].(map[string]any)
		details, _ := errObj["details"].([]any)
		if len(details) == 0 || details[0].(map[string]any)["field"] != tc.wantField {
			t.Fatalf("%s: expected field error for %q, got %v", tc.name, tc.wantField, errObj)
		}
	}
}

// ---- login -----------------------------------------------------------------

func login(t *testing.T, h *harness, identifier, password string) (*http.Response, map[string]any) {
	return call(t, h, http.MethodPost, "/api/auth/login", map[string]string{
		"identifier": identifier, "password": password,
	}, nil)
}

func TestLoginWithEmailAndPassword(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")
	res, payload := login(t, h, "ada@example.com", "correct horse")

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %v", res.StatusCode, payload)
	}
	if userOf(payload)["username"] != "ada" {
		t.Fatalf("unexpected user %v", userOf(payload))
	}
	if sessionCookie(t, res) == nil {
		t.Fatal("login must set the session cookie")
	}
}

func TestLoginWithUsername(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")
	res, payload := login(t, h, "ada", "correct horse")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %v", res.StatusCode, payload)
	}
}

func TestLoginWrongPasswordAndUnknownAccountLookAlike(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")

	wrongRes, wrongPayload := login(t, h, "ada@example.com", "wrong password")
	unknownRes, unknownPayload := login(t, h, "ghost@example.com", "whatever password")

	if wrongRes.StatusCode != http.StatusUnauthorized || errorCode(wrongPayload) != "INVALID_CREDENTIALS" {
		t.Fatalf("wrong password: status=%d code=%s", wrongRes.StatusCode, errorCode(wrongPayload))
	}
	if unknownRes.StatusCode != http.StatusUnauthorized || errorCode(unknownPayload) != "INVALID_CREDENTIALS" {
		t.Fatalf("unknown account: status=%d code=%s", unknownRes.StatusCode, errorCode(unknownPayload))
	}
	if wrongPayload["error"].(map[string]any)["message"] != unknownPayload["error"].(map[string]any)["message"] {
		t.Fatal("login errors must not reveal whether the account exists")
	}
}

func TestLoginMissingFields(t *testing.T) {
	h := newHarness(t)
	res, payload := login(t, h, "", "")
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "VALIDATION_ERROR" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

// ---- session / me / logout ---------------------------------------------------

func TestMeRequiresSession(t *testing.T) {
	h := newHarness(t)
	res, payload := call(t, h, http.MethodGet, "/api/auth/me", nil, nil)
	if res.StatusCode != http.StatusUnauthorized || errorCode(payload) != "UNAUTHORIZED" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestMeWithSessionPersistsAcrossRequests(t *testing.T) {
	h := newHarness(t)
	regRes, _ := register(t, h, "ada@example.com", "ada", "correct horse")
	cookie := sessionCookie(t, regRes)

	// A second, independent request (like a browser refresh) must stay signed in.
	res, payload := call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %v", res.StatusCode, payload)
	}
	if userOf(payload)["email"] != "ada@example.com" {
		t.Fatalf("unexpected user %v", userOf(payload))
	}
}

func TestMeRejectsForgedVerifier(t *testing.T) {
	h := newHarness(t)
	regRes, _ := register(t, h, "ada@example.com", "ada", "correct horse")
	cookie := sessionCookie(t, regRes)

	selector, _, _ := strings.Cut(cookie.Value, ".")
	forged := &http.Cookie{Name: cookie.Name, Value: selector + ".FORGED-VERIFIER-VALUE"}
	res, payload := call(t, h, http.MethodGet, "/api/auth/me", nil, forged)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("forged verifier accepted: status=%d body=%v", res.StatusCode, payload)
	}
}

func TestMeRejectsExpiredSession(t *testing.T) {
	h := newHarness(t)
	regRes, _ := register(t, h, "ada@example.com", "ada", "correct horse")
	cookie := sessionCookie(t, regRes)
	selector, _, _ := strings.Cut(cookie.Value, ".")

	if _, err := h.db.Exec(`UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE selector = $1`, selector); err != nil {
		t.Fatalf("age session: %v", err)
	}
	res, payload := call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expired session accepted: status=%d body=%v", res.StatusCode, payload)
	}
}

func TestLogoutInvalidatesSession(t *testing.T) {
	h := newHarness(t)
	regRes, _ := register(t, h, "ada@example.com", "ada", "correct horse")
	cookie := sessionCookie(t, regRes)

	res, payload := call(t, h, http.MethodPost, "/api/auth/logout", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("logout status=%d body=%v", res.StatusCode, payload)
	}

	// Cookie must be expired in the response.
	var cleared bool
	for _, c := range res.Cookies() {
		if c.Name == "ideaven_session" && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Fatal("logout must expire the session cookie")
	}

	// The old cookie must no longer authenticate.
	res, payload = call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("session survived logout: status=%d body=%v", res.StatusCode, payload)
	}
}

// ---- password reset ----------------------------------------------------------

func TestForgotPasswordSendsResetLink(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")

	res, payload := call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "ada@example.com"}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%v", res.StatusCode, payload)
	}
	if len(h.mailer.resetLinks) != 1 {
		t.Fatalf("expected one reset email, got %d", len(h.mailer.resetLinks))
	}
	if !strings.Contains(h.mailer.resetLinks[0], "/reset-password?token=") {
		t.Fatalf("reset link malformed: %s", h.mailer.resetLinks[0])
	}
}

func TestForgotPasswordUnknownEmailIsOpaque(t *testing.T) {
	h := newHarness(t)
	knownRes, knownPayload := call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "known@example.com"}, nil)
	register(t, h, "known@example.com", "known", "correct horse")
	unknownRes, unknownPayload := call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "unknown@example.com"}, nil)

	// Same status and message shape whether or not the account exists.
	if knownRes.StatusCode != unknownRes.StatusCode || knownPayload["message"] != unknownPayload["message"] {
		t.Fatalf("forgot-password leaks account existence: %v vs %v", knownPayload, unknownPayload)
	}
	if len(h.mailer.resetLinks) != 0 {
		t.Fatal("no reset email may be sent for unknown addresses")
	}
}

func TestResetPasswordFlow(t *testing.T) {
	h := newHarness(t)
	regRes, _ := register(t, h, "ada@example.com", "ada", "old password")
	oldCookie := sessionCookie(t, regRes)

	call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "ada@example.com"}, nil)
	token := h.mailer.lastResetToken()
	if token == "" {
		t.Fatal("no reset token captured")
	}

	res, payload := call(t, h, http.MethodPost, "/api/auth/reset-password", map[string]string{"token": token, "password": "brand new password"}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("reset status=%d body=%v", res.StatusCode, payload)
	}

	// Old sessions are revoked by the reset.
	res, payload = call(t, h, http.MethodGet, "/api/auth/me", nil, oldCookie)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("old session survived password reset: status=%d", res.StatusCode)
	}

	// Old password rejected, new password accepted.
	if res, _ := login(t, h, "ada@example.com", "old password"); res.StatusCode != http.StatusUnauthorized {
		t.Fatal("old password still works after reset")
	}
	if res, _ := login(t, h, "ada@example.com", "brand new password"); res.StatusCode != http.StatusOK {
		t.Fatal("new password rejected after reset")
	}
}

func TestResetPasswordTokenSingleUse(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "old password")
	call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "ada@example.com"}, nil)
	token := h.mailer.lastResetToken()

	first, _ := call(t, h, http.MethodPost, "/api/auth/reset-password", map[string]string{"token": token, "password": "first new password"}, nil)
	second, secondPayload := call(t, h, http.MethodPost, "/api/auth/reset-password", map[string]string{"token": token, "password": "second new password"}, nil)

	if first.StatusCode != http.StatusOK {
		t.Fatalf("first use failed: %d", first.StatusCode)
	}
	if second.StatusCode != http.StatusBadRequest || errorCode(secondPayload) != "TOKEN_INVALID" {
		t.Fatalf("token reuse accepted: status=%d code=%s", second.StatusCode, errorCode(secondPayload))
	}
}

func TestResetPasswordExpiredToken(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "old password")
	call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "ada@example.com"}, nil)
	token := h.mailer.lastResetToken()
	selector, _, _ := strings.Cut(token, ".")

	if _, err := h.db.Exec(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 hour' WHERE selector = $1`, selector); err != nil {
		t.Fatalf("age token: %v", err)
	}
	res, payload := call(t, h, http.MethodPost, "/api/auth/reset-password", map[string]string{"token": token, "password": "brand new password"}, nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "TOKEN_EXPIRED" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestResetPasswordGarbageToken(t *testing.T) {
	h := newHarness(t)
	res, payload := call(t, h, http.MethodPost, "/api/auth/reset-password", map[string]string{"token": "garbage.token", "password": "brand new password"}, nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "TOKEN_INVALID" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestValidateResetToken(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")
	call(t, h, http.MethodPost, "/api/auth/forgot-password", map[string]string{"email": "ada@example.com"}, nil)
	token := h.mailer.lastResetToken()

	res, payload := call(t, h, http.MethodPost, "/api/auth/validate-reset-token", map[string]string{"token": token}, nil)
	if res.StatusCode != http.StatusOK || payload["valid"] != true {
		t.Fatalf("valid token rejected: %d %v", res.StatusCode, payload)
	}
	res, payload = call(t, h, http.MethodPost, "/api/auth/validate-reset-token", map[string]string{"token": "nope.nope"}, nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "TOKEN_INVALID" {
		t.Fatalf("invalid token accepted: %d %v", res.StatusCode, payload)
	}
}

// ---- email verification -------------------------------------------------------

func TestVerifyEmailFlow(t *testing.T) {
	h := newHarness(t)
	regRes, _ := register(t, h, "ada@example.com", "ada", "correct horse")
	cookie := sessionCookie(t, regRes)
	token := h.mailer.lastVerificationToken()
	if token == "" {
		t.Fatal("no verification token captured")
	}

	res, payload := call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": token}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("verify status=%d body=%v", res.StatusCode, payload)
	}

	res, payload = call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	if res.StatusCode != http.StatusOK || userOf(payload)["emailVerified"] != true {
		t.Fatalf("emailVerified not set: %d %v", res.StatusCode, userOf(payload))
	}
}

func TestVerifyEmailTokenSingleUseAndInvalid(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")
	token := h.mailer.lastVerificationToken()

	if res, _ := call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": token}, nil); res.StatusCode != http.StatusOK {
		t.Fatal("first verification failed")
	}
	res, payload := call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": token}, nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "TOKEN_INVALID" {
		t.Fatalf("reuse accepted: status=%d code=%s", res.StatusCode, errorCode(payload))
	}

	res, payload = call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": "bad.token"}, nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "TOKEN_INVALID" {
		t.Fatalf("garbage accepted: status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestVerifyEmailExpiredToken(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")
	token := h.mailer.lastVerificationToken()
	selector, _, _ := strings.Cut(token, ".")

	if _, err := h.db.Exec(`UPDATE email_verification_tokens SET expires_at = now() - interval '1 hour' WHERE selector = $1`, selector); err != nil {
		t.Fatalf("age token: %v", err)
	}
	res, payload := call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": token}, nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "TOKEN_EXPIRED" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

func TestResendVerificationIssuesNewToken(t *testing.T) {
	h := newHarness(t)
	register(t, h, "ada@example.com", "ada", "correct horse")
	first := h.mailer.lastVerificationToken()

	res, payload := call(t, h, http.MethodPost, "/api/auth/resend-verification", map[string]string{"email": "ada@example.com"}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("resend status=%d body=%v", res.StatusCode, payload)
	}
	second := h.mailer.lastVerificationToken()
	if second == "" || second == first {
		t.Fatal("resend must issue a fresh token")
	}

	// Old token is replaced — only the newest works.
	if res, _ := call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": first}, nil); res.StatusCode != http.StatusBadRequest {
		t.Fatal("superseded verification token still works")
	}
	if res, _ := call(t, h, http.MethodPost, "/api/auth/verify-email", map[string]string{"token": second}, nil); res.StatusCode != http.StatusOK {
		t.Fatal("new verification token rejected")
	}
}

// ---- transport hardening -------------------------------------------------------

func TestPostRequiresJSONContentType(t *testing.T) {
	h := newHarness(t)
	req, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/auth/login", strings.NewReader(`{"identifier":"a","password":"b"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "text/plain")
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("non-JSON content type returned %d, want 415", res.StatusCode)
	}
}

func TestUnknownFieldsAndTrailingGarbageRejected(t *testing.T) {
	h := newHarness(t)
	res, payload := call(t, h, http.MethodPost, "/api/auth/login", json.RawMessage(`{"identifier":"a","password":"b","extra":1}`), nil)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "INVALID_REQUEST_BODY" {
		t.Fatalf("unknown field accepted: %d %v", res.StatusCode, payload)
	}

	req, _ := http.NewRequest(http.MethodPost, h.server.URL+"/api/auth/login", strings.NewReader(`{"identifier":"a"} {"second":"object"}`))
	req.Header.Set("Content-Type", "application/json")
	res2, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res2.Body.Close()
	if res2.StatusCode != http.StatusBadRequest {
		t.Fatalf("trailing garbage accepted: %d", res2.StatusCode)
	}
}

// ---- profile & account ------------------------------------------------------

func TestUpdateProfileRequiresSession(t *testing.T) {
	h := newHarness(t)
	res, payload := call(t, h, http.MethodPatch, "/api/profile", map[string]string{
		"username": "intruder", "displayName": "X", "bio": "", "avatarUrl": "",
	}, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}
	if errorCode(payload) != "UNAUTHORIZED" {
		t.Fatalf("code = %q, want UNAUTHORIZED", errorCode(payload))
	}
}

func TestUpdateProfileRewritesFieldsAndPersists(t *testing.T) {
	h := newHarness(t)
	res, _ := register(t, h, "profile@ideaven.test", "profileuser", "Correct-Horse-9")
	cookie := sessionCookie(t, res)
	if cookie == nil {
		t.Fatal("register did not set a session cookie")
	}

	res, payload := call(t, h, http.MethodPatch, "/api/profile", map[string]string{
		"username": "renameduser", "displayName": "Renamed", "bio": "I build tiny games.",
		"avatarUrl": "https://cdn.example.com/a.png",
	}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	user := userOf(payload)
	if user["username"] != "renameduser" || user["displayName"] != "Renamed" ||
		user["bio"] != "I build tiny games." || user["avatarUrl"] != "https://cdn.example.com/a.png" {
		t.Fatalf("updated fields wrong: %v", user)
	}
	// ID is immutable and untouched.
	if user["id"] == "" {
		t.Fatal("id missing from response")
	}

	// The change persists through a fresh GET /me.
	res, payload = call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me status = %d", res.StatusCode)
	}
	if userOf(payload)["username"] != "renameduser" {
		t.Fatalf("username did not persist: %v", payload)
	}
}

func TestUpdateProfileUsernameUniqueness(t *testing.T) {
	h := newHarness(t)
	res, _ := register(t, h, "first@ideaven.test", "firstuser", "Correct-Horse-9")
	_ = sessionCookie(t, res)
	res, _ = register(t, h, "second@ideaven.test", "seconduser", "Correct-Horse-9")
	cookie := sessionCookie(t, res)

	// Taking the other user's handle fails with a field-scoped error.
	res, payload := call(t, h, http.MethodPatch, "/api/profile", map[string]string{
		"username": "FIRSTUSER", "displayName": "", "bio": "", "avatarUrl": "",
	}, cookie)
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want 409", res.StatusCode)
	}
	if errorCode(payload) != "USERNAME_TAKEN" {
		t.Fatalf("code = %q, want USERNAME_TAKEN", errorCode(payload))
	}

	// Keeping your own handle (case change) is not a conflict.
	res, payload = call(t, h, http.MethodPatch, "/api/profile", map[string]string{
		"username": "SecondUser", "displayName": "", "bio": "", "avatarUrl": "",
	}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("own-handle status = %d, payload %v", res.StatusCode, payload)
	}
}

func TestUpdateProfileValidation(t *testing.T) {
	h := newHarness(t)
	res, _ := register(t, h, "valid@ideaven.test", "validuser", "Correct-Horse-9")
	cookie := sessionCookie(t, res)

	cases := []struct {
		name   string
		body   map[string]string
		field  string
		expect string
	}{
		{"short username", map[string]string{"username": "ab", "displayName": "", "bio": "", "avatarUrl": ""}, "username", "VALIDATION_ERROR"},
		{"bad username chars", map[string]string{"username": "not allowed!", "displayName": "", "bio": "", "avatarUrl": ""}, "username", "VALIDATION_ERROR"},
		{"long bio", map[string]string{"username": "validuser", "displayName": "", "bio": strings.Repeat("x", 281), "avatarUrl": ""}, "bio", "VALIDATION_ERROR"},
		{"bad avatar scheme", map[string]string{"username": "validuser", "displayName": "", "bio": "", "avatarUrl": "javascript:alert(1)"}, "avatarUrl", "VALIDATION_ERROR"},
	}
	for _, tc := range cases {
		res, payload := call(t, h, http.MethodPatch, "/api/profile", tc.body, cookie)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", tc.name, res.StatusCode)
		}
		if errorCode(payload) != tc.expect {
			t.Fatalf("%s: code = %q", tc.name, errorCode(payload))
		}
		errObj, _ := payload["error"].(map[string]any)
		details, _ := errObj["details"].([]any)
		if len(details) == 0 {
			t.Fatalf("%s: expected field details", tc.name)
		}
		first, _ := details[0].(map[string]any)
		if first["field"] != tc.field {
			t.Fatalf("%s: detail field = %v, want %s", tc.name, first["field"], tc.field)
		}
	}
}

func TestChangePasswordFlow(t *testing.T) {
	h := newHarness(t)
	res, _ := register(t, h, "changer@ideaven.test", "changer", "Correct-Horse-9")
	cookie := sessionCookie(t, res)

	// Wrong current password is rejected without revealing more.
	res, payload := call(t, h, http.MethodPost, "/api/auth/change-password", map[string]string{
		"currentPassword": "wrong-pass-1", "newPassword": "New-Stable-7",
	}, cookie)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong-current status = %d, payload %v", res.StatusCode, payload)
	}

	// A second device (session) exists before the change.
	res, _ = call(t, h, http.MethodPost, "/api/auth/login", map[string]string{
		"identifier": "changer", "password": "Correct-Horse-9",
	}, nil)
	otherCookie := sessionCookie(t, res)
	if otherCookie == nil {
		t.Fatal("second login did not set a cookie")
	}

	// Correct change: this device stays signed in.
	res, payload = call(t, h, http.MethodPost, "/api/auth/change-password", map[string]string{
		"currentPassword": "Correct-Horse-9", "newPassword": "New-Stable-7",
	}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("change status = %d, payload %v", res.StatusCode, payload)
	}

	res, _ = call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatal("current device was signed out by its own password change")
	}

	// The other device was revoked.
	res, _ = call(t, h, http.MethodGet, "/api/auth/me", nil, otherCookie)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatal("other device survived the password change")
	}

	// The old password no longer works; the new one does.
	res, _ = call(t, h, http.MethodPost, "/api/auth/login", map[string]string{
		"identifier": "changer", "password": "Correct-Horse-9",
	}, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatal("old password still accepted")
	}
	res, _ = call(t, h, http.MethodPost, "/api/auth/login", map[string]string{
		"identifier": "changer", "password": "New-Stable-7",
	}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatal("new password rejected")
	}
}

func TestChangePasswordRequiresSession(t *testing.T) {
	h := newHarness(t)
	res, payload := call(t, h, http.MethodPost, "/api/auth/change-password", map[string]string{
		"currentPassword": "x", "newPassword": "New-Stable-7",
	}, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}
	if errorCode(payload) != "UNAUTHORIZED" {
		t.Fatalf("code = %q", errorCode(payload))
	}
}

func TestMeIncludesBio(t *testing.T) {
	h := newHarness(t)
	res, _ := register(t, h, "bio@ideaven.test", "biouser", "Correct-Horse-9")
	cookie := sessionCookie(t, res)

	res, payload := call(t, h, http.MethodGet, "/api/auth/me", nil, cookie)
	user := userOf(payload)
	if _, present := user["bio"]; !present {
		t.Fatal("bio missing from /me payload")
	}
	if _, present := user["passwordHash"]; present {
		t.Fatal("password hash leaked into /me payload")
	}
}
