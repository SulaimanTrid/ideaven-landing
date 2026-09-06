-- Publishing (roadmap 19): a publication is a server-side snapshot of the
-- project model. The public page renders the snapshot, so editing after
-- publishing never changes the live page until the owner republishes.
CREATE TABLE publications (
    project_id    UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    model         JSONB NOT NULL,
    published_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public lookups resolve by slug among published projects only.
CREATE INDEX projects_published_slug_idx ON projects (slug) WHERE status = 'published';

-- Slugs are public identities; the generator suffixes random characters, so
-- collisions are not expected — enforce uniqueness from here on.
CREATE UNIQUE INDEX projects_slug_unique_idx ON projects (slug);
