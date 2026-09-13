package project_test

import (
	"archive/zip"
	"bytes"
	"mime/multipart"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// 6J project package portability: export a real zip (metadata + model +
// assets), import it back as a NEW owned project with remapped asset refs.
func TestProjectPackageRoundTrip(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "pkg@ideaven.test", "pkguser")
	created := createProject(t, h, owner, "game", "Package Star")
	projectID, _ := created["id"].(string)

	// Upload a real asset and reference it in the model.
	png := []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0, 0x9d, 0x72, 0x5e, 0x9a, 0, 0, 0, 0x0c, 0x49, 0x44,
		0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18,
		0x24, 0xa8, 0x49, 0xae, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
	uploadRes, uploadPayload := upload2(t, h, owner, projectID, "file", "icon.png", png)
	if uploadRes.StatusCode != http.StatusCreated {
		t.Fatalf("upload = %d, %v", uploadRes.StatusCode, uploadPayload)
	}
	uploaded := struct{ Asset struct{ ID string `json:"id"` } `json:"asset"` }{}
	if b, _ := json.Marshal(uploadPayload); json.Unmarshal(b, &uploaded) != nil {
		t.Fatal("upload payload unparsable")
	}

	model := modelOf(t, h, owner, projectID)
	screen0, _ := model["screens"].([]any)[0].(map[string]any)
	screen0["components"] = []any{map[string]any{
		"id": "c-img", "type": "image",
		"props": map[string]any{"src": "asset:" + uploaded.Asset.ID},
	}}
	if res := putModel(t, h, owner, projectID, model); res.StatusCode != http.StatusOK {
		t.Fatalf("model put = %d", res.StatusCode)
	}

	// EXPORT: download the package zip.
	req2, err := http.NewRequest(http.MethodGet, h.server.URL+"/api/projects/"+projectID+"/package", nil)
	if err != nil {
		t.Fatal(err)
	}
	req2.AddCookie(owner)
	pkgRes, err := h.server.Client().Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	defer pkgRes.Body.Close()
	if pkgRes.StatusCode != http.StatusOK {
		t.Fatalf("package = %d", pkgRes.StatusCode)
	}
	pkgBytes, _ := io.ReadAll(pkgRes.Body)
	zr, err := zip.NewReader(bytes.NewReader(pkgBytes), int64(len(pkgBytes)))
	if err != nil {
		t.Fatalf("package is not a zip: %v", err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	if !names["package.json"] || !names["model.json"] {
		t.Fatalf("package missing entries: %v", names)
	}
	hasAsset := false
	for name := range names {
		if strings.HasPrefix(name, "assets/") {
			hasAsset = true
		}
	}
	if !hasAsset {
		t.Fatal("package missing the asset")
	}

	// IMPORT: restore as a new project.
	importBody := &bytes.Buffer{}
	writer := multipart.NewWriter(importBody)
	part, err := writer.CreateFormFile("file", "package.zip")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(pkgBytes); err != nil {
		t.Fatal(err)
	}
	writer.Close()
	importReq, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/projects/import", importBody)
	if err != nil {
		t.Fatal(err)
	}
	importReq.Header.Set("Content-Type", writer.FormDataContentType())
	importReq.AddCookie(owner)
	importRes, err := h.server.Client().Do(importReq)
	if err != nil {
		t.Fatal(err)
	}
	defer importRes.Body.Close()
	importBodyBytes, _ := io.ReadAll(importRes.Body)
	if importRes.StatusCode != http.StatusCreated {
		t.Fatalf("import = %d, %s", importRes.StatusCode, importBodyBytes)
	}
	var imported struct {
		Project struct {
			ID   string `json:"id"`
			Slug string `json:"slug"`
			Name string `json:"name"`
		} `json:"project"`
	}
	if err := json.Unmarshal(importBodyBytes, &imported); err != nil {
		t.Fatal(err)
	}
	if imported.Project.ID == projectID {
		t.Fatal("import must create a NEW project id")
	}
	if !strings.Contains(imported.Project.Name, "(imported)") {
		t.Fatalf("imported name = %q", imported.Project.Name)
	}

	// The imported model remaps to NEW asset ids.
	importedModel := modelOf(t, h, owner, imported.Project.ID)
	text, _ := json.Marshal(importedModel)
	if strings.Contains(string(text), "asset:"+uploaded.Asset.ID) {
		t.Fatal("imported model still references the ORIGINAL asset id")
	}
	if !strings.Contains(string(text), "asset:") {
		t.Fatal("imported model lost its asset reference")
	}

	// Foreign/anonymous denied.
	other := register(t, h, "pkg-other@ideaven.test", "pkgother")
	res3, _ := call(t, h, http.MethodGet, "/api/projects/"+projectID+"/package", nil, other)
	if res3.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign package = %d, want 404", res3.StatusCode)
	}
	res4, _ := call(t, h, http.MethodGet, "/api/projects/"+projectID+"/package", nil, nil)
	if res4.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous package = %d, want 401", res4.StatusCode)
	}
}

var _ = zip.NewWriter
var _ = bytes.MinRead
var _ = strings.TrimSpace
var _ = json.Marshal
var _ = io.Discard

// upload2 is upload() with a parsed JSON payload.
func upload2(t *testing.T, h *harness, cookie *http.Cookie, projectID, fieldName, fileName string, data []byte) (*http.Response, map[string]any) {
	t.Helper()
	res := upload(t, h, cookie, projectID, fieldName, fileName, data)
	raw, _ := io.ReadAll(res.Body)
	payload := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("non-JSON upload response: %q", raw)
		}
	}
	return res, payload
}
