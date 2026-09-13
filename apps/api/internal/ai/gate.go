package ai

import (
	"context"
	"database/sql"
)

// Package-level wrappers over the credit ledger so other AI-assisted
// endpoints (extension build fix) share one allowance and one usage log
// without importing handler internals.

// Exhausted reports whether the user has spent today's free allowance and
// holds no pack credits. Ledger errors fail open — counting problems must
// never lock users out.
func Exhausted(db *sql.DB, userID string) bool {
	if db == nil {
		return false
	}
	usage := &usageStore{db: db}
	used, err := usage.usedToday(context.Background(), userID)
	if err != nil {
		return false
	}
	if used < DailyFreeCommands {
		return false
	}
	pack, err := usage.packBalance(context.Background(), userID)
	if err != nil {
		return false
	}
	return pack <= 0
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
