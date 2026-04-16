#!/usr/bin/env node
/**
 * dedupe-restaurants.mjs
 * ======================
 *
 * One-time cleanup that merges duplicate restaurant rows that share BOTH
 * the same Google `place_id` AND the same lat/lng (rounded to 4 decimals,
 * ~11m).  Coordinates as the second gate auto-excludes "false duplicates"
 * where Google accidentally stamped two different locations with the same
 * place_id (e.g. Jon & Vinny's Fairfax vs Encino) — if they're at different
 * coordinates, they won't be touched.
 *
 * For each duplicate group:
 *   1. Pick the canonical row: highest interactions, highest photos, lowest id.
 *   2. Merge all non-canonical rows' photos into the canonical row
 *      (upsert with ignoreDuplicates so overlapping URLs don't collide).
 *   3. Reassign restaurant_interactions from dupes → canonical.
 *   4. Delete flame_scores for dupes (will recompute lazily).
 *   5. Update every user's loved / heat.loved / watchlist arrays:
 *      replace dupe IDs with canonical ID, dedupe the array.
 *   6. Delete dupe rows from the restaurants table.
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY env var (Supabase → Settings → API).
 *
 * Usage:
 *   cd cooked
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/dedupe-restaurants.mjs --dry-run
 *     # inspect what would happen; no writes
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/dedupe-restaurants.mjs --limit 5
 *     # actually merge just the first 5 groups (good for a live test)
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/dedupe-restaurants.mjs
 *     # merge everything
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'node:process';
import { argv } from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL || 'https://jfwtyqyglxknubvhgifw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required (Supabase → Settings → API).');
  process.exit(1);
}

const FLAG_DRY_RUN = argv.includes('--dry-run');
const FLAG_LIMIT   = (() => {
  const i = argv.indexOf('--limit');
  return i > -1 ? parseInt(argv[i + 1], 10) : null;
})();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --- 1. Pull everything with a place_id + coords ---------------------------
// We fetch full metadata so we can do field-level merging — any blank field on
// the canonical row gets filled in from a dupe that has data for it.

async function loadAllRestaurants() {
  const PAGE = 1000;
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .not('place_id', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data.filter(r => r.is_deleted !== true));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function coordKey(r) {
  const lat = Math.round(Number(r.lat) * 1e4) / 1e4;
  const lng = Math.round(Number(r.lng) * 1e4) / 1e4;
  return `${r.place_id}|${lat}|${lng}`;
}

async function findDuplicateGroups() {
  const rows = await loadAllRestaurants();
  const byKey = new Map();
  for (const r of rows) {
    const k = coordKey(r);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  const groups = [];
  for (const [, list] of byKey) {
    if (list.length > 1) groups.push(list);
  }
  return groups;
}

// --- 2. Pick canonical -----------------------------------------------------
// Default rule: most interactions, tie → most photos, tie → lowest id (older).
//
// MANUAL_CANONICAL: hand-picked overrides for groups where the rule picks a
// row with worse metadata (e.g. wrong neighborhood, less descriptive name,
// missing accents).  Keyed by place_id → preferred row id.  If a group's
// place_id is in this map, that row wins regardless of the rule.
const MANUAL_CANONICAL = {
  'ChIJ1Y52MZlTUkYRuDl4FNhYh_U': 35004,         // Kadeau Copenhagen (vs just "Kadeau")
  'ChIJs1uZdNP-0YUR7xEuCTGxAMM': 35999,         // Taquería Los Cocuyos (proper full name)
  'ChIJVeUHqupv5kcRDHPinmB3LtU': 36219,         // Epicure at Le Bristol
  'ChIJ8UxZqPxYwokRQSC7-Qoeea0': 35212,         // The Grill (vs "The Grill's Bar Room")
  'ChIJ__-_24W02YgRXJM6PONpVbM': 35409,         // Mila Restaurant (vs "Mila Lounge")
  'ChIJGa3wvNIEdkgRN1HW-os2NzY': 7424,          // Swift Soho (location specific)
  'ChIJgXiP3MsEdkgRRp0YhagxGsg': 7405,          // The American Bar at The Savoy
  'ChIJbWMwSDL_0YURXhN_fv6AG48': 35977,         // Cicatriz Café (vs "Cicatriz Bar")
  'ChIJg67PeyeBhYAROkno8i7ZxlI': 7658,          // The Interval at Long Now
  'ChIJ93uz9TFu5kcRc8c4Y3tP3dI': 802999,        // Bar Hemingway (official Ritz name)
  'ChIJlYcsb_dDXz4Rh3YArLLsh6A': 734858,        // Amazónico Dubai (proper accent)
  'ChIJKRmHQ46jpBIRoX7IpueOC0k': 7783,          // Monk (vs "Monk Barcelona", city redundant)
  'ChIJ__-vLymWwoARaHQj7e219pI': 36328,         // Petit Trois Valley (right spelling, right location)
  'ChIJTW33Mf8sDogRiUnjYL3R_ck': 35510,         // HaiSous (vs "HaiSous Vietnamese Kitchen")
  'ChIJx2QJkxpTUkYR0MR2kI3TJlo': 36426,         // Restaurant Schønnemann
  'ChIJ7fOMUsSkwoARIOVuE_23I1Q': 35111,         // Mélisse (proper accent)
  'ChIJIegyMbG-woAR5lAy62GLMN4': 35171,         // Rosaliné (proper accent)
  'ChIJfz6TMGW5woARTAZdlUymtbs': 36353,         // Mizlala West Adams (coords are West Adams)
  'ChIJQ1R3hKNZwokRQM4wbIrc00o': 768868,        // COTE Flatiron
  'ChIJSXqRWGKeToYRWqrIL53Phd4': 35941,         // Shinsei Restaurant (vs "Shinsei Dallas")
  'ChIJC0xiTBof6IAR6ZbMPPS9weE': 795708,        // Malibu Seafood (shorter)
  'ChIJ61_DMsoUXz4RV3jdxajvWm4': 1774244880295, // Stay by Yannick Alléno (proper accent)
};

async function enrichWithCounts(group) {
  const ids = group.map(r => String(r.id));
  const [photos, interactions] = await Promise.all([
    supabase.from('restaurant_photos').select('restaurant_id').in('restaurant_id', ids),
    supabase.from('restaurant_interactions').select('restaurant_id').in('restaurant_id', ids),
  ]);
  const photoCount = new Map();
  (photos.data || []).forEach(row => {
    photoCount.set(row.restaurant_id, (photoCount.get(row.restaurant_id) || 0) + 1);
  });
  const interactionCount = new Map();
  (interactions.data || []).forEach(row => {
    interactionCount.set(row.restaurant_id, (interactionCount.get(row.restaurant_id) || 0) + 1);
  });
  return group.map(r => ({
    ...r,
    photos: photoCount.get(String(r.id)) || 0,
    interactions: interactionCount.get(String(r.id)) || 0,
  }));
}

function pickCanonical(group) {
  // Manual override first
  const placeId = group[0]?.place_id;
  const preferredId = MANUAL_CANONICAL[placeId];
  if (preferredId) {
    const match = group.find(r => Number(r.id) === Number(preferredId));
    if (match) return { ...match, _manual: true };
  }
  // Otherwise: most interactions, tie → most photos, tie → lowest id
  return [...group].sort((a, b) => {
    if (b.interactions !== a.interactions) return b.interactions - a.interactions;
    if (b.photos !== a.photos)             return b.photos - a.photos;
    return a.id - b.id;
  })[0];
}

// --- Field-level merge ----------------------------------------------------
// For every metadata field, if the canonical is blank but a dupe has a value,
// copy it over.  This way we never lose neighborhood/description/tags just
// because the "winner" happened to be less populated.
const MERGEABLE_FIELDS = [
  'neighborhood', 'cuisine', 'price', 'rating', 'google_rating',
  'address', 'phone', 'website', 'hours', 'tags', 'img', 'img2',
  'description', 'about', 'must_order', 'vibe', 'best_for',
  'known_for', 'insider_tip', 'price_detail',
  'google_maps_url', 'google_reviews',
];

function isEmpty(v) {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function computeMergeUpdates(canonical, dupes) {
  const updates = {};
  for (const field of MERGEABLE_FIELDS) {
    if (!isEmpty(canonical[field])) continue;
    for (const d of dupes) {
      if (!isEmpty(d[field])) {
        updates[field] = d[field];
        break;
      }
    }
  }
  // Boolean OR for is_bar / is_hotel (true wins)
  if (!canonical.is_bar && dupes.some(d => d.is_bar === true)) updates.is_bar = true;
  if (!canonical.is_hotel && dupes.some(d => d.is_hotel === true)) updates.is_hotel = true;
  return updates;
}

async function applyCanonicalUpdates(canonicalId, updates) {
  if (!Object.keys(updates).length) return;
  const { error } = await supabase
    .from('restaurants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', Number(canonicalId));
  if (error) throw error;
}

// --- 3. Merge one dupe row into a canonical row ---------------------------

async function mergePhotos(fromId, intoId) {
  // Fetch dupe's photo URLs, upsert into canonical (PK is (restaurant_id, photo_url)),
  // then delete the dupe rows.
  const { data: dupePhotos, error: fetchErr } = await supabase
    .from('restaurant_photos')
    .select('photo_url')
    .eq('restaurant_id', String(fromId));
  if (fetchErr) throw fetchErr;
  if (!dupePhotos?.length) return 0;

  const toInsert = dupePhotos.map(p => ({
    restaurant_id: String(intoId),
    photo_url:     p.photo_url,
  }));
  const { error: upsertErr } = await supabase
    .from('restaurant_photos')
    .upsert(toInsert, { onConflict: 'restaurant_id,photo_url', ignoreDuplicates: true });
  if (upsertErr) throw upsertErr;

  const { error: delErr } = await supabase
    .from('restaurant_photos')
    .delete()
    .eq('restaurant_id', String(fromId));
  if (delErr) throw delErr;

  return dupePhotos.length;
}

async function reassignInteractions(fromId, intoId) {
  const { data, error } = await supabase
    .from('restaurant_interactions')
    .update({ restaurant_id: String(intoId) })
    .eq('restaurant_id', String(fromId))
    .select('id');
  if (error) throw error;
  return data?.length || 0;
}

async function deleteDupeFlameScore(fromId) {
  const { error } = await supabase
    .from('restaurant_flame_scores')
    .delete()
    .eq('restaurant_id', String(fromId));
  if (error && error.code !== 'PGRST116') throw error;
}

// --- User-array cleanup: runs ONCE per group across all users ------------
// Swaps every dupe id in (loved, heat.loved, watchlist) for the canonical id,
// deduping the resulting array.

async function updateUserArraysForGroup(dupeIds, canonicalId) {
  const dupeNumSet = new Set(dupeIds.map(Number));
  const dupeStrSet = new Set(dupeIds.map(String));
  const canonicalNum = Number(canonicalId);

  const { data: rows, error } = await supabase
    .from('user_data')
    .select('clerk_user_id, loved, heat, watchlist');
  if (error) throw error;

  let touchedUsers = 0;
  for (const row of rows || []) {
    const updates = {};

    const rewrite = (arr) => {
      if (!Array.isArray(arr)) return { changed: false, out: arr };
      let changed = false;
      const out = [];
      const seen = new Set();
      for (const id of arr) {
        let finalId = id;
        if (dupeNumSet.has(Number(id)) || dupeStrSet.has(String(id))) {
          finalId = canonicalNum;
          changed = true;
        }
        if (!seen.has(finalId)) {
          seen.add(finalId);
          out.push(finalId);
        } else {
          changed = true;
        }
      }
      return { changed, out };
    };

    const lovedResult = rewrite(row.loved);
    if (lovedResult.changed) updates.loved = lovedResult.out;

    if (row.heat?.loved && Array.isArray(row.heat.loved)) {
      const r = rewrite(row.heat.loved);
      if (r.changed) updates.heat = { ...row.heat, loved: r.out };
    }

    const wlResult = rewrite(row.watchlist);
    if (wlResult.changed) updates.watchlist = wlResult.out;

    if (Object.keys(updates).length) {
      if (!FLAG_DRY_RUN) {
        const { error: updErr } = await supabase
          .from('user_data')
          .update(updates)
          .eq('clerk_user_id', row.clerk_user_id);
        if (updErr) throw updErr;
      }
      touchedUsers++;
    }
  }
  return touchedUsers;
}

async function deleteRestaurantRow(fromId) {
  const { error } = await supabase
    .from('restaurants')
    .delete()
    .eq('id', Number(fromId));
  if (error) throw error;
}

// --- Main loop ------------------------------------------------------------

(async () => {
  console.log(`🔎 Loading restaurants …`);
  const rawGroups = await findDuplicateGroups();
  console.log(`   → ${rawGroups.length} duplicate groups found (same place_id + same coords)`);

  const limit = FLAG_LIMIT ?? rawGroups.length;
  const groupsToProcess = rawGroups.slice(0, limit);
  if (limit < rawGroups.length) {
    console.log(`   → Limiting to first ${limit} groups for this run`);
  }

  let totalPhotosMerged = 0;
  let totalInteractionsReassigned = 0;
  let totalUsersTouched = 0;
  let totalRowsDeleted = 0;
  let totalFieldsFilled = 0;
  let totalManualPicks = 0;
  let groupsProcessed = 0;

  for (const [gIdx, rawGroup] of groupsToProcess.entries()) {
    const group = await enrichWithCounts(rawGroup);
    const canonical = pickCanonical(group);
    const dupes = group.filter(r => r.id !== canonical.id);
    const fieldUpdates = computeMergeUpdates(canonical, dupes);
    const fieldKeys = Object.keys(fieldUpdates);

    const pickTag = canonical._manual ? ' [manual override]' : '';
    if (canonical._manual) totalManualPicks++;
    const label = `[${gIdx + 1}/${groupsToProcess.length}] ${canonical.name} (${canonical.city})`;
    console.log(`\n${label}`);
    console.log(`  ✔ keep #${canonical.id}${pickTag} (photos=${canonical.photos}, interactions=${canonical.interactions})`);
    for (const d of dupes) {
      console.log(`  ✗ merge #${d.id} "${d.name}" (photos=${d.photos}, interactions=${d.interactions}) → #${canonical.id}`);
    }
    if (fieldKeys.length) {
      console.log(`  ⤷ fill blank fields on canonical from dupe(s): ${fieldKeys.join(', ')}`);
      totalFieldsFilled += fieldKeys.length;
    }

    if (FLAG_DRY_RUN) {
      totalRowsDeleted += dupes.length;
      totalPhotosMerged += dupes.reduce((s, d) => s + d.photos, 0);
      totalInteractionsReassigned += dupes.reduce((s, d) => s + d.interactions, 0);
      groupsProcessed++;
      continue;
    }

    try {
      // 1) Field-level merge: patch blanks on canonical from dupes.
      await applyCanonicalUpdates(canonical.id, fieldUpdates);

      // 2) Move photos + interactions + clear dupe flame scores.
      for (const d of dupes) {
        const moved = await mergePhotos(d.id, canonical.id);
        totalPhotosMerged += moved;
        const reassigned = await reassignInteractions(d.id, canonical.id);
        totalInteractionsReassigned += reassigned;
        await deleteDupeFlameScore(d.id);
      }

      // 3) Rewrite every user's loved / heat / watchlist arrays.
      const touched = await updateUserArraysForGroup(dupes.map(d => d.id), canonical.id);
      totalUsersTouched += touched;

      // 4) Delete the dupe restaurant rows.
      for (const d of dupes) {
        await deleteRestaurantRow(d.id);
        totalRowsDeleted++;
      }
      groupsProcessed++;
    } catch (err) {
      console.error(`  ⚠ error in group: ${err.message || err}`);
    }
  }

  console.log(`\n${FLAG_DRY_RUN ? '🧪 DRY RUN' : '✅ Done'}  groups=${groupsProcessed}  rows_deleted=${totalRowsDeleted}  photos_merged=${totalPhotosMerged}  interactions_reassigned=${totalInteractionsReassigned}  fields_filled=${totalFieldsFilled}  manual_picks=${totalManualPicks}  user_updates=${totalUsersTouched}`);
  if (!FLAG_DRY_RUN) {
    console.log(`\n💡 Flame scores for the canonical rows will recompute next time they're read.`);
    console.log(`   (Or you can run \`refresh_all_flame_scores()\` from the admin panel.)`);
  }
})().catch(err => {
  console.error('❌ fatal:', err);
  process.exit(1);
});
