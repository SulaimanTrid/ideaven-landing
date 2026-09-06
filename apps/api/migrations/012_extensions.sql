-- Extension ecosystem (roadmap 2.0-B): authored extensions and their
-- immutable versions. The manifest is the forward-compatible contract the
-- Studio edits and the build worker consumes; source holds the authored
-- metadata/artifacts per version.
CREATE TABLE extensions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    kind            TEXT NOT NULL DEFAULT 'mixed' CHECK (kind IN ('component', 'blocks', 'mixed')),
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    manifest        JSONB NOT NULL,
    docs            TEXT NOT NULL DEFAULT '',
    current_version TEXT NOT NULL DEFAULT '0.1.0',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slugs are public identities; extensions feed the marketplace later.
CREATE UNIQUE INDEX extensions_slug_unique_idx ON extensions (slug);
CREATE INDEX extensions_owner_updated_idx ON extensions (owner_id, updated_at DESC);

-- Immutable published versions; source is the authored package content.
CREATE TABLE extension_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extension_id UUID NOT NULL REFERENCES extensions (id) ON DELETE CASCADE,
    version      TEXT NOT NULL,
    manifest     JSONB NOT NULL,
    source       JSONB NOT NULL DEFAULT '{}'::jsonb,
    changelog    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (extension_id, version)
);
