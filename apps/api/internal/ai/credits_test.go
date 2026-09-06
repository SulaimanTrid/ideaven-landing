package ai

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Credits: an honest, derived daily allowance computed from the ai_usage
// ledger. Only successful completions count; exhaustion is enforced before
// the provider is ever called.

func getJSON(t *testing.T, server *httptest.Server, path, cookie string) (*http.Response, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, server.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "ideaven_session", Value: cookie})
	}
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := ioReadAll(res.Body)
	payload := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("non-JSON response: %q", raw)
		}
	}
	return res, payload
}

func creditsOf(t *testing.T, payload map[string]any) map[string]any {
	t.Helper()
	credits, _ := payload["credits"].(map[string]any)
	if credits == nil {
		t.Fatalf("missing credits in %v", payload)
	}
	return credits
}

func TestCreditsFreshUserHasFullAllowance(t *testing.T) {
	_, server, _ := newTestHandler(t, goodOutput, http.StatusOK)
	res, payload := getJSON(t, server, "/api/ai/credits", "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("credits: status = %d, payload %v", res.StatusCode, payload)
	}
	credits := creditsOf(t, payload)
	if credits["usedToday"] != float64(0) || credits["remaining"] != float64(DailyFreeCommands) {
		t.Fatalf("fresh user credits = %v", credits)
	}
	if credits["dailyLimit"] != float64(DailyFreeCommands) {
		t.Fatalf("dailyLimit = %v", credits["dailyLimit"])
	}
	if credits["resetsAt"] == "" {
		t.Fatalf("resetsAt missing: %v", credits)
	}
}

func TestCreditsRequiresSession(t *testing.T) {
	_, server, _ := newTestHandler(t, goodOutput, http.StatusOK)
	res, _ := getJSON(t, server, "/api/ai/credits", "")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous credits: status = %d, want 401", res.StatusCode)
	}
}

func TestCommandCountsTowardQuota(t *testing.T) {
	_, server, _ := newTestHandler(t, goodOutput, http.StatusOK)
	res, payload := post(t, server, `{"prompt":"x"}`, "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("command: status = %d, payload %v", res.StatusCode, payload)
	}

	res, payload = getJSON(t, server, "/api/ai/credits", "test-session")
	credits := creditsOf(t, payload)
	if credits["usedToday"] != float64(1) || credits["remaining"] != float64(DailyFreeCommands-1) {
		t.Fatalf("credits after one command = %v", credits)
	}
}

func TestQuotaExhaustionBlocksCommands(t *testing.T) {
	_, server, db := newTestHandler(t, goodOutput, http.StatusOK)

	// Seed a full day of successful completions directly: the loop is what
	// the quota measures, not the provider call.
	for i := 0; i < DailyFreeCommands; i++ {
		if _, err := db.Exec(`INSERT INTO ai_usage (user_id, provider, model, prompt_chars, output_chars, ok)
			VALUES ('11111111-1111-1111-1111-111111111111', 'mock', 'mock-1', 1, 1, true)`); err != nil {
			t.Fatalf("seed usage row %d: %v", i, err)
		}
	}

	res, payload := post(t, server, `{"prompt":"one too many"}`, "test-session")
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("exhausted command: status = %d, payload %v", res.StatusCode, payload)
	}
	if codeOf(payload) != "AI_CREDITS_EXHAUSTED" {
		t.Fatalf("code = %v", payload)
	}

	res, payload = getJSON(t, server, "/api/ai/credits", "test-session")
	credits := creditsOf(t, payload)
	if credits["remaining"] != float64(0) {
		t.Fatalf("exhausted credits = %v", credits)
	}
}

func TestFailedProviderCallsDoNotDrainQuota(t *testing.T) {
	_, server, db := newTestHandler(t, goodOutput, http.StatusOK)

	for i := 0; i < DailyFreeCommands; i++ {
		if _, err := db.Exec(fmt.Sprintf(`INSERT INTO ai_usage (user_id, provider, model, prompt_chars, output_chars, ok)
			VALUES ('11111111-1111-1111-1111-111111111111', 'mock', 'mock-1', 1, 1, %t)`, i%2 == 0)); err != nil {
			t.Fatalf("seed usage row %d: %v", i, err)
		}
	}
	// Half of the rows are failures: the allowance still has room.
	res, payload := post(t, server, `{"prompt":"still allowed"}`, "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("command with failures seeded: status = %d, payload %v", res.StatusCode, payload)
	}
	res, payload = getJSON(t, server, "/api/ai/credits", "test-session")
	credits := creditsOf(t, payload)
	if credits["usedToday"] != float64(DailyFreeCommands/2+1) {
		t.Fatalf("only successes count: %v", credits)
	}
}
