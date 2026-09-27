// Package credits implements the AI credit purchase flow: server-
// authoritative credit packages, purchase intents, a payment provider
// boundary, and idempotent settlement into the EXISTING credit ledger
// (credit_grants). There is deliberately no second balance and no second
// ledger here — commerce records (what was offered and paid) live in
// credit_purchases; credit movement stays in credit_grants + ai_usage.
package credits

import (
	"context"
	"errors"
	"net/http"
)

// ErrProviderUnavailable reports that no payment provider is configured.
// The API answers honestly ("coming soon") instead of faking checkout.
var ErrProviderUnavailable = errors.New("credits: no payment provider configured")

// PurchaseIntent is everything a provider needs to start a checkout for one
// package. Prices and credits are resolved server-side from the package
// table — a client never sends an amount.
type PurchaseIntent struct {
	PurchaseID string // internal purchase record id
	UserID     string
	PackageID  string
	Credits    int
	Currency   string // ISO 4217
	Amount     int    // minor units of Currency
	ReturnURL  string // where the hosted checkout sends the user back
}

// CheckoutSession is a started provider checkout.
type CheckoutSession struct {
	// IntentID is the provider's handle for this checkout (session/txn/ref).
	IntentID string
	// URL is the hosted checkout page the client redirects to.
	URL string
}

// Outcome is the verified end state of a provider transaction.
type Outcome string

const (
	OutcomeSucceeded Outcome = "succeeded"
	OutcomeFailed    Outcome = "failed"
	OutcomeCancelled Outcome = "cancelled"
)

// TransactionResult is the authenticated outcome of a provider event. It is
// produced ONLY by PaymentProvider.Verify — never parsed from client input.
type TransactionResult struct {
	IntentID     string // provider intent id → matches a stored purchase
	TransactionID string // provider's unique transaction reference
	Outcome      Outcome
}

// PaymentProvider is the boundary between Ideaven and a payment processor.
// UI components never talk to a provider; the service is the only caller.
// Implementations must be safe for concurrent use.
type PaymentProvider interface {
	// Name is the provider slug used in webhook routes and purchase rows.
	Name() string

	// CreateCheckout starts a hosted checkout for one purchase intent.
	CreateCheckout(ctx context.Context, intent PurchaseIntent) (CheckoutSession, error)

	// Verify authenticates a provider callback/webhook payload and returns
	// the transaction outcome it proves. An event that fails authentication
	// must return an error — it must NEVER yield a successful result, or
	// credits would be granted on forged input.
	Verify(ctx context.Context, raw []byte, headers http.Header) (TransactionResult, error)
}
