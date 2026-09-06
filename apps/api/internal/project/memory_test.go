package project_test

import (
	"net/http"
	"testing"
)

// Project Memory (roadmap 5.0 M5): durable per-project AI rules. Closed
// categories, owner-scoped reads/writes, no cross-project leakage.
func TestProjectMemory(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "mem@example.com", "memuser")
	created := createProject(t, h, cookie, "app", "Memory Fixture")
	id, _ := created["id"].(string)

	// Add two rules.
	res, body := call(t, h, http.MethodPost, "/api/projects/"+id+"/memory",
		map[string]any{"category": "ui", "content": "Use the existing Button component."}, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("memory add = %d (%v)", res.StatusCode, body)
	}
	first, _ := body["memory"].(map[string]any)
	if first["id"] == "" || first["category"] != "ui" {
		t.Fatalf("memory add payload wrong: %v", body)
	}

	res, _ = call(t, h, http.MethodPost, "/api/projects/"+id+"/memory",
		map[string]any{"category": "forbidden", "content": "Do not modify the auth screen."}, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("memory add 2 = %d", res.StatusCode)
	}

	// List returns both, oldest first.
	res, body = call(t, h, http.MethodGet, "/api/projects/"+id+"/memory", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("memory list = %d (%v)", res.StatusCode, body)
	}
	items, _ := body["memory"].([]any)
	if len(items) != 2 {
		t.Fatalf("expected 2 rules, got %v", items)
	}
	if first, _ := items[0].(map[string]any); first["category"] != "ui" {
		t.Fatalf("list order wrong: %v", items)
	}

	// Closed vocabulary: unknown categories are rejected.
	res, _ = call(t, h, http.MethodPost, "/api/projects/"+id+"/memory",
		map[string]any{"category": "chaos", "content": "x"}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown category = %d, want 400", res.StatusCode)
	}
	// Empty content rejected.
	res, _ = call(t, h, http.MethodPost, "/api/projects/"+id+"/memory",
		map[string]any{"category": "ui", "content": "   "}, cookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty content = %d, want 400", res.StatusCode)
	}

	// Ownership: another account sees nothing and cannot add.
	other := register(t, h, "mem2@example.com", "memuser2")
	res, body = call(t, h, http.MethodGet, "/api/projects/"+id+"/memory", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign memory list = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodPost, "/api/projects/"+id+"/memory",
		map[string]any{"category": "ui", "content": "injected"}, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign memory add = %d, want 404", res.StatusCode)
	}

	// Delete: owner removes one; a foreign delete of that id is 404.
	firstID, _ := first["id"].(string)
	res, _ = call(t, h, http.MethodDelete, "/api/projects/"+id+"/memory/"+firstID, nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign memory delete = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodDelete, "/api/projects/"+id+"/memory/"+firstID, nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("memory delete = %d", res.StatusCode)
	}
	res, body = call(t, h, http.MethodGet, "/api/projects/"+id+"/memory", nil, cookie)
	items, _ = body["memory"].([]any)
	if res.StatusCode != http.StatusOK || len(items) != 1 {
		t.Fatalf("after delete expected 1 rule: %d %v", res.StatusCode, body)
	}

	// Unknown ids delete to 404.
	res, _ = call(t, h, http.MethodDelete, "/api/projects/"+id+"/memory/00000000-0000-0000-0000-000000000000", nil, cookie)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown memory delete = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/memory", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous memory list = %d, want 401", res.StatusCode)
	}
}
