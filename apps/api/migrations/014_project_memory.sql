-- Project Memory (roadmap 5.0 M5 / phase 5A): durable per-project rules the
-- user writes for the AI planner ("use the existing Button", "never modify
-- the auth screen"). Rows are project-scoped and owner-checked on every
-- read; they never leak between projects.
CREATE TABLE project_memory (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    category   TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_memory_project_idx ON project_memory (project_id);
