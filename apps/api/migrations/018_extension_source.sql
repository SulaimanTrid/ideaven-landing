-- Extension source (launch feedback): the authored code (e.g. Java for an
-- App-Inventor-style extension) lives with the extension, flows into every
-- version snapshot at build time, and is edited in the Studio's Source tab.
ALTER TABLE extensions ADD COLUMN source TEXT NOT NULL DEFAULT '';
