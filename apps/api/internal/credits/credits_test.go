package credits

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ideaven/apps/api/internal/database"
	"ideaven/apps/api/internal/user"
)

// Purchase flow: packages are server-authoritative, prices never come from
// the client, and a credit_grants row is written exactly once per verified
// provider transaction — replays, failures, and cancellations grant nothing.

const testUserID = "33333333-3333-3333-3333-333333333333"

func testDSN(t *testing.T) string {
	t.Helper()
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test_credits?sslmode=disable"
}

// mockProvider is the fake payment boundary: checkout always yields the same
// session; verification behavior is injected per test.
type mockProvider struct {
	name     string
	createErr error
	checkout CheckoutSession
	verifyFn func(raw []byte, headers http.Header) (TransactionResult, error)

	mu       chan struct{} // serializes intent recording without importing sync in tests
	intents  []PurchaseIntent
}

func newMockProvider() *mockProvider {
	return &mockProvider{
		name: "mockpay",
		checkout: CheckoutSession{IntentID: "intent-1", URL: "https://pay.mock/checkout/intent-1"},
		mu:  make(chan struct{}, 1),
	}
}

func (m *mockProvider) Name() string { return m.name }

func (m *mockProvider) CreateCheckout(ctx context.Context, intent PurchaseIntent) (CheckoutSession, error) {
	m.mu <- struct{}{}
	m.intents = append(m.intents, intent)
	<-m.mu
	if m.createErr != nil {
		return CheckoutSession{}, m.createErr
	}
	return m.checkout, nil
}

func (m *mockProvider) Verify(ctx context.Context, raw []byte, headers http.Header) (TransactionResult, error) {
	return m.verifyFn(raw, headers)
}

func newTestService(t *testing.T, provider PaymentProvider) (*Service, *httptest.Server, *sql.DB) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := database.EnsureDatabase(ctx, testDSN(t)); err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	db, err := database.Connect(ctx, testDSN(t))
	if err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := db.Exec(`TRUNCATE users, credit_purchases, credit_grants CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO users (id, email, username, password_hash, display_name)
		VALUES ($1, 'buy@ideaven.test', 'buyer', 'x', 'Buyer')`, testUserID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	service := NewService(db, provider, "https://app.ideaven.test")
	handler := NewHandler(service, testAuthenticate, CookieConfig{Name: "ideaven_session"})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/credits/packages", handler.Packages)
	mux.HandleFunc("POST /api/credits/purchases", handler.CreatePurchase)
	mux.HandleFunc("GET /api/credits/purchases/{id}", handler.GetPurchase)
	mux.HandleFunc("POST /api/credits/webhook/{provider}", handler.Webhook)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return service, server, db
}

func testAuthenticate(ctx context.Context, token string) (*user.User, error) {
	if token != "test-session" {
		return nil, errors.New("unauthorized")
	}
	return &user.User{ID: testUserID, Email: "buy@ideaven.test", Username: "buyer"}, nil
}

func callJSON(t *testing.T, server *httptest.Server, method, path, body, cookie string) (*http.Response, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, server.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "ideaven_session", Value: cookie})
	}
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	payload := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("non-JSON response: %q", raw)
		}
	}
	return res, payload
}

func errCode(t *testing.T, payload map[string]any) string {
	t.Helper()
	errObj, _ := payload["error"].(map[string]any)
	if errObj == nil {
		return ""
	}
	code, _ := errObj["code"].(string)
	return code
}

func errData(t *testing.T, payload map[string]any) map[string]any {
	t.Helper()
	errObj, _ := payload["error"].(map[string]any)
	if errObj == nil {
		return nil
	}
	data, _ := errObj["data"].(map[string]any)
	return data
}

func grantSum(t *testing.T, db *sql.DB) int {
	t.Helper()
	var total int
	if err := db.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM credit_grants WHERE source = 'purchase'`).Scan(&total); err != nil {
		t.Fatal(err)
	}
	return total
}

// ---- packages ---------------------------------------------------------------------

func TestPackagesListsEnabledInOrder(t *testing.T) {
	_, server, _ := newTestService(t, newMockProvider())
	res, payload := callJSON(t, server, http.MethodGet, "/api/credits/packages", "", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("packages: status = %d, payload %v", res.StatusCode, payload)
	}
	packages, _ := payload["packages"].([]any)
	if len(packages) != 3 {
		t.Fatalf("want 3 seeded packages, got %d: %v", len(packages), payload)
	}
	first, _ := packages[0].(map[string]any)
	if first["id"] != "pack-starter" || first["credits"] != float64(100) || first["currency"] != "USD" {
		t.Fatalf("first package = %v", first)
	}
	// Prices travel as server data, never as client input.
	if first["price"] != float64(200) {
		t.Fatalf("price = %v", first["price"])
	}
}

// ---- purchase creation ------------------------------------------------------------

func TestCreatePurchaseWithoutProviderIsHonest(t *testing.T) {
	_, server, _ := newTestService(t, nil)
	res, payload := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-builder"}`, "test-session")
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	if errCode(t, payload) != "PURCHASE_UNAVAILABLE" {
		t.Fatalf("code = %v", payload)
	}
}

func TestCreatePurchaseRejectsUnknownPackage(t *testing.T) {
	_, server, _ := newTestService(t, newMockProvider())
	res, payload := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-infinite"}`, "test-session")
	if res.StatusCode != http.StatusNotFound || errCode(t, payload) != "PACKAGE_NOT_FOUND" {
		t.Fatalf("status = %d, code = %v", res.StatusCode, payload)
	}
}

// The client sends ONLY the package id. Any money-shaped field in the body
// is a protocol violation and must be rejected outright — the server owns
// package, price, currency, and credit amount.
func TestCreatePurchaseRejectsClientSuppliedMoney(t *testing.T) {
	_, server, _ := newTestService(t, newMockProvider())
	res, payload := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-builder","price":1,"credits":999999,"amount":1}`, "test-session")
	if res.StatusCode != http.StatusBadRequest || errCode(t, payload) != "INVALID_REQUEST_BODY" {
		t.Fatalf("status = %d, code = %v", res.StatusCode, payload)
	}
}

func TestCreatePurchaseUsesServerPrice(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	res, payload := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-builder","returnPath":"/builder/x/builder"}`, "test-session")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	purchase, _ := payload["purchase"].(map[string]any)
	if purchase == nil || purchase["status"] != "pending" || purchase["checkoutUrl"] == "" {
		t.Fatalf("purchase = %v", payload)
	}
	if purchase["credits"] != float64(600) || purchase["amount"] != float64(1000) || purchase["currency"] != "USD" {
		t.Fatalf("server-resolved purchase numbers = %v", purchase)
	}
	if len(provider.intents) != 1 {
		t.Fatalf("provider checkouts = %d", len(provider.intents))
	}
	intent := provider.intents[0]
	if intent.Amount != 1000 || intent.Credits != 600 || intent.Currency != "USD" {
		t.Fatalf("provider intent numbers = %v", intent)
	}
	// The return URL is anchored to the server's app origin, never the client's.
	if intent.ReturnURL != "https://app.ideaven.test/builder/x/builder" {
		t.Fatalf("returnURL = %q", intent.ReturnURL)
	}
	// A pending row exists for this user.
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM credit_purchases WHERE user_id = $1 AND status = 'pending'`, testUserID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("pending rows = %d", count)
	}
}

func TestCreatePurchaseRequiresSession(t *testing.T) {
	_, server, _ := newTestService(t, newMockProvider())
	res, _ := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-builder"}`, "")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}
}

func TestCreatePurchaseProviderFailureFailsTheRow(t *testing.T) {
	provider := newMockProvider()
	provider.createErr = errors.New("provider down")
	_, server, db := newTestService(t, provider)
	res, payload := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-builder"}`, "test-session")
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	var status string
	if err := db.QueryRow(`SELECT status FROM credit_purchases WHERE user_id = $1`, testUserID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "failed" {
		t.Fatalf("status = %q, want failed (no dangling pending)", status)
	}
}

// ---- settlement & idempotency ------------------------------------------------------

// settle posts one webhook event through the handler with the given verify
// behavior and returns the response.
func settle(t *testing.T, server *httptest.Server, provider *mockProvider, body string) (*http.Response, map[string]any) {
	t.Helper()
	provider.verifyFn = func(raw []byte, headers http.Header) (TransactionResult, error) {
		if headers.Get("X-Mock-Signature") == "" {
			return TransactionResult{}, errors.New("bad signature")
		}
		var event struct {
			Intent string `json:"intent"`
			Txn    string `json:"txn"`
			State  string `json:"state"`
		}
		if err := json.Unmarshal(raw, &event); err != nil {
			return TransactionResult{}, err
		}
		outcome := OutcomeSucceeded
		switch event.State {
		case "failed":
			outcome = OutcomeFailed
		case "cancelled":
			outcome = OutcomeCancelled
		}
		return TransactionResult{IntentID: event.Intent, TransactionID: event.Txn, Outcome: outcome}, nil
	}
	req, err := http.NewRequest(http.MethodPost, server.URL+"/api/credits/webhook/mockpay", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Mock-Signature", "valid")
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	payload := map[string]any{}
	_ = json.Unmarshal(raw, &payload)
	return res, payload
}

// startPurchase creates one pending purchase for the builder pack.
func startPurchase(t *testing.T, server *httptest.Server) string {
	t.Helper()
	_, payload := callJSON(t, server, http.MethodPost, "/api/credits/purchases",
		`{"packageId":"pack-builder"}`, "test-session")
	purchase, _ := payload["purchase"].(map[string]any)
	if purchase == nil {
		t.Fatalf("no purchase created: %v", payload)
	}
	id, _ := purchase["id"].(string)
	return id
}

func TestVerifiedPaymentGrantsCreditsOnce(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	res, _ := settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"succeeded"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("webhook status = %d, payload %v", res.StatusCode, map[string]any{})
	}
	if got := grantSum(t, db); got != 600 {
		t.Fatalf("grant sum = %d, want 600", got)
	}
	var status string
	var completed *time.Time
	if err := db.QueryRow(`SELECT status, completed_at FROM credit_purchases WHERE provider_intent_id = 'intent-1'`).Scan(&status, &completed); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" || completed == nil {
		t.Fatalf("purchase status = %q completed = %v", status, completed)
	}
	// The grant rides the SAME ledger the operator CLI writes, so the derived
	// balance (Σ grants − pack draws) increases by the pack size.
	var balance int
	if err := db.QueryRow(`SELECT COALESCE(SUM(amount), 0) FROM credit_grants WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())`, testUserID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 600 {
		t.Fatalf("derived balance = %d, want 600", balance)
	}
}

func TestDuplicateWebhookDoesNotDoubleGrant(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"succeeded"}`)
	res, _ := settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"succeeded"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("replayed webhook must still acknowledge: %d", res.StatusCode)
	}
	if got := grantSum(t, db); got != 600 {
		t.Fatalf("grant sum after replay = %d, want 600", got)
	}
}

// A second, DIFFERENT transaction id claiming the same intent must not
// re-settle the purchase: succeeded is terminal.
func TestSecondEventForSameIntentDoesNotDoubleGrant(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"succeeded"}`)
	settle(t, server, provider, `{"intent":"intent-1","txn":"tx-2","state":"succeeded"}`)
	if got := grantSum(t, db); got != 600 {
		t.Fatalf("grant sum = %d, want 600", got)
	}
}

func TestFailedPaymentGrantsNothing(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	res, _ := settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"failed"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("webhook status = %d", res.StatusCode)
	}
	if got := grantSum(t, db); got != 0 {
		t.Fatalf("grant sum = %d, want 0", got)
	}
	var status string
	if err := db.QueryRow(`SELECT status FROM credit_purchases WHERE provider_intent_id = 'intent-1'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "failed" {
		t.Fatalf("status = %q, want failed", status)
	}
}

func TestCancelledPaymentGrantsNothing(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	res, _ := settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"cancelled"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("webhook status = %d", res.StatusCode)
	}
	if got := grantSum(t, db); got != 0 {
		t.Fatalf("grant sum = %d, want 0", got)
	}
	var status string
	if err := db.QueryRow(`SELECT status FROM credit_purchases WHERE provider_intent_id = 'intent-1'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "cancelled" {
		t.Fatalf("status = %q, want cancelled", status)
	}
}

// A late "failure" arriving after the purchase already succeeded must not
// revoke the delivered credits or corrupt the record.
func TestLateFailureAfterSuccessChangesNothing(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	settle(t, server, provider, `{"intent":"intent-1","txn":"tx-1","state":"succeeded"}`)
	settle(t, server, provider, `{"intent":"intent-1","txn":"tx-9","state":"failed"}`)
	if got := grantSum(t, db); got != 600 {
		t.Fatalf("grant sum = %d, want 600 (delivered credits stand)", got)
	}
	var status string
	if err := db.QueryRow(`SELECT status FROM credit_purchases WHERE provider_intent_id = 'intent-1'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "succeeded" {
		t.Fatalf("status = %q, want succeeded", status)
	}
}

// An event that fails verification (bad signature, malformed payload) is
// rejected and settles nothing.
func TestUnauthenticatedWebhookRejected(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	provider.verifyFn = func(raw []byte, headers http.Header) (TransactionResult, error) {
		return TransactionResult{}, errors.New("bad signature")
	}
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/api/credits/webhook/mockpay", strings.NewReader(`{"intent":"intent-1","txn":"tx-1","state":"succeeded"}`))
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.StatusCode)
	}
	if got := grantSum(t, db); got != 0 {
		t.Fatalf("grant sum = %d, want 0", got)
	}
	var status string
	if err := db.QueryRow(`SELECT status FROM credit_purchases WHERE provider_intent_id = 'intent-1'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "pending" {
		t.Fatalf("status = %q, want pending (nothing settled)", status)
	}
}

func TestWebhookWrongProviderPath(t *testing.T) {
	provider := newMockProvider()
	_, server, db := newTestService(t, provider)
	startPurchase(t, server)

	provider.verifyFn = func(raw []byte, headers http.Header) (TransactionResult, error) {
		return TransactionResult{IntentID: "intent-1", TransactionID: "tx-1", Outcome: OutcomeSucceeded}, nil
	}
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/api/credits/webhook/otherpay", strings.NewReader(`{}`))
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.StatusCode)
	}
	if got := grantSum(t, db); got != 0 {
		t.Fatalf("grant sum = %d, want 0", got)
	}
}

func TestWebhookWithoutProvider(t *testing.T) {
	_, server, _ := newTestService(t, nil)
	req, _ := http.NewRequest(http.MethodPost, server.URL+"/api/credits/webhook/mockpay", strings.NewReader(`{}`))
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
}

// ---- purchase status ---------------------------------------------------------------

func TestGetPurchaseOwnerScoped(t *testing.T) {
	provider := newMockProvider()
	_, server, _ := newTestService(t, provider)
	id := startPurchase(t, server)

	res, payload := callJSON(t, server, http.MethodGet, "/api/credits/purchases/"+id, "", "test-session")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, payload %v", res.StatusCode, payload)
	}
	purchase, _ := payload["purchase"].(map[string]any)
	if purchase["status"] != "pending" || purchase["packageId"] != "pack-builder" {
		t.Fatalf("purchase = %v", purchase)
	}

	// Another session is not this user: 401 for anonymous.
	res, _ = callJSON(t, server, http.MethodGet, "/api/credits/purchases/"+id, "", "")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous status = %d, want 401", res.StatusCode)
	}
}
