package extension_test

import (
	"bytes"
	"context"
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
	"ideaven/apps/api/internal/extension"
)

// Extension registry tests (roadmap 2.0-B, Phase A): CRUD + versions +
// manifest validation + ownership. Needs PostgreSQL — the harness skips
// without one, like every other integration suite here.

func testDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test_extension?sslmode=disable"
}

var testSecret = bytes.Repeat([]byte{0x7e}, 32)

type silentMailer struct{}

func (silentMailer) SendEmailVerification(context.Context, string, string) error { return nil }
func (silentMailer) SendPasswordReset(context.Context, string, string) error     { return nil }

type harness struct {
	server *httptest.Server
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
	if _, err := db.Exec(`TRUNCATE users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	cfg := config.Config{
		Env: config.EnvDevelopment, Addr: ":0", ReadTimeout: 5 * time.Second,
		WriteTimeout: 5 * time.Second, AllowedOrigins: []string{"http://localhost:3000"},
		DatabaseURL: dsn, SessionSecret: testSecret, AppURL: "http://localhost:3000",
		SessionTTL: 7 * 24 * time.Hour, ResetTokenTTL: time.Hour, VerifyTokenTTL: 24 * time.Hour,
		Cookie: config.CookieConfig{
			Name: "ideaven_session", Secure: false, HTTPOnly: true, SameSite: "Lax",
			Path: "/", MaxAge: 7 * 24 * time.Hour,
		},
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	authService := auth.NewService(db, cfg, silentMailer{}, logger)
	authHandler := auth.NewHandler(authService, cfg.Cookie)
	extensionService := extension.NewService(db, "")
	extensionHandler := extension.NewHandler(extensionService, authService.Authenticate, cfg.Cookie)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/extensions", extensionHandler.Create)
	mux.HandleFunc("GET /api/extensions", extensionHandler.List)
	mux.HandleFunc("GET /api/extensions/{id}", extensionHandler.Get)
	mux.HandleFunc("PATCH /api/extensions/{id}", extensionHandler.Update)
	mux.HandleFunc("DELETE /api/extensions/{id}", extensionHandler.Delete)
	mux.HandleFunc("POST /api/extensions/{id}/versions", extensionHandler.SaveVersion)
	mux.HandleFunc("GET /api/extensions/{id}/versions", extensionHandler.ListVersions)
	mux.HandleFunc("POST /api/extensions/{id}/publish", extensionHandler.Publish)
	mux.HandleFunc("POST /api/extensions/{id}/build", extensionHandler.Build)
	mux.HandleFunc("GET /api/extensions/{id}/aix", extensionHandler.AIX)
	mux.HandleFunc("POST /api/extensions/{id}/install", extensionHandler.Install)
	mux.HandleFunc("DELETE /api/extensions/{id}/install", extensionHandler.Uninstall)
	mux.HandleFunc("GET /api/me/extensions", extensionHandler.Installed)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return &harness{server: server}
}

func call(t *testing.T, h *harness, method, path string, body any, cookie *http.Cookie) (*http.Response, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, h.server.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	payload := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("%s %s: non-JSON: %q", method, path, raw)
		}
	}
	return res, payload
}

func register(t *testing.T, h *harness, email, username string) *http.Cookie {
	t.Helper()
	res, _ := call(t, h, http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "username": username, "password": "Correct-Horse-9",
	}, nil)
	for _, cookie := range res.Cookies() {
		if cookie.Name == "ideaven_session" && cookie.Value != "" {
			return cookie
		}
	}
	t.Fatalf("register %s did not set a session", email)
	return nil
}

const goodManifest = `{"format":1,"components":[{"id":"remote","label":"Remote","props":[{"key":"channel","type":"number","default":1}]}],` +
	`"methods":[{"id":"send","label":"send signal","params":[{"key":"code","type":"number"}]}],` +
	`"events":[{"id":"onsignal","label":"when signal received"}],` +
	`"blocks":[{"type":"ext-remote-send","kind":"statement","category":"logic","label":"send {code} on remote","inputs":[{"key":"code","kind":"number"}]}]}`

func createExtension(t *testing.T, h *harness, cookie *http.Cookie, name string) map[string]any {
	t.Helper()
	res, payload := call(t, h, http.MethodPost, "/api/extensions", map[string]any{
		"name": name, "summary": "A test extension.", "kind": "mixed", "manifest": json.RawMessage(goodManifest),
	}, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create %s: status = %d, %v", name, res.StatusCode, payload)
	}
	ext, _ := payload["extension"].(map[string]any)
	t.Logf("create %s payload: %#v", name, payload)
	if ext == nil {
		t.Fatalf("create %s: no extension in payload", name)
	}
	return ext
}

func TestExtensionLifecycle(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "dev@example.com", "devx")

	created := createExtension(t, h, cookie, "Remote Control")
	id, _ := created["id"].(string)
	if created["slug"] != "remote-control-ext" {
		t.Fatalf("slug = %v", created["slug"])
	}
	if created["status"] != "draft" || created["currentVersion"] != "0.1.0" {
		t.Fatalf("new extension must be draft 0.1.0: %v", created)
	}

	// The manifest round-trips and is normalized on the server.
	manifest, _ := created["manifest"].(map[string]any)
	if manifest["format"] != float64(1) || len(manifest["components"].([]any)) != 1 {
		t.Fatalf("manifest mismatch: %v", manifest)
	}

	// List shows it.
	res, list := call(t, h, http.MethodGet, "/api/extensions", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list = %d", res.StatusCode)
	}
	if total, _ := list["total"].(float64); total != 1 {
		t.Fatalf("list total = %v", list)
	}

	// Update renames; slug is identity and never changes.
	res, updated := call(t, h, http.MethodPatch, "/api/extensions/"+id,
		map[string]any{"name": "Remote Pro"}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("update = %d (%v)", res.StatusCode, updated)
	}
	if projectOf(updated)["slug"] != "remote-control-ext" {
		t.Fatalf("slug must not change on rename: %v", updated)
	}

	// New version: validated semver + manifest, pointer moves.
	res, saved := call(t, h, http.MethodPost, "/api/extensions/"+id+"/versions", map[string]any{
		"version": "0.2.0", "manifest": json.RawMessage(goodManifest), "changelog": "Adds events.",
	}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("save version = %d (%v)", res.StatusCode, saved)
	}
	if projectOf(saved)["currentVersion"] != "0.2.0" {
		t.Fatalf("current version pointer did not move: %v", saved)
	}

	// Versions list, newest first.
	res, versions := call(t, h, http.MethodGet, "/api/extensions/"+id+"/versions", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("versions = %d", res.StatusCode)
	}
	items, _ := versions["versions"].([]any)
	if len(items) != 2 {
		t.Fatalf("want 2 versions, got %d", len(items))
	}
	if items[0].(map[string]any)["version"] != "0.2.0" {
		t.Fatalf("versions must be newest first: %v", versions)
	}

	// Delete removes it; afterwards GET is 404.
	res, _ = call(t, h, http.MethodDelete, "/api/extensions/"+id, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("delete = %d", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/extensions/"+id, nil, cookie)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("get after delete = %d, want 404", res.StatusCode)
	}
}

func projectOf(payload map[string]any) map[string]any {
	extension, _ := payload["extension"].(map[string]any)
	return extension
}

func TestExtensionManifestValidation(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "dev@example.com", "devx")

	bad := `{"format":1,"components":[{"id":"a","label":"A"},{"id":"a","label":"A2"}]}`
	res, payload := call(t, h, http.MethodPost, "/api/extensions", map[string]any{
		"name": "Bad", "manifest": json.RawMessage(bad),
	}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("duplicate component id must be rejected: %d (%v)", res.StatusCode, payload)
	}

	badVersion := `{"format":2}`
	res, _ = call(t, h, http.MethodPost, "/api/extensions", map[string]any{
		"name": "BadFormat", "manifest": json.RawMessage(badVersion),
	}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unsupported manifest format must be rejected")
	}

	ext := mustCreate(t, h, cookie)
	if ext == nil || ext["id"] == nil {
		t.Fatalf("created extension missing: %v", ext)
	}
	res, saved := call(t, h, http.MethodPost, "/api/extensions/"+ext["id"].(string)+"/versions",
		map[string]any{"version": "not-semver", "manifest": json.RawMessage(goodManifest)}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("non-semver version must be rejected: %d (%v)", res.StatusCode, saved)
	}
	_ = saved
}

func mustCreate(t *testing.T, h *harness, cookie *http.Cookie) map[string]any {
	t.Helper()
	return createExtension(t, h, cookie, "Versioned Ext")
}

func TestExtensionOwnership(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createExtension(t, h, owner, "Owned Ext")
	id, _ := created["id"].(string)

	other := register(t, h, "bob@example.com", "bob")
	res, _ := call(t, h, http.MethodGet, "/api/extensions/"+id, nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign get = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodPatch, "/api/extensions/"+id, map[string]any{"name": "Hacked"}, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign update = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodDelete, "/api/extensions/"+id, nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign delete = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/extensions/"+id+"/versions", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign versions = %d, want 404", res.StatusCode)
	}

	res, _ = call(t, h, http.MethodGet, "/api/extensions", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous list = %d, want 401", res.StatusCode)
	}
}

var _ = strings.TrimSpace

// Phase 1 build pipeline: isolated worker, dependency resolution, AIX
// download, install registry, publish gate.
func TestExtensionBuildPipelineAndInstall(t *testing.T) {
	h := newHarness(t)
	author := register(t, h, "ada@example.com", "ada")
	fan := register(t, h, "bob@example.com", "bob")

	depExt := createExtension(t, h, author, "Core Library")
	depID, _ := depExt["id"].(string)
	depSlug, _ := depExt["slug"].(string)

	// The consumer depends on the core library.
	res, payload := call(t, h, http.MethodPost, "/api/extensions", map[string]any{
		"name": "Consumer Ext", "summary": "Depends on core.", "kind": "blocks",
		"manifest": map[string]any{
			"format":       1,
			"blocks":       []map[string]any{{"type": "ext-consumer-run", "kind": "statement", "category": "logic", "label": "run consumer"}},
			"dependencies": []map[string]string{{"slug": depSlug, "version": "0.1.0"}},
		},
	}, author)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create consumer: %d (%v)", res.StatusCode, payload)
	}
	consumer := payload["extension"].(map[string]any)
	consumerID, _ := consumer["id"].(string)

	// Drafts cannot be installed by anyone.
	res, installBody := call(t, h, http.MethodPost, "/api/extensions/"+depID+"/install", nil, fan)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("install of draft = %d (%v), want 400", res.StatusCode, installBody)
	}

	// Publish both.
	for _, id := range []string{depID, consumerID} {
		res, pub := call(t, h, http.MethodPost, "/api/extensions/"+id+"/publish", nil, author)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("publish = %d (%v)", res.StatusCode, pub)
		}
	}

	// Build the consumer: the worker resolves the dependency from the
	// registry snapshot and produces a verified AIX.
	res, buildBody := call(t, h, http.MethodPost, "/api/extensions/"+consumerID+"/build",
		map[string]any{"changelog": "First build."}, author)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("build = %d (%v)", res.StatusCode, buildBody)
	}
	build, _ := buildBody["build"].(map[string]any)
	if build == nil || build["ok"] != true {
		t.Fatalf("build failed: %v", buildBody)
	}
	if build["checksum"] == nil || build["size"].(float64) <= 0 {
		t.Fatalf("build result missing checksum/size: %v", build)
	}

	// AIX download: owner gets a readable zip.
	aixReq, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/extensions/"+consumerID+"/aix", nil)
	aixReq.AddCookie(author)
	aixRes, err := h.server.Client().Do(aixReq)
	if err != nil {
		t.Fatal(err)
	}
	aixRaw, _ := io.ReadAll(aixRes.Body)
	aixRes.Body.Close()
	if aixRes.StatusCode != http.StatusOK || len(aixRaw) == 0 {
		t.Fatalf("aix download = %d (%d bytes)", aixRes.StatusCode, len(aixRaw))
	}

	// Foreign users cannot download someone's package.
	aixReq2, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/extensions/"+consumerID+"/aix", nil)
	aixReq2.AddCookie(fan)
	aixRes2, err := h.server.Client().Do(aixReq2)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, aixRes2.Body)
	aixRes2.Body.Close()
	if aixRes2.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign aix = %d, want 404", aixRes2.StatusCode)
	}

	// Install published extension by another user → appears in installed list.
	res, installBody = call(t, h, http.MethodPost, "/api/extensions/"+consumerID+"/install", nil, fan)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("install = %d (%v)", res.StatusCode, installBody)
	}
	res, installed := call(t, h, http.MethodGet, "/api/me/extensions", nil, fan)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("installed list = %d", res.StatusCode)
	}
	if total, _ := installed["total"].(float64); total != 1 {
		t.Fatalf("installed total = %v", installed)
	}

	// Uninstall empties it.
	res, _ = call(t, h, http.MethodDelete, "/api/extensions/"+consumerID+"/install", nil, fan)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("uninstall = %d", res.StatusCode)
	}
	res, installed = call(t, h, http.MethodGet, "/api/me/extensions", nil, fan)
	if total, _ := installed["total"].(float64); total != 0 {
		t.Fatalf("installed after uninstall = %v", installed)
	}
}
