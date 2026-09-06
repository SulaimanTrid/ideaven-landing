# IDEAVEN 6.0 — Decision Log

Numbered, immutable-once-accepted decisions. New decisions append.

## DEC-1: Asset bytes move off the database onto a StorageAdapter, lazily

**Context.** Assets are stored as `BYTEA` rows — one giant DB record per
file, no hashes, and DB backup size scales with media. 6.0 M2/M4/M5 require
a storage model split and a provider-agnostic adapter.

**Decision.** Introduce `internal/storage.Adapter` (Save/Load/Delete). The
first backend is `LocalAdapter` (filesystem under `DataDir/assets/<project_id>/<asset_id>`,
0600 dirs, ID-based paths only — user names never touch paths). The assets
table keeps metadata plus the bytes for now:

- Write path: new uploads are written to the adapter **and** stored in DB
  (keeps existing consumers/tests valid during transition).
- Read path: adapter first; if the file is missing, serve DB bytes and
  lazily write the file (incremental backfill — no risky big-bang
  migration, no downtime, backward compatible).
- Delete path: removes both.

A later decision (6K) will flip the default to adapter-only once backfill
completeness is verified.

**Consequences.** No data migration required; `sha256` added via migration
015 for integrity/ETags/dedup groundwork; DB remains the fallback of record.

## DEC-2: Public asset caching becomes long-immutable with ETag/304

**Context.** Asset IDs are stable and content-addressed uploads never
mutate in place (re-upload creates a new asset id), so responses are
naturally immutable. Public assets currently cache only 24h with no ETag.

**Decision.** Public raw responses: `ETag: "<sha256>"` +
`Cache-Control: public, max-age=31536000, immutable`, honoring
`If-None-Match` with 304. Owner (private) responses keep
`Cache-Control: private, max-age=86400, immutable` plus the same ETag.
The audience split stays; private bytes are never cacheable by shared
proxies.

## DEC-3: Image processing (6A M8) is deferred, not faked

**Context.** No image library is available on this no-sudo machine beyond
the Go stdlib; half-featured "compression" would be dishonest and risky
(originals must be preserved per policy).

**Decision.** Defer M8 (resize/thumbnail/compress) until 6E/6K where a
pure-Go pipeline (stdlib decode → box-filter resize → encode) can be built
and tested properly, with originals retained and processing failures
non-destructive. The upload pipeline (M7) already validates content, size,
and type — that part is real today.

## DEC-4: Sync/offline (M10–M12) waits for the collaboration model (6B)

**Context.** The current model is single-writer with server-side version
history; bolting a client op-queue onto a single-owner model would be
rewritten again when 6B lands multi-user.

**Decision.** 6A keeps the existing debounced save + version history and
documents the limitation. The op-log (operation id, entity id, version,
author) is designed together with 6B roles so conflicts (M12) have someone
to conflict *with*.

## DEC-5: Commerce stays locked (M113)

**Decision.** Marketplace grows discovery/compatibility/moderation only.
Paid flows activate only after the full seller/payment/refund/dispute/
payout checklist exists (6G/6I), per M345: never mark commerce complete on
UI evidence.
