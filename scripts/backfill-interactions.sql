-- BACKFILL SCRIPT: Migrate existing user actions into restaurant_interactions
-- Run this ONCE after creating the tables to seed flame scores with existing data

-- 1. Backfill HEAT (loved) interactions from user_data
-- Each user's loved[] array becomes heat interactions
INSERT INTO restaurant_interactions (restaurant_id, clerk_user_id, action, created_at)
SELECT
  unnest_id::text as restaurant_id,
  clerk_user_id,
  'heat' as action,
  COALESCE(updated_at, now()) as created_at
FROM user_data,
LATERAL unnest(
  CASE
    WHEN jsonb_typeof(to_jsonb(loved)) = 'array' THEN
      ARRAY(SELECT jsonb_array_elements_text(to_jsonb(loved)))
    ELSE ARRAY[]::text[]
  END
) as unnest_id
WHERE loved IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Backfill WATCHLIST interactions from user_data
INSERT INTO restaurant_interactions (restaurant_id, clerk_user_id, action, created_at)
SELECT
  unnest_id::text as restaurant_id,
  clerk_user_id,
  'watchlist' as action,
  COALESCE(updated_at, now()) as created_at
FROM user_data,
LATERAL unnest(
  CASE
    WHEN jsonb_typeof(to_jsonb(watchlist)) = 'array' THEN
      ARRAY(SELECT jsonb_array_elements_text(to_jsonb(watchlist)))
    ELSE ARRAY[]::text[]
  END
) as unnest_id
WHERE watchlist IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Backfill RATING interactions from user_data.ratings (jsonb object {restaurantId: score})
INSERT INTO restaurant_interactions (restaurant_id, clerk_user_id, action, value, created_at)
SELECT
  key as restaurant_id,
  clerk_user_id,
  'rating' as action,
  value::numeric as value,
  COALESCE(updated_at, now()) as created_at
FROM user_data,
LATERAL jsonb_each_text(to_jsonb(ratings))
WHERE ratings IS NOT NULL AND jsonb_typeof(to_jsonb(ratings)) = 'object'
ON CONFLICT DO NOTHING;

-- 4. Backfill DM share interactions from messages table
INSERT INTO restaurant_interactions (restaurant_id, clerk_user_id, action, created_at)
SELECT
  restaurant_id,
  sender_id as clerk_user_id,
  'dm' as action,
  created_at
FROM messages
WHERE restaurant_id IS NOT NULL
ON CONFLICT DO NOTHING;
