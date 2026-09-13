package ai

import (
	"sync"
	"testing"
	"time"
)

func TestDedupeReplaysIdenticalCommand(t *testing.T) {
	d := newCommandDeduper()
	key := commandDeduperKey("user1", "proj1", "add a button", `[{"kind":"project"}]`)
	resp := map[string]any{"operations": []string{"op"}}

	if _, ok := d.lookup(key); ok {
		t.Fatal("empty deduper returned a hit")
	}
	d.remember(key, resp)
	got, ok := d.lookup(key)
	if !ok || got == nil {
		t.Fatal("identical command did not replay")
	}
	// A different prompt/context must NOT hit.
	other := commandDeduperKey("user1", "proj1", "add a label", `[{"kind":"project"}]`)
	if _, ok := d.lookup(other); ok {
		t.Fatal("different prompt wrongly deduped")
	}
	otherUser := commandDeduperKey("user2", "proj1", "add a button", `[{"kind":"project"}]`)
	if _, ok := d.lookup(otherUser); ok {
		t.Fatal("different user wrongly deduped")
	}
}

func TestDedupeWindowExpires(t *testing.T) {
	d := newCommandDeduper()
	key := commandDeduperKey("u", "p", "prompt", "ctx")
	d.remember(key, "x")
	// Simulate age beyond the TTL.
	d.mu.Lock()
	d.seen[string(key)] = dedupeEntry{response: "x", at: time.Now().Add(-2 * dedupeTTL)}
	d.mu.Unlock()
	if _, ok := d.lookup(key); ok {
		t.Fatal("expired entry replayed")
	}
}

func TestDedupeConcurrentSafe(t *testing.T) {
	d := newCommandDeduper()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := commandDeduperKey("u", "p", "prompt", string(rune('a'+i%26)))
			d.remember(key, i)
			_, _ = d.lookup(key)
		}(i)
	}
	wg.Wait()
	if len(d.seen) == 0 {
		t.Fatal("nothing stored")
	}
	// Entries only for the 26 distinct keys.
	if len(d.seen) > 26 {
		t.Fatalf("unexpected key growth: %d", len(d.seen))
	}
}
