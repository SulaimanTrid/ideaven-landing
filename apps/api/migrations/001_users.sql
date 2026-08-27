-- Phase 2: user accounts.
-- Emails and usernames are matched case-insensitively via expression indexes
-- on lower(); lookups must always compare lower(value) = lower($1).

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL,
    username       TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    avatar_url     TEXT NOT NULL DEFAULT '',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
