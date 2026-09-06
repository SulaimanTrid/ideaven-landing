package project_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// Project Intelligence (roadmap 3.0 M1): derived-only report over the
// canonical model — counts, navigation graph, dangling references, and the
// seven health dimensions.
func TestIntelligenceReport(t *testing.T) {
	h := newHarness(t)
	cookie := register(t, h, "ada@example.com", "ada")
	created := createProject(t, h, cookie, "app", "Smart App")
	id, _ := created["id"].(string)

	model := fullModel("app",
		map[string]any{
			"id":   "screen-home",
			"name": "Home",
			"components": []any{
				map[string]any{"id": "btn1", "type": "button", "props": map[string]any{"label": "Go"}},
				map[string]any{"id": "btn2", "type": "button", "props": map[string]any{}},
				map[string]any{"id": "img1", "type": "image", "props": map[string]any{"src": "asset:missing"}},
			},
			"logic": map[string]any{
				"handlers": []any{
					map[string]any{
						"id": "h1", "componentId": "btn1", "event": "click",
						"body": []any{
							map[string]any{"id": "b1", "kind": "statement", "type": "navigate",
								"inputs": map[string]any{"screenId": "screen-next"}},
							map[string]any{"id": "b2", "kind": "statement", "type": "navigate",
								"inputs": map[string]any{"screenId": "screen-ghost"}},
							map[string]any{"id": "b3", "kind": "statement", "type": "set-variable",
								"inputs": map[string]any{"name": "nope"}, "slots": map[string]any{
									"value": map[string]any{"id": "b3v", "kind": "expression", "type": "number", "inputs": map[string]any{"value": 1}},
								}},
						},
					},
					map[string]any{"id": "h2", "componentId": "deleted-c", "event": "click", "body": []any{}},
				},
			},
		},
		map[string]any{
			"id": "screen-next", "name": "Next", "components": []any{},
		})
	res, payload := call(t, h, http.MethodPut, "/api/projects/"+id+"/model", map[string]any{"model": model}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("save model = %d (%v)", res.StatusCode, payload)
	}

	res, body := call(t, h, http.MethodGet, "/api/projects/"+id+"/intelligence", nil, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("intelligence = %d (%v)", res.StatusCode, body)
	}
	report, _ := body["intelligence"].(map[string]any)
	if report == nil {
		t.Fatalf("missing intelligence: %v", body)
	}

	counts, _ := report["counts"].(map[string]any)
	if counts["screens"] != float64(2) || counts["components"] != float64(3) {
		t.Fatalf("counts wrong: %v", counts)
	}
	if byType, _ := counts["byType"].(map[string]any); byType["button"] != float64(2) {
		t.Fatalf("byType wrong: %v", byType)
	}
	if counts["handlers"] != float64(2) || counts["blocks"] != float64(4) {
		t.Fatalf("handler/block counts wrong: %v", counts)
	}

	// Navigation graph keeps the valid edge and flags the ghost target; the
	// kept edge carries provenance back to its handler/block.
	nav, _ := report["navigation"].([]any)
	if len(nav) != 1 {
		t.Fatalf("navigation edges = %v", report["navigation"])
	}
	edge := nav[0].(map[string]any)
	if edge["handlerId"] != "h1" || edge["blockId"] != "b1" {
		t.Fatalf("edge provenance wrong: %v", edge)
	}

	// Issues: dangling handler (critical), ghost navigation (critical),
	// unknown variable (critical), missing asset (attention), unlabeled
	// button (attention), empty screen (info).
	issues, _ := report["issues"].([]any)
	if len(issues) < 6 {
		t.Fatalf("expected at least 6 issues, got %d: %v", len(issues), report["issues"])
	}
	bySeverity := map[string]int{}
	variableIssueFound := false
	for _, raw := range issues {
		issue := raw.(map[string]any)
		bySeverity[issue["severity"].(string)]++
		if msg, _ := issue["message"].(string); msg == "Variable “nope” does not exist — create it in the Variables panel." {
			variableIssueFound = true
			if issue["handlerId"] != "h1" || issue["blockId"] != "b3" {
				t.Fatalf("variable issue missing provenance: %v", issue)
			}
		}
		// Block-level issues must be clickable-through: they carry their
		// handler so the UI can open Blocks mode on the cause.
		if msg, _ := issue["message"].(string); msg != "" && issue["severity"] == "critical" && issue["blockId"] != nil && issue["handlerId"] == nil {
			t.Fatalf("critical block issue without handler provenance: %v", issue)
		}
	}
	if !variableIssueFound {
		t.Fatalf("unknown variable not reported: %v", issues)
	}
	if bySeverity["critical"] < 3 {
		t.Fatalf("expected >=3 critical issues: %v", bySeverity)
	}

	health, _ := report["health"].(map[string]any)
	if health["build"] != "critical" {
		t.Fatalf("build health must be critical with dangling refs: %v", health)
	}
	if health["accessibility"] != "attention" {
		t.Fatalf("a11y health must be attention with an unlabeled button: %v", health)
	}

	// Ownership: another account cannot read the report.
	other := register(t, h, "bob@example.com", "bob")
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/intelligence", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign intelligence = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodGet, "/api/projects/"+id+"/intelligence", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous intelligence = %d, want 401", res.StatusCode)
	}
	_ = json.Marshal
}
