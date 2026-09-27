package credits

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Service owns the purchase flow. The rule it enforces: a credit_grants row
// is written only inside the same transaction that moves a purchase to
// succeeded, and only if that purchase was not already succeeded — so a
// replayed webhook (same provider transaction id, or a second event for the
// same intent) can never grant twice, and a late contradicting event can
// never revoke a delivered grant.
type Service struct {
	db       *sql.DB
	provider PaymentProvider
	appURL   string // absolute origin used to make client return paths absolute
}

// NewService builds the purchase service. provider may be nil — purchases
// then honestly report unavailable instead of faking checkout.
func NewService(db *sql.DB, provider PaymentProvider, appURL string) *Service {
	return &Service{db: db, provider: provider, appURL: strings.TrimRight(appURL, "/")}
}

// PurchaseAvailable reports whether checkouts can be started at all.
func (s *Service) PurchaseAvailable() bool { return s.provider != nil }

// ProviderName is the configured provider slug ("" when none).
func (s *Service) ProviderName() string {
	if s.provider == nil {
		return ""
	}
	return s.provider.Name()
}

// Package is one purchasable credit pack (server-authoritative product data).
type Package struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Credits      int    `json:"credits"`
	Currency     string `json:"currency"`
	Price        int    `json:"price"` // minor units of Currency
	Tagline      string `json:"tagline"`
	Popular      bool   `json:"popular"`
	DisplayOrder int    `json:"-"`
}

// Packages lists enabled packs in display order — the single definition the
// pricing page and the contextual modal both render.
func (s *Service) Packages(ctx context.Context) ([]Package, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, credits, currency, price, tagline, popular, display_order
		FROM credit_packages WHERE enabled ORDER BY display_order, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	packages := []Package{}
	for rows.Next() {
		var p Package
		if err := rows.Scan(&p.ID, &p.Name, &p.Credits, &p.Currency, &p.Price, &p.Tagline, &p.Popular, &p.DisplayOrder); err != nil {
			return nil, err
		}
		packages = append(packages, p)
	}
	return packages, rows.Err()
}

// purchase is the wire shape of one purchase record (safe fields only).
type purchase struct {
	ID         string     `json:"id"`
	PackageID  string     `json:"packageId"`
	Credits    int        `json:"credits"`
	Currency   string     `json:"currency"`
	Amount     int        `json:"amount"`
	Status     string     `json:"status"`
	CheckoutURL string    `json:"checkoutUrl,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
}

// CreatePurchase starts one purchase: resolves the package server-side,
// records a pending row, and asks the provider for a hosted checkout. The
// client contributes only the package id and a return path — never a price,
// a credit amount, or a payment result.
func (s *Service) CreatePurchase(ctx context.Context, userID, packageID, returnPath string) (*purchase, error) {
	if s.provider == nil {
		return nil, httpx.Errorf(http.StatusServiceUnavailable, "PURCHASE_UNAVAILABLE",
			"Credit purchases are coming soon — the payment integration is not live yet.")
	}

	// Return paths are relative app paths; the provider needs an absolute
	// URL, so the server anchors it to the configured app origin. A client
	// can therefore never aim the post-payment redirect at another host.
	if !strings.HasPrefix(returnPath, "/") || strings.HasPrefix(returnPath, "//") {
		returnPath = "/"
	}

	var pkg Package
	err := s.db.QueryRowContext(ctx, `
		SELECT id, credits, currency, price FROM credit_packages
		WHERE id = $1 AND enabled`, packageID).
		Scan(&pkg.ID, &pkg.Credits, &pkg.Currency, &pkg.Price)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpx.Errorf(http.StatusNotFound, "PACKAGE_NOT_FOUND",
			"That credit pack is not available.")
	}
	if err != nil {
		return nil, err
	}

	var p purchase
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO credit_purchases (user_id, package_id, provider, currency, amount, credits, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending')
		RETURNING id, created_at`,
		userID, pkg.ID, s.provider.Name(), pkg.Currency, pkg.Price, pkg.Credits).
		Scan(&p.ID, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	p.PackageID, p.Credits, p.Currency, p.Amount, p.Status = pkg.ID, pkg.Credits, pkg.Currency, pkg.Price, "pending"

	session, err := s.provider.CreateCheckout(ctx, PurchaseIntent{
		PurchaseID: p.ID,
		UserID:     userID,
		PackageID:  pkg.ID,
		Credits:    pkg.Credits,
		Currency:   pkg.Currency,
		Amount:     pkg.Price,
		ReturnURL:  s.appURL + returnPath,
	})
	if err != nil {
		// No checkout means the purchase cannot proceed; record it failed so
		// pending rows never dangle as if a payment were in flight.
		_, _ = s.db.ExecContext(ctx, `
			UPDATE credit_purchases SET status = 'failed', completed_at = now()
			WHERE id = $1 AND status = 'pending'`, p.ID)
		return nil, httpx.Errorf(http.StatusBadGateway, "CHECKOUT_UNAVAILABLE",
			"The payment provider could not start checkout. Try again shortly.")
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE credit_purchases SET provider_intent_id = $1 WHERE id = $2`, session.IntentID, p.ID); err != nil {
		return nil, err
	}
	p.CheckoutURL = session.URL
	return &p, nil
}

// GetPurchase returns the caller's own purchase record (owner-scoped).
func (s *Service) GetPurchase(ctx context.Context, userID, purchaseID string) (*purchase, error) {
	var p purchase
	var completed *time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT id, package_id, credits, currency, amount, status, created_at, completed_at
		FROM credit_purchases WHERE id = $1 AND user_id = $2`, purchaseID, userID).
		Scan(&p.ID, &p.PackageID, &p.Credits, &p.Currency, &p.Amount, &p.Status, &p.CreatedAt, &completed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "That purchase was not found.")
	}
	if err != nil {
		return nil, err
	}
	p.CompletedAt = completed
	return &p, nil
}

// settleResult is what Settle did, for observability and tests.
type settleResult struct {
	AlreadySettled bool // event was a replay — nothing changed
	Granted        int  // credits granted by this call (0 on replays/failures)
}

// Settle applies one VERIFIED provider transaction: exactly-once credit
// grant for successes, honest status for failures and cancellations.
// Idempotency is layered:
//
//  1. (provider, provider_transaction_id) is unique — a replayed webhook
//     resolves to the settled purchase and changes nothing.
//  2. succeeded is terminal — a second event for the same intent (or a late
//     failure arriving after success) is a no-op.
//  3. the grant row and the status transition commit in ONE transaction.
func (s *Service) Settle(ctx context.Context, result TransactionResult) (settleResult, error) {
	if s.provider == nil {
		return settleResult{}, ErrProviderUnavailable
	}
	providerName := s.provider.Name()

	// Fast path: this exact provider transaction was seen before.
	var existingID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id FROM credit_purchases
		WHERE provider = $1 AND provider_transaction_id = $2`,
		providerName, result.TransactionID).Scan(&existingID)
	if err == nil {
		return settleResult{AlreadySettled: true}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return settleResult{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return settleResult{}, err
	}
	defer tx.Rollback()

	var (
		purchaseID string
		userID     string
		credits    int
		status     string
	)
	// FOR UPDATE serializes concurrent webhooks for one intent; the intent is
	// the provider's own handle, matched only within this provider's rows.
	err = tx.QueryRowContext(ctx, `
		SELECT id, user_id, credits, status FROM credit_purchases
		WHERE provider = $1 AND provider_intent_id = $2
		FOR UPDATE`, providerName, result.IntentID).
		Scan(&purchaseID, &userID, &credits, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return settleResult{}, httpx.Errorf(http.StatusNotFound, "PURCHASE_NOT_FOUND",
			"The payment event did not match any purchase.")
	}
	if err != nil {
		return settleResult{}, err
	}

	if status != "pending" {
		// Terminal already: succeeded stays succeeded (no double grant),
		// failed/cancelled stay as they are.
		return settleResult{AlreadySettled: true}, nil
	}

	switch result.Outcome {
	case OutcomeSucceeded:
		res, err := tx.ExecContext(ctx, `
			UPDATE credit_purchases
			SET status = 'succeeded', provider_transaction_id = $1, completed_at = now()
			WHERE id = $2 AND status = 'pending'`,
			result.TransactionID, purchaseID)
		if err != nil {
			return settleResult{}, err
		}
		// The unique index on (provider, provider_transaction_id) is the last
		// backstop: two different intents claiming one transaction id means
		// one of them settles and the other aborts with nothing granted.
		if changed, _ := res.RowsAffected(); changed == 0 {
			return settleResult{AlreadySettled: true}, nil
		}
		// Same transaction, same ledger, same insert path as the operator
		// CLI — commerce and credit movement commit together.
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO credit_grants (user_id, amount, source, note)
			VALUES ($1, $2, 'purchase', $3)`,
			userID, credits, fmt.Sprintf("purchase %s", purchaseID)); err != nil {
			return settleResult{}, err
		}
		if err := tx.Commit(); err != nil {
			return settleResult{}, err
		}
		return settleResult{Granted: credits}, nil

	case OutcomeFailed, OutcomeCancelled:
		if _, err := tx.ExecContext(ctx, `
			UPDATE credit_purchases SET status = $1, completed_at = now()
			WHERE id = $2 AND status = 'pending'`, string(result.Outcome), purchaseID); err != nil {
			return settleResult{}, err
		}
		if err := tx.Commit(); err != nil {
			return settleResult{}, err
		}
		return settleResult{}, nil

	default:
		return settleResult{}, fmt.Errorf("credits: unknown outcome %q", result.Outcome)
	}
}

// HandleWebhook authenticates and settles one provider callback. The raw
// body and headers go to the provider's Verify — authentication happens
// inside the boundary, never on trust. Every acknowledged (verified) event
// answers 200 so the provider stops retrying; replays are no-ops.
func (s *Service) HandleWebhook(ctx context.Context, providerSlug string, raw []byte, headers http.Header) error {
	if s.provider == nil {
		return ErrProviderUnavailable
	}
	if providerSlug != s.provider.Name() {
		return httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "No payment provider answers at this path.")
	}
	result, err := s.provider.Verify(ctx, raw, headers)
	if err != nil {
		// Unauthenticated or malformed: reject. Never settle on doubt.
		return httpx.Errorf(http.StatusBadRequest, "WEBHOOK_REJECTED",
			"The payment event could not be verified.")
	}
	if _, err := s.Settle(ctx, result); err != nil {
		return err
	}
	return nil
}

// LoadPaymentProvider reads PAYMENT_* environment variables and returns the
// configured provider, or nil when payments are deliberately not integrated
// yet. No provider ships today; the boundary exists so integration later is
// one adapter, not a rework.
func LoadPaymentProvider(getenv func(string) string) PaymentProvider {
	name := strings.TrimSpace(getenv("PAYMENT_PROVIDER"))
	if name == "" {
		return nil
	}
	switch strings.ToLower(name) {
	// case "midtrans": return newMidtrans(...) — future adapters land here.
	default:
		return nil
	}
}
