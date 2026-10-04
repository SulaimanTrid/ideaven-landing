-- TASK 64: per-install enable/disable. Disabling removes an extension's
-- blocks from the active palette without uninstalling it — project models
-- keep their `ext:<slug>:<type>` references and stay readable.
ALTER TABLE extension_installs
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;
