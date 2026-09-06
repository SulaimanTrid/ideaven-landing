package project_test

import (
	"net/http"
	"testing"
)

// Project Intent (roadmap 7.0 M11): user-authored structured purpose.
// Upsert semantics, owner scoping, and field limits.
func TestProjectIntent(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Intent Fixture")
	id, _ := created["id"].(string)

	// Absent intent reads as the empty document.
	res, body := call(t, h, http.MethodGet, "/api/projects/"+id+"/intent", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("intent get = %d (%v)", res.StatusCode, body)
	}
	if got, _ := body["intent"].(map[string]any); got["goal"] != "" {
		t.Fatalf("fresh intent must be empty: %v", got)
	}

	// Set fills every field.
	payload := map[string]any{
		"goal":        "Teach multiplication to 2nd graders",
		"audience":    "Students and teachers",
		"platforms":   "Web + Android",
		"constraints": "Fast startup; accessible; offline-friendly",
		"success":     "A student completes a practice round unaided",
	}
	res, body = call(t, h, http.MethodPut, "/api/projects/"+id+"/intent", payload, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("intent set = %d (%v)", res.StatusCode, body)
	}

	// Round-trip.
	res, body = call(t, h, http.MethodGet, "/api/projects/"+id+"/intent", nil, cookie)
	intent, _ := body["intent"].(map[string]any)
	if intent["goal"] != payload["goal"] || intent["constraints"] != payload["constraints"] {
		t.Fatalf("intent round-trip wrong: %v", intent)
	}

	// Upsert replaces.
	res, _ = call(t, h, http.MethodPut, "/api/projects/"+id+"/intent", map[string]any{"goal": "Refocus on division"}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("intent overwrite = %d", res.StatusCode)
	}
	res, body = call(t, h, http.MethodGet, "/api/projects/"+id+"/intent", nil, cookie)
	intent, _ = body["intent"].(map[string]any)
	if intent["goal"] != "Refocus on division" || intent["audience"] != "" {
		t.Fatalf("overwrite semantics wrong: %v", intent)
	}

	// Ownership: another account cannot read or write.
	other := register(t, h, "bob@example.com", "bob")
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/intent", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign intent get = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodPut, "/api/projects/"+id+"/intent", payload, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign intent set = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/intent", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous intent get = %d, want 401", res.StatusCode)
	}
}
