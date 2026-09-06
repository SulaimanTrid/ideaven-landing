-- Universal project types (roadmap 7.0 M7 / phase 7A): a project can
-- represent more than an app or game. Existing rows stay valid; the check
-- constraint is replaced atomically. InitialModel treats unknown types as
-- screen-based (Home), so no data migration is needed.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_type_check
    CHECK (type IN ('app', 'game', 'website', 'backend', 'api', 'database', 'experience', 'extension', 'tool', 'education'));
