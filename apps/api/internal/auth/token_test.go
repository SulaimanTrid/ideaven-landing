package auth

import (
	"strings"
	"testing"
)

func TestNewTokenShape(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	token, selector, verifierHash, err := NewToken(secret)
	if err != nil {
		t.Fatalf("NewToken: %v", err)
	}

	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		t.Fatalf("token must be selector.verifier, got %q", token)
	}
	if parts[0] != selector {
		t.Fatalf("selector mismatch: %q vs %q", parts[0], selector)
	}
	if strings.Contains(token, verifierHash) {
		t.Fatal("token must not contain the stored hash")
	}
	if len(verifierHash) != 64 { // sha256 hex
		t.Fatalf("verifier hash length = %d, want 64", len(verifierHash))
	}
}

func TestNewTokenUniqueness(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	seen := make(map[string]bool, 100)
	for i := 0; i < 100; i++ {
		token, _, _, err := NewToken(secret)
		if err != nil {
			t.Fatalf("NewToken: %v", err)
		}
		if seen[token] {
			t.Fatalf("duplicate token after %d draws", i)
		}
		seen[token] = true
	}
}

func TestParseToken(t *testing.T) {
	if _, _, err := ParseToken("only-selector"); err == nil {
		t.Fatal("missing separator accepted")
	}
	if _, _, err := ParseToken(".verifier"); err == nil {
		t.Fatal("empty selector accepted")
	}
	if _, _, err := ParseToken("selector."); err == nil {
		t.Fatal("empty verifier accepted")
	}
	if _, _, err := ParseToken("  selector.verifier  "); err != nil {
		t.Fatalf("trimmed token rejected: %v", err)
	}
}

func TestVerifierMatches(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	other := []byte("fedcba9876543210fedcba9876543210")
	token, _, verifierHash, err := NewToken(secret)
	if err != nil {
		t.Fatalf("NewToken: %v", err)
	}
	_, verifier, err := ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken: %v", err)
	}

	if !VerifierMatches(secret, verifier, verifierHash) {
		t.Fatal("correct verifier/secret rejected")
	}
	if VerifierMatches(other, verifier, verifierHash) {
		t.Fatal("verifier accepted under a different secret")
	}
	if VerifierMatches(secret, "forged-verifier", verifierHash) {
		t.Fatal("forged verifier accepted")
	}
}
