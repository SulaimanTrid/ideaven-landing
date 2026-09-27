package ai

import (
	"context"
	"net/http"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Credits: an honest, derived free allowance. The ai_usage ledger is the
// single source of truth — the balance is computed from it, never stored,
// so it cannot drift from what actually happened. Only successful
// completions count: a provider outage must not drain a user's quota.
// Paid top-ups land in the same ledger: a verified purchase writes a
// credit_grants row via internal/credits (TASK 12).
const (
	// DailyFreeCommands is the per-user free AI command allowance per day.
	DailyFreeCommands = 20
)

// usedToday counts the user's successful AI commands since local midnight.
func (s *usageStore) usedToday(ctx context.Context, userID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT count(*) FROM ai_usage
		WHERE user_id = $1 AND ok AND created_at >= date_trunc('day', now())`,
		userID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// nextReset returns the timestamp the daily allowance resets.
func (s *usageStore) nextReset(ctx context.Context) (time.Time, error) {
	var reset time.Time
	err := s.db.QueryRowContext(ctx,
		`SELECT date_trunc('day', now()) + interval '1 day'`).Scan(&reset)
	return reset, err
}

// activeGrantBalance sums the user's credit grants that have not expired.
// Awards live in credit_grants; consumption stays in ai_usage, so this
// never double-counts.
func (s *usageStore) activeGrantBalance(ctx context.Context, userID string) (int, error) {
	var balance int
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM credit_grants
		WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())`,
		userID).Scan(&balance)
	return balance, err
}

// packDrawnTotal sums every pack-credit draw across all days: a day draws
// from packs only past the free allowance, so its draw is
// max(0, ok_commands_that_day − DailyFreeCommands).
func (s *usageStore) packDrawnTotal(ctx context.Context, userID string) (int, error) {
	var drawn int
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(GREATEST(day_count - $2, 0)), 0) FROM (
			SELECT count(*) AS day_count FROM ai_usage
			WHERE user_id = $1 AND ok
			GROUP BY date_trunc('day', created_at)
		) days`,
		userID, DailyFreeCommands).Scan(&drawn)
	return drawn, err
}

// Grant is one row of the credit ledger (awards side).
type Grant struct {
	ID        string
	Amount    int
	Source    string
	Note      string
	GrantedAt time.Time
	ExpiresAt *time.Time
}

// insertGrant awards credits. Only the operator CLI calls this today; the
// payment system will write the same rows later.
func (s *usageStore) insertGrant(ctx context.Context, userID string, amount int, source, note string, expiresAt *time.Time) (*Grant, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO credit_grants (user_id, amount, source, note, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, amount, source, note, granted_at, expires_at`,
		userID, amount, source, note, expiresAt)
	var g Grant
	err := row.Scan(&g.ID, &g.Amount, &g.Source, &g.Note, &g.GrantedAt, &g.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// CreditActivityEntry is one merged ledger row for the settings surface:
// either an award (grant) or a consumption (a successful AI command).
type CreditActivityEntry struct {
	Kind      string     `json:"kind"` // "grant" | "usage"
	At        time.Time  `json:"at"`
	Amount    int        `json:"amount"` // grants: credits awarded; usage: pack credits drawn that day
	Detail    string     `json:"detail"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

// recentActivity merges grants and per-day usage into a newest-first feed
// for the settings surface. Usage rows collapse to one entry per day (the
// pack draw) pinned at that day's start: a day bucket ranks below any
// instant inside it, so a grant made later the same day sorts above the
// day's usage without leaking row counts.
func (s *usageStore) recentActivity(ctx context.Context, userID string, limit int) ([]CreditActivityEntry, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT kind, at, amount, detail, expires_at FROM (
			SELECT 'grant' AS kind, granted_at AS at, amount,
			       CASE WHEN note = '' THEN source ELSE note END AS detail,
			       expires_at
			FROM credit_grants WHERE user_id = $1
			UNION ALL
			SELECT 'usage', day, GREATEST(day_count - $2, 0), day_count::text, NULL
			FROM (
				SELECT date_trunc('day', created_at) AS day, count(*) AS day_count
				FROM ai_usage WHERE user_id = $1 AND ok
				GROUP BY date_trunc('day', created_at)
			) days
		) ledger
		ORDER BY at DESC
		LIMIT $3`, userID, DailyFreeCommands, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []CreditActivityEntry{}
	for rows.Next() {
		var e CreditActivityEntry
		if err := rows.Scan(&e.Kind, &e.At, &e.Amount, &e.Detail, &e.ExpiresAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// packBalance is the spendable pack credit total right now.
func (s *usageStore) packBalance(ctx context.Context, userID string) (int, error) {
	grants, err := s.activeGrantBalance(ctx, userID)
	if err != nil {
		return 0, err
	}
	drawn, err := s.packDrawnTotal(ctx, userID)
	if err != nil {
		return 0, err
	}
	balance := grants - drawn
	if balance < 0 {
		balance = 0
	}
	return balance, nil
}

// Credits handles GET /api/ai/credits.
func (h *Handler) Credits(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue."))
		return
	}
	current, err := h.auth(r.Context(), cookie.Value)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	used, err := h.usage.usedToday(r.Context(), current.ID)
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Could not read your AI credits. Try again shortly."))
		return
	}
	pack, err := h.usage.packBalance(r.Context(), current.ID)
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Could not read your AI credits. Try again shortly."))
		return
	}
	reset, err := h.usage.nextReset(r.Context())
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Could not read your AI credits. Try again shortly."))
		return
	}

	freeRemaining := DailyFreeCommands - used
	if freeRemaining < 0 {
		freeRemaining = 0
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"credits": map[string]any{
			"usedToday":     used,
			"dailyLimit":    DailyFreeCommands,
			"freeRemaining": freeRemaining,
			"packBalance":   pack,
			"remaining":     freeRemaining + pack,
			"resetsAt":      reset,
		},
	})
}

// CreditActivity handles GET /api/ai/credits/activity — the merged
// award/consumption feed shown in account settings.
func (h *Handler) CreditActivity(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue."))
		return
	}
	current, err := h.auth(r.Context(), cookie.Value)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	entries, err := h.usage.recentActivity(r.Context(), current.ID, 15)
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal,
			"Could not read your credit history. Try again shortly."))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

// creditsExhausted guards the command endpoint: the free daily allowance is
// spent first, then pack credits. Ledger errors fail open — a counting
// problem must not lock users out; the request is recorded either way.
func (h *Handler) creditsExhausted(ctx context.Context, userID string) bool {
	return h.creditGate(ctx, userID) != nil
}

// CodeInsufficientCredits is the stable error code clients key the
// contextual purchase modal on.
const CodeInsufficientCredits = "AI_INSUFFICIENT_CREDITS"

// CreditsPerCommand is the pack-credit cost of one AI action. Actions draw
// from the free daily allowance first; pack credits cover the overflow.
const CreditsPerCommand = 1

// InsufficientCreditsData is the SAFE metadata attached to the 402 so the
// client can explain the situation and offer packs without a second
// round-trip. Deliberately numeric and small: no billing internals, no
// package prices, no session data.
type InsufficientCreditsData struct {
	Remaining         int  `json:"remaining"`         // spendable credits right now
	Required          int  `json:"required"`          // credits the attempted action needs
	PackBalance       int  `json:"packBalance"`       // pack-credit part of remaining
	FreeRemaining     int  `json:"freeRemaining"`     // daily-allowance part of remaining
	PurchaseAvailable bool `json:"purchaseAvailable"` // whether packs can actually be bought yet
}

// insufficientCreditsError builds the structured 402. HTTP 402 is used over
// 429 because the situation is solvable with payment — the response IS the
// offer, not a rate limit.
func (h *Handler) insufficientCreditsError(pack int) *httpx.Error {
	freeRemaining := 0
	remaining := pack
	if remaining < 0 {
		remaining = 0
	}
	if pack < 0 {
		pack = 0
	}
	available := false
	if h.purchaseAvailable != nil {
		available = h.purchaseAvailable()
	}
	data := InsufficientCreditsData{
		Remaining:         remaining,
		Required:          CreditsPerCommand,
		PackBalance:       pack,
		FreeRemaining:     freeRemaining,
		PurchaseAvailable: available,
	}
	return httpx.Errorf(http.StatusPaymentRequired, CodeInsufficientCredits,
		"You're out of AI credits. The daily free allowance is spent and you have no pack credits left.").
		WithData(data)
}

// creditGate evaluates whether one AI action may run. nil means allowed;
// non-nil is the structured 402 to write. Ledger errors fail open exactly
// like the previous bool gate — a counting problem must never lock users out.
func (h *Handler) creditGate(ctx context.Context, userID string) *httpx.Error {
	used, err := h.usage.usedToday(ctx, userID)
	if err != nil {
		return nil
	}
	if used < DailyFreeCommands {
		return nil
	}
	pack, err := h.usage.packBalance(ctx, userID)
	if err != nil {
		return nil
	}
	if pack >= CreditsPerCommand {
		return nil
	}
	return h.insufficientCreditsError(pack)
}
