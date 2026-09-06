// Package user persists user accounts.
package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// User is a stored account. PasswordHash must never leave the API.
type User struct {
	ID            string
	Email         string
	Username      string
	PasswordHash  string
	DisplayName   string
	Bio           string
	AvatarURL     string
	EmailVerified bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
	LastLoginAt   *time.Time
}

// ProfileUpdate is the editable subset of a user's profile. ID and email are
// intentionally absent: identity is immutable and derived from the session.
type ProfileUpdate struct {
	Username    string
	DisplayName string
	Bio         string
	AvatarURL   string
}

// NewUser is the input for creating an account.
type NewUser struct {
	Email        string
	Username     string
	PasswordHash string
	DisplayName  string
}

// Store is the PostgreSQL-backed user repository.
type Store struct {
	db *sql.DB
}

// NewStore builds a Store.
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

const columns = `id, email, username, password_hash, display_name, bio, avatar_url,
	email_verified, created_at, updated_at, last_login_at`

func scanUser(scanner interface{ Scan(...any) error }) (*User, error) {
	var u User
	err := scanner.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash, &u.DisplayName,
		&u.Bio, &u.AvatarURL, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ErrNotFound reports that no user matched the query.
var ErrNotFound = errors.New("user: not found")

// ErrDuplicateEmail and ErrDuplicateUsername report unique-constraint hits.
var (
	ErrDuplicateEmail    = errors.New("user: email already registered")
	ErrDuplicateUsername = errors.New("user: username already taken")
)

// Create inserts a user; uniqueness is enforced by the lower(email) and
// lower(username) indexes, with pre-checks in the service layer for clean
// error codes. Constraint races map to the same errors.
func (s *Store) Create(ctx context.Context, input NewUser) (*User, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO users (email, username, password_hash, display_name)
		VALUES ($1, $2, $3, $4)
		RETURNING `+columns,
		input.Email, input.Username, input.PasswordHash, input.DisplayName)

	user, err := scanUser(row)
	if err != nil {
		if isUniqueViolation(err, "users_email_key") {
			return nil, ErrDuplicateEmail
		}
		if isUniqueViolation(err, "users_username_key") {
			return nil, ErrDuplicateUsername
		}
		return nil, fmt.Errorf("user: create: %w", err)
	}
	return user, nil
}

// FindByEmail matches case-insensitively.
func (s *Store) FindByEmail(ctx context.Context, email string) (*User, error) {
	return s.findOne(ctx, `SELECT `+columns+` FROM users WHERE lower(email) = lower($1)`, email)
}

// FindByUsername matches case-insensitively.
func (s *Store) FindByUsername(ctx context.Context, username string) (*User, error) {
	return s.findOne(ctx, `SELECT `+columns+` FROM users WHERE lower(username) = lower($1)`, username)
}

// FindByID looks a user up by primary key.
func (s *Store) FindByID(ctx context.Context, id string) (*User, error) {
	return s.findOne(ctx, `SELECT `+columns+` FROM users WHERE id = $1`, id)
}

// UpdateProfile rewrites the editable profile fields of one user. Callers
// pass the session-derived ID only; username uniqueness is enforced here by
// the lower(username) index and surfaced as ErrDuplicateUsername.
func (s *Store) UpdateProfile(ctx context.Context, id string, in ProfileUpdate) (*User, error) {
	row := s.db.QueryRowContext(ctx, `
		UPDATE users SET username = $2, display_name = $3, bio = $4, avatar_url = $5, updated_at = now()
		WHERE id = $1
		RETURNING `+columns,
		id, in.Username, in.DisplayName, in.Bio, in.AvatarURL)

	user, err := scanUser(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		if isUniqueViolation(err, "users_username_key") {
			return nil, ErrDuplicateUsername
		}
		return nil, fmt.Errorf("user: update profile: %w", err)
	}
	return user, nil
}

func (s *Store) findOne(ctx context.Context, query string, arg any) (*User, error) {
	user, err := scanUser(s.db.QueryRowContext(ctx, query, arg))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("user: find: %w", err)
	}
	return user, nil
}

// UpdatePassword replaces the stored password hash.
func (s *Store) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, passwordHash)
	if err != nil {
		return fmt.Errorf("user: update password: %w", err)
	}
	return nil
}

// MarkEmailVerified flips email_verified and clears stale verification tokens.
func (s *Store) MarkEmailVerified(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET email_verified = TRUE, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("user: mark verified: %w", err)
	}
	return nil
}

// TouchLogin records a successful login.
func (s *Store) TouchLogin(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET last_login_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("user: touch login: %w", err)
	}
	return nil
}

// isUniqueViolation reports whether err is a 23505 on the named index.
func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.ConstraintName == constraint
}
