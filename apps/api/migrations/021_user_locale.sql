-- TASK 10: account-level UI language preference. Empty means "not set" —
-- the client then falls back to its local preference and browser language.
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT '';
