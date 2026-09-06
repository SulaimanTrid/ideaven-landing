-- Phase 4: user projects.
-- A project row owns exactly one canonical Project Model document (model
-- JSONB). The model is versioned (model_version + schemaVersion inside the
-- document) so future migrations can upgrade stored models in place.

CREATE TABLE projects (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    slug           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    type           TEXT NOT NULL CHECK (type IN ('app', 'game')),
    status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    visibility     TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
    thumbnail      TEXT NOT NULL DEFAULT '',
    model          JSONB NOT NULL,
    model_version  INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_opened_at TIMESTAMPTZ
);

-- Dashboard list queries order by recency within one owner's library.
CREATE INDEX projects_owner_updated_idx ON projects (owner_id, updated_at DESC);
CREATE INDEX projects_owner_last_opened_idx ON projects (owner_id, last_opened_at DESC NULLS LAST);

-- Slugs are stable, owner-scoped identities for future public URLs.
CREATE UNIQUE INDEX projects_owner_slug_key ON projects (owner_id, slug);
