-- Community (TASK 07): questions, discussions, answers, upvotes, and
-- reports. Counts are always derived (COUNT subqueries) so they can never
-- drift from the rows. Soft delete (deleted_at) is the moderation state;
-- nothing is hard-deleted by users.

CREATE TABLE community_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              TEXT NOT NULL DEFAULT 'question' CHECK (kind IN ('question', 'discussion')),
    channel           TEXT NOT NULL CHECK (channel IN ('general', 'help', 'showcase', 'game-dev', 'app-dev', 'extensions', 'beginner-zone')),
    title             TEXT NOT NULL,
    body              TEXT NOT NULL,
    author_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_slug      TEXT REFERENCES projects (slug) ON DELETE SET NULL,
    tags              TEXT[] NOT NULL DEFAULT '{}',
    accepted_reply_id UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX community_posts_feed_idx ON community_posts (channel, created_at DESC);
CREATE INDEX community_posts_author_idx ON community_posts (author_id);
CREATE INDEX community_posts_tags_idx ON community_posts USING GIN (tags);

CREATE TABLE community_replies (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES community_posts (id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX community_replies_post_idx ON community_replies (post_id, created_at);

ALTER TABLE community_posts
    ADD CONSTRAINT community_posts_accepted_reply_fk
    FOREIGN KEY (accepted_reply_id) REFERENCES community_replies (id) ON DELETE SET NULL;

-- One upvote per user per target; the CHECK keeps every row aimed at
-- exactly one target.
CREATE TABLE community_votes (
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    post_id    UUID REFERENCES community_posts (id) ON DELETE CASCADE,
    reply_id   UUID REFERENCES community_replies (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT community_votes_target_ck CHECK ((post_id IS NULL) <> (reply_id IS NULL)),
    CONSTRAINT community_votes_unique_post UNIQUE (user_id, post_id),
    CONSTRAINT community_votes_unique_reply UNIQUE (user_id, reply_id)
);

CREATE INDEX community_votes_post_idx ON community_votes (post_id);
CREATE INDEX community_votes_reply_idx ON community_votes (reply_id);

CREATE TABLE community_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    post_id     UUID REFERENCES community_posts (id) ON DELETE CASCADE,
    reply_id    UUID REFERENCES community_replies (id) ON DELETE CASCADE,
    reason      TEXT NOT NULL CHECK (reason IN ('spam', 'abusive', 'inappropriate', 'other')),
    note        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT community_reports_target_ck CHECK ((post_id IS NULL) <> (reply_id IS NULL))
);
