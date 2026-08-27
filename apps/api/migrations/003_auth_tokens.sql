-- Phase 2: single-use, time-limited tokens for password reset and email
-- verification. Same selector/verifier scheme as sessions. Deleting and
-- re-inserting a row per request keeps tokens single-use and non-cumulative.

CREATE TABLE password_reset_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    selector      TEXT NOT NULL UNIQUE,
    verifier_hash TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

CREATE TABLE email_verification_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    selector      TEXT NOT NULL UNIQUE,
    verifier_hash TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens (user_id);
