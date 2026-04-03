-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query)
-- Creates the unified restaurants table

CREATE TABLE IF NOT EXISTS restaurants (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  neighborhood TEXT,
  cuisine TEXT,
  price TEXT,
  rating NUMERIC(4,1),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  phone TEXT,
  website TEXT,
  hours JSONB,
  tags JSONB,
  img TEXT,
  img2 TEXT,
  description TEXT,
  about TEXT,
  must_order JSONB,
  vibe TEXT,
  best_for JSONB,
  known_for TEXT,
  insider_tip TEXT,
  price_detail TEXT,
  source TEXT,
  place_id TEXT,
  google_maps_url TEXT,
  google_rating NUMERIC(4,1),
  google_reviews INTEGER,
  heat TEXT,
  is_bar BOOLEAN DEFAULT FALSE,
  is_hotel BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  merged_into_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants(city);
CREATE INDEX IF NOT EXISTS idx_restaurants_name ON restaurants(name);
CREATE INDEX IF NOT EXISTS idx_restaurants_updated ON restaurants(updated_at);
CREATE INDEX IF NOT EXISTS idx_restaurants_deleted ON restaurants(is_deleted) WHERE is_deleted = FALSE;

-- Allow public read access (same as other tables)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON restaurants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON restaurants FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON restaurants FOR DELETE USING (true);
