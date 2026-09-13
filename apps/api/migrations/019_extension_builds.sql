-- Extension build pipeline (Task 06): one row per real build run — success,
-- failure, or cancellation. This is the build history the Studio renders;
-- extension_versions stays the immutable snapshot registry for artifacts
-- that shipped. Failed builds intentionally create no version row, so a
-- retry at the same version never collides.
CREATE TABLE extension_builds (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extension_id UUID NOT NULL REFERENCES extensions (id) ON DELETE CASCADE,
    version      TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
    failed_step  TEXT NOT NULL DEFAULT '',
    error        TEXT NOT NULL DEFAULT '',
    logs         JSONB NOT NULL DEFAULT '[]'::jsonb,
    checksum     TEXT NOT NULL DEFAULT '',
    size         INTEGER NOT NULL DEFAULT 0,
    changelog    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX extension_builds_ext_idx ON extension_builds (extension_id, created_at DESC);
