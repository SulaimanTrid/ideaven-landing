-- Extension installs (roadmap 2.0 Phase 1): a user-level install registry.
-- Wiring into project palettes arrives with the visual-blocks phase.
CREATE TABLE extension_installs (
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    extension_id UUID NOT NULL REFERENCES extensions (id) ON DELETE CASCADE,
    version      TEXT NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, extension_id)
);
CREATE INDEX extension_installs_extension_idx ON extension_installs (extension_id);
