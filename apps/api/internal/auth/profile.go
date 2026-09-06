package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// UpdateProfileInput is the validated shape of a profile update request.
type UpdateProfileInput struct {
	Username    string
	DisplayName string
	Bio         string
	AvatarURL   string
}

// UpdateProfile rewrites the editable profile fields of the session's user.
// The caller passes the server-derived user ID; clients never supply one.
func (s *Service) UpdateProfile(ctx context.Context, userID string, input UpdateProfileInput) (*user.User, error) {
	username := strings.TrimSpace(input.Username)
	displayName := strings.TrimSpace(input.DisplayName)
	bio := strings.TrimSpace(input.Bio)
	avatarURL := strings.TrimSpace(input.AvatarURL)

	if err := ValidateUsername(username); err != nil {
		return nil, field("username", err)
	}
	if err := ValidateDisplayName(displayName); err != nil {
		return nil, field("displayName", err)
	}
	if err := ValidateBio(bio); err != nil {
		return nil, field("bio", err)
	}
	if err := ValidateAvatarURL(avatarURL); err != nil {
		return nil, field("avatarUrl", err)
	}
	if displayName == "" {
		displayName = username
	}

	current, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("auth: profile: find user: %w", err)
	}

	// Pre-check for a clean field error when the handle changes; the
	// lower(username) index remains the real enforcement under concurrency.
	if !strings.EqualFold(current.Username, username) {
		existing, err := s.users.FindByUsername(ctx, username)
		switch {
		case err == nil && existing != nil && existing.ID != userID:
			return nil, httpx.Errorf(http.StatusConflict, httpx.CodeUsernameTaken, "This username is already taken.")
		case err != nil && !errors.Is(err, user.ErrNotFound):
			return nil, fmt.Errorf("auth: profile: check username: %w", err)
		}
	}

	updated, err := s.users.UpdateProfile(ctx, userID, user.ProfileUpdate{
		Username: username, DisplayName: displayName, Bio: bio, AvatarURL: avatarURL,
	})
	if err != nil {
		if errors.Is(err, user.ErrDuplicateUsername) {
			return nil, httpx.Errorf(http.StatusConflict, httpx.CodeUsernameTaken, "This username is already taken.")
		}
		return nil, fmt.Errorf("auth: profile: update: %w", err)
	}
	s.logger.Info("profile updated", "user_id", userID)
	return updated, nil
}

// ChangePassword verifies the current password, stores the new hash, and
// revokes every other session — the device making the change stays signed in.
func (s *Service) ChangePassword(ctx context.Context, token, currentPassword, newPassword string) error {
	selector, _, err := ParseToken(token)
	if err != nil {
		return httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to continue.")
	}
	found, err := s.Authenticate(ctx, token)
	if err != nil {
		return err
	}

	if currentPassword == "" {
		return field("currentPassword", errors.New("Enter your current password."))
	}
	if err := ValidatePassword(newPassword); err != nil {
		return field("password", err)
	}

	ok, verifyErr := VerifyPassword(currentPassword, found.PasswordHash)
	if verifyErr != nil {
		s.logger.Error("auth: change password: verify", "user_id", found.ID, "error", verifyErr)
		return httpx.Errorf(http.StatusUnauthorized, httpx.CodeInvalidCreds, "Your current password is incorrect.")
	}
	if !ok {
		return httpx.Errorf(http.StatusUnauthorized, httpx.CodeInvalidCreds, "Your current password is incorrect.")
	}

	passwordHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	if err := s.users.UpdatePassword(ctx, found.ID, passwordHash); err != nil {
		return fmt.Errorf("auth: change password: update: %w", err)
	}
	if _, err := s.sessions.DeleteByUserExcept(ctx, found.ID, selector); err != nil {
		return fmt.Errorf("auth: change password: revoke sessions: %w", err)
	}
	s.logger.Info("password changed", "user_id", found.ID)
	return nil
}
