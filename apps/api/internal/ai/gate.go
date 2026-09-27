package ai

import (
	"context"
	"database/sql"
	"net/http"

	"ideaven/apps/api/internal/httpx"
)

// Package-level wrappers over the credit ledger so other AI-assisted
// endpoints (extension build fix) share one allowance and one usage log
// without importing handler internals.

// GateError evaluates the shared credit gate for AI surfaces outside this
// package. nil = allowed; non-nil = the structured 402 to write (carries
// safe credit metadata for the contextual purchase modal). Ledger errors
// fail open — counting problems must never lock users out.
func GateError(ctx context.Context, db *sql.DB, userID string, purchaseAvailable bool) *httpx.Error {
	if db == nil {
		return nil
	}
	usage := &usageStore{db: db}
	used, err := usage.usedToday(ctx, userID)
	if err != nil {
		return nil
	}
	if used < DailyFreeCommands {
		return nil
	}
	pack, err := usage.packBalance(ctx, userID)
	if err != nil {
		return nil
	}
	if pack >= CreditsPerCommand {
		return nil
	}
	if pack < 0 {
		pack = 0
	}
	data := InsufficientCreditsData{
		Remaining:         pack,
		Required:          CreditsPerCommand,
		PackBalance:       pack,
		FreeRemaining:     0,
		PurchaseAvailable: purchaseAvailable,
	}
	return httpx.Errorf(http.StatusPaymentRequired, CodeInsufficientCredits,
		"You're out of AI credits. The daily free allowance is spent and you have no pack credits left.").
		WithData(data)
}

// Exhausted reports whether the user has spent today's free allowance and
// holds no pack credits. Ledger errors fail open — counting problems must
// never lock users out.
func Exhausted(db *sql.DB, userID string) bool {
	return GateError(context.Background(), db, userID, false) != nil
}

// RecordUsage logs one AI-assisted request into ai_usage. Logging must
// never break the caller's request path.
func RecordUsage(db *sql.DB, userID, provider, model string, promptChars, outputChars int, ok bool) {
	if db == nil {
		return
	}
	usage := &usageStore{db: db}
	usage.record(context.Background(), userID, "", provider, model, promptChars, outputChars, ok)
}
