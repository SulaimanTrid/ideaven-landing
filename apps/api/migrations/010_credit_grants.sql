-- Phase 3 (AI credits): the grant ledger. Awards only — consumption stays
-- in the ai_usage ledger, where every successful command is already
-- recorded. Pack credits are drawn only after the derived daily free
-- allowance (20/day) is spent, so pack balance is computable at any moment:
--   balance = Σ grants not expired − Σ per-day max(0, ok_commands − 20)
-- Grants arrive from the operator CLI (cmd/grant-credits) for now; paid
-- top-ups will write the same rows when payments exist (roadmap 42).

CREATE TABLE credit_grants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL CHECK (amount > 0),
    source     TEXT NOT NULL CHECK (source IN ('signup', 'promo')),
    note       TEXT NOT NULL DEFAULT '',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX credit_grants_user_granted_idx ON credit_grants (user_id, granted_at DESC);
