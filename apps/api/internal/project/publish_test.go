package project_test

import (
	"net/http"
	"strings"
	"testing"
)

// Publishing (roadmap 19): owner endpoints snapshot + unpublish; the public
// endpoints answer anonymously from the stored snapshot only. These tests
// need PostgreSQL — the harness skips without one, like the rest of the
// integration suite.

// publishDraftModel saves a recognisable model, then publishes the project.
func publishProject(t *testing.T, h *harness, cookie *http.Cookie, projectID string) map[string]any {
	t.Helper()

	model := fullModel("app",
		map[string]any{
			"id":         "screen-home",
			"name":       "Home",
			"components": []any{map[string]any{"id": "c1", "type": "text", "props": map[string]any{"text": "Hello public"}}},
		})
	res, payload := call(t, h, http.MethodPut, "/api/projects/"+projectID+"/model", map[string]any{"model": model}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("save model: status = %d, payload %v", res.StatusCode, payload)
	}

	res, payload = call(t, h, http.MethodPost, "/api/projects/"+projectID+"/publish", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("publish: status = %d, payload %v", res.StatusCode, payload)
	}
	return payload
}

func TestPublishLifecycleEndToEnd(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Public App")
	id, _ := created["id"].(string)

	payload := publishProject(t, h, cookie, id)
	project := projectOf(payload)
	if project["status"] != "published" || project["visibility"] != "public" {
		t.Fatalf("publish must mark published+public: %v", project)
	}
	slug, _ := project["slug"].(string)
	if path, _ := payload["publicPath"].(string); path != "/p/"+slug {
		t.Fatalf("publicPath = %v, want /p/%s", payload["publicPath"], slug)
	}

	// Anonymous read of the snapshot.
	res, pub := call(t, h, http.MethodGet, "/api/public/projects/"+slug, nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("anonymous public fetch: status = %d, %v", res.StatusCode, pub)
	}
	publication, _ := pub["publication"].(map[string]any)
	if publication == nil || publication["slug"] != slug {
		t.Fatalf("publication missing or wrong slug: %v", pub)
	}
	model, _ := publication["model"].(map[string]any)
	if model == nil {
		t.Fatalf("publication must carry the model document: %v", publication)
	}

	// The gallery lists it.
	res, list := call(t, h, http.MethodGet, "/api/public/projects", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("gallery: status = %d, %v", res.StatusCode, list)
	}
	items, _ := list["publications"].([]any)
	if len(items) != 1 {
		t.Fatalf("gallery should list exactly one publication: %v", list)
	}

	// Editing after publish does not change the public snapshot.
	edited := fullModel("app", map[string]any{
		"id": "screen-home", "name": "Home",
		"components": []any{map[string]any{"id": "c1", "type": "text", "props": map[string]any{"text": "Edited"}}},
	})
	call(t, h, http.MethodPut, "/api/projects/"+id+"/model", map[string]any{"model": edited}, cookie)
	_, pub2 := call(t, h, http.MethodGet, "/api/public/projects/"+slug, nil, nil)
	publication2, _ := pub2["publication"].(map[string]any)
	if model2, _ := publication2["model"].(map[string]any); model2 != nil {
		if screens, _ := model2["screens"].([]any); len(screens) > 0 {
			screen, _ := screens[0].(map[string]any)
			if comps, _ := screen["components"].([]any); len(comps) > 0 {
				comp, _ := comps[0].(map[string]any)
				if props, _ := comp["props"].(map[string]any); props["text"] == "Edited" {
					t.Fatal("public snapshot changed after edit — republish must be required")
				}
			}
		}
	}

	// Republish picks the edit up (the edit from above is already saved).
	res, pub3body := call(t, h, http.MethodPost, "/api/projects/"+id+"/publish", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("republish: status = %d, %v", res.StatusCode, pub3body)
	}
	_, pub3 := call(t, h, http.MethodGet, "/api/public/projects/"+slug, nil, nil)
	publication3, _ := pub3["publication"].(map[string]any)
	model3, _ := publication3["model"].(map[string]any)
	screens3, _ := model3["screens"].([]any)
	screen3, _ := screens3[0].(map[string]any)
	comps3, _ := screen3["components"].([]any)
	comp3, _ := comps3[0].(map[string]any)
	props3, _ := comp3["props"].(map[string]any)
	if props3["text"] != "Edited" {
		t.Fatalf("republish must refresh the snapshot: %v", model3)
	}

	// Unpublish kills the public page immediately and returns to draft.
	res, up := call(t, h, http.MethodPost, "/api/projects/"+id+"/unpublish", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unpublish: status = %d, %v", res.StatusCode, up)
	}
	if projectOf(up)["status"] != "draft" {
		t.Fatalf("unpublish must return the project to draft: %v", up)
	}
	res, _ = call(t, h, http.MethodGet, "/api/public/projects/"+slug, nil, nil)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("public page after unpublish = %d, want 404", res.StatusCode)
	}
	res, list2 := call(t, h, http.MethodGet, "/api/public/projects", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("gallery after unpublish: %d, %v", res.StatusCode, list2)
	}
	if items2, _ := list2["publications"].([]any); len(items2) != 0 {
		t.Fatalf("gallery must drop unpublished projects: %v", list2)
	}
}

func TestPublishRequiresOwnership(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, owner, "app", "Private App")
	id, _ := created["id"].(string)

	other := register(t, h, "bob@example.com", "bob")
	res, payload := call(t, h, http.MethodPost, "/api/projects/"+id+"/publish", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign publish = %d (%v), want 404", res.StatusCode, payload)
	}
	res, _ = call(t, h, http.MethodPost, "/api/projects/"+id+"/unpublish", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign unpublish = %d, want 404", res.StatusCode)
	}
}

func TestPublishRequiresSession(t *testing.T) {
	h := newHarness(t)
	created := createProject(t, h, register(t, h, "ada@example.com", "ada"), "app", "App")
	id, _ := created["id"].(string)

	res, _ := call(t, h, http.MethodPost, "/api/projects/"+id+"/publish", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous publish = %d, want 401", res.StatusCode)
	}
}

func TestPublicUnknownSlugIs404(t *testing.T) {
	h := newHarness(t)
	res, _ := call(t, h, http.MethodGet, "/api/public/projects/does-not-exist", nil, nil)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown slug = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/public/projects/"+strings.Repeat("x", 150), nil, nil)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("oversized slug = %d, want 404", res.StatusCode)
	}
}

func TestUnpublishNotPublishedIsNoopSuccess(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Never Published")
	id, _ := created["id"].(string)

	res, payload := call(t, h, http.MethodPost, "/api/projects/"+id+"/unpublish", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unpublish of draft = %d (%v), want 200", res.StatusCode, payload)
	}
	if projectOf(payload)["status"] != "draft" {
		t.Fatalf("draft must stay draft: %v", payload)
	}
}
