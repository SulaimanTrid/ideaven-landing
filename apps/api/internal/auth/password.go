package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (RFC 9106 second recommendation, single-threaded):
// 64 MiB, 2 passes, parallelism 1 — ~50–150 ms on typical hardware.
const (
	argonMemoryKiB = 64 * 1024
	argonTime      = 2
	argonThreads   = 1
	argonSaltLen   = 16
	argonKeyLen    = 32
)

// HashPassword derives an Argon2id hash encoded in PHC string format:
//
//	$argon2id$v=19$m=65536,t=2,p=1$<salt b64>$<key b64>
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: hash: read salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword reports whether password matches a stored PHC-format hash.
// Hash parameters are read from the stored string, so they can be raised
// later without invalidating existing accounts.
func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// "", "argon2id", "v=19", "m=...,t=...,p=...", salt, key
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("auth: verify: unrecognized hash format")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, fmt.Errorf("auth: verify: parse version: %w", err)
	}

	var memoryKiB, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memoryKiB, &time, &threads); err != nil {
		return false, fmt.Errorf("auth: verify: parse parameters: %w", err)
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("auth: verify: decode salt: %w", err)
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("auth: verify: decode key: %w", err)
	}

	got := argon2.IDKey([]byte(password), salt, time, memoryKiB, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// dummyHash is a real Argon2id hash of an unguessable value; verifying
// against it when an account does not exist keeps login timing uniform.
var dummyHash = func() string {
	hash, err := HashPassword("ideaven-timing-equalizer")
	if err != nil {
		// crypto/rand failure here would fail every other hash too
		panic(fmt.Sprintf("auth: build dummy hash: %v", err))
	}
	return hash
}()
