package auth

import (
	"fmt"
	"net/mail"
	"net/url"
	"strings"
	"unicode/utf8"

	"ideaven/apps/api/internal/httpx"
)

// Input limits — enforced server-side regardless of what the frontend checks.
const (
	emailMaxLen    = 254
	usernameMinLen = 3
	usernameMaxLen = 32
	displayMaxLen  = 50
	passwordMinLen = 8
	passwordMaxLen = 128
	bioMaxLen      = 280
	avatarMaxLen   = 500
)

// NormalizeEmail trims surrounding whitespace. Case is preserved for display;
// uniqueness and lookups compare lower(email) in PostgreSQL.
func NormalizeEmail(raw string) string {
	return strings.TrimSpace(raw)
}

// ValidateEmail validates a normalized email address.
func ValidateEmail(email string) error {
	if email == "" {
		return fmt.Errorf("Enter your email address.")
	}
	if utf8.RuneCountInString(email) > emailMaxLen {
		return fmt.Errorf("Email addresses are at most %d characters.", emailMaxLen)
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || !strings.Contains(email, "@") || strings.ContainsAny(email, " \t") {
		return fmt.Errorf("Enter a valid email address.")
	}
	return nil
}

// ValidateUsername enforces the public handle rules: 3–32 characters of
// letters, digits, underscore, or hyphen. Case is preserved for display;
// uniqueness compares lower(username).
func ValidateUsername(username string) error {
	if username == "" {
		return fmt.Errorf("Choose a username.")
	}
	n := utf8.RuneCountInString(username)
	if n < usernameMinLen || n > usernameMaxLen {
		return fmt.Errorf("Usernames are %d–%d characters.", usernameMinLen, usernameMaxLen)
	}
	for _, r := range username {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
		default:
			return fmt.Errorf("Usernames use letters, numbers, underscores, and hyphens only.")
		}
	}
	return nil
}

// ValidatePassword enforces the password policy: length only, deliberately —
// composition rules measurably hurt usability without adding entropy.
func ValidatePassword(password string) error {
	if utf8.RuneCountInString(password) < passwordMinLen {
		return fmt.Errorf("Passwords are at least %d characters.", passwordMinLen)
	}
	// Length in bytes bounds Argon2 work; rune count alone does not.
	if len(password) > passwordMaxLen {
		return fmt.Errorf("Passwords are at most %d characters.", passwordMaxLen)
	}
	if strings.TrimSpace(password) != password {
		return fmt.Errorf("Passwords cannot start or end with whitespace.")
	}
	return nil
}

// ValidateDisplayName allows an optional friendly name, defaulting to the
// username.
func ValidateDisplayName(name string) error {
	if utf8.RuneCountInString(name) > displayMaxLen {
		return fmt.Errorf("Display names are at most %d characters.", displayMaxLen)
	}
	return nil
}

// ValidateBio allows an optional short public bio.
func ValidateBio(bio string) error {
	if utf8.RuneCountInString(bio) > bioMaxLen {
		return fmt.Errorf("Bios are at most %d characters.", bioMaxLen)
	}
	return nil
}

// ValidateAvatarURL allows an optional http(s) image URL. The platform has no
// file storage yet, so avatars ride the existing avatar_url column.
func ValidateAvatarURL(raw string) error {
	if raw == "" {
		return nil
	}
	if utf8.RuneCountInString(raw) > avatarMaxLen {
		return fmt.Errorf("Avatar URLs are at most %d characters.", avatarMaxLen)
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return fmt.Errorf("Avatar must be an http(s) image URL.")
	}
	return nil
}

// field builds a field-scoped validation error.
func field(name string, err error) *httpx.Error {
	return httpx.Errorf(400, httpx.CodeValidation, "Please fix the highlighted fields.").
		WithDetails(httpx.FieldError{Field: name, Message: err.Error()})
}
