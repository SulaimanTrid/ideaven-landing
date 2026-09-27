-- TASK 51 (3D foundation): "3d" joins the project type vocabulary — the
-- check constraint is replaced atomically; InitialModel already gives 3d
-- projects a Scene 1 screen. Existing rows stay valid.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_type_check
    CHECK (type IN ('app', 'game', '3d', 'website', 'backend', 'api', 'database', 'experience', 'extension', 'tool', 'education'));
