package ai

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
)

// Pack credits: awards live in credit_grants, consumption stays in the
// ai_usage ledger (per-day commands past the free allowance draw packs).
// No separate consumption table — the usage ledger is the single record.

func testStore(db *sql.DB) *usageStore { return &usageStore{db: db} }

// seedUsageDay inserts n successful usage rows for the fixed test user at a
// day offset (0 = today, 1 = yesterday).
func seedUsageDay(t *testing.T, db *sql.DB, userID string, n int, daysBack int) {
	t.Helper()
	for i := 0; i < n; i++ {
		if _, err := db.Exec(`INSERT INTO ai_usage (user_id, provider, model, prompt_chars, output_chars, ok, created_at)
			VALUES ($1, 'mock', 'mock-1', 1, 1, true, now() - make_interval(days => $2))`,
			userID, daysBack); err != nil {
			t.Fatalf("seed usage row: %v", err)
		}
	}
}

func TestPackBalanceSumsActiveGrants(t *testing.T) {
	_, _, db := newTestHandler(t, goodOutput, http.StatusOK)
	userID := "11111111-1111-1111-1111-111111111111"

	if _, err := db.Exec(`INSERT INTO credit_grants (user_id, amount, source, note)
		VALUES ($1, 100, 'promo', 'launch'), ($1, 50, 'promo', '')`, userID); err != nil {
		t.Fatalf("seed grants: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO credit_grants (user_id, amount, source, note, expires_at)
		VALUES ($1, 999, 'promo', 'expired', now() - interval '1 day')`, userID); err != nil {
		t.Fatalf("seed expired grant: %v", err)
	}
	balance, err := testStore(db).packBalance(context.Background(), userID)
	if err != nil {
		t.Fatalf("pack balance: %v", err)
	}
	if balance != 150 {
		t.Fatalf("pack balance = %d, want 150 (expired grant excluded)", balance)
	}
}

func TestPackDrawnCountsOnlyPastFreeAllowance(t *testing.T) {
	_, _, db := newTestHandler(t, goodOutput, http.StatusOK)
	userID := "11111111-1111-1111-1111-111111111111"

	// Today: 22 commands → 2 drawn. Yesterday: 10 → 0 drawn.
	seedUsageDay(t, db, userID, 22, 0)
	seedUsageDay(t, db, userID, 10, 1)

	drawn, err := testStore(db).packDrawnTotal(context.Background(), userID)
	if err != nil {
		t.Fatalf("pack drawn: %v", err)
	}
	if drawn != 2 {
		t.Fatalf("pack drawn = %d, want 2", drawn)
	}
}

func TestPackCreditsExtendTheAllowance(t *testing.T) {
	_, server, db := newTestHandler(t, goodOutput, http.StatusOK)
	userID := "11111111-1111-1111-1111-111111111111"

	// Free tier spent, 5 pack credits left: the next command must pass.
	seedUsageDay(t, db, userID, DailyFreeCommands, 0)
	if _, err := db.Exec(`INSERT INTO credit_grants (user_id, amount, source, note)
		VALUES ($1, 5, 'promo', 'top-up')`, userID); err != nil {
		t.Fatalf("seed grant: %v", err)
	}

	res, payload := post(t, server, `{"prompt":"on pack credits"}`, "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("command on packs: status = %d, payload %v", res.StatusCode, payload)
	}

	// The command drew 1 pack credit (the day's count is now 21).
	_, payload = getJSON(t, server, "/api/ai/credits", "test-session")
	credits := creditsOf(t, payload)
	if credits["packBalance"] != float64(4) {
		t.Fatalf("packBalance = %v, want 4", credits["packBalance"])
	}
	if credits["freeRemaining"] != float64(0) {
		t.Fatalf("freeRemaining = %v, want 0", credits["freeRemaining"])
	}
	if credits["remaining"] != float64(4) {
		t.Fatalf("remaining = %v, want 4", credits["remaining"])
	}
}

func TestExhaustedPackCreditsStillBlock(t *testing.T) {
	_, server, db := newTestHandler(t, goodOutput, http.StatusOK)
	userID := "11111111-1111-1111-1111-111111111111"

	seedUsageDay(t, db, userID, DailyFreeCommands+3, 0) // free spent + 3 drawn
	if _, err := db.Exec(`INSERT INTO credit_grants (user_id, amount, source, note)
		VALUES ($1, 3, 'promo', 'gone')`, userID); err != nil {
		t.Fatalf("seed grant: %v", err)
	}

	res, payload := post(t, server, `{"prompt":"no credits left"}`, "test-session")
	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("exhausted packs: status = %d, payload %v", res.StatusCode, payload)
	}
	if codeOf(payload) != "AI_CREDITS_EXHAUSTED" {
		t.Fatalf("code = %v", payload)
	}
}

func TestCreditActivityMergesGrantsAndUsage(t *testing.T) {
	_, server, db := newTestHandler(t, goodOutput, http.StatusOK)
	userID := "11111111-1111-1111-1111-111111111111"

	if _, err := db.Exec(`INSERT INTO credit_grants (user_id, amount, source, note)
		VALUES ($1, 10, 'promo', 'tester bonus')`, userID); err != nil {
		t.Fatalf("seed grant: %v", err)
	}
	seedUsageDay(t, db, userID, 3, 0) // 3 commands, no pack draw

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/ai/credits/activity", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(&http.Cookie{Name: "ideaven_session", Value: "test-session"})
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := ioReadAll(res.Body)
	payload := map[string]any{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("non-JSON: %q", raw)
	}
	entries, _ := payload["entries"].([]any)
	if len(entries) != 2 {
		t.Fatalf("want 2 activity entries (1 grant + 1 usage day), got %d: %v", len(entries), payload)
	}
	grant := entries[0].(map[string]any)
	usage := entries[1].(map[string]any)
	if grant["kind"] != "grant" || grant["amount"] != float64(10) || grant["detail"] != "tester bonus" {
		t.Fatalf("grant entry = %v", grant)
	}
	if usage["kind"] != "usage" || usage["amount"] != float64(0) || usage["detail"] != "3" {
		t.Fatalf("usage entry = %v", usage)
	}
}

func TestCreditActivityRequiresSession(t *testing.T) {
	_, server, _ := newTestHandler(t, goodOutput, http.StatusOK)
	req, _ := http.NewRequest(http.MethodGet, server.URL+"/api/ai/credits/activity", nil)
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous activity: status = %d, want 401", res.StatusCode)
	}
}
