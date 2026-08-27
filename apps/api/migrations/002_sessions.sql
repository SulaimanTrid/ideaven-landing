-- Phase 2: server-side browser sessions.
-- The cookie holds "<selector>.<verifier>"; only sha256(HMAC(secret, verifier))
-- is stored, so a database leak cannot reconstruct usable cookies.

CREATE TABLE sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    selector      TEXT NOT NULL UNIQUE,
    verifier_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
