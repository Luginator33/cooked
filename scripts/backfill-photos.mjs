#!/usr/bin/env node
/**
 * backfill-photos.mjs
 * ===================
 *
 * One-time backfill that walks every row in `restaurant_photos` and moves
 * the photo bytes into our own Supabase Storage bucket (`restaurant-photos`),
 * so every photo is permanently ours — no expiring Google signatures, no
 * dependency on Google serving the URL.
 *
 * Strategy per restaurant (cheap first, then fallback):
 *   1. Try downloading the existing photo URL as-is.
 *      - If Google still serves the bytes → upload them to our bucket.
 *        Preserves the exact photo the app currently shows.
 *        Zero Google API cost.
 *   2. If the URL is broken (403 / expired signature / dead link):
 *      - Call Google Places API for fresh photo references.
 *      - Pull up to 5 fresh photos as a safety net.
 *      - Upload all to our bucket.
 *   3. Delete the old DB row(s); insert permanent URLs pointing at our bucket.
 *
 * Why fallback pulls 5: Google's photo #1 is sometimes a promotional poster
 * (e.g. NYE graphics) rather than a real photo of the place. Pulling 5 as a
 * safety net means if one is a dud, the others are almost always real shots.
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY env var (get from Supabase dashboard →
 *     Project Settings → API → service_role).
 *   - GOOGLE_PLACES_KEY env var (~$7 per 1,000 Places calls; each restaurant
 *     uses 1 detail call + up to 5 media calls = ~$42 per 1,000 restaurants).
 *   - Node 18+ (built-in fetch).
 *
 * Usage:
 *   cd cooked
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx GOOGLE_PLACES_KEY=yyyy \
 *     node scripts/backfill-photos.mjs                     # all broken restaurants
 *   node scripts/backfill-photos.mjs --limit 10            # first 10 restaurants
 *   node scripts/backfill-photos.mjs --dry-run             # inspect only
 *   node scripts/backfill-photos.mjs --restaurant 35421    # only this restaurant's broken rows
 *   node scripts/backfill-photos.mjs --refresh-restaurant 35421
 *       # force: delete ALL current photos for this restaurant and pull 5 fresh
 *       # (use this when Google's #1 photo is a promo/dud)
 *   node scripts/backfill-photos.mjs --refresh-restaurants 35421,12345,99999
 *       # same, but for a comma-separated list of restaurants at once
 *       # (this is what the photo review page generates)
 *
 * Safe to re-run: rows already pointing at our bucket are skipped.
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

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required (Supabase → Settings → API).');
  process.exit(1);
}
if (!GOOGLE_PLACES_KEY) {
  console.error('❌ GOOGLE_PLACES_KEY is required (the key you use for Places API).');
  process.exit(1);
}

// --- CLI flags ---
const FLAG_DRY_RUN   = argv.includes('--dry-run');
const FLAG_LIMIT     = (() => {
  const i = argv.indexOf('--limit');
  return i > -1 ? parseInt(argv[i + 1], 10) : null;
})();
const FLAG_RESTAURANT = (() => {
  const i = argv.indexOf('--restaurant');
  return i > -1 ? argv[i + 1] : null;
})();
const FLAG_REFRESH   = (() => {
  const i = argv.indexOf('--refresh-restaurant');
  return i > -1 ? argv[i + 1] : null;
})();
const FLAG_REFRESH_MANY = (() => {
  const i = argv.indexOf('--refresh-restaurants');
  if (i < 0) return null;
  const csv = argv[i + 1] || '';
  return csv.split(',').map(s => s.trim()).filter(Boolean);
})();

// How many photos to pull from Google when the existing URL is broken.
// Acts as a safety net — if Google's #1 is a promo, we still have 4 real ones.
const FALLBACK_PHOTOS = 5;

// How many restaurants to process at the same time.  5 is well within
// Google's default 100 QPS quota and keeps output readable.
const CONCURRENCY = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --- Helpers ---------------------------------------------------------------

// URL formats we've seen:
//   ours          : https://<our-project>.supabase.co/storage/v1/object/public/…   (never expires, we control it)
//   google-stable : https://lh3.googleusercontent.com/places/<random>              (Google says stable, but content can be a promo
//                                                                                   poster AND signatures can eventually roll — rehost)
//   google-ephem  : https://lh3.googleusercontent.com/place-photos/<signed>        (expires within hours, 403s — MUST rehost)
// We rehost everything non-"ours" that came from Google, so photos are permanently ours.
function classifyUrl(url) {
  if (!url) return 'empty';
  const u = url.toLowerCase();
  if (u.includes('supabase.co/storage/')) return 'ours';
  if (u.includes('googleusercontent.com/place-photos/')) return 'google-ephemeral';
  if (u.includes('googleusercontent.com/places/'))       return 'google-stable';
  if (u.startsWith('http')) return 'other';
  return 'other';
}

function isGoogleHosted(classification) {
  return classification === 'google-ephemeral' || classification === 'google-stable';
}

async function fetchFreshGooglePhotoUrls(placeId, count = FALLBACK_PHOTOS) {
  // 1. Ask Places API for current photo references (returns up to 10).
  const detailUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=photos`;
  const detailRes = await fetch(detailUrl, {
    headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY },
  });
  if (!detailRes.ok) throw new Error(`Places detail ${detailRes.status}`);
  const detail = await detailRes.json();
  const photos = detail?.photos || [];
  if (photos.length === 0) return [];

  // 2. Resolve the top `count` references to CDN URLs IN PARALLEL.
  //    skipHttpRedirect so we get JSON back — we'll download the bytes right after.
  const results = await Promise.all(
    photos.slice(0, count).map(async (photo) => {
      if (!photo?.name) return null;
      try {
        const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1600&skipHttpRedirect=true`;
        const mediaRes = await fetch(mediaUrl, {
          headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY },
        });
        if (!mediaRes.ok) return null;
        const mediaJson = await mediaRes.json();
        return mediaJson?.photoUri || null;
      } catch (_e) {
        return null; // one bad reference shouldn't sink the whole restaurant
      }
    })
  );
  return results.filter(Boolean);
}

async function rehostToBucket(sourceUrl, restaurantId) {
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) throw new Error(`Source ${imgRes.status}`);
  const contentType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const ext = contentType.includes('png') ? 'png'
            : contentType.includes('webp') ? 'webp'
            : 'jpg';
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (!buf.length) throw new Error('Empty body');

  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('restaurant-photos')
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw new Error(`Storage upload: ${error.message}`);

  const { data: pub } = supabase.storage
    .from('restaurant-photos')
    .getPublicUrl(path);
  return pub.publicUrl;
}

async function loadBrokenRows() {
  // Pull rows, page through to avoid the default 1,000 cap.
  const all = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    let q = supabase
      .from('restaurant_photos')
      .select('restaurant_id, photo_url')
      .range(from, from + pageSize - 1);
    if (FLAG_RESTAURANT) q = q.eq('restaurant_id', String(FLAG_RESTAURANT));
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all.filter(r => isGoogleHosted(classifyUrl(r.photo_url)));
}

async function loadAllPhotosForRestaurant(restaurantId) {
  const { data, error } = await supabase
    .from('restaurant_photos')
    .select('restaurant_id, photo_url')
    .eq('restaurant_id', String(restaurantId));
  if (error) throw error;
  return data || [];
}

async function placeIdFor(restaurantId) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('place_id')
    .eq('id', Number(restaurantId))
    .maybeSingle();
  if (error) return null;
  return data?.place_id || null;
}

// --- Main -----------------------------------------------------------------

(async () => {
  console.log(`🔧 Supabase        : ${SUPABASE_URL}`);
  console.log(`🔧 Dry run         : ${FLAG_DRY_RUN ? 'YES' : 'no'}`);
  console.log(`🔧 Fallback photos : ${FALLBACK_PHOTOS} (only if existing URL is broken)`);
  console.log(`🔧 Concurrency     : ${CONCURRENCY} restaurants at a time`);
  if (FLAG_REFRESH)    console.log(`🔧 REFRESH mode  : restaurant ${FLAG_REFRESH} (will delete ALL its current photos)`);
  if (FLAG_RESTAURANT) console.log(`🔧 Scoped to     : restaurant ${FLAG_RESTAURANT}`);
  if (FLAG_LIMIT)      console.log(`🔧 Limit         : ${FLAG_LIMIT} restaurant(s)`);

  // Build the work list: { restaurantId, rowsToDelete: [{photo_url}, ...] }
  let workList = [];
  if (FLAG_REFRESH_MANY && FLAG_REFRESH_MANY.length > 0) {
    // Bulk refresh: list of restaurant ids, each wiped & re-pulled.
    console.log(`📸 Bulk refresh: ${FLAG_REFRESH_MANY.length} restaurant(s).`);
    for (const id of FLAG_REFRESH_MANY) {
      const existing = await loadAllPhotosForRestaurant(id);
      workList.push({ restaurantId: String(id), rowsToDelete: existing });
    }
  } else if (FLAG_REFRESH) {
    // Refresh mode: one restaurant, wipe all its current photos and re-pull.
    const existing = await loadAllPhotosForRestaurant(FLAG_REFRESH);
    console.log(`📸 Restaurant ${FLAG_REFRESH} currently has ${existing.length} photo row(s); all will be replaced.`);
    workList.push({ restaurantId: String(FLAG_REFRESH), rowsToDelete: existing });
  } else {
    const broken = await loadBrokenRows();
    console.log(`\n📊 Found ${broken.length} row(s) with Google-hosted URLs (ephemeral + stable) to rehost.`);

    // Group broken rows by restaurant_id so one restaurant = one Google call.
    const byRestaurant = new Map();
    for (const row of broken) {
      const id = String(row.restaurant_id);
      if (!byRestaurant.has(id)) byRestaurant.set(id, []);
      byRestaurant.get(id).push(row);
    }
    console.log(`📊 That's ${byRestaurant.size} unique restaurant(s) to process.\n`);

    workList = Array.from(byRestaurant.entries())
      .map(([id, rows]) => ({ restaurantId: id, rowsToDelete: rows }));
  }

  if (FLAG_LIMIT) workList = workList.slice(0, FLAG_LIMIT);

  if (FLAG_DRY_RUN) {
    // Dry-run: just show counts, no Google API calls, no uploads, no DB writes.
    // Cheap & fast so we can sanity-check scope before committing.
    console.log(`\n🧪 DRY RUN — would process ${workList.length} restaurant(s).`);
    console.log(`🧪 Strategy: try existing URL first; fall back to Google Places API with ${FALLBACK_PHOTOS} photos only if the existing URL is broken.`);
    console.log(`🧪 Google API calls: ~0 for restaurants whose current URL still works; up to ${1 + FALLBACK_PHOTOS} per restaurant that needs fallback.`);
    console.log(`🧪 No DB or bucket writes will happen.`);
    if (workList.length > 0) {
      console.log(`\nFirst few restaurants that would be processed:`);
      for (const item of workList.slice(0, 5)) {
        console.log(`   r=${item.restaurantId} — ${item.rowsToDelete.length} old row(s) to replace`);
      }
    }
    return;
  }

  // Process one restaurant.  Strategy:
  //   1. Try downloading each existing URL as-is (the photo currently in the app).
  //      If it works, save those bytes — preserves the photo the user is seeing now.
  //      No Google API call needed.
  //   2. If ALL existing URLs failed (e.g. expired signatures), fall back to
  //      the Places API and pull FALLBACK_PHOTOS fresh photos as a safety net.
  //   3. Delete old DB rows, insert new permanent URLs.
  async function processOne(item, displayIdx) {
    const { restaurantId, rowsToDelete } = item;
    const prefix = `[${String(displayIdx + 1).padStart(4)}/${workList.length}] r=${restaurantId}`;
    try {
      // Step 1: try to preserve existing photos by downloading their bytes.
      const preserveResults = await Promise.all(
        rowsToDelete.map(async (row) => {
          try {
            const p = await rehostToBucket(row.photo_url, restaurantId);
            return { ok: true, url: p };
          } catch (e) {
            return { ok: false, err: e.message };
          }
        })
      );
      const preservedUrls = preserveResults.filter(r => r.ok).map(r => r.url);

      let finalUrls = preservedUrls;
      let fellBack = false;

      // Step 2: if nothing could be preserved, fall back to Places API.
      if (preservedUrls.length === 0) {
        const placeId = await placeIdFor(restaurantId);
        if (!placeId) {
          console.log(`${prefix} ⚠️  original URL(s) broken and no place_id on restaurant, skipping`);
          return { status: 'skipped', photos: 0 };
        }
        const freshUrls = await fetchFreshGooglePhotoUrls(placeId, FALLBACK_PHOTOS);
        if (freshUrls.length === 0) {
          console.log(`${prefix} ⚠️  original URL(s) broken and Google returned no photos`);
          return { status: 'skipped', photos: 0 };
        }
        const uploads = await Promise.all(
          freshUrls.map(async (url) => {
            try { return await rehostToBucket(url, restaurantId); }
            catch (e) {
              console.log(`${prefix}   (fallback upload failed: ${e.message})`);
              return null;
            }
          })
        );
        finalUrls = uploads.filter(Boolean);
        fellBack = true;
      }

      if (finalUrls.length === 0) {
        console.log(`${prefix} ❌ no photos could be saved`);
        return { status: 'failed', photos: 0 };
      }

      // Step 3: delete old row(s) in parallel.
      await Promise.all(rowsToDelete.map(async (row) => {
        const { error: delErr } = await supabase
          .from('restaurant_photos')
          .delete()
          .eq('restaurant_id', restaurantId)
          .eq('photo_url', row.photo_url);
        if (delErr) console.log(`${prefix}   (delete-old warning: ${delErr.message})`);
      }));

      // Insert the new permanent URLs (single batch insert).
      const { error: insErr } = await supabase
        .from('restaurant_photos')
        .insert(finalUrls.map(u => ({
          restaurant_id: restaurantId,
          photo_url: u,
        })));
      if (insErr) throw new Error(`insert new: ${insErr.message}`);

      const tag = fellBack
        ? `🔄 fell back — saved ${finalUrls.length} fresh photo(s) from Google`
        : `✅ preserved ${finalUrls.length} existing photo(s)`;
      console.log(`${prefix} ${tag}`);
      return { status: 'ok', photos: finalUrls.length, fellBack };
    } catch (err) {
      console.log(`${prefix} ❌ ${err.message}`);
      return { status: 'failed', photos: 0 };
    }
  }

  // Chunked concurrency: process CONCURRENCY restaurants at a time.
  let ok = 0, skipped = 0, failed = 0;
  let preservedCount = 0, fellBackCount = 0, photosInserted = 0;
  const startedAt = Date.now();
  for (let i = 0; i < workList.length; i += CONCURRENCY) {
    const chunk = workList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((item, j) => processOne(item, i + j))
    );
    for (const r of results) {
      if (r.status === 'ok') {
        ok++;
        photosInserted += r.photos;
        if (r.fellBack) fellBackCount++; else preservedCount++;
      }
      else if (r.status === 'skipped') skipped++;
      else failed++;
    }
  }
  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);

  console.log(`\n📦 Done in ${elapsedMin} min.  ok=${ok}  skipped=${skipped}  failed=${failed}  of ${workList.length} restaurant(s).`);
  console.log(`📦 Preserved original: ${preservedCount}   ·   Fell back to Places API: ${fellBackCount}`);
  console.log(`📦 Photos inserted: ${photosInserted}`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
