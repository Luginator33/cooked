#!/usr/bin/env node
/**
 * inspect-broken-photos.mjs
 * =========================
 *
 * Lists every `restaurant_photos` row whose URL is still Google-hosted
 * (ephemeral OR stable) — these are exactly the rows the backfill "skipped"
 * or "failed" on its last run.  For each, prints the restaurant name,
 * place_id, and URL so we can decide whether to retry, refresh from Google,
 * or drop the row entirely.
 *
 * Usage:
 *   cd cooked
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/inspect-broken-photos.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL || 'https://jfwtyqyglxknubvhgifw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function classifyUrl(url) {
  if (!url) return 'empty';
  const u = url.toLowerCase();
  if (u.includes('supabase.co/storage/')) return 'ours';
  if (u.includes('googleusercontent.com/place-photos/')) return 'google-ephemeral';
  if (u.includes('googleusercontent.com/places/'))       return 'google-stable';
  if (u.startsWith('http')) return 'other';
  return 'other';
}

async function loadAllPhotoRows() {
  const all = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('restaurant_photos')
      .select('restaurant_id, photo_url')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  console.log('🔎 Loading restaurant_photos …');
  const rows = await loadAllPhotoRows();
  console.log(`📊 ${rows.length} total photo rows.`);

  const buckets = { ours: 0, 'google-ephemeral': 0, 'google-stable': 0, other: 0, empty: 0 };
  const broken = [];
  for (const r of rows) {
    const cls = classifyUrl(r.photo_url);
    buckets[cls] = (buckets[cls] || 0) + 1;
    if (cls === 'google-ephemeral' || cls === 'google-stable') broken.push({ ...r, cls });
  }

  console.log(`\nBy class:`);
  for (const [k, v] of Object.entries(buckets)) console.log(`   ${k.padEnd(18)} ${v}`);

  if (broken.length === 0) {
    console.log('\n✅ Zero Google-hosted rows remaining. Nothing to do.');
    return;
  }

  // Group by restaurant so we can show name + place_id once per restaurant.
  const byRest = new Map();
  for (const row of broken) {
    const id = String(row.restaurant_id);
    if (!byRest.has(id)) byRest.set(id, []);
    byRest.get(id).push(row);
  }
  const ids = Array.from(byRest.keys()).map(n => Number(n)).filter(n => !Number.isNaN(n));

  const { data: rests, error } = await supabase
    .from('restaurants')
    .select('id, name, city, place_id')
    .in('id', ids);
  if (error) throw error;
  const restById = new Map((rests || []).map(r => [String(r.id), r]));

  console.log(`\n⚠️  ${broken.length} broken row(s) across ${byRest.size} restaurant(s):\n`);
  const sorted = Array.from(byRest.entries()).sort((a, b) => {
    const ra = restById.get(a[0]) || {};
    const rb = restById.get(b[0]) || {};
    return (ra.city || '').localeCompare(rb.city || '') ||
           (ra.name || '').localeCompare(rb.name || '');
  });
  for (const [id, rowList] of sorted) {
    const rest = restById.get(id);
    const name = rest?.name || '(missing restaurant row)';
    const city = rest?.city || '?';
    const pid = rest?.place_id || '(no place_id)';
    console.log(`  r=${id}  ${name}  ·  ${city}  ·  place_id=${pid}  ·  ${rowList.length} row(s)`);
    for (const row of rowList) {
      console.log(`      [${row.cls}] ${row.photo_url.slice(0, 120)}${row.photo_url.length > 120 ? '…' : ''}`);
    }
  }

  const noPlaceId = sorted.filter(([id]) => !restById.get(id)?.place_id).length;
  console.log(`\nSummary: ${byRest.size} restaurants · ${broken.length} broken rows · ${noPlaceId} with no place_id (unfixable via Google)`);
  console.log(`Next: to retry them all, run:  node scripts/backfill-photos.mjs`);
  console.log(`      to force-refresh one:   node scripts/backfill-photos.mjs --refresh-restaurant <id>`);
  console.log(`      to force-refresh many:  node scripts/backfill-photos.mjs --refresh-restaurants <id1,id2,…>`);
})().catch(err => { console.error('❌', err); process.exit(1); });
