package asset

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"ideaven/apps/api/internal/auth"
	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/database"
	"ideaven/apps/api/internal/project"
	"ideaven/apps/api/internal/storage"
)

// ---- test environment ------------------------------------------------------

// testDSN points at a package-local scratch database so parallel test
// packages never race each other's TRUNCATEs.
func testDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test_asset?sslmode=disable"
}

var testSecret = bytes.Repeat([]byte{0x5b}, 32)

// pngMagic is a minimal PNG signature; DetectContentType maps it to image/png.
var pngMagic = []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00}

type harness struct {
	db      *sql.DB
	server  *httptest.Server
	objects *storage.LocalAdapter
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

	assetObjects := storage.NewLocalAdapter(filepath.Join(t.TempDir(), "assets"))
	assetService := NewService(NewStore(db), func(ctx context.Context, ownerID, projectID string) error {
		_, err := projectService.Get(ctx, ownerID, projectID)
		return err
	}, assetObjects)
	assetHandler := NewHandler(assetService, authService.Authenticate, CookieConfig{Name: cfg.Cookie.Name})

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/projects", projectHandler.Create)
	mux.HandleFunc("POST /api/projects/{id}/assets", assetHandler.Upload)
	mux.HandleFunc("GET /api/projects/{id}/assets", assetHandler.List)
	mux.HandleFunc("GET /api/assets/{id}/raw", assetHandler.Raw)
	mux.HandleFunc("DELETE /api/assets/{id}", assetHandler.Delete)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return &harness{db: db, server: server, objects: assetObjects}
}

// silentMailer satisfies auth.Mailer without sending anything.
type silentMailer struct{}

func (silentMailer) SendEmailVerification(context.Context, string, string) error { return nil }
func (silentMailer) SendPasswordReset(context.Context, string, string) error     { return nil }

func sessionCookie(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if cookie.Name == "ideaven_session" && cookie.Value != "" {
			return cookie
		}
	}
	return nil
}

func register(t *testing.T, h *harness, email, username string) *http.Cookie {
	t.Helper()
	res, _ := jsonCall(t, h, http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "username": username, "password": "Correct-Horse-9",
	}, nil)
	cookie := sessionCookie(t, res)
	if cookie == nil {
		t.Fatalf("register %s did not set a session cookie", email)
	}
	return cookie
}

// createProject creates an owned project and returns its ID.
func createProject(t *testing.T, h *harness, cookie *http.Cookie, name string) string {
	t.Helper()
	res, payload := jsonCall(t, h, http.MethodPost, "/api/projects", map[string]string{
		"type": "app", "name": name,
	}, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create %s: status = %d, payload %v", name, res.StatusCode, payload)
	}
	project, _ := payload["project"].(map[string]any)
	if project == nil {
		t.Fatalf("create %s: missing project in %v", name, payload)
	}
	id, _ := project["id"].(string)
	return id
}

// upload posts a multipart asset upload and returns the raw response.
func upload(t *testing.T, h *harness, cookie *http.Cookie, projectID, fieldName, fileName string, data []byte) *http.Response {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if data != nil {
		part, err := writer.CreateFormFile(fieldName, fileName)
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		if _, err := part.Write(data); err != nil {
			t.Fatalf("write form file: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/projects/"+projectID+"/assets", body)
	if err != nil {
		t.Fatalf("build upload: %v", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if cookie != nil {
		req.AddCookie(cookie)
	}
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

// jsonCall performs a JSON request; the asset tests need it for list/delete.
func jsonCall(t *testing.T, h *harness, method, path string, body any, cookie *http.Cookie) (*http.Response, map[string]any) {
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

func errorCode(payload map[string]any) string {
	errObj, _ := payload["error"].(map[string]any)
	if errObj == nil {
		return ""
	}
	code, _ := errObj["code"].(string)
	return code
}

// ---- upload + list + raw -----------------------------------------------------

func TestUploadListAndRaw(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Assetful")

	res := upload(t, h, cookie, projectID, "file", "hero.png", pngMagic)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("upload: status = %d", res.StatusCode)
	}
	res, payload := jsonCall(t, h, http.MethodGet, "/api/projects/"+projectID+"/assets", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list: status = %d, payload %v", res.StatusCode, payload)
	}
	assets, _ := payload["assets"].([]any)
	if len(assets) != 1 {
		t.Fatalf("list: want 1 asset, got %d", len(assets))
	}
	first, _ := assets[0].(map[string]any)
	if first["name"] != "hero.png" || first["mime"] != "image/png" || first["kind"] != "image" {
		t.Fatalf("list: unexpected asset metadata %v", first)
	}
	assetID, _ := first["id"].(string)

	raw, err := http.Get(h.server.URL + "/api/assets/" + assetID + "/raw")
	if err != nil {
		t.Fatalf("raw without cookie: %v", err)
	}
	raw.Body.Close()
	if raw.StatusCode != http.StatusUnauthorized {
		t.Fatalf("raw without cookie: status = %d, want 401", raw.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/assets/"+assetID+"/raw", nil)
	req.AddCookie(cookie)
	served, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatalf("raw: %v", err)
	}
	defer served.Body.Close()
	data, _ := io.ReadAll(served.Body)
	if served.StatusCode != http.StatusOK {
		t.Fatalf("raw: status = %d", served.StatusCode)
	}
	if served.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("raw: content type = %q, want image/png", served.Header.Get("Content-Type"))
	}
	if !bytes.Equal(data, pngMagic) {
		t.Fatalf("raw: served %d bytes, want the exact upload", len(data))
	}
}

// ---- ownership ----------------------------------------------------------------

func TestUploadIsScopedToOwner(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	stranger := register(t, h, "mallory@example.com", "mallory")
	projectID := createProject(t, h, owner, "Mine")

	res := upload(t, h, stranger, projectID, "file", "stolen.png", pngMagic)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign upload: status = %d, want 404", res.StatusCode)
	}

	res, _ = jsonCall(t, h, http.MethodGet, "/api/projects/"+projectID+"/assets", nil, stranger)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign list: status = %d, want 404", res.StatusCode)
	}
}

// ---- validation ----------------------------------------------------------------

func TestUploadRejectsUnsupportedType(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Picky")

	res := upload(t, h, cookie, projectID, "file", "notes.txt", []byte("plain text, not an image"))
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("text upload: status = %d, want 415", res.StatusCode)
	}
}

func TestUploadRejectsOversize(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Big")

	big := make([]byte, MaxAssetSize+1)
	copy(big, pngMagic)
	res := upload(t, h, cookie, projectID, "file", "big.png", big)
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize upload: status = %d, want 413", res.StatusCode)
	}
}

func TestUploadWithoutFileField(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Empty")

	res := upload(t, h, cookie, projectID, "not-file", "x.png", nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing file field: status = %d, want 400", res.StatusCode)
	}
}

func TestUploadRequiresSession(t *testing.T) {
	h := newHarness(t)
	res := upload(t, h, nil, "00000000-0000-0000-0000-000000000000", "file", "x.png", pngMagic)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous upload: status = %d, want 401", res.StatusCode)
	}
}

func TestUploadNonMultipart(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Strict")

	res, _ := jsonCall(t, h, http.MethodPost, "/api/projects/"+projectID+"/assets",
		map[string]string{"nope": "json"}, cookie)
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("json upload: status = %d, want 415", res.StatusCode)
	}
}

// ---- delete ---------------------------------------------------------------------

func TestDeleteAsset(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Doomed")

	res := upload(t, h, cookie, projectID, "file", "gone.png", pngMagic)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("upload: status = %d", res.StatusCode)
	}
	res, payload := jsonCall(t, h, http.MethodGet, "/api/projects/"+projectID+"/assets", nil, cookie)
	assets, _ := payload["assets"].([]any)
	if len(assets) != 1 {
		t.Fatalf("list: want 1 asset, got %d", len(assets))
	}
	first, _ := assets[0].(map[string]any)
	assetID, _ := first["id"].(string)

	res, _ = jsonCall(t, h, http.MethodDelete, "/api/assets/"+assetID, nil, cookie)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: status = %d", res.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/assets/"+assetID+"/raw", nil)
	req.AddCookie(cookie)
	served, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatalf("raw after delete: %v", err)
	}
	servedBody, _ := io.ReadAll(served.Body)
	served.Body.Close()
	if served.StatusCode != http.StatusNotFound {
		t.Fatalf("raw after delete: status = %d, want 404, body %s", served.StatusCode, servedBody)
	}

	stranger := register(t, h, "mallory@example.com", "mallory")
	res, _ = jsonCall(t, h, http.MethodDelete, "/api/assets/"+assetID, nil, stranger)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign delete: status = %d, want 404", res.StatusCode)
	}
}

// ---- the 50-asset ceiling --------------------------------------------------------

func TestUploadPerProjectLimit(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	projectID := createProject(t, h, cookie, "Hoarded")

	for i := 0; i < MaxAssetsPerProject; i++ {
		res := upload(t, h, cookie, projectID, "file", fmt.Sprintf("img-%d.png", i), pngMagic)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("upload %d: status = %d", i, res.StatusCode)
		}
	}
	res := upload(t, h, cookie, projectID, "file", "overflow.png", pngMagic)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("limit upload: status = %d, want 403", res.StatusCode)
	}
}

// ---- 6.0 phase 6A: storage adapter, hash, ETag/304 -----------------------------

func TestAssetStorageAdapterAndETag(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "gra@example.com", "gra")
	projectID := createProject(t, h, cookie, "Storage")

	res, payload := jsonCall(t, h, http.MethodPost, "/api/projects/"+projectID+"/assets", nil, cookie)
	_ = payload
	res = upload(t, h, cookie, projectID, "file", "hero.png", pngMagic)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("upload: status = %d", res.StatusCode)
	}
	res, payload = jsonCall(t, h, http.MethodGet, "/api/projects/"+projectID+"/assets", nil, cookie)
	assets, _ := payload["assets"].([]any)
	first, _ := assets[0].(map[string]any)
	assetID, _ := first["id"].(string)

	// sha256 is tracked on the wire and matches the uploaded bytes.
	sum := sha256.Sum256(pngMagic)
	wantHash := hex.EncodeToString(sum[:])
	if first["sha256"] != wantHash {
		t.Fatalf("sha256 wrong: %v", first["sha256"])
	}

	// The adapter holds the file on disk.
	fileData, err := h.objects.Load(storage.NewScope(projectID), assetID)
	if err != nil {
		t.Fatalf("adapter missing the uploaded object: %v", err)
	}
	if !bytes.Equal(fileData, pngMagic) {
		t.Fatalf("adapter bytes differ from the upload")
	}

	// Raw serving carries the strong ETag and answers 304 on If-None-Match.
	req, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/assets/"+assetID+"/raw", nil)
	req.AddCookie(cookie)
	served, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatalf("raw: %v", err)
	}
	if served.Header.Get("ETag") != `"`+wantHash+`"` {
		t.Fatalf("ETag wrong: %q", served.Header.Get("ETag"))
	}
	served.Body.Close()

	revalidated, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/assets/"+assetID+"/raw", nil)
	revalidated.AddCookie(cookie)
	revalidated.Header.Set("If-None-Match", `"`+wantHash+`"`)
	notModified, err := h.server.Client().Do(revalidated)
	if err != nil {
		t.Fatalf("revalidate: %v", err)
	}
	notModified.Body.Close()
	if notModified.StatusCode != http.StatusNotModified {
		t.Fatalf("If-None-Match: status = %d, want 304", notModified.StatusCode)
	}

	// Lazy backfill: remove the file, serve again — bytes come from the DB
	// fallback and the file is rewritten to the adapter.
	if err := h.objects.Delete(storage.NewScope(projectID), assetID); err != nil {
		t.Fatalf("remove file: %v", err)
	}
	refetched, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/assets/"+assetID+"/raw", nil)
	refetched.AddCookie(cookie)
	again, err := h.server.Client().Do(refetched)
	if err != nil {
		t.Fatalf("refetch: %v", err)
	}
	back, _ := io.ReadAll(again.Body)
	again.Body.Close()
	if again.StatusCode != http.StatusOK || !bytes.Equal(back, pngMagic) {
		t.Fatalf("fallback serve failed: %d %d bytes", again.StatusCode, len(back))
	}
	if _, err := h.objects.Load(storage.NewScope(projectID), assetID); err != nil {
		t.Fatalf("lazy backfill did not rewrite the file: %v", err)
	}

	// Delete removes both the row and the file.
	del, _ := jsonCall(t, h, http.MethodDelete, "/api/assets/"+assetID, nil, cookie)
	if del.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: status = %d", del.StatusCode)
	}
	if _, err := h.objects.Load(storage.NewScope(projectID), assetID); err == nil {
		t.Fatalf("adapter still holds a deleted object")
	}
}
