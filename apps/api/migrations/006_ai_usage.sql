-- Phase 3 (AI): server-side usage accounting for AI commands.
-- Provider API keys never touch the browser; this table records every AI
-- request the platform makes so a credits economy can later be built on
-- verifiable usage rows.

CREATE TABLE ai_usage (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id   UUID,
    provider     TEXT NOT NULL,
    model        TEXT NOT NULL,
    prompt_chars INTEGER NOT NULL,
    output_chars INTEGER NOT NULL,
    ok           BOOLEAN NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_user_created_idx ON ai_usage (user_id, created_at DESC);
