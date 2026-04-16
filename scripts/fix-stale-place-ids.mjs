#!/usr/bin/env node
/**
 * fix-stale-place-ids.mjs
 * =======================
 *
 * Some restaurants in our DB have stale `place_id`s — Google has retired or
 * re-assigned the id to a different business.  That's why the backfill got
 * "no photos" / 404 for them even though the restaurants are real.
 *
 * This script, for each restaurant id passed in (or all broken-photo
 * restaurants if none are):
 *   1. Loads its name, city, lat, lng, and current place_id from Supabase.
 *   2. Calls Google Places Text Search ("name, city") biased to the
 *      existing lat/lng.
 *   3. Prints old vs new place_id and the names they resolve to.
 *   4. In --apply mode, updates `restaurants.place_id` (and name if blank)
 *      and pulls up to 5 fresh photos into our Supabase Storage bucket,
 *      replacing any currently-broken Google-hosted rows.
 *
 * Usage:
 *   cd cooked
 *   # dry-run on a specific list of restaurant IDs:
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/fix-stale-place-ids.mjs \
 *     --ids 35533,35781,35351,35442
 *
 *   # dry-run on ALL restaurants with a broken (Google-hosted) photo row:
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/fix-stale-place-ids.mjs
 *
 *   # apply changes (updates DB + uploads fresh photos):
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/fix-stale-place-ids.mjs --apply
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'node:process';
import { argv } from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL || 'https://jfwtyqyglxknubvhgifw.supabase.co';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY || process.env.VITE_GOOGLE_PLACES_KEY;
if (!SERVICE_ROLE_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
if (!GOOGLE_PLACES_KEY) { console.error('❌ GOOGLE_PLACES_KEY required'); process.exit(1); }

const FLAG_APPLY = argv.includes('--apply');
const FLAG_IDS = (() => {
  const i = argv.indexOf('--ids');
  if (i < 0) return null;
  const csv = argv[i + 1] || '';
  return csv.split(',').map(s => s.trim()).filter(Boolean).map(Number);
})();

const FALLBACK_PHOTOS = 5;
const LOCATION_RADIUS_M = 5000; // 5 km bias around existing coords

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
const isGoogleHosted = cls => cls === 'google-ephemeral' || cls === 'google-stable';

async function resolveTargetIds() {
  if (FLAG_IDS && FLAG_IDS.length > 0) return FLAG_IDS;
  // Default: load all restaurant_photos, find rows with Google-hosted URLs,
  // return their restaurant_ids.
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
  const ids = new Set();
  for (const r of all) {
    if (isGoogleHosted(classifyUrl(r.photo_url))) ids.add(Number(r.restaurant_id));
  }
  return Array.from(ids);
}

async function loadRestaurant(id) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, city, lat, lng, place_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Google Places (New) Text Search — biased by a circular region around
// our lat/lng so "Rao's Chicago" won't match some random Rao's in NYC.
async function textSearch({ name, city, lat, lng }) {
  const query = [name, city].filter(Boolean).join(', ');
  const body = {
    textQuery: query,
    pageSize: 5,
  };
  if (lat != null && lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: LOCATION_RADIUS_M,
      },
    };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TextSearch ${res.status}: ${(await res.text()).slice(0,200)}`);
  const j = await res.json();
  return j.places || [];
}

async function fetchFreshGooglePhotoUrls(placeId, count = FALLBACK_PHOTOS) {
  const detailUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const detailRes = await fetch(detailUrl, {
    headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'photos' },
  });
  if (!detailRes.ok) throw new Error(`Places detail ${detailRes.status}`);
  const detail = await detailRes.json();
  const photos = detail?.photos || [];
  if (photos.length === 0) return [];
  const results = await Promise.all(
    photos.slice(0, count).map(async (photo) => {
      if (!photo?.name) return null;
      try {
        const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1600&skipHttpRedirect=true`;
        const mediaRes = await fetch(mediaUrl, { headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY } });
        if (!mediaRes.ok) return null;
        const mj = await mediaRes.json();
        return mj?.photoUri || null;
      } catch { return null; }
    })
  );
  return results.filter(Boolean);
}

async function rehostToBucket(sourceUrl, restaurantId) {
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) throw new Error(`Source ${imgRes.status}`);
  const contentType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error('Empty body');
  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('restaurant-photos')
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload: ${error.message}`);
  const { data: pub } = supabase.storage.from('restaurant-photos').getPublicUrl(path);
  return pub.publicUrl;
}

(async () => {
  console.log(`🔧 Mode: ${FLAG_APPLY ? 'APPLY (will write to DB)' : 'DRY-RUN'}`);
  const ids = await resolveTargetIds();
  console.log(`🔧 ${ids.length} restaurant(s) to probe.\n`);
  if (ids.length === 0) return;

  let matched = 0, same = 0, noMatch = 0, missing = 0, updated = 0, photosInserted = 0;

  for (const id of ids) {
    const r = await loadRestaurant(id);
    if (!r) { console.log(`r=${id}  (no restaurant row)`); missing++; continue; }
    if (!r.name) { console.log(`r=${id}  (no name, skipping)`); missing++; continue; }

    let candidates;
    try { candidates = await textSearch(r); }
    catch (e) { console.log(`r=${id}  ${r.name}  ❌ ${e.message}`); noMatch++; continue; }

    if (!candidates || candidates.length === 0) {
      console.log(`r=${id}  ${r.name} · ${r.city}  ❌ no Google match`);
      noMatch++; continue;
    }

    const top = candidates[0];
    const newPid = top.id;
    const sameAsOld = newPid === r.place_id;
    const label = sameAsOld ? '= unchanged' : '→ NEW place_id';
    console.log(`r=${id}  ${r.name} · ${r.city}`);
    console.log(`   old: ${r.place_id || '(none)'}`);
    console.log(`   new: ${newPid}  ${label}`);
    console.log(`        "${top.displayName?.text}" @ ${top.formattedAddress}`);

    if (sameAsOld) same++;
    else matched++;

    if (!FLAG_APPLY) continue;

    // Apply mode: update place_id (and fill blank name), refresh photos.
    if (!sameAsOld) {
      const patch = { place_id: newPid };
      // Only overwrite name if ours is empty — never clobber a human-edited name.
      if (!r.name) patch.name = top.displayName?.text || r.name;
      const { error: upErr } = await supabase.from('restaurants').update(patch).eq('id', r.id);
      if (upErr) { console.log(`   ❌ update failed: ${upErr.message}`); continue; }
      updated++;
    }

    // Photos: delete broken Google-hosted rows, insert fresh ones.
    const { data: existingPhotos } = await supabase
      .from('restaurant_photos')
      .select('photo_url')
      .eq('restaurant_id', String(r.id));
    const brokenUrls = (existingPhotos || [])
      .filter(p => isGoogleHosted(classifyUrl(p.photo_url)))
      .map(p => p.photo_url);

    const fresh = await fetchFreshGooglePhotoUrls(newPid, FALLBACK_PHOTOS);
    if (fresh.length === 0) { console.log(`   ⚠️  new place_id still returned 0 photos`); continue; }

    const uploaded = [];
    for (const src of fresh) {
      try { uploaded.push(await rehostToBucket(src, String(r.id))); }
      catch (e) { console.log(`   (upload failed: ${e.message})`); }
    }
    if (uploaded.length === 0) { console.log(`   ❌ 0 photos rehosted`); continue; }

    // Delete broken rows
    for (const bu of brokenUrls) {
      await supabase.from('restaurant_photos').delete()
        .eq('restaurant_id', String(r.id)).eq('photo_url', bu);
    }
    // Insert fresh rows
    const { error: insErr } = await supabase.from('restaurant_photos').insert(
      uploaded.map(u => ({ restaurant_id: String(r.id), photo_url: u }))
    );
    if (insErr) { console.log(`   ❌ insert: ${insErr.message}`); continue; }

    console.log(`   ✅ inserted ${uploaded.length} fresh photo(s)`);
    photosInserted += uploaded.length;
  }

  console.log(`\n📦 ${ids.length} probed · ${matched} would-update · ${same} already-correct · ${noMatch} no-match · ${missing} missing`);
  if (FLAG_APPLY) console.log(`📦 Applied: ${updated} place_id update(s) · ${photosInserted} photo(s) inserted`);
  else console.log(`📦 Dry-run.  Re-run with --apply to commit.`);
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
