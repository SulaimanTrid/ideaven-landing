-- TASK 12: contextual credit purchase flow. Three additions, one rule:
-- the credit ledger stays the single balance source; this migration adds
-- commerce records only (what was offered, what was paid, what was
-- delivered). A purchase NEVER writes a balance — it writes a credit_grants
-- row through the same insert path the operator CLI uses, after the payment
-- provider's result is verified server-side.

-- 1) Paid top-ups arrive as grants from purchases.
ALTER TABLE credit_grants DROP CONSTRAINT credit_grants_source_check;
ALTER TABLE credit_grants ADD CONSTRAINT credit_grants_source_check
    CHECK (source IN ('signup', 'promo', 'purchase'));

-- 2) Credit packages: server-authoritative product data. One definition —
-- the pricing page and the contextual purchase modal both read it from the
-- API; neither hardcodes a second copy. Price is in MINOR units of the
-- currency (IDR/JPY-class zero-decimal currencies: minor == major).
-- The seeded rows are the packs the pricing page already describes
-- (designed, not yet sold); they are honest placeholders for the configured
-- product, and can be updated or disabled by operators at any time.
CREATE TABLE credit_packages (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    credits       INTEGER NOT NULL CHECK (credits > 0),
    currency      TEXT NOT NULL,
    price         INTEGER NOT NULL CHECK (price >= 0),
    tagline       TEXT NOT NULL DEFAULT '',
    popular       BOOLEAN NOT NULL DEFAULT false,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO credit_packages (id, name, credits, currency, price, tagline, popular, enabled, display_order) VALUES
    ('pack-starter', 'Starter pack', 100,  'USD', 200,  'Small top-up when a build day runs long.', false, true, 1),
    ('pack-builder', 'Builder pack', 600,  'USD', 1000, 'The everyday pack for active projects.',  true,  true, 2),
    ('pack-studio',  'Studio pack',  2000, 'USD', 3000, 'For heavy sessions and long AI-assisted builds.', false, true, 3);

-- 3) Purchase records (commerce audit trail). status is the purchase state
-- machine: pending → succeeded | failed | cancelled. succeeded is terminal —
-- a late duplicate or contradicting webhook can never revoke or repeat a
-- delivered grant. provider_transaction_id is the idempotency key: a
-- replayed webhook hits the unique index and settles nothing twice.
CREATE TABLE credit_purchases (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    package_id             TEXT NOT NULL,
    provider               TEXT NOT NULL,
    provider_intent_id     TEXT,
    provider_transaction_id TEXT,
    currency               TEXT NOT NULL,
    amount                 INTEGER NOT NULL,
    credits                INTEGER NOT NULL,
    status                 TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at           TIMESTAMPTZ
);

CREATE INDEX credit_purchases_user_idx ON credit_purchases (user_id, created_at DESC);
CREATE UNIQUE INDEX credit_purchases_provider_txn_uidx
    ON credit_purchases (provider, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;
