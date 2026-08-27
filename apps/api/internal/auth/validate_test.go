package auth

import "testing"

func TestValidateEmail(t *testing.T) {
	valid := []string{"user@example.com", "first.last+tag@sub.domain.org", "a@b.co"}
	for _, email := range valid {
		if err := ValidateEmail(email); err != nil {
			t.Errorf("valid email %q rejected: %v", email, err)
		}
	}
	invalid := []string{
		"",
		"no-at-sign",
		"user @x.com",
		"user@x.com ", // trailing space (not normalized first)
		"@x.com",
		"x@",
		"a b@x.com",
	}
	for _, email := range invalid {
		if err := ValidateEmail(email); err == nil {
			t.Errorf("invalid email %q accepted", email)
		}
	}
}

func TestValidateUsername(t *testing.T) {
	valid := []string{"ada", "user_1", "creator-99", "ABCxyz012", strings32()}
	for _, username := range valid {
		if err := ValidateUsername(username); err != nil {
			t.Errorf("valid username %q rejected: %v", username, err)
		}
	}
	invalid := []string{"", "ab", "has space", "ümlaut", "semi;colon", "a" + strings32() + "x"}
	for _, username := range invalid {
		if err := ValidateUsername(username); err == nil {
			t.Errorf("invalid username %q accepted", username)
		}
	}
}

func strings32() string {
	s := make([]byte, 32)
	for i := range s {
		s[i] = 'a'
	}
	return string(s)
}

func TestValidatePassword(t *testing.T) {
	if err := ValidatePassword("12345678"); err != nil {
		t.Errorf("8-char password rejected: %v", err)
	}
	if err := ValidatePassword("          "); err == nil {
		t.Fatal("whitespace-only password accepted") // TrimSpace differs → rejected
	}
	if err := ValidatePassword("1234567"); err == nil {
		t.Fatal("7-char password accepted")
	}
	if err := ValidatePassword(" padded "); err == nil {
		t.Fatal("padded password accepted")
	}
	if err := ValidatePassword(longRunes(200)); err == nil {
		t.Fatal("200-char password accepted")
	}
}

func longRunes(n int) string {
	s := make([]byte, n)
	for i := range s {
		s[i] = 'x'
	}
	return string(s)
}
