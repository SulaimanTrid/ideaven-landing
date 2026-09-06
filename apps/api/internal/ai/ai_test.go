package ai

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/database"
	"ideaven/apps/api/internal/user"
)

// ---- test environment -----------------------------------------------------------

func testDSN(t *testing.T) string {
	t.Helper()
	if dsn := testDSNEnv(); dsn != "" {
		return dsn
	}
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test_ai?sslmode=disable"
}

func newTestHandler(t *testing.T, providerOutput string, providerStatus int) (*Handler, *httptest.Server, *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	dsn := testDSN(t)
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
	if _, err := db.Exec(`TRUNCATE users, ai_usage CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	// The mock authenticate returns this fixed user; create the row so usage
	// logging satisfies its foreign key.
	if _, err := db.Exec(`INSERT INTO users (id, email, username, password_hash, display_name)
		VALUES ('11111111-1111-1111-1111-111111111111', 'ai@ideaven.test', 'aiuser', 'x', 'AI Tester')`); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	provider := &mockProvider{output: providerOutput, status: providerStatus}
	handler := NewHandler(provider, testAuthenticate, db, CookieConfig{Name: "ideaven_session"})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/ai/command":
			handler.Command(w, r)
			return
		case "/api/ai/credits":
			handler.Credits(w, r)
			return
		case "/api/ai/credits/activity":
			handler.CreditActivity(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	return handler, server, db
}

type mockProvider struct {
	output string
	status int
	calls  int
}

func (p *mockProvider) Complete(ctx context.Context, system, user string) (string, error) {
	p.calls++
	if p.status != http.StatusOK {
		return "", errors.New("provider down")
	}
	return p.output, nil
}
func (p *mockProvider) Name() string  { return "mock" }
func (p *mockProvider) Model() string { return "mock-1" }

// testAuthenticate stands in for auth.Service.Authenticate.
func testAuthenticate(ctx context.Context, token string) (*user.User, error) {
	if token != "test-session" {
		return nil, errors.New("unauthorized")
	}
	return &user.User{ID: "11111111-1111-1111-1111-111111111111", Email: "ai@ideaven.test", Username: "aiuser"}, nil
}

func testDSNEnv() string { return "" }

func post(t *testing.T, server *httptest.Server, body string, cookie string) (*http.Response, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, server.URL+"/api/ai/command", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "ideaven_session", Value: cookie})
	}
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := ioReadAll(res.Body)
	payload := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("non-JSON response: %q", raw)
		}
	}
	return res, payload
}

// ---- tests ------------------------------------------------------------------------

const goodOutput = `{"explanation":"Adds a heading.","operations":[` +
	`{"op":"createComponent","screenId":"screen-home","componentType":"text","props":{"text":"Hello"}}]}`

func TestCommandUnconfiguredProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	dsn := testDSN(t)
	if err := database.EnsureDatabase(ctx, dsn); err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	db, err := database.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.Migrate(db); err != nil {
		t.Fatal(err)
	}

	unconfigured := NewHandler(nil, testAuthenticate, db, CookieConfig{Name: "ideaven_session"})
	server := httptest.NewServer(http.HandlerFunc(unconfigured.Command))
	t.Cleanup(server.Close)

	res, payload := post(t, server, `{"prompt":"hi"}`, "test-session")
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
	if codeOf(payload) != "AI_NOT_CONFIGURED" {
		t.Fatalf("code = %v", payload)
	}
}

func TestCommandRequiresSession(t *testing.T) {
	_, server, _ := newTestHandler(t, goodOutput, http.StatusOK)
	res, payload := post(t, server, `{"prompt":"hi"}`, "")
	if res.StatusCode != http.StatusUnauthorized || codeOf(payload) != "UNAUTHORIZED" {
		t.Fatalf("status=%d code=%v", res.StatusCode, payload)
	}
}

func TestCommandReturnsValidatedOperations(t *testing.T) {
	_, server, _ := newTestHandler(t, goodOutput, http.StatusOK)
	res, payload := post(t, server, `{"prompt":"Add a heading","context":[{"kind":"project","data":{"name":"Demo","type":"app"}}]}`, "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	ops, _ := payload["operations"].([]any)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %v", payload)
	}
	if payload["explanation"] != "Adds a heading." {
		t.Fatalf("explanation missing: %v", payload)
	}
}

func TestCommandRejectsUnknownOperation(t *testing.T) {
	bad := `{"explanation":"x","operations":[{"op":"formatDisk"}]}`
	_, server, _ := newTestHandler(t, bad, http.StatusOK)
	res, payload := post(t, server, `{"prompt":"x"}`, "test-session")
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", res.StatusCode)
	}
	if codeOf(payload) != "AI_PROVIDER_ERROR" {
		t.Fatalf("code = %v", payload)
	}
}

func TestCommandToleratesMarkdownFences(t *testing.T) {
	fenced := "```json\n" + goodOutput + "\n```"
	_, server, _ := newTestHandler(t, fenced, http.StatusOK)
	res, payload := post(t, server, `{"prompt":"x"}`, "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	if ops, _ := payload["operations"].([]any); len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %v", payload)
	}
}

func TestCommandProviderFailure(t *testing.T) {
	_, server, _ := newTestHandler(t, "", http.StatusBadGateway)
	res, payload := post(t, server, `{"prompt":"x"}`, "test-session")
	if res.StatusCode != http.StatusBadGateway || codeOf(payload) != "AI_PROVIDER_ERROR" {
		t.Fatalf("status=%d code=%v", res.StatusCode, payload)
	}
}

func TestCommandValidationAndUsageRow(t *testing.T) {
	handler, server, _ := newTestHandler(t, goodOutput, http.StatusOK)

	// Empty prompt is a validation error.
	res, payload := post(t, server, `{"prompt":"  "}`, "test-session")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("blank prompt status = %d", res.StatusCode)
	}

	// Unknown fields are rejected (strict decoding).
	res, payload = post(t, server, `{"prompt":"x","surprise":1}`, "test-session")
	if res.StatusCode != http.StatusBadRequest || codeOf(payload) != "INVALID_REQUEST_BODY" {
		t.Fatalf("unknown field: status=%d code=%v", res.StatusCode, payload)
	}

	// A successful call records a usage row.
	res, _ = post(t, server, `{"prompt":"Add a heading","projectId":"22222222-2222-2222-2222-222222222222"}`, "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("ok path status = %d", res.StatusCode)
	}
	var count int
	if err := handler.usage.db.QueryRow(`SELECT count(*) FROM ai_usage WHERE ok = true`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected 1 usage row, got %d", count)
	}
}

// config.LoadProvider is exercised separately (no DB needed).
func TestLoadProvider(t *testing.T) {
	if LoadProvider(mapEnv(nil), nil) != nil {
		t.Fatal("no env must mean no provider")
	}
	if LoadProvider(mapEnv(map[string]string{"AI_PROVIDER": "openai"}), nil) != nil {
		t.Fatal("provider without key must be nil")
	}
	p := LoadProvider(mapEnv(map[string]string{"AI_PROVIDER": "openai", "AI_API_KEY": "k"}), nil)
	if p == nil || p.Name() != "openai" || p.Model() != "gpt-4o-mini" {
		t.Fatalf("openai provider wrong: %v", p)
	}
	p = LoadProvider(mapEnv(map[string]string{"AI_PROVIDER": "anthropic", "AI_API_KEY": "k", "AI_MODEL": "m1", "AI_BASE_URL": "http://x/"}), nil)
	if p == nil || p.Name() != "anthropic" || p.Model() != "m1" {
		t.Fatalf("anthropic provider wrong: %v", p)
	}
}

func mapEnv(m map[string]string) func(string) string {
	return func(key string) string { return m[key] }
}

// ---- shared test helpers ------------------------------------------------------------

func codeOf(payload map[string]any) string {
	errObj, _ := payload["error"].(map[string]any)
	if errObj == nil {
		return ""
	}
	code, _ := errObj["code"].(string)
	return code
}

var _ = config.EnvDevelopment
var _ = sql.ErrNoRows
