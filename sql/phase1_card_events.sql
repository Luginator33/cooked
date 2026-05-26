-- ============================================================
-- Phase 1 — card_events table
-- ============================================================
-- Logs every meaningful interaction with the feed: card impressions,
-- taps, action-row presses, Heat-game swipes. Powers personalization
-- (Phase 2 scoring formula) + Neo4j enrichment (Phase 1B).
--
-- Volume estimate: ~50-200 events/day per active user. With 90-day
-- TTL + indexes below, the table stays under ~2GB at 50k users.
--
-- Safe to re-run — uses IF NOT EXISTS guards throughout.

CREATE TABLE IF NOT EXISTS card_events (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      TEXT         NOT NULL,              -- clerk_user_id
    restaurant_id BIGINT      NULL,                  -- nullable for non-restaurant events (future-proof)
    kind         TEXT         NOT NULL,              -- impression / tap / love_tap / bookmark_tap / share_tap / pass / love / skip
    badge_kind   TEXT         NULL,                  -- which BadgeKind case the card had at the time (rail engagement analysis)
    source       TEXT         NOT NULL DEFAULT 'home', -- home / discover / heat / detail / profile
    context_city TEXT         NULL,                  -- which city filter was active when the card was shown
    session_id   UUID         NULL,                  -- groups events from one app launch
    at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- 90-day retention. Scheduled cleanup job below.
    synced_to_neo4j_at TIMESTAMPTZ NULL              -- when the Phase 1B worker last picked this up
);

-- ------------------------------------------------------------
-- Indexes — each query path the feed actually uses
-- ------------------------------------------------------------

-- Phase 0 negative-signal read: "passes/skips for this user in last 30d"
CREATE INDEX IF NOT EXISTS idx_card_events_user_kind_at
    ON card_events (user_id, kind, at DESC);

-- Phase 2 read: "all events for one user-restaurant pair" (for impression
-- counts, tap-rate, time-since-last-shown)
CREATE INDEX IF NOT EXISTS idx_card_events_user_restaurant
    ON card_events (user_id, restaurant_id);

-- Phase 1B worker read: "all events not yet synced to Neo4j"
CREATE INDEX IF NOT EXISTS idx_card_events_unsynced
    ON card_events (at)
    WHERE synced_to_neo4j_at IS NULL;

-- ------------------------------------------------------------
-- RLS — users can only read their own events
-- ------------------------------------------------------------

ALTER TABLE card_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_events: viewer reads own" ON card_events;
CREATE POLICY "card_events: viewer reads own"
    ON card_events
    FOR SELECT
    USING (user_id = (auth.jwt() ->> 'sub'));

-- Writes happen exclusively via service_role from the iOS EventLogger
-- batch flush. Service_role bypasses RLS so no INSERT policy needed.
-- (If we ever wanted client-direct writes, we'd add an INSERT policy.)

-- ------------------------------------------------------------
-- Sync state for Phase 1B worker
-- ------------------------------------------------------------
-- Tracks the most-recent card_events.id the worker has processed.
-- The worker reads (last_id, now] each tick. Single row.

CREATE TABLE IF NOT EXISTS card_events_sync_state (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    last_event_id BIGINT NOT NULL DEFAULT 0,
    last_run_at TIMESTAMPTZ NULL,
    CHECK (id = 1)  -- enforce single-row
);

INSERT INTO card_events_sync_state (id, last_event_id) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Retention — drop events older than 90 days
-- ------------------------------------------------------------
-- A separate Cloudflare cron (existing) will call this periodically.
-- Kept as a function so we can also invoke it manually from psql.

CREATE OR REPLACE FUNCTION prune_card_events()
    RETURNS INTEGER
    LANGUAGE sql
    AS $$
        DELETE FROM card_events WHERE at < NOW() - INTERVAL '90 days'
        RETURNING 1;
    $$;

-- ============================================================
-- Sanity check — these queries should run without error
-- ============================================================
-- SELECT COUNT(*) FROM card_events;
-- SELECT * FROM card_events_sync_state;
-- SELECT prune_card_events();
