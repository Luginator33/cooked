-- Run this in Supabase SQL Editor
-- Creates the bug_reports table for user-submitted bug reports

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  page TEXT,
  tab TEXT,
  url TEXT,
  platform TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  restaurant_id TEXT,
  restaurant_name TEXT,
  viewing_user_id TEXT,
  app_version TEXT,
  status TEXT DEFAULT 'open',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert" ON bug_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON bug_reports FOR SELECT USING (true);
CREATE POLICY "Allow public update" ON bug_reports FOR UPDATE USING (true);
