package project_test

import (
	"net/http"
	"testing"
)

// Project DNA (roadmap 4.0 M3): the derived understanding document. Every
// field must come from the real model — counts, variable usage, orphan
// assets, extension provenance, and health agreement with the M1 report.
func TestProjectDNA(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "dna@example.com", "dnauser")
	created := createProject(t, h, cookie, "app", "DNA Fixture")
	id, _ := created["id"].(string)

	model := fullModel("app",
		map[string]any{
			"id":   "screen-home",
			"name": "Home",
			"components": []any{
				map[string]any{"id": "img1", "type": "image", "props": map[string]any{"src": "asset:asset-real"}},
				map[string]any{"id": "lbl1", "type": "label", "props": map[string]any{"text": "Hi"}},
			},
			"logic": map[string]any{
				"handlers": []any{
					map[string]any{
						"id": "h1", "componentId": "img1", "event": "click",
						"body": []any{
							map[string]any{"id": "b1", "kind": "statement", "type": "set-variable",
								"inputs": map[string]any{"name": "score", "value": 1}},
							map[string]any{"id": "b2", "kind": "statement", "type": "navigate",
								"inputs": map[string]any{"screenId": "screen-two"}},
							map[string]any{"id": "b3", "kind": "statement", "type": "ext:remote-control:vibrate",
								"inputs": map[string]any{}},
						},
					},
					map[string]any{
						"id": "h2", "event": "initialize",
						"body": []any{
							map[string]any{"id": "b4", "kind": "statement", "type": "set-variable",
								"inputs": map[string]any{"name": "score", "value": 0}},
							map[string]any{"id": "b5", "kind": "statement", "type": "navigate",
								"inputs": map[string]any{"screenId": "screen-ghost"}},
						},
					},
				},
			},
		},
		map[string]any{"id": "screen-two", "name": "Two", "components": []any{}})
	model["variables"] = []any{map[string]any{"id": "v1", "name": "score", "type": "number"}}
	model["assets"] = []any{
		map[string]any{"id": "asset-real", "kind": "image", "name": "hero.png"},
		map[string]any{"id": "asset-lonely", "kind": "image", "name": "unused.png"},
	}
	res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model", map[string]any{"model": model}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("save model = %d (%v)", res.StatusCode, payload)
	}

	res, body := call(t, h, http.MethodGet, "/api/projects/"+id+"/dna", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("dna = %d (%v)", res.StatusCode, body)
	}
	dna, _ := body["dna"].(map[string]any)
	if dna == nil {
		t.Fatalf("missing dna: %v", body)
	}

	purpose, _ := dna["purpose"].(map[string]any)
	if purpose["name"] != "DNA Fixture" || purpose["type"] != "app" {
		t.Fatalf("purpose wrong: %v", purpose)
	}

	arch, _ := dna["architecture"].(map[string]any)
	if arch["screens"] != float64(2) || arch["components"] != float64(2) {
		t.Fatalf("architecture counts wrong: %v", arch)
	}
	if arch["startScreen"] != "Home" {
		t.Fatalf("start screen wrong: %v", arch["startScreen"])
	}
	if nav, _ := arch["navigation"].(map[string]any); nav["Home"] != "Two" {
		t.Fatalf("navigation map wrong: %v", nav)
	}
	if empty, _ := arch["emptyScreens"].([]any); len(empty) != 1 || empty[0] != "Two" {
		t.Fatalf("empty screens wrong: %v", empty)
	}
	if byType, _ := arch["byType"].(map[string]any); byType["image"] != float64(1) || byType["label"] != float64(1) {
		t.Fatalf("byType wrong: %v", byType)
	}

	state, _ := dna["state"].(map[string]any)
	vars, _ := state["variables"].([]any)
	if len(vars) != 1 {
		t.Fatalf("expected 1 variable, got %v", vars)
	}
	score := vars[0].(map[string]any)
	if score["name"] != "score" || score["writes"] != float64(2) {
		t.Fatalf("variable usage wrong: %v", score)
	}

	assets, _ := dna["assets"].([]any)
	if len(assets) != 2 {
		t.Fatalf("expected 2 assets, got %v", assets)
	}
	orphanCount := 0
	for _, raw := range assets {
		asset := raw.(map[string]any)
		if asset["orphan"] == true {
			orphanCount += 1
		} else if asset["usedBy"] != float64(1) {
			t.Fatalf("used asset count wrong: %v", asset)
		}
	}
	if orphanCount != 1 {
		t.Fatalf("expected exactly 1 orphan asset: %v", assets)
	}

	exts, _ := dna["extensions"].([]any)
	if len(exts) != 1 || exts[0] != "remote-control" {
		t.Fatalf("extension provenance wrong: %v", exts)
	}

	health, _ := dna["health"].(map[string]any)
	if health["critical"] == float64(0) {
		t.Fatalf("ghost navigate must surface as critical: %v", health)
	}
	if dims, _ := health["dimensions"].(map[string]any); dims["build"] != "critical" {
		t.Fatalf("dimensions must agree with intelligence: %v", dims)
	}

	// Ownership: another account cannot read the DNA.
	other := register(t, h, "dna2@example.com", "dnauser2")
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/dna", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign dna = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/dna", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous dna = %d, want 401", res.StatusCode)
	}
}
