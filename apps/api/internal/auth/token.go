package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// Tokens use the OWASP selector/verifier pattern. The wire form sent to users
// (in a cookie or an email link) is "<selector>.<verifier>", both base64url.
// Only sha256(HMAC(secret, verifier)) is stored; lookups go through the
// selector, and the verifier hash is compared in constant time.
const (
	selectorBytes = 16
	verifierBytes = 32
)

// ErrBadToken reports a malformed token string.
var ErrBadToken = errors.New("auth: malformed token")

// NewToken returns the wire token and the verifier hash to store.
func NewToken(secret []byte) (token, selector, verifierHash string, err error) {
	selectorRaw := make([]byte, selectorBytes)
	verifierRaw := make([]byte, verifierBytes)
	if _, err = rand.Read(selectorRaw); err != nil {
		return "", "", "", fmt.Errorf("auth: token: read selector: %w", err)
	}
	if _, err = rand.Read(verifierRaw); err != nil {
		return "", "", "", fmt.Errorf("auth: token: read verifier: %w", err)
	}

	selector = base64.RawURLEncoding.EncodeToString(selectorRaw)
	verifier := base64.RawURLEncoding.EncodeToString(verifierRaw)
	return selector + "." + verifier, selector, HashVerifier(secret, verifier), nil
}

// ParseToken splits a wire token into its selector and verifier.
func ParseToken(token string) (selector, verifier string, err error) {
	selector, verifier, found := strings.Cut(strings.TrimSpace(token), ".")
	if !found || selector == "" || verifier == "" {
		return "", "", ErrBadToken
	}
	return selector, verifier, nil
}

// HashVerifier derives the stored form of a verifier.
func HashVerifier(secret []byte, verifier string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(verifier))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifierMatches compares a verifier against its stored hash in constant
// time.
func VerifierMatches(secret []byte, verifier, storedHash string) bool {
	expected := HashVerifier(secret, verifier)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(storedHash)) == 1
}
