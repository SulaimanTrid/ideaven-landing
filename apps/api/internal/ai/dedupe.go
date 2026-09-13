package ai

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// Duplicate-command prevention (roadmap 5.0 phase 5L — AI reliability):
// an identical command from the same user for the same project inside the
// dedupe window returns the original response without calling the provider
// again — a double-click or impatient retry can never burn credits twice
// or produce two divergent plans for one intent.
//
// This is process-local (single-binary API); it is a correctness guard for
// rapid retries, not a distributed cache.

const dedupeTTL = 60 * time.Second

type dedupeKey string

type dedupeEntry struct {
	response any
	at       time.Time
}

type commandDeduper struct {
	mu    sync.Mutex
	seen  map[string]dedupeEntry
}

func newCommandDeduper() *commandDeduper {
	return &commandDeduper{seen: map[string]dedupeEntry{}}
}

// key derives a stable fingerprint from everything that defines the
// command's meaning: user, project, prompt, and the exact context payload.
func commandDeduperKey(userID, projectID, prompt, contextJSON string) dedupeKey {
	sum := sha256.Sum256([]byte(userID + "\x00" + projectID + "\x00" + prompt + "\x00" + contextJSON))
	return dedupeKey(hex.EncodeToString(sum[:]))
}

// lookup returns the cached response for an identical, recent command.
func (d *commandDeduper) lookup(key dedupeKey) (any, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	entry, ok := d.seen[string(key)]
	if !ok {
		return nil, false
	}
	if time.Since(entry.at) > dedupeTTL {
		delete(d.seen, string(key))
		return nil, false
	}
	return entry.response, true
}

// remember stores a completed response for the dedupe window and prunes
// expired entries (amortized cleanup, deterministic behavior unchanged).
func (d *commandDeduper) remember(key dedupeKey, response any) {
	d.mu.Lock()
	defer d.mu.Unlock()
	now := time.Now()
	for k, entry := range d.seen {
		if now.Sub(entry.at) > dedupeTTL {
			delete(d.seen, k)
		}
	}
	d.seen[string(key)] = dedupeEntry{response: response, at: now}
}
