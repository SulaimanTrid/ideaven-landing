// Package session persists server-side browser sessions. Cookies carry
// "<selector>.<verifier>"; the database stores only the selector and a hash
// of the HMAC'd verifier, so a database leak cannot mint working cookies.
package session

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"ideaven/apps/api/internal/user"
)

// Session is a stored session row joined with its owner.
type Session struct {
	Selector     string
	VerifierHash string
	User         *user.User
	CreatedAt    time.Time
	LastSeenAt   time.Time
	ExpiresAt    time.Time
}

// Store is the PostgreSQL-backed session repository.
type Store struct {
	db *sql.DB
}

// NewStore builds a Store.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// ErrNotFound reports that no live session matched.
var ErrNotFound = errors.New("session: not found")

// Create inserts a session row.
func (s *Store) Create(ctx context.Context, userID, selector, verifierHash string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (user_id, selector, verifier_hash, expires_at)
		VALUES ($1, $2, $3, $4)`,
		userID, selector, verifierHash, expiresAt)
	if err != nil {
		return fmt.Errorf("session: create: %w", err)
	}
	return nil
}

// FindBySelector resolves a selector to its session and owner. Expiry is
// re-checked by the caller so refresh logic can reuse the row.
func (s *Store) FindBySelector(ctx context.Context, selector string) (*Session, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT s.selector, s.verifier_hash, s.created_at, s.last_seen_at, s.expires_at,
		       u.id, u.email, u.username, u.password_hash, u.display_name,
		       u.bio, u.avatar_url, u.locale, u.email_verified, u.created_at, u.updated_at, u.last_login_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.selector = $1`, selector)

	var sess Session
	sess.User = &user.User{}
	err := row.Scan(&sess.Selector, &sess.VerifierHash, &sess.CreatedAt, &sess.LastSeenAt, &sess.ExpiresAt,
		&sess.User.ID, &sess.User.Email, &sess.User.Username, &sess.User.PasswordHash, &sess.User.DisplayName,
		&sess.User.Bio, &sess.User.AvatarURL, &sess.User.Locale, &sess.User.EmailVerified, &sess.User.CreatedAt, &sess.User.UpdatedAt, &sess.User.LastLoginAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("session: find: %w", err)
	}
	return &sess, nil
}

// Touch extends a session's expiry (sliding sessions) and records activity.
func (s *Store) Touch(ctx context.Context, selector string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE selector = $1`,
		selector, expiresAt)
	if err != nil {
		return fmt.Errorf("session: touch: %w", err)
	}
	return nil
}

// DeleteBySelector invalidates one session (logout).
func (s *Store) DeleteBySelector(ctx context.Context, selector string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE selector = $1`, selector)
	if err != nil {
		return fmt.Errorf("session: delete: %w", err)
	}
	return nil
}

// DeleteByUser invalidates every session of a user (password reset, account
// compromise response).
func (s *Store) DeleteByUser(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("session: delete by user: %w", err)
	}
	return nil
}

// DeleteByUserExcept invalidates every session of a user except keepSelector,
// so a password change signs other devices out without ejecting the one that
// performed it.
func (s *Store) DeleteByUserExcept(ctx context.Context, userID, keepSelector string) (int64, error) {
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE user_id = $1 AND selector <> $2`, userID, keepSelector)
	if err != nil {
		return 0, fmt.Errorf("session: delete by user except: %w", err)
	}
	return result.RowsAffected()
}

// DeleteExpired opportunistically purges stale rows.
func (s *Store) DeleteExpired(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
	if err != nil {
		return 0, fmt.Errorf("session: delete expired: %w", err)
	}
	return result.RowsAffected()
}
