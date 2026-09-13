package project_test

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
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ideaven/apps/api/internal/asset"
	"ideaven/apps/api/internal/auth"
	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/database"
	"ideaven/apps/api/internal/project"
	"ideaven/apps/api/internal/storage"
)

// ---- test environment ------------------------------------------------------

// testDSN points at a scratch database; tests create and migrate it.
// A package-local database keeps the per-test TRUNCATE from racing the other
// test packages that run in parallel against their own scratch databases.
func testDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test_project?sslmode=disable"
}

var testSecret = bytes.Repeat([]byte{0x5a}, 32)

// silentMailer satisfies auth.Mailer without sending anything.
type silentMailer struct{}

func (silentMailer) SendEmailVerification(context.Context, string, string) error { return nil }
func (silentMailer) SendPasswordReset(context.Context, string, string) error     { return nil }

type harness struct {
	db      *sql.DB
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
	// Fresh data per test; FK cascades cover sessions, tokens, and projects.
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
	authService := auth.NewService(db, cfg, silentMailer{}, logger)
	authHandler := auth.NewHandler(authService, cfg.Cookie)

	projectService := project.NewService(db, logger)
	projectHandler := project.NewHandler(projectService, authService, cfg.Cookie)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("GET /api/auth/me", authHandler.Me)
	mux.HandleFunc("POST /api/projects", projectHandler.Create)
	mux.HandleFunc("GET /api/projects", projectHandler.List)
	mux.HandleFunc("GET /api/projects/{id}", projectHandler.Get)
	mux.HandleFunc("PATCH /api/projects/{id}", projectHandler.Update)
	mux.HandleFunc("DELETE /api/projects/{id}", projectHandler.Delete)
	mux.HandleFunc("POST /api/projects/{id}/duplicate", projectHandler.Duplicate)
	mux.HandleFunc("GET /api/projects/{id}/package", projectHandler.ProjectPackage)
	mux.HandleFunc("POST /api/projects/import", projectHandler.ImportPackage)
	mux.HandleFunc("POST /api/projects/{id}/open", projectHandler.Open)
	mux.HandleFunc("PUT /api/projects/{id}/model", projectHandler.UpdateModel)
	mux.HandleFunc("GET /api/projects/{id}/versions", projectHandler.ListVersions)
	mux.HandleFunc("GET /api/projects/{id}/versions/{versionId}", projectHandler.GetVersion)
	mux.HandleFunc("POST /api/projects/{id}/publish", projectHandler.Publish)
	mux.HandleFunc("POST /api/projects/{id}/unpublish", projectHandler.Unpublish)
	mux.HandleFunc("GET /api/projects/{id}/intelligence", projectHandler.Intelligence)
	mux.HandleFunc("GET /api/projects/{id}/dna", projectHandler.DNA)
	mux.HandleFunc("GET /api/projects/{id}/asset-intelligence", projectHandler.AssetIntelligence)
	mux.HandleFunc("GET /api/projects/{id}/intent", projectHandler.IntentGet)
	mux.HandleFunc("PUT /api/projects/{id}/intent", projectHandler.IntentSet)
	mux.HandleFunc("GET /api/projects/{id}/memory", projectHandler.MemoryList)
	mux.HandleFunc("POST /api/projects/{id}/memory", projectHandler.MemoryAdd)
	mux.HandleFunc("DELETE /api/projects/{id}/memory/{memoryId}", projectHandler.MemoryDelete)
	mux.HandleFunc("GET /api/public/projects/{slug}", projectHandler.PublicProject)
	mux.HandleFunc("GET /api/public/projects", projectHandler.PublicList)
	mux.HandleFunc("GET /api/public/creators/{username}", projectHandler.PublicCreator)
	mux.HandleFunc("POST /api/public/projects/{slug}/remix", projectHandler.Remix)
	mux.HandleFunc("GET /api/public/stats", projectHandler.PublicStats)
	mux.HandleFunc("GET /api/templates", projectHandler.ListTemplates)
	mux.HandleFunc("GET /api/projects/{id}/export/html", projectHandler.ExportHTML)
	mux.HandleFunc("GET /api/projects/{id}/export/android", projectHandler.ExportAndroid)

	assetService := asset.NewService(asset.NewStore(db), func(ctx context.Context, ownerID, projectID string) error {
		_, err := projectService.Get(ctx, ownerID, projectID)
		return err
	}, storage.NewLocalAdapter(filepath.Join(t.TempDir(), "assets")))
	projectService.SetAssetMediaSource(asset.NewStore(db))
	projectService.AssetInserter = func(ctx context.Context, ownerID, projectID, fileName string, data []byte) (string, error) {
		inserted, err := assetService.Create(ctx, ownerID, projectID, fileName, data)
		if err != nil {
			return "", err
		}
		return inserted.ID, nil
	}
	assetHandler := asset.NewHandler(assetService, authService.Authenticate, asset.CookieConfig{Name: cfg.Cookie.Name})
	mux.HandleFunc("POST /api/projects/{id}/assets", assetHandler.Upload)
	mux.HandleFunc("GET /api/assets/{id}/raw", assetHandler.Raw)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return &harness{db: db, handler: mux, server: server}
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
	raw, _ := io.ReadAll(res.Body)
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("%s %s: response is not JSON: %q", method, path, raw)
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

func register(t *testing.T, h *harness, email, username string) *http.Cookie {
	t.Helper()
	res, _ := call(t, h, http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "username": username, "password": "Correct-Horse-9",
	}, nil)
	cookie := sessionCookie(t, res)
	if cookie == nil {
		t.Fatalf("register %s did not set a session cookie", email)
	}
	return cookie
}

// createProject creates a project and fails the test unless it succeeds.
func createProject(t *testing.T, h *harness, cookie *http.Cookie, projectType, name string) map[string]any {
	t.Helper()
	res, payload := call(t, h, http.MethodPost, "/api/projects", map[string]string{
		"type": projectType, "name": name,
	}, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create %s: status = %d, payload %v", name, res.StatusCode, payload)
	}
	project, _ := payload["project"].(map[string]any)
	if project == nil {
		t.Fatalf("create %s: missing project in %v", name, payload)
	}
	return project
}

func projectOf(payload map[string]any) map[string]any {
	project, _ := payload["project"].(map[string]any)
	return project
}

// ---- creation ----------------------------------------------------------------

func TestCreateAppProject(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")

	project := createProject(t, h, cookie, "app", "My First App")

	if project["type"] != "app" || project["name"] != "My First App" {
		t.Fatalf("unexpected project %v", project)
	}
	if project["status"] != "draft" || project["visibility"] != "private" {
		t.Fatalf("new projects must start as private drafts, got %v", project)
	}
	if project["id"] == "" || len(project["id"].(string)) != 36 {
		t.Fatalf("expected UUID id, got %v", project["id"])
	}
	if project["slug"] == "" || !strings.HasPrefix(project["slug"].(string), "my-first-app-") {
		t.Fatalf("expected readable slug, got %v", project["slug"])
	}

	// The canonical model must be present, versioned, and structurally valid.
	model, ok := project["model"].(map[string]any)
	if !ok {
		t.Fatalf("model missing from create response: %v", project)
	}
	if model["schemaVersion"] != float64(1) || model["type"] != "app" {
		t.Fatalf("unexpected model header %v", model)
	}
	screens, _ := model["screens"].([]any)
	if len(screens) != 1 {
		t.Fatalf("expected one initial screen, got %v", screens)
	}
	screen, _ := screens[0].(map[string]any)
	if screen["name"] != "Home" {
		t.Fatalf("unexpected initial screen %v", screen)
	}
	if model["navigation"].(map[string]any)["startScreenId"] != screen["id"] {
		t.Fatalf("start screen must point at the initial screen: %v", model)
	}
}

func TestCreateGameProject(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")

	project := createProject(t, h, cookie, "game", "Jump Hero")
	if project["type"] != "game" {
		t.Fatalf("unexpected type %v", project["type"])
	}
	model := project["model"].(map[string]any)
	screens, _ := model["screens"].([]any)
	screen, _ := screens[0].(map[string]any)
	if screen["name"] != "Scene 1" {
		t.Fatalf("game projects should start with a scene, got %v", screen)
	}
}

func TestCreateValidation(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")

	cases := []struct {
		name      string
		body      map[string]string
		wantField string
	}{
		{"missing type", map[string]string{"name": "X"}, "type"},
		{"bad type", map[string]string{"type": "hologram", "name": "X"}, "type"},
		{"blank name", map[string]string{"type": "app", "name": "   "}, "name"},
		{"long name", map[string]string{"type": "app", "name": strings.Repeat("x", 81)}, "name"},
	}
	for _, tc := range cases {
		res, payload := call(t, h, http.MethodPost, "/api/projects", tc.body, cookie)
		if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "VALIDATION_ERROR" {
			t.Fatalf("%s: status=%d code=%s", tc.name, res.StatusCode, errorCode(payload))
		}
		errObj := payload["error"].(map[string]any)
		details, _ := errObj["details"].([]any)
		if len(details) == 0 || details[0].(map[string]any)["field"] != tc.wantField {
			t.Fatalf("%s: expected field %q, got %v", tc.name, tc.wantField, errObj)
		}
	}
}

func TestCreateRequiresSession(t *testing.T) {
	h := newHarness(t)
	res, payload := call(t, h, http.MethodPost, "/api/projects", map[string]string{"type": "app", "name": "X"}, nil)
	if res.StatusCode != http.StatusUnauthorized || errorCode(payload) != "UNAUTHORIZED" {
		t.Fatalf("status=%d code=%s", res.StatusCode, errorCode(payload))
	}
}

// ---- listing -------------------------------------------------------------------

func TestListIsScopedToOwner(t *testing.T) {
	h := newHarness(t)
	ada := register(t, h, "ada@example.com", "ada")
	bob := register(t, h, "bob@example.com", "bob")

	createProject(t, h, ada, "app", "Ada App")
	createProject(t, h, ada, "game", "Ada Game")
	createProject(t, h, bob, "app", "Bob App")

	res, payload := call(t, h, http.MethodGet, "/api/projects", nil, ada)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	projects, _ := payload["projects"].([]any)
	if len(projects) != 2 || payload["total"] != float64(2) {
		t.Fatalf("ada should see exactly her 2 projects, got %v", payload)
	}
	for _, raw := range projects {
		project := raw.(map[string]any)
		if project["name"] == "Bob App" {
			t.Fatal("ada can see bob's project")
		}
		if _, hasModel := project["model"]; hasModel {
			t.Fatal("list responses must not carry model documents")
		}
	}
}

func TestListSearchSortAndStatus(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")

	createProject(t, h, cookie, "app", "Alpha Calculator")
	createProject(t, h, cookie, "game", "Beta Jump")
	createProject(t, h, cookie, "app", "Alpha Notes")

	// Search matches name substrings case-insensitively.
	res, payload := call(t, h, http.MethodGet, "/api/projects?q=alpha", nil, cookie)
	projects, _ := payload["projects"].([]any)
	if res.StatusCode != http.StatusOK || len(projects) != 2 {
		t.Fatalf("search q=alpha: status=%d results=%v", res.StatusCode, payload)
	}

	// Alphabetical sort.
	res, payload = call(t, h, http.MethodGet, "/api/projects?sort=name", nil, cookie)
	projects, _ = payload["projects"].([]any)
	first := projects[0].(map[string]any)["name"]
	if first != "Alpha Calculator" {
		t.Fatalf("sort=name should put Alpha Calculator first, got %v", projects)
	}

	// Archive one and confirm the default list hides it while the archived
	// filter shows it.
	created := createProject(t, h, cookie, "app", "Archived Item")
	id := created["id"].(string)
	res, _ = call(t, h, http.MethodPatch, "/api/projects/"+id, map[string]string{"status": "archived"}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("archive failed: %d", res.StatusCode)
	}
	_, payload = call(t, h, http.MethodGet, "/api/projects", nil, cookie)
	if got := len(payload["projects"].([]any)); got != 3 {
		t.Fatalf("default list should hide archived, got %d", got)
	}
	_, payload = call(t, h, http.MethodGet, "/api/projects?status=archived", nil, cookie)
	projects = payload["projects"].([]any)
	if len(projects) != 1 || projects[0].(map[string]any)["name"] != "Archived Item" {
		t.Fatalf("archived filter wrong: %v", payload)
	}
	_, payload = call(t, h, http.MethodGet, "/api/projects?status=all", nil, cookie)
	if got := len(payload["projects"].([]any)); got != 4 {
		t.Fatalf("all filter wrong: got %d", got)
	}
}

// ---- get / update / open ---------------------------------------------------------

func TestGetReturnsModel(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Detailed App")
	id := created["id"].(string)

	res, payload := call(t, h, http.MethodGet, "/api/projects/"+id, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	project := projectOf(payload)
	if _, hasModel := project["model"]; !hasModel {
		t.Fatal("get must return the canonical model")
	}
	if project["modelVersion"] != float64(1) {
		t.Fatalf("unexpected model version %v", project["modelVersion"])
	}
}

func TestGetForeignProjectIsNotFound(t *testing.T) {
	h := newHarness(t)
	ada := register(t, h, "ada@example.com", "ada")
	bob := register(t, h, "bob@example.com", "bob")
	created := createProject(t, h, ada, "app", "Ada Secret")
	id := created["id"].(string)

	res, payload := call(t, h, http.MethodGet, "/api/projects/"+id, nil, bob)
	if res.StatusCode != http.StatusNotFound || errorCode(payload) != "NOT_FOUND" {
		t.Fatalf("foreign project: status=%d code=%s", res.StatusCode, errorCode(payload))
	}

	// Same answer for a garbage ID — existence is never leaked.
	res, payload = call(t, h, http.MethodGet, "/api/projects/not-a-uuid", nil, ada)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("garbage id: status=%d", res.StatusCode)
	}
}

func TestUpdateRenameAndArchive(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Old Name")
	id := created["id"].(string)

	res, payload := call(t, h, http.MethodPatch, "/api/projects/"+id, map[string]any{
		"name": "New Name", "description": "A tiny calculator.",
	}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("update status = %d, payload %v", res.StatusCode, payload)
	}
	project := projectOf(payload)
	if project["name"] != "New Name" || project["description"] != "A tiny calculator." {
		t.Fatalf("update not applied: %v", project)
	}
	// Slugs are stable identities and must not change on rename.
	if project["slug"] != created["slug"] {
		t.Fatalf("slug changed on rename: %v -> %v", created["slug"], project["slug"])
	}

	// Validation still applies on update.
	res, payload = call(t, h, http.MethodPatch, "/api/projects/"+id, map[string]string{"name": "   "}, cookie)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "VALIDATION_ERROR" {
		t.Fatalf("blank rename accepted: %d %s", res.StatusCode, errorCode(payload))
	}

	// Status transitions accept only known values.
	res, payload = call(t, h, http.MethodPatch, "/api/projects/"+id, map[string]string{"status": "deleted"}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown status accepted: %d %v", res.StatusCode, payload)
	}

	// An empty patch is a client error, not a silent success.
	res, _ = call(t, h, http.MethodPatch, "/api/projects/"+id, map[string]any{}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty patch accepted: %d", res.StatusCode)
	}
}

func TestOpenRecordsLastOpened(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Openable")
	id := created["id"].(string)

	if created["lastOpenedAt"] != nil {
		t.Fatalf("fresh project should have no lastOpenedAt, got %v", created["lastOpenedAt"])
	}

	res, payload := call(t, h, http.MethodPost, "/api/projects/"+id+"/open", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("open status = %d, payload %v", res.StatusCode, payload)
	}
	if projectOf(payload)["lastOpenedAt"] == nil {
		t.Fatal("open must record lastOpenedAt")
	}
}

// ---- duplicate -----------------------------------------------------------------

func TestDuplicateCopiesModel(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "game", "Original")
	id := created["id"].(string)

	res, payload := call(t, h, http.MethodPost, "/api/projects/"+id+"/duplicate", nil, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("duplicate status = %d, payload %v", res.StatusCode, payload)
	}
	copy := projectOf(payload)
	if copy["id"] == id {
		t.Fatal("duplicate must have a fresh project ID")
	}
	if copy["name"] != "Original (Copy)" {
		t.Fatalf("unexpected copy name %v", copy["name"])
	}
	if copy["status"] != "draft" || copy["visibility"] != "private" {
		t.Fatalf("copies must start as private drafts: %v", copy)
	}

	// The copy's model is a full document, not a reference.
	res, payload = call(t, h, http.MethodGet, "/api/projects/"+copy["id"].(string), nil, cookie)
	copyModel := projectOf(payload)["model"].(map[string]any)
	if copyModel["type"] != "game" {
		t.Fatalf("copy lost its model: %v", copyModel)
	}
}

// ---- delete ---------------------------------------------------------------------

func TestDeleteRemovesProject(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Doomed")
	id := created["id"].(string)

	res, _ := call(t, h, http.MethodDelete, "/api/projects/"+id, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("delete status = %d", res.StatusCode)
	}

	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id, nil, cookie)
	if res.StatusCode != http.StatusNotFound {
		t.Fatal("deleted project still readable")
	}

	// Deleting again reports the same not-found, not a 500.
	res, payload := call(t, h, http.MethodDelete, "/api/projects/"+id, nil, cookie)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("second delete: %d %v", res.StatusCode, payload)
	}
}

func TestDeleteIsScopedToOwner(t *testing.T) {
	h := newHarness(t)
	ada := register(t, h, "ada@example.com", "ada")
	bob := register(t, h, "bob@example.com", "bob")
	created := createProject(t, h, ada, "app", "Ada Precious")
	id := created["id"].(string)

	res, _ := call(t, h, http.MethodDelete, "/api/projects/"+id, nil, bob)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("bob deleted ada's project: %d", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id, nil, ada)
	if res.StatusCode != http.StatusOK {
		t.Fatal("ada's project vanished after bob's delete attempt")
	}
}

// ---- model saving (builder write path) ------------------------------------------

// fullModel builds a wire-ready model document for PUT bodies.
func fullModel(projectType string, screens ...map[string]any) map[string]any {
	if len(screens) == 0 {
		screens = []map[string]any{{"id": "screen-home", "name": "Home", "components": []any{}}}
	}
	return map[string]any{
		"schemaVersion": 1,
		"type":          projectType,
		"settings":      map[string]any{"theme": "light"},
		"screens":       screens,
		"navigation":    map[string]any{"startScreenId": screens[0]["id"]},
		"variables":     []any{},
		"assets":        []any{},
	}
}

func TestUpdateModelSavesAndPersists(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Editable")
	id := created["id"].(string)

	model := fullModel("app", map[string]any{
		"id": "screen-home", "name": "Home",
		"components": []any{
			map[string]any{
				"id": "c-text-1", "type": "text",
				"props":  map[string]any{"text": "Hello, Ideaven"},
				"styles": map[string]any{"fontSize": 24, "color": "#0b0e16"},
			},
			map[string]any{
				"id": "c-btn-1", "type": "button",
				"props": map[string]any{"label": "Get started"},
			},
		},
	})

	res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model",
		map[string]any{"model": model}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("put model status = %d, payload %v", res.StatusCode, payload)
	}

	// The saved document comes back through GET, byte-for-byte in structure.
	res, payload = call(t, h, http.MethodGet, "/api/projects/"+id, nil, cookie)
	project := projectOf(payload)
	saved := project["model"].(map[string]any)
	screens := saved["screens"].([]any)
	if len(screens) != 1 {
		t.Fatalf("expected 1 screen, got %d", len(screens))
	}
	components := screens[0].(map[string]any)["components"].([]any)
	if len(components) != 2 {
		t.Fatalf("expected 2 components, got %d", len(components))
	}
	first := components[0].(map[string]any)
	if first["type"] != "text" ||
		first["props"].(map[string]any)["text"] != "Hello, Ideaven" {
		t.Fatalf("saved component lost its content: %v", first)
	}
	if project["updatedAt"] == created["updatedAt"] {
		t.Fatal("model save must bump updated_at")
	}
}

func TestUpdateModelRejectsInvalidDocuments(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Guarded")
	id := created["id"].(string)

	cases := []struct {
		name  string
		model map[string]any
	}{
		{"wrong project type", fullModel("game")},
		{"unknown schema version", func() map[string]any {
			m := fullModel("app")
			m["schemaVersion"] = 99
			return m
		}()},
		{"no screens", func() map[string]any {
			m := fullModel("app")
			m["screens"] = []any{}
			return m
		}()},
		{"duplicate component ids", fullModel("app", map[string]any{
			"id": "screen-home", "name": "Home",
			"components": []any{
				map[string]any{"id": "dup", "type": "text"},
				map[string]any{"id": "dup", "type": "button"},
			},
		})},
		{"dangling start screen", func() map[string]any {
			m := fullModel("app")
			m["navigation"] = map[string]any{"startScreenId": "ghost"}
			return m
		}()},
	}
	for _, tc := range cases {
		res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model",
			map[string]any{"model": tc.model}, cookie)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, payload %v", tc.name, res.StatusCode, payload)
		}
	}

	// A missing model key is a client error, not a nil-pointer panic.
	res, _ := call(t, h, http.MethodPut, "/api/projects/"+id+"/model", map[string]any{}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty body status = %d, want 400", res.StatusCode)
	}
}

func TestUpdateModelIsScopedToOwner(t *testing.T) {
	h := newHarness(t)
	ada := register(t, h, "ada@example.com", "ada")
	bob := register(t, h, "bob@example.com", "bob")
	created := createProject(t, h, ada, "app", "Ada Model")
	id := created["id"].(string)

	res, _ := call(t, h, http.MethodPut, "/api/projects/"+id+"/model",
		map[string]any{"model": fullModel("app")}, bob)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("bob saved ada's model: %d", res.StatusCode)
	}
}

// ---- transport ------------------------------------------------------------------

func TestProjectsRequireJSONContentType(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")

	req, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/projects", strings.NewReader(`{"type":"app","name":"X"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "text/plain")
	req.AddCookie(cookie)
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("non-JSON content type returned %d, want 415", res.StatusCode)
	}
}

func TestCreateRejectsUnknownFields(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	res, payload := call(t, h, http.MethodPost, "/api/projects",
		json.RawMessage(`{"type":"app","name":"X","ownerId":"forge-one"}`), cookie)
	if res.StatusCode != http.StatusBadRequest || errorCode(payload) != "INVALID_REQUEST_BODY" {
		t.Fatalf("forged owner accepted: %d %s", res.StatusCode, errorCode(payload))
	}
}

// Universal project types (roadmap 7.0 M7): the closed vocabulary beyond
// app/game creates and lists like any project; invalid types are rejected.
func TestUniversalProjectTypes(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "uni@example.com", "uni")

	for _, projectType := range []string{"website", "backend", "api", "database", "experience", "extension", "tool", "education"} {
		created := createProject(t, h, cookie, projectType, "Universal "+projectType)
		if created["type"] != projectType {
			t.Fatalf("type %s not preserved: %v", projectType, created["type"])
		}
	}

	res, body := call(t, h, http.MethodPost, "/api/projects", map[string]any{"name": "Nope", "type": "hologram"}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid type = %d, want 400 (%v)", res.StatusCode, body)
	}
}

// modelOf fetches the current canonical model as generic JSON.
func modelOf(t *testing.T, h *harness, cookie *http.Cookie, projectID string) map[string]any {
	t.Helper()
	res, payload := call(t, h, http.MethodGet, "/api/projects/"+projectID, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get project = %d", res.StatusCode)
	}
	project, _ := payload["project"].(map[string]any)
	model, _ := project["model"].(map[string]any)
	return model
}

// putModel saves a modified model document.
func putModel(t *testing.T, h *harness, cookie *http.Cookie, projectID string, model map[string]any) *http.Response {
	t.Helper()
	res, _ := call(t, h, http.MethodPut, "/api/projects/"+projectID+"/model", map[string]any{"model": model, "origin": "edit"}, cookie)
	return res
}
