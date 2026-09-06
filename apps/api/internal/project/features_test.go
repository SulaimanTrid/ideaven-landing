package project_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ideaven/apps/api/internal/project"
)

var multipartType string

// buildMultipart assembles a one-file multipart body for the upload endpoint.
func buildMultipart(t *testing.T, name, mime string, data []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	multipartType = writer.FormDataContentType()
	return buf.Bytes()
}

// readBody consumes a response body once for raw-content assertions.
func readBody(res *http.Response) ([]byte, error) {
	defer res.Body.Close()
	return io.ReadAll(res.Body)
}

// decode parses a JSON response body into a map.
func decode(t *testing.T, res *http.Response) map[string]any {
	t.Helper()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("non-JSON response: %q", raw)
	}
	return payload
}

var _ = httptest.NewServer

// Templates (roadmap 4/32): pure checks — every built-in must be a valid
// model, since creation hands it to users as their starting document.
func TestTemplatesAreValidModels(t *testing.T) {
	templates := project.Templates()
	if len(templates) < 3 {
		t.Fatalf("expected at least 3 built-in templates, got %d", len(templates))
	}
	seen := map[string]bool{}
	for _, tpl := range templates {
		if seen[tpl.ID] {
			t.Fatalf("duplicate template id %q", tpl.ID)
		}
		seen[tpl.ID] = true
		model, err := project.TemplateModel(tpl.ID, tpl.Type)
		if err != nil {
			t.Fatalf("template %s: %v", tpl.ID, err)
		}
		if err := project.ValidateModel(&model); err != nil {
			t.Fatalf("template %s invalid: %v", tpl.ID, err)
		}
		if len(model.Screens) != tpl.Screens {
			t.Fatalf("template %s: screen count mismatch", tpl.ID)
		}
	}
	if _, err := project.TemplateModel("no-such-template", "app"); err == nil {
		t.Fatal("unknown template must be rejected")
	}
	if _, err := project.TemplateModel("signin-starter", "game"); err == nil {
		t.Fatal("type mismatch must be rejected")
	}
}

// Remix (roadmap 33–35): a published project copies into the caller's
// account as a fresh draft with attribution.
func TestRemixPublishedProject(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, owner, "app", "Remixable App")
	id, _ := created["id"].(string)

	payload := publishProject(t, h, owner, id)
	slug, _ := projectOf(payload)["slug"].(string)

	fan := register(t, h, "grace@example.com", "grace")
	res, payload2 := call(t, h, http.MethodPost, "/api/public/projects/"+slug+"/remix", nil, fan)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("remix = %d (%v), want 201", res.StatusCode, payload2)
	}
	remix := projectOf(payload2)
	if remix["status"] != "draft" {
		t.Fatalf("remix must be a draft: %v", remix)
	}
	if name, _ := remix["name"].(string); !strings.HasSuffix(name, "(remix)") {
		t.Fatalf("remix name should be marked: %v", name)
	}
	if desc, _ := remix["description"].(string); !strings.Contains(desc, "@ada/") {
		t.Fatalf("remix must attribute the original creator: %v", desc)
	}
	model, _ := remix["model"].(map[string]any)
	if model == nil {
		t.Fatal("remix must carry the snapshot model")
	}

	// Anonymous remix is not a thing — a session is required.
	res, _ = call(t, h, http.MethodPost, "/api/public/projects/"+slug+"/remix", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous remix = %d, want 401", res.StatusCode)
	}
}

// Creator pages (roadmap 20/33): a public identity with their publications.
func TestPublicCreatorPage(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, owner, "app", "Creator App")
	id, _ := created["id"].(string)

	payload := publishProject(t, h, owner, id)
	slug, _ := projectOf(payload)["slug"].(string)

	res, body := call(t, h, http.MethodGet, "/api/public/creators/ada", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("creator page = %d (%v)", res.StatusCode, body)
	}
	creator, _ := body["creator"].(map[string]any)
	if creator == nil || creator["username"] != "ada" {
		t.Fatalf("creator missing: %v", body)
	}
	items, _ := body["publications"].([]any)
	if len(items) != 1 {
		t.Fatalf("creator should list 1 publication: %v", body)
	}
	first, _ := items[0].(map[string]any)
	if first["slug"] != slug || first["author"] != "ada" {
		t.Fatalf("publication summary wrong: %v", first)
	}

	res, _ = call(t, h, http.MethodGet, "/api/public/creators/nobody", nil, nil)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown creator = %d, want 404", res.StatusCode)
	}
}

// Platform stats (roadmap 28) count real rows.
func TestPublicStats(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, owner, "app", "Counted")
	id, _ := created["id"].(string)
	publishProject(t, h, owner, id)

	res, body := call(t, h, http.MethodGet, "/api/public/stats", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("stats = %d", res.StatusCode)
	}
	stats, _ := body["stats"].(map[string]any)
	if stats == nil || stats["creators"] != float64(1) || stats["publications"] != float64(1) {
		t.Fatalf("stats wrong: %v", body)
	}
}

// Exports (roadmap 26/30–31): owner-only downloads with real content.
func TestExportHTMLAndAndroid(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, owner, "app", "Exported App")
	id, _ := created["id"].(string)

	model := fullModel("app", map[string]any{
		"id": "screen-home", "name": "Home",
		"components": []any{map[string]any{"id": "c1", "type": "text", "props": map[string]any{"text": "Export marker"}}},
	})
	call(t, h, http.MethodPut, "/api/projects/"+id+"/model", map[string]any{"model": model}, owner)

	htmlReq, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/projects/"+id+"/export/html", nil)
	htmlReq.AddCookie(owner)
	rawRes, err := h.server.Client().Do(htmlReq)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := readBody(rawRes)
	if rawRes.StatusCode != http.StatusOK {
		t.Fatalf("html export = %d", rawRes.StatusCode)
	}
	if cd := rawRes.Header.Get("Content-Disposition"); !strings.Contains(cd, ".html") {
		t.Fatalf("html export must be an attachment: %v", cd)
	}
	if !strings.Contains(string(raw), "Export marker") || !strings.Contains(string(raw), "ASSET_BASE") {
		t.Fatalf("html export missing runtime or model: %d bytes", len(raw))
	}

	authReq, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/projects/"+id+"/export/android", nil)
	authReq.AddCookie(owner)
	rawRes, err = h.server.Client().Do(authReq)
	if err != nil {
		t.Fatal(err)
	}
	zipBytes, _ := readBody(rawRes)
	if rawRes.StatusCode != http.StatusOK {
		t.Fatalf("android export = %d", rawRes.StatusCode)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("android export is not a zip: %v", err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	for _, want := range []string{"app/src/main/assets/index.html", "app/build.gradle.kts", "README.md"} {
		if !names[want] {
			t.Fatalf("android project missing %s (has %d files)", want, len(names))
		}
	}

	// Foreign users and anonymous callers cannot download someone's export.
	other := register(t, h, "bob@example.com", "bob")
	req2, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/projects/"+id+"/export/html", nil)
	req2.AddCookie(other)
	res2, err := h.server.Client().Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	readBody(res2)
	if res2.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign export = %d, want 404", res2.StatusCode)
	}
	res3, err := h.server.Client().Get(h.server.URL + "/api/projects/" + id + "/export/html")
	if err != nil {
		t.Fatal(err)
	}
	readBody(res3)
	if res3.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous export = %d, want 401", res3.StatusCode)
	}
}

// Published assets are publicly readable — and stop being readable the
// moment the project is unpublished.
func TestPublicAssetServing(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, owner, "app", "With Image")
	id, _ := created["id"].(string)

	png := []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 13, 'I', 'H', 'D', 'R',
		0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 10,
		'I', 'D', 'A', 'T', 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
		0x0d, 0x0a, 0x2d, 0xb4, 0, 0, 0, 0, 'I', 'E', 'N', 'D', 0xae, 0x42, 0x60, 0x82,
	}
	uploadBody := buildMultipart(t, "logo.png", "image/png", png)
	req, _ := http.NewRequest(http.MethodPost, h.server.URL+"/api/projects/"+id+"/assets", bytes.NewReader(uploadBody))
	req.Header.Set("Content-Type", multipartType)
	req.AddCookie(owner)
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	uploadPayload := decode(t, res)
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("upload = %d (%v)", res.StatusCode, uploadPayload)
	}
	asset, _ := uploadPayload["asset"].(map[string]any)
	assetID, _ := asset["id"].(string)

	// Before publish: anonymous raw is unauthorized.
	res, _ = call(t, h, http.MethodGet, "/api/assets/"+assetID+"/raw", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("private raw = %d, want 401", res.StatusCode)
	}

	publishProject(t, h, owner, id)
	rawRes, err := h.server.Client().Get(h.server.URL + "/api/assets/" + assetID + "/raw")
	if err != nil {
		t.Fatal(err)
	}
	rawBytes, _ := readBody(rawRes)
	if rawRes.StatusCode != http.StatusOK {
		t.Fatalf("published raw = %d, want 200", rawRes.StatusCode)
	}
	if ct := rawRes.Header.Get("Content-Type"); ct != "image/png" {
		t.Fatalf("published raw content type = %s", ct)
	}
	if !bytes.Equal(rawBytes, png) {
		t.Fatal("published raw bytes must be byte-identical")
	}

	// Unpublish cuts public access immediately.
	call(t, h, http.MethodPost, "/api/projects/"+id+"/unpublish", nil, owner)
	res, _ = call(t, h, http.MethodGet, "/api/assets/"+assetID+"/raw", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("raw after unpublish = %d, want 401", res.StatusCode)
	}
}
