-- Phase 10 (Versioning): server-side snapshots of the canonical model. Every
-- changed save records the new state, pruned to a per-project cap, so the
-- builder's History panel (and future AI rollback) can restore any earlier
-- state through the same validated model path. Rows cascade with their
-- project; size is octet-length of the stored document for cheap listing.

CREATE TABLE project_versions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    model      JSONB NOT NULL,
    size       INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX project_versions_project_created_idx
    ON project_versions (project_id, created_at DESC);
