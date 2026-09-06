-- Asset storage hardening (roadmap 6.0 M4/M6, phase 6A): content hash for
-- integrity, ETags, and future dedup. Existing rows backfill lazily on
-- first read/write after deploy (the service computes and persists it).
ALTER TABLE assets ADD COLUMN sha256 TEXT NOT NULL DEFAULT '';
