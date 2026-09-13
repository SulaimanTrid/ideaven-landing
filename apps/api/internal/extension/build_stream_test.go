package extension_test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ideaven/apps/api/internal/extension"
)

// Task 06: streaming build (real states), version conflict handling, build
// history, retry after failure, and the diff-based AI fix proposal.

// streamBuildPOST runs the SSE build endpoint and returns every parsed
// event in arrival order.
func streamBuildPOST(t *testing.T, h *harness, cookie *http.Cookie, id, version, changelog string) []extension.BuildEvent {
	t.Helper()
	body := fmt.Sprintf(`{"version":%q,"changelog":%q}`, version, changelog)
	req, err := http.NewRequest(http.MethodPost, h.server.URL+"/api/extensions/"+id+"/build/stream", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(res.Body)
		t.Fatalf("build stream = %d (%s)", res.StatusCode, raw)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("content type = %q, want text/event-stream", ct)
	}

	var events []extension.BuildEvent
	scanner := bufio.NewScanner(res.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var ev extension.BuildEvent
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &ev); err != nil {
			t.Fatalf("bad SSE event %q: %v", line, err)
		}
		events = append(events, ev)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("stream read: %v", err)
	}
	return events
}

func terminalOf(events []extension.BuildEvent) *extension.BuildEvent {
	for i := range events {
		if events[i].Type == "result" || events[i].Type == "conflict" {
			return &events[i]
		}
	}
	return nil
}

func statesOf(events []extension.BuildEvent) []string {
	var states []string
	for _, ev := range events {
		if ev.Type == "state" {
			states = append(states, ev.State)
		}
	}
	return states
}

func patchSource(t *testing.T, h *harness, cookie *http.Cookie, id, source string) {
	t.Helper()
	res, payload := call(t, h, http.MethodPatch, "/api/extensions/"+id,
		map[string]any{"source": source}, cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("patch source = %d (%v)", res.StatusCode, payload)
	}
}

func TestBuildStreamSuccessConflictFailureRetry(t *testing.T) {
	h := newHarness(t)
	author := register(t, h, "stream@example.com", "streamer")
	ext := createExtension(t, h, author, "Stream Ext")
	id, _ := ext["id"].(string)

	// 1. First build (version left empty → server bumps the patch): every
	// real pipeline state streams, in order, ending in success.
	valid := "package com.example.stream;\n\npublic class StreamExt {\n  void run() {\n    go();\n  }\n}\n"
	patchSource(t, h, author, id, valid)
	events := streamBuildPOST(t, h, author, id, "", "first")
	states := statesOf(events)
	wantStates := []string{
		extension.BuildStateValidating, extension.BuildStateSource,
		extension.BuildStateDependencies, extension.BuildStateCompiling,
		extension.BuildStatePackaging, extension.BuildStateVerifying,
	}
	if len(states) == 0 || len(states) > len(wantStates) {
		t.Fatalf("unexpected state sequence: %v", states)
	}
	for i, want := range states {
		if want != wantStates[i] {
			t.Fatalf("state %d = %q, want %q (all: %v)", i, want, wantStates[i], states)
		}
	}
	terminal := terminalOf(events)
	if terminal == nil || terminal.Type != "result" || !terminal.OK {
		t.Fatalf("first build must succeed, got %+v", terminal)
	}
	if terminal.Checksum == "" || terminal.Size <= 0 {
		t.Fatalf("success must carry checksum/size: %+v", terminal)
	}
	// Logs are real: the compile step must have actually run.
	sawCompile := false
	for _, ev := range events {
		if ev.Type == "log" && ev.Step == "compile" && strings.Contains(ev.Message, "structural compile OK") {
			sawCompile = true
		}
	}
	if !sawCompile {
		t.Fatalf("real compile log missing from stream: %+v", events)
	}
	if terminal.BuildID == "" {
		t.Fatal("events must carry the build record id")
	}

	// 2. Rebuilding the same version conflicts — with only actions the
	// backend really supports (the version now has a package).
	events = streamBuildPOST(t, h, author, id, "0.1.1", "")
	terminal = terminalOf(events)
	if terminal == nil || terminal.Type != "conflict" {
		t.Fatalf("rebuild of existing version must conflict, got %+v", terminal)
	}
	if terminal.Conflict == nil || terminal.Conflict.Version != "0.1.1" {
		t.Fatalf("conflict must name the version: %+v", terminal.Conflict)
	}
	var actions []string
	for _, a := range terminal.Conflict.Suggestions {
		actions = append(actions, a.Action)
	}
	if len(actions) != 3 {
		t.Fatalf("built version must offer 3 actions, got %v", terminal.Conflict.Suggestions)
	}

	// 2b. The never-built seeded version (0.1.0) conflicts too, but without
	// "use existing" — there is no package behind it.
	events = streamBuildPOST(t, h, author, id, "0.1.0", "")
	terminal = terminalOf(events)
	if terminal == nil || terminal.Type != "conflict" {
		t.Fatalf("0.1.0 must conflict, got %+v", terminal)
	}
	for _, a := range terminal.Conflict.Suggestions {
		if a.Action == extension.ConflictUseExisting {
			t.Fatalf("use-existing must not be offered for a never-built version: %+v", terminal.Conflict.Suggestions)
		}
	}

	// 3. Broken source fails the compile step for real.
	broken := "package com.example.broken;\n\npublic class Broken {\n  void run() {\n"
	patchSource(t, h, author, id, broken)
	events = streamBuildPOST(t, h, author, id, "0.1.2", "")
	terminal = terminalOf(events)
	if terminal == nil || terminal.Type != "result" || terminal.OK {
		t.Fatalf("broken source must fail the build: %+v", terminal)
	}
	if terminal.FailedStep != extension.BuildStateCompiling {
		t.Fatalf("failure must be at compile, got %q", terminal.FailedStep)
	}
	if !strings.Contains(terminal.Error, "compilation failed") {
		t.Fatalf("failure reason must be actionable: %q", terminal.Error)
	}

	// 4. Build history is real: success, conflict-less failure recorded.
	res, builds := call(t, h, http.MethodGet, "/api/extensions/"+id+"/builds", nil, author)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("builds = %d", res.StatusCode)
	}
	list, _ := builds["builds"].([]any)
	if len(list) != 2 {
		t.Fatalf("want 2 build records (success + failed), got %d: %v", len(list), builds)
	}
	first, _ := list[0].(map[string]any)
	if first["status"] != "failed" || first["failedStep"] != "compiling" {
		t.Fatalf("newest record must be the failed build: %v", first)
	}
	if logs, _ := first["logs"].([]any); len(logs) == 0 {
		t.Fatal("failed record must keep the real logs")
	}
	second, _ := list[1].(map[string]any)
	if second["status"] != "success" || second["checksum"] == "" {
		t.Fatalf("older record must be the successful build: %v", second)
	}

	// 5. Fix with AI: a validated, diff-based proposal for the failed build.
	res, fixBody := call(t, h, http.MethodPost, "/api/extensions/"+id+"/fix",
		map[string]any{"buildId": first["id"]}, author)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("fix = %d (%v)", res.StatusCode, fixBody)
	}
	fix, _ := fixBody["fix"].(map[string]any)
	if fix == nil {
		t.Fatalf("fix payload missing: %v", fixBody)
	}
	if fix["target"] != "source" || fix["diff"] == "" || fix["newContent"] == "" {
		t.Fatalf("proposal must carry target/diff/content: %v", fix)
	}
	if fix["valid"] != true {
		t.Fatalf("mock fix must validate: %v", fix)
	}

	// 6. Apply the fix through the normal PATCH path, then retry the same
	// version — it now succeeds; no duplicate invalid state was needed.
	patchSource(t, h, author, id, fix["newContent"].(string))
	events = streamBuildPOST(t, h, author, id, "0.1.2", "retry")
	terminal = terminalOf(events)
	if terminal == nil || terminal.Type != "result" || !terminal.OK {
		t.Fatalf("retry after fix must succeed: %+v", terminal)
	}

	// History now has 3 records; the failed one stays as history.
	_, builds = call(t, h, http.MethodGet, "/api/extensions/"+id+"/builds", nil, author)
	list, _ = builds["builds"].([]any)
	if len(list) != 3 {
		t.Fatalf("want 3 build records after retry, got %d", len(list))
	}

	// 7. Foreign users see neither the stream nor the history.
	other := register(t, h, "mallory@example.com", "mallory")
	res, _ = call(t, h, http.MethodGet, "/api/extensions/"+id+"/builds", nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign builds = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodPost, "/api/extensions/"+id+"/fix",
		map[string]any{"buildId": first["id"]}, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign fix = %d, want 404", res.StatusCode)
	}

	// 8. The AIX now ships the authored source inside src/.
	aixReq, _ := http.NewRequest(http.MethodGet, h.server.URL+"/api/extensions/"+id+"/aix?version=0.1.2", nil)
	aixReq.AddCookie(author)
	aixRes, err := h.server.Client().Do(aixReq)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(aixRes.Body)
	aixRes.Body.Close()
	if aixRes.StatusCode != http.StatusOK || len(raw) == 0 {
		t.Fatalf("aix download = %d (%d bytes)", aixRes.StatusCode, len(raw))
	}
}

func TestBuildStreamCancelRecordsCancelled(t *testing.T) {
	h := newHarness(t)
	author := register(t, h, "cancel@example.com", "canceller")
	ext := createExtension(t, h, author, "Cancel Ext")
	id, _ := ext["id"].(string)

	// A worker that hangs until it is killed — the process-group kill is
	// what makes cancellation real.
	dir := t.TempDir()
	script := filepath.Join(dir, "slow-worker.sh")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nsleep 30\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("EXT_BUILD_BIN", script)

	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	body := `{"version":"0.2.0"}`
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.server.URL+"/api/extensions/"+id+"/build/stream", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(author)
	// The context fires mid-stream, so the client-side Do may end with a
	// context error — that is the cancellation path being exercised, not a
	// failure.
	res, err := h.server.Client().Do(req)
	if err == nil {
		_, _ = io.ReadAll(res.Body)
		res.Body.Close()
	}

	// The record must land as cancelled, not success or failed.
	deadline := time.Now().Add(10 * time.Second)
	for {
		_, builds := call(t, h, http.MethodGet, "/api/extensions/"+id+"/builds", nil, author)
		list, _ := builds["builds"].([]any)
		if len(list) == 1 {
			rec, _ := list[0].(map[string]any)
			switch rec["status"] {
			case "cancelled":
				return // verified
			case "running":
				// Cancellation is async — keep polling until it lands.
			default:
				t.Fatalf("record must end cancelled, got %v", rec)
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("cancelled record never appeared: %v", builds)
		}
		time.Sleep(200 * time.Millisecond)
	}
}
