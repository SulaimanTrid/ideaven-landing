-- Phase 10 (Versioning) / AI safety: label how each snapshot came to be.
-- "edit" is any normal save; "ai" marks the save that carried an applied
-- AI changeset, so the History panel (and future AI rollback) can point at
-- the state right before an AI change.

ALTER TABLE project_versions
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'edit'
    CHECK (origin IN ('edit', 'ai'));
