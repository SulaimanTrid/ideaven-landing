package auth

import (
	"strings"
	"testing"
)

func TestHashPasswordFormat(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=65536,t=2,p=1$") {
		t.Fatalf("unexpected PHC prefix: %q", hash)
	}
	if strings.Contains(hash, "correct horse") {
		t.Fatal("hash must not embed the password")
	}
}

func TestVerifyPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("tr0ub4dor&3")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if ok, err := VerifyPassword("tr0ub4dor&3", hash); err != nil || !ok {
		t.Fatalf("correct password rejected: ok=%v err=%v", ok, err)
	}
	if ok, err := VerifyPassword("wrong", hash); err != nil || ok {
		t.Fatalf("wrong password accepted: ok=%v err=%v", ok, err)
	}
}

func TestVerifyPasswordUniqueSalts(t *testing.T) {
	first, _ := HashPassword("same-input")
	second, _ := HashPassword("same-input")
	if first == second {
		t.Fatal("salts must make identical passwords hash differently")
	}
}

func TestVerifyPasswordMalformedHash(t *testing.T) {
	for _, hash := range []string{"", "plaintext", "$argon2i$v=19$x$y", "$argon2id$v=19$m=broken$盐水$盐"} {
		if _, err := VerifyPassword("x", hash); err == nil {
			t.Fatalf("malformed hash %q accepted", hash)
		}
	}
}
