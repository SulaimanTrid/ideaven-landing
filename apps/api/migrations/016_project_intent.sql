-- Project Intent (roadmap 7.0 M11, phase 7A): the user's structured
-- statement of what the project is FOR. One row per project, owner-checked
-- on every read/write; consumed by the AI planner next to Project Memory
-- and surfaced read-only in the Project Brain.
CREATE TABLE project_intent (
    project_id  UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    goal        TEXT NOT NULL DEFAULT '',
    audience    TEXT NOT NULL DEFAULT '',
    platforms   TEXT NOT NULL DEFAULT '',
    constraints TEXT NOT NULL DEFAULT '',
    success     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
