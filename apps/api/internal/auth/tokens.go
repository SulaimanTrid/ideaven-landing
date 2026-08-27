package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// tokenStore persists one kind of single-use token (password reset or email
// verification). The table name is a compile-time constant set by the
// constructor — never user input.
type tokenStore struct {
	db    *sql.DB
	table string
}

// Sentinel outcomes for Consume.
var (
	ErrTokenNotFound = errors.New("auth: token not found")
	ErrTokenUsed     = errors.New("auth: token already used")
	ErrTokenExpired  = errors.New("auth: token expired")
	ErrTokenMismatch = errors.New("auth: token verifier mismatch")
)

// Issue replaces any outstanding tokens for the user with a fresh one —
// tokens are single-use and never accumulate.
func (s *tokenStore) Issue(ctx context.Context, userID, selector, verifierHash string, expiresAt time.Time) error {
	if _, err := s.db.ExecContext(ctx,
		fmt.Sprintf(`DELETE FROM %s WHERE user_id = $1`, s.table), userID); err != nil {
		return fmt.Errorf("auth: tokens(%s): clear previous: %w", s.table, err)
	}
	if _, err := s.db.ExecContext(ctx,
		fmt.Sprintf(`INSERT INTO %s (user_id, selector, verifier_hash, expires_at) VALUES ($1, $2, $3, $4)`, s.table),
		userID, selector, verifierHash, expiresAt); err != nil {
		return fmt.Errorf("auth: tokens(%s): insert: %w", s.table, err)
	}
	return nil
}

// Consume atomically marks the token used and returns its user — or one of
// the sentinel errors. The UPDATE … WHERE guards (unused, unexpired) make the
// check-and-mark a single statement, so concurrent reuse cannot both win.
func (s *tokenStore) Consume(ctx context.Context, selector, verifierHash string) (userID string, err error) {
	err = s.db.QueryRowContext(ctx,
		fmt.Sprintf(`UPDATE %s SET used_at = now()
			WHERE selector = $1 AND verifier_hash = $2 AND used_at IS NULL AND expires_at > now()
			RETURNING user_id`, s.table),
		selector, verifierHash).Scan(&userID)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		// Distinguish the failure cause for an accurate API error.
		var expiresAt, usedAt sql.NullTime
		rowErr := s.db.QueryRowContext(ctx,
			fmt.Sprintf(`SELECT expires_at, used_at FROM %s WHERE selector = $1`, s.table),
			selector).Scan(&expiresAt, &usedAt)
		switch {
		case errors.Is(rowErr, sql.ErrNoRows):
			return "", ErrTokenNotFound
		case rowErr != nil:
			return "", fmt.Errorf("auth: tokens(%s): inspect: %w", s.table, rowErr)
		case usedAt.Valid:
			return "", ErrTokenUsed
		case !expiresAt.Valid || expiresAt.Time.Before(time.Now()):
			return "", ErrTokenExpired
		default:
			return "", ErrTokenMismatch
		}
	case err != nil:
		return "", fmt.Errorf("auth: tokens(%s): consume: %w", s.table, err)
	}
	return userID, nil
}

// Peek verifies a token without consuming it (used to validate the verifier
// before asking the user for a new password on the reset page).
func (s *tokenStore) Peek(ctx context.Context, selector, verifierHash string) error {
	var expiresAt, usedAt sql.NullTime
	err := s.db.QueryRowContext(ctx,
		fmt.Sprintf(`SELECT expires_at, used_at FROM %s WHERE selector = $1 AND verifier_hash = $2`, s.table),
		selector, verifierHash).Scan(&expiresAt, &usedAt)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return ErrTokenNotFound
	case err != nil:
		return fmt.Errorf("auth: tokens(%s): peek: %w", s.table, err)
	case usedAt.Valid:
		return ErrTokenUsed
	case !expiresAt.Valid || expiresAt.Time.Before(time.Now()):
		return ErrTokenExpired
	}
	return nil
}

// DeleteExpired purges stale rows opportunistically.
func (s *tokenStore) DeleteExpired(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx,
		fmt.Sprintf(`DELETE FROM %s WHERE expires_at < now()`, s.table)); err != nil {
		return fmt.Errorf("auth: tokens(%s): delete expired: %w", s.table, err)
	}
	return nil
}
