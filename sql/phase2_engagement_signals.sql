-- ============================================================
-- Phase 2 — get_engagement_signals RPC
-- ============================================================
-- Aggregates card_events into per-restaurant signals used by the
-- iOS FeedScoringService. Returns one row per restaurant the viewer
-- has any card_events activity on in the last 60 days.
--
-- Used by FeedScoringService for:
--   - negative_signals.impressions_without_tap (impressions - taps)
--   - freshness.days_since_shown (NOW() - last_impression_at)
--
-- Why an RPC vs raw SELECT: avoids transferring all card_events
-- rows to the client (max ~9000/user for heavy use). The aggregate
-- result is a few rows per restaurant the viewer has seen.
--
-- Safe to re-run — uses CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION get_engagement_signals(p_user_id TEXT)
RETURNS TABLE (
    restaurant_id BIGINT,
    impressions   INTEGER,
    taps          INTEGER,
    last_impression_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        restaurant_id,
        COUNT(*) FILTER (WHERE kind = 'impression')::INTEGER AS impressions,
        COUNT(*) FILTER (WHERE kind IN ('tap', 'love_tap', 'bookmark_tap', 'share_tap'))::INTEGER AS taps,
        MAX(at) FILTER (WHERE kind = 'impression') AS last_impression_at
    FROM card_events
    WHERE user_id = p_user_id
      AND restaurant_id IS NOT NULL
      AND at > NOW() - INTERVAL '60 days'
    GROUP BY restaurant_id
    HAVING COUNT(*) > 0;
$$;

-- Grant to authenticated so the iOS client (Clerk JWT) can call it.
GRANT EXECUTE ON FUNCTION get_engagement_signals(TEXT) TO authenticated;

-- ============================================================
-- Sanity check — should run without error after deployment
-- ============================================================
-- SELECT * FROM get_engagement_signals('user_3B9bXI2JCTGmvdVl6lRtjQ276W3');
