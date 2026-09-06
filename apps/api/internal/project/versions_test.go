package project_test

import (
	"fmt"
	"net/http"
	"testing"

	"ideaven/apps/api/internal/project"
)

// Server-side version history: every changed model save snapshots the new
// state (identical consecutive saves dedupe), listings exclude documents,
// and restores ride the same validated GET path.

// saveModelText PUTs a model whose only text component reads `text`.
func saveModelText(t *testing.T, h *harness, cookie *http.Cookie, id, text string) map[string]any {
	t.Helper()
	model := fullModel("app", map[string]any{
		"id": "screen-home", "name": "Home",
		"components": []any{
			map[string]any{
				"id": "c-text-1", "type": "text",
				"props": map[string]any{"text": text},
			},
		},
	})
	res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model",
		map[string]any{"model": model}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("put model (%q): status = %d, payload %v", text, res.StatusCode, payload)
	}
	return model
}

func versionList(t *testing.T, h *harness, cookie *http.Cookie, projectID string) []any {
	t.Helper()
	res, payload := call(t, h, http.MethodGet, "/api/projects/"+projectID+"/versions", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list versions: status = %d, payload %v", res.StatusCode, payload)
	}
	versions, _ := payload["versions"].([]any)
	return versions
}

func TestModelSaveCreatesVersions(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	id := createProject(t, h, cookie, "app", "Versioned")["id"].(string)

	if versions := versionList(t, h, cookie, id); len(versions) != 0 {
		t.Fatalf("fresh project: want 0 versions, got %d", len(versions))
	}

	saveModelText(t, h, cookie, id, "first")
	saveModelText(t, h, cookie, id, "second")
	if versions := versionList(t, h, cookie, id); len(versions) != 2 {
		t.Fatalf("after two changed saves: want 2 versions, got %d", len(versions))
	}

	// An identical autosave re-fire must not add a snapshot.
	saveModelText(t, h, cookie, id, "second")
	if versions := versionList(t, h, cookie, id); len(versions) != 2 {
		t.Fatalf("identical resave: want 2 versions, got %d", len(versions))
	}
}

func TestVersionRestoreReturnsSavedModel(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	id := createProject(t, h, cookie, "app", "Restorable")["id"].(string)

	saveModelText(t, h, cookie, id, "first")
	saveModelText(t, h, cookie, id, "second")

	versions := versionList(t, h, cookie, id)
	if len(versions) != 2 {
		t.Fatalf("want 2 versions, got %d", len(versions))
	}
	// Newest first: index 1 is the "first" save.
	oldest := versions[1].(map[string]any)
	versionID := oldest["id"].(string)

	res, payload := call(t, h, http.MethodGet, "/api/projects/"+id+"/versions/"+versionID, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get version: status = %d, payload %v", res.StatusCode, payload)
	}
	version := payload["version"].(map[string]any)
	model := version["model"].(map[string]any)
	screens := model["screens"].([]any)
	components := screens[0].(map[string]any)["components"].([]any)
	text := components[0].(map[string]any)["props"].(map[string]any)["text"]
	if text != "first" {
		t.Fatalf("oldest version should hold the first save, got %q", text)
	}
}

func TestVersionsAreScopedToOwner(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	stranger := register(t, h, "mallory@example.com", "mallory")
	id := createProject(t, h, owner, "app", "Private")["id"].(string)
	saveModelText(t, h, owner, id, "secret")

	res, _ := call(t, h, http.MethodGet, "/api/projects/"+id+"/versions", nil, stranger)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign list: status = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/versions/00000000-0000-0000-0000-000000000000", nil, stranger)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign get: status = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/versions", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous list: status = %d, want 401", res.StatusCode)
	}
}

func TestVersionUnknownIDsAre404(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	id := createProject(t, h, cookie, "app", "Sparse")["id"].(string)

	res, payload := call(t, h, http.MethodGet, "/api/projects/"+id+"/versions/not-a-uuid", nil, cookie)
	if res.StatusCode != http.StatusBadRequest && res.StatusCode != http.StatusNotFound {
		t.Fatalf("garbage version id: status = %d, payload %v", res.StatusCode, payload)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/versions/00000000-0000-0000-0000-000000000000", nil, cookie)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("missing version: status = %d, want 404", res.StatusCode)
	}
}

func TestVersionsPruneToCap(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	id := createProject(t, h, cookie, "app", "Chatty")["id"].(string)

	for i := 0; i < project.MaxVersionsPerProject+5; i++ {
		saveModelText(t, h, cookie, id, fmt.Sprintf("state-%d", i))
	}
	versions := versionList(t, h, cookie, id)
	if len(versions) != project.MaxVersionsPerProject {
		t.Fatalf("prune: want %d versions, got %d", project.MaxVersionsPerProject, len(versions))
	}
	// The newest snapshot must be the last saved state.
	newest := versions[0].(map[string]any)
	res, payload := call(t, h, http.MethodGet, "/api/projects/"+id+"/versions/"+newest["id"].(string), nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("newest version get: status = %d", res.StatusCode)
	}
	model := payload["version"].(map[string]any)["model"].(map[string]any)
	screens := model["screens"].([]any)
	components := screens[0].(map[string]any)["components"].([]any)
	text := components[0].(map[string]any)["props"].(map[string]any)["text"]
	want := fmt.Sprintf("state-%d", project.MaxVersionsPerProject+4)
	if text != want {
		t.Fatalf("newest version holds %q, want %q", text, want)
	}
}

// AI-labelled snapshots: saves carrying origin:"ai" are visible as such in
// the history, and unknown origins are rejected up front.

func saveModelWithOrigin(t *testing.T, h *harness, cookie *http.Cookie, id, text, origin string) {
	t.Helper()
	model := fullModel("app", map[string]any{
		"id": "screen-home", "name": "Home",
		"components": []any{
			map[string]any{
				"id": "c-text-1", "type": "text",
				"props": map[string]any{"text": text},
			},
		},
	})
	res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model",
		map[string]any{"model": model, "origin": origin}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("put model origin=%q: status = %d, payload %v", origin, res.StatusCode, payload)
	}
}

func TestVersionOriginLabelsAISaves(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	id := createProject(t, h, cookie, "app", "Labelled")["id"].(string)

	saveModelWithOrigin(t, h, cookie, id, "plain edit", "")
	saveModelWithOrigin(t, h, cookie, id, "ai change", "ai")

	versions := versionList(t, h, cookie, id)
	if len(versions) != 2 {
		t.Fatalf("want 2 versions, got %d", len(versions))
	}
	// Newest first: the AI save must be labelled, the edit default-labelled.
	newest := versions[0].(map[string]any)
	oldest := versions[1].(map[string]any)
	if newest["origin"] != "ai" {
		t.Fatalf("newest origin = %v, want ai", newest["origin"])
	}
	if oldest["origin"] != "edit" {
		t.Fatalf("oldest origin = %v, want edit", oldest["origin"])
	}

	// The single-version GET exposes origin too.
	res, payload := call(t, h, http.MethodGet, "/api/projects/"+id+"/versions/"+newest["id"].(string), nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get version: status = %d", res.StatusCode)
	}
	version := payload["version"].(map[string]any)
	if version["origin"] != "ai" {
		t.Fatalf("get version origin = %v, want ai", version["origin"])
	}
}

func TestVersionOriginRejectsUnknownValues(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	id := createProject(t, h, cookie, "app", "Strict")["id"].(string)

	model := fullModel("app")
	res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model",
		map[string]any{"model": model, "origin": "format-disk"}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown origin: status = %d, payload %v", res.StatusCode, payload)
	}
	// The save itself must not have gone through.
	if versions := versionList(t, h, cookie, id); len(versions) != 0 {
		t.Fatalf("rejected save must not snapshot, got %d versions", len(versions))
	}
}
