package project_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"testing"
)

// TASK 11 / roadmap 4.0 M30: asset intelligence is owner-scoped and derives
// real facts (dimensions from image headers, usage, orphans, hints).
func TestAssetIntelligence(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ai-assets@ideaven.test", "aassets")
	created := createProject(t, h, owner, "app", "Asset IQ")
	projectID, _ := created["id"].(string)

	// A real 3x2 PNG (67 bytes) built inline: IHDR says 3x2, RGBA.
	png := []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0, 0x9d, 0x72, 0x5e, 0x9a, 0, 0, 0, 0x0c, 0x49, 0x44,
		0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18,
		0x24, 0xa8, 0x49, 0xae, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
	res := upload(t, h, owner, projectID, "file", "icon.png", png)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("upload = %d", res.StatusCode)
	}
	var uploaded struct {
		Asset struct {
			ID string `json:"id"`
		} `json:"asset"`
	}
	// Parse the upload response for the asset id.
	raw, _ := io.ReadAll(res.Body)
	if err := json.Unmarshal(raw, &uploaded); err != nil {
		t.Fatalf("upload body: %q", raw)
	}
	assetID := uploaded.Asset.ID

	// The model references the asset once → 1 use, not orphan.
	modelRef(t, h, owner, projectID, assetID)

	res2, report := call(t, h, http.MethodGet, "/api/projects/"+projectID+"/asset-intelligence", nil, owner)
	if res2.StatusCode != http.StatusOK {
		t.Fatalf("intelligence = %d, %v", res2.StatusCode, report)
	}
	intel, _ := report["intelligence"].(map[string]any)
	assets, _ := intel["assets"].([]any)
	if len(assets) != 1 {
		t.Fatalf("expected 1 asset entry, got %v", intel)
	}
	entry, _ := assets[0].(map[string]any)
	if entry["width"] != float64(3) || entry["height"] != float64(2) {
		t.Fatalf("dimensions wrong: %v", entry)
	}
	if entry["decodedMemory"] != float64(3*2*4) {
		t.Fatalf("decoded memory wrong: %v", entry)
	}
	if entry["uses"] != float64(1) || entry["orphan"] != false {
		t.Fatalf("usage wrong: %v", entry)
	}

	// Ownership: another account's session gets the project 404.
	other := register(t, h, "ai-assets-other@ideaven.test", "aassets2")
	res3, _ := call(t, h, http.MethodGet, "/api/projects/"+projectID+"/asset-intelligence", nil, other)
	if res3.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign intelligence = %d, want 404", res3.StatusCode)
	}

	// Anonymous 401.
	res4, _ := call(t, h, http.MethodGet, "/api/projects/"+projectID+"/asset-intelligence", nil, nil)
	if res4.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d, want 401", res4.StatusCode)
	}
}

// modelRef saves a model whose Text component's src references asset:<id>.
func modelRef(t *testing.T, h *harness, cookie *http.Cookie, projectID, assetID string) {
	t.Helper()
	res, payload := call(t, h, http.MethodGet, "/api/projects/"+projectID, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get project = %d", res.StatusCode)
	}
	project, _ := payload["project"].(map[string]any)
	model, _ := project["model"].(map[string]any)
	screens, _ := model["screens"].([]any)
	if len(screens) == 0 {
		t.Fatal("model has no screens")
	}
	screen, _ := screens[0].(map[string]any)
	// The blank initial model has no components — add one image component
	// whose src references the uploaded asset.
	screen["components"] = []any{map[string]any{
		"id": "c-img", "type": "image",
		"props": map[string]any{"src": "asset:" + assetID},
	}}
	body := map[string]any{"model": model, "origin": "edit"}
	res2, upd := call(t, h, http.MethodPut, "/api/projects/"+projectID+"/model", body, cookie)
	if res2.StatusCode != http.StatusOK {
		t.Fatalf("model put = %d, %v", res2.StatusCode, upd)
	}
}

// upload posts a multipart asset upload through the harness (the project
// package's harness registers the asset upload route).
func upload(t *testing.T, h *harness, cookie *http.Cookie, projectID, fieldName, fileName string, data []byte) *http.Response {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(fieldName, fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/projects/"+projectID+"/assets", &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.AddCookie(cookie)
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}
