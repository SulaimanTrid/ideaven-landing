// Package auth implements Ideaven's authentication domain: registration,
// login, sessions, password reset, and email verification.
package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/session"
	"ideaven/apps/api/internal/user"
)

// Service holds the authentication business logic. Handlers translate HTTP
// into calls; everything here is transport-agnostic and unit-testable.
type Service struct {
	users      *user.Store
	sessions   *session.Store
	resets     *tokenStore
	verifies   *tokenStore
	secret     []byte
	mailer     Mailer
	appURL     string
	sessionTTL time.Duration
	resetTTL   time.Duration
	verifyTTL  time.Duration
	logger     *slog.Logger
}

// NewService wires a Service from the database pool and configuration.
func NewService(db *sql.DB, cfg config.Config, mailer Mailer, logger *slog.Logger) *Service {
	return &Service{
		users:      user.NewStore(db),
		sessions:   session.NewStore(db),
		resets:     &tokenStore{db: db, table: "password_reset_tokens"},
		verifies:   &tokenStore{db: db, table: "email_verification_tokens"},
		secret:     cfg.SessionSecret,
		mailer:     mailer,
		appURL:     cfg.AppURL,
		sessionTTL: cfg.SessionTTL,
		resetTTL:   cfg.ResetTokenTTL,
		verifyTTL:  cfg.VerifyTokenTTL,
		logger:     logger,
	}
}

// RegisterInput is the validated shape of a registration request.
type RegisterInput struct {
	Email       string
	Username    string
	Password    string
	DisplayName string
}

// Register creates an account, queues the verification email, and starts a
// session. The returned token goes straight into the session cookie.
func (s *Service) Register(ctx context.Context, input RegisterInput) (*user.User, string, error) {
	email := NormalizeEmail(input.Email)
	username := strings.TrimSpace(input.Username)
	displayName := strings.TrimSpace(input.DisplayName)

	if err := ValidateEmail(email); err != nil {
		return nil, "", field("email", err)
	}
	if err := ValidateUsername(username); err != nil {
		return nil, "", field("username", err)
	}
	if err := ValidatePassword(input.Password); err != nil {
		return nil, "", field("password", err)
	}
	if err := ValidateDisplayName(displayName); err != nil {
		return nil, "", field("displayName", err)
	}
	if displayName == "" {
		displayName = username
	}

	// Pre-checks give clean field errors; the unique indexes remain the real
	// enforcement under concurrency.
	if existing, err := s.users.FindByEmail(ctx, email); err == nil && existing != nil {
		return nil, "", httpx.Errorf(http.StatusConflict, httpx.CodeEmailTaken, "An account with this email already exists.")
	} else if err != nil && !errors.Is(err, user.ErrNotFound) {
		return nil, "", fmt.Errorf("auth: register: check email: %w", err)
	}
	if existing, err := s.users.FindByUsername(ctx, username); err == nil && existing != nil {
		return nil, "", httpx.Errorf(http.StatusConflict, httpx.CodeUsernameTaken, "This username is already taken.")
	} else if err != nil && !errors.Is(err, user.ErrNotFound) {
		return nil, "", fmt.Errorf("auth: register: check username: %w", err)
	}

	passwordHash, err := HashPassword(input.Password)
	if err != nil {
		return nil, "", err
	}

	created, err := s.users.Create(ctx, user.NewUser{
		Email: email, Username: username, PasswordHash: passwordHash, DisplayName: displayName,
	})
	if err != nil {
		switch {
		case errors.Is(err, user.ErrDuplicateEmail):
			return nil, "", httpx.Errorf(http.StatusConflict, httpx.CodeEmailTaken, "An account with this email already exists.")
		case errors.Is(err, user.ErrDuplicateUsername):
			return nil, "", httpx.Errorf(http.StatusConflict, httpx.CodeUsernameTaken, "This username is already taken.")
		}
		return nil, "", fmt.Errorf("auth: register: create user: %w", err)
	}

	s.sendVerificationEmail(ctx, created)

	token, err := s.createSession(ctx, created.ID)
	if err != nil {
		return nil, "", err
	}
	s.logger.Info("user registered", "user_id", created.ID, "username", created.Username)
	return created, token, nil
}

// Login verifies credentials and starts a session. The identifier may be an
// email address or a username; failures are deliberately indistinguishable.
func (s *Service) Login(ctx context.Context, identifier, password string) (*user.User, string, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, "", field("identifier", errors.New("Enter your email or username."))
	}
	if password == "" {
		return nil, "", field("password", errors.New("Enter your password."))
	}

	var found *user.User
	var err error
	if strings.Contains(identifier, "@") {
		found, err = s.users.FindByEmail(ctx, identifier)
	} else {
		found, err = s.users.FindByUsername(ctx, identifier)
	}
	if err != nil && !errors.Is(err, user.ErrNotFound) {
		return nil, "", fmt.Errorf("auth: login: find user: %w", err)
	}

	invalid := httpx.Errorf(http.StatusUnauthorized, httpx.CodeInvalidCreds, "Incorrect email/username or password.")
	if found == nil {
		// Equalize timing with the real path so absence is not observable.
		if _, verifyErr := VerifyPassword(password, dummyHash); verifyErr != nil {
			s.logger.Error("auth: login: dummy verify failed", "error", verifyErr)
		}
		return nil, "", invalid
	}

	ok, verifyErr := VerifyPassword(password, found.PasswordHash)
	if verifyErr != nil {
		s.logger.Error("auth: login: verify password", "user_id", found.ID, "error", verifyErr)
		return nil, "", invalid
	}
	if !ok {
		return nil, "", invalid
	}

	if err := s.users.TouchLogin(ctx, found.ID); err != nil {
		return nil, "", fmt.Errorf("auth: login: touch: %w", err)
	}
	token, err := s.createSession(ctx, found.ID)
	if err != nil {
		return nil, "", err
	}
	s.logger.Info("user logged in", "user_id", found.ID)
	return found, token, nil
}

// Authenticate resolves a session cookie token to its user, sliding the
// expiry forward when the session has been idle for over an hour.
func (s *Service) Authenticate(ctx context.Context, token string) (*user.User, error) {
	selector, verifier, err := ParseToken(token)
	if err != nil {
		return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
	}

	sess, err := s.sessions.FindBySelector(ctx, selector)
	if err != nil {
		if errors.Is(err, session.ErrNotFound) {
			return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
		}
		return nil, fmt.Errorf("auth: authenticate: find session: %w", err)
	}
	if sess.ExpiresAt.Before(time.Now()) {
		return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Your session expired. Sign in again.")
	}
	if !VerifierMatches(s.secret, verifier, sess.VerifierHash) {
		return nil, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
	}

	if time.Since(sess.LastSeenAt) > time.Hour {
		if err := s.sessions.Touch(ctx, selector, time.Now().Add(s.sessionTTL)); err != nil {
			s.logger.Error("auth: authenticate: refresh session", "error", err)
		}
	}
	return sess.User, nil
}

// Logout invalidates the session behind a cookie token. Missing or stale
// tokens are not errors — logout is idempotent.
func (s *Service) Logout(ctx context.Context, token string) error {
	selector, _, err := ParseToken(token)
	if err != nil {
		return nil
	}
	if err := s.sessions.DeleteBySelector(ctx, selector); err != nil {
		return fmt.Errorf("auth: logout: %w", err)
	}
	return nil
}

// ForgotPassword emails a reset link when the address belongs to an account.
// The response is always success so the endpoint cannot be used to probe
// which addresses are registered.
func (s *Service) ForgotPassword(ctx context.Context, rawEmail string) error {
	email := NormalizeEmail(rawEmail)
	if err := ValidateEmail(email); err != nil {
		return field("email", err)
	}

	found, err := s.users.FindByEmail(ctx, email)
	if err != nil && !errors.Is(err, user.ErrNotFound) {
		return fmt.Errorf("auth: forgot password: find user: %w", err)
	}
	if found == nil {
		s.logger.Info("password reset requested for unknown address", "email_domain", domainOf(email))
		return nil
	}

	token, selector, verifierHash, err := NewToken(s.secret)
	if err != nil {
		return err
	}
	if err := s.resets.Issue(ctx, found.ID, selector, verifierHash, time.Now().Add(s.resetTTL)); err != nil {
		return err
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", s.appURL, token)
	if mailErr := s.mailer.SendPasswordReset(ctx, found.Email, link); mailErr != nil {
		// Delivery failure must not leak account existence; the user can retry.
		s.logger.Error("auth: forgot password: send mail", "user_id", found.ID, "error", mailErr)
	}
	return nil
}

// ResetPassword consumes a reset token, stores the new hash, and signs the
// user out everywhere.
func (s *Service) ResetPassword(ctx context.Context, token, password string) error {
	if err := ValidatePassword(password); err != nil {
		return field("password", err)
	}
	selector, verifier, err := ParseToken(token)
	if err != nil {
		return invalidToken()
	}
	userID, err := s.resets.Consume(ctx, selector, HashVerifier(s.secret, verifier))
	if err != nil {
		return mapTokenError(err)
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return err
	}
	if err := s.users.UpdatePassword(ctx, userID, passwordHash); err != nil {
		return err
	}
	if err := s.sessions.DeleteByUser(ctx, userID); err != nil {
		return err
	}
	s.logger.Info("password reset completed", "user_id", userID)
	return nil
}

// ValidateResetToken checks a token is usable without consuming it, so the
// reset page can reject expired links before asking for a new password.
func (s *Service) ValidateResetToken(ctx context.Context, token string) error {
	selector, verifier, err := ParseToken(token)
	if err != nil {
		return invalidToken()
	}
	if err := s.resets.Peek(ctx, selector, HashVerifier(s.secret, verifier)); err != nil {
		return mapTokenError(err)
	}
	return nil
}

// VerifyEmail consumes a verification token and marks the account verified.
func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	selector, verifier, err := ParseToken(token)
	if err != nil {
		return invalidToken()
	}
	userID, err := s.verifies.Consume(ctx, selector, HashVerifier(s.secret, verifier))
	if err != nil {
		return mapTokenError(err)
	}
	if err := s.users.MarkEmailVerified(ctx, userID); err != nil {
		return err
	}
	s.logger.Info("email verified", "user_id", userID)
	return nil
}

// ResendVerification re-queues the verification email for an unverified
// account. Like ForgotPassword it is response-uniform to prevent probing.
func (s *Service) ResendVerification(ctx context.Context, rawEmail string) error {
	email := NormalizeEmail(rawEmail)
	if err := ValidateEmail(email); err != nil {
		return field("email", err)
	}

	found, err := s.users.FindByEmail(ctx, email)
	if err != nil && !errors.Is(err, user.ErrNotFound) {
		return fmt.Errorf("auth: resend verification: find user: %w", err)
	}
	if found == nil || found.EmailVerified {
		return nil
	}
	s.sendVerificationEmail(ctx, found)
	return nil
}

// sendVerificationEmail issues a token and hands the link to the mailer.
func (s *Service) sendVerificationEmail(ctx context.Context, u *user.User) {
	token, selector, verifierHash, err := NewToken(s.secret)
	if err != nil {
		s.logger.Error("auth: verification token", "user_id", u.ID, "error", err)
		return
	}
	if err := s.verifies.Issue(ctx, u.ID, selector, verifierHash, time.Now().Add(s.verifyTTL)); err != nil {
		s.logger.Error("auth: issue verification token", "user_id", u.ID, "error", err)
		return
	}
	link := fmt.Sprintf("%s/verify-email?token=%s", s.appURL, token)
	if err := s.mailer.SendEmailVerification(ctx, u.Email, link); err != nil {
		s.logger.Error("auth: send verification email", "user_id", u.ID, "error", err)
	}
}

// createSession mints a session row and returns the cookie token.
func (s *Service) createSession(ctx context.Context, userID string) (string, error) {
	token, selector, verifierHash, err := NewToken(s.secret)
	if err != nil {
		return "", err
	}
	if err := s.sessions.Create(ctx, userID, selector, verifierHash, time.Now().Add(s.sessionTTL)); err != nil {
		return "", fmt.Errorf("auth: create session: %w", err)
	}
	return token, nil
}

// StartCleanup purges expired sessions and tokens every hour until ctx ends.
func (s *Service) StartCleanup(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := s.sessions.DeleteExpired(ctx); err != nil {
					s.logger.Error("cleanup: sessions", "error", err)
				}
				if err := s.resets.DeleteExpired(ctx); err != nil {
					s.logger.Error("cleanup: reset tokens", "error", err)
				}
				if err := s.verifies.DeleteExpired(ctx); err != nil {
					s.logger.Error("cleanup: verification tokens", "error", err)
				}
			}
		}
	}()
}

// mapTokenError converts token-store sentinels into API errors.
func mapTokenError(err error) *httpx.Error {
	switch {
	case errors.Is(err, ErrTokenExpired):
		return httpx.Errorf(http.StatusBadRequest, httpx.CodeTokenExpired, "This link has expired. Request a new one.")
	case errors.Is(err, ErrTokenUsed):
		return httpx.Errorf(http.StatusBadRequest, httpx.CodeTokenInvalid, "This link was already used. Request a new one.")
	default:
		return httpx.Errorf(http.StatusBadRequest, httpx.CodeTokenInvalid, "This link is not valid. Request a new one.")
	}
}

func invalidToken() *httpx.Error {
	return httpx.Errorf(http.StatusBadRequest, httpx.CodeTokenInvalid, "This link is not valid. Request a new one.")
}

func domainOf(email string) string {
	if _, domain, found := strings.Cut(email, "@"); found {
		return domain
	}
	return ""
}
