-- Phase 3: user profile.
-- Profile fields (username, display_name, avatar_url) live on users itself —
-- the existing architecture's single source of truth. This migration adds the
-- one missing profile field: a short public bio. Future user-related systems
-- (projects, credits, usage) get their own tables keyed by users.id.
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
