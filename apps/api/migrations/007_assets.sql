-- Phase 3 (Assets): per-project media storage. The canonical model references
-- assets by ID (props "asset:<id>"); binary bytes live in this table, never
-- inside the model document (see internal/project/model.go Asset). Rows
-- cascade with their project; ownership is the owning project's owner.

CREATE TABLE assets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    name       TEXT NOT NULL,
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    data       BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assets_project_created_idx ON assets (project_id, created_at DESC);
