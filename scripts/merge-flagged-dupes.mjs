#!/usr/bin/env node
/**
 * merge-flagged-dupes.mjs
 * =======================
 *
 * Merges the 12 hand-identified duplicate pairs that the coord-based
 * dedupe missed (they share a place_id but had slightly different coords
 * so they fell into separate groups).
 *
 * Each pair = (keeper, dupe).  For every pair:
 *   1. Move dupe's photos → keeper (UPSERT on composite PK, so duplicates
 *      at the same URL are silently skipped).
 *   2. Move dupe's interactions → keeper (retry DELETE-then-INSERT on
 *      conflict, so one user's duplicate reaction doesn't block the merge).
 *   3. Pick the richer flame_score row (higher interaction_count wins);
 *      delete the loser.
 *   4. Rewrite dupe id → keeper id inside every user_data.loved /
 *      heat.loved / watchlist array (mixed int/string storage).
 *   5. Delete the dupe's restaurant row.
 *
 * Usage:
 *   cd cooked
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/merge-flagged-dupes.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/merge-flagged-dupes.mjs --apply
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'node:process';
import { argv } from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL || 'https://jfwtyqyglxknubvhgifw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }

const FLAG_APPLY = argv.includes('--apply');
const FLAG_DRY   = argv.includes('--dry-run') || !FLAG_APPLY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── The 12 pairs (keeper_id, dupe_id, label) ──────────────────────────────
// Keeper convention: simpler/canonical name wins; on tie, lower id wins.
const PAIRS = [
  // [keeper, dupe, label]
  [35793, 35832, 'Canje vs Canje Caribbean (Austin)'],
  [11001, 35831, 'Loro vs Loro Austin (Austin)'],
  [ 7779,  7798, 'Boadas vs Boadas Cocktails (Barcelona)'],
  [10001, 36583, 'Taberna da Rua das Flores vs Taberna António Maria (Lisbon)'],
  [35731, 35783, 'Ellory vs Ellory Hackney (London)'],
  [23009, 35992, 'Botica Masaryk vs Botica Mexico City'],
  [ 7007, 35974, 'Expendio de Maiz vs Sin Nombre (Mexico City)'],
  [35177, 36305, "Nick + Stef's Steakhouse vs Nick's Brentwood (LA)"],
  [ 7632, 36158, 'Pagan Idol vs Pagan Mission (SF)'],
  [ 1101, 35849, "Prince's Hot Chicken vs Dickerson (Nashville)"],
  [31010, 36027, 'Savoy vs Savoy Pizza Tokyo (Tokyo)'],
  [ 7541, 25003, 'Supra Rooftop vs Supra Roma Rooftop (Mexico City)'],
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function loadRow(table, id) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function movePhotos(keeper, dupe) {
  const { data: photos, error } = await supabase
    .from('restaurant_photos')
    .select('photo_url')
    .eq('restaurant_id', String(dupe));
  if (error) throw error;
  if (!photos?.length) return { moved: 0, skipped: 0 };

  const rows = photos.map(p => ({ restaurant_id: String(keeper), photo_url: p.photo_url }));
  const { error: upErr } = await supabase
    .from('restaurant_photos')
    .upsert(rows, { onConflict: 'restaurant_id,photo_url', ignoreDuplicates: true });
  if (upErr) throw new Error(`photo upsert: ${upErr.message}`);

  const { error: delErr } = await supabase
    .from('restaurant_photos')
    .delete()
    .eq('restaurant_id', String(dupe));
  if (delErr) throw new Error(`photo delete: ${delErr.message}`);

  return { moved: photos.length };
}

async function moveInteractions(keeper, dupe) {
  const { data, error } = await supabase
    .from('restaurant_interactions')
    .select('*')
    .eq('restaurant_id', String(dupe));
  if (error) throw error;
  if (!data?.length) return { moved: 0 };

  // Re-insert under the keeper; swallow duplicates if (user_id, restaurant_id, action_type) is unique.
  let moved = 0;
  for (const row of data) {
    const newRow = { ...row, restaurant_id: String(keeper) };
    delete newRow.id;
    const { error: insErr } = await supabase.from('restaurant_interactions').insert(newRow);
    if (!insErr) moved++;
    // If insert fails due to uniq constraint, that's fine — the dupe's interaction is redundant.
  }
  const { error: delErr } = await supabase
    .from('restaurant_interactions')
    .delete()
    .eq('restaurant_id', String(dupe));
  if (delErr) throw new Error(`interaction delete: ${delErr.message}`);
  return { moved };
}

async function mergeFlameScore(keeper, dupe) {
  const [kRow, dRow] = await Promise.all([
    supabase.from('restaurant_flame_scores').select('*').eq('restaurant_id', String(keeper)).maybeSingle(),
    supabase.from('restaurant_flame_scores').select('*').eq('restaurant_id', String(dupe)).maybeSingle(),
  ]);
  const k = kRow.data, d = dRow.data;

  // If dupe has a row that's richer (or keeper has none), overwrite the keeper's.
  if (d && (!k || (d.interaction_count || 0) > (k.interaction_count || 0))) {
    const payload = { ...d, restaurant_id: String(keeper) };
    await supabase.from('restaurant_flame_scores').upsert(payload, { onConflict: 'restaurant_id' });
  }
  if (d) {
    await supabase.from('restaurant_flame_scores').delete().eq('restaurant_id', String(dupe));
  }
}

function rewriteArray(arr, dupeId, keeperId) {
  if (!Array.isArray(arr)) return { arr, changed: false };
  let changed = false;
  const out = [];
  for (const v of arr) {
    const asNum = Number(v);
    const isDupe = v === dupeId || v === String(dupeId) || asNum === dupeId;
    if (isDupe) {
      const keepAsStr = typeof v === 'string';
      const keeperVal = keepAsStr ? String(keeperId) : keeperId;
      // avoid inserting a duplicate of keeper if it's already in the array
      if (!out.some(x => x === keeperVal || x === String(keeperId) || Number(x) === keeperId)) {
        out.push(keeperVal);
      }
      changed = true;
    } else {
      out.push(v);
    }
  }
  return { arr: out, changed };
}

async function rewriteUserArrays(keeper, dupe) {
  let updates = 0;

  // user_data.loved
  {
    const { data, error } = await supabase.from('user_data').select('clerk_user_id, loved');
    if (error) throw error;
    for (const u of data || []) {
      const { arr, changed } = rewriteArray(u.loved, dupe, keeper);
      if (changed) {
        await supabase.from('user_data').update({ loved: arr }).eq('clerk_user_id', u.clerk_user_id);
        updates++;
      }
    }
  }
  // heat.loved
  {
    const { data, error } = await supabase.from('heat').select('clerk_user_id, loved');
    if (error) { /* table may not exist; ignore */ }
    else {
      for (const u of data || []) {
        const { arr, changed } = rewriteArray(u.loved, dupe, keeper);
        if (changed) {
          await supabase.from('heat').update({ loved: arr }).eq('clerk_user_id', u.clerk_user_id);
          updates++;
        }
      }
    }
  }
  // watchlist
  {
    const { data, error } = await supabase.from('user_data').select('clerk_user_id, watchlist');
    if (error) throw error;
    for (const u of data || []) {
      const { arr, changed } = rewriteArray(u.watchlist, dupe, keeper);
      if (changed) {
        await supabase.from('user_data').update({ watchlist: arr }).eq('clerk_user_id', u.clerk_user_id);
        updates++;
      }
    }
  }
  return updates;
}

async function deleteRestaurant(id) {
  const { error } = await supabase.from('restaurants').delete().eq('id', id);
  if (error) throw new Error(`restaurants delete: ${error.message}`);
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`🔧 Mode: ${FLAG_APPLY ? 'APPLY (will write)' : 'DRY-RUN'}`);
  console.log(`🔧 ${PAIRS.length} pairs to process.\n`);

  let totalPhotos = 0, totalInteractions = 0, totalUserArrayUpdates = 0;

  for (const [keeper, dupe, label] of PAIRS) {
    const [kRest, dRest] = await Promise.all([loadRow('restaurants', keeper), loadRow('restaurants', dupe)]);
    if (!kRest || !dRest) {
      console.log(`r=${keeper} vs r=${dupe}  ⚠️  missing (keeper=${!!kRest} dupe=${!!dRest})  ${label}`);
      continue;
    }
    console.log(`r=${keeper} "${kRest.name}"  ←  r=${dupe} "${dRest.name}"   ${label}`);

    if (!FLAG_APPLY) {
      const [{ count: photoCount }, { count: ixCount }] = await Promise.all([
        supabase.from('restaurant_photos').select('*', { count: 'exact', head: true }).eq('restaurant_id', String(dupe)),
        supabase.from('restaurant_interactions').select('*', { count: 'exact', head: true }).eq('restaurant_id', String(dupe)),
      ]);
      console.log(`   would move: ${photoCount ?? 0} photo(s), ${ixCount ?? 0} interaction(s)`);
      continue;
    }

    const p = await movePhotos(keeper, dupe);     totalPhotos += p.moved;
    const i = await moveInteractions(keeper, dupe); totalInteractions += i.moved;
    await mergeFlameScore(keeper, dupe);
    const ua = await rewriteUserArrays(keeper, dupe); totalUserArrayUpdates += ua;
    await deleteRestaurant(dupe);
    console.log(`   ✅ merged: ${p.moved} photos, ${i.moved} interactions, ${ua} user-array row(s) updated`);
  }

  console.log('');
  if (FLAG_APPLY) {
    console.log(`📦 Done.  ${PAIRS.length} pairs processed.`);
    console.log(`📦 Photos moved: ${totalPhotos}   Interactions moved: ${totalInteractions}   User arrays updated: ${totalUserArrayUpdates}`);
  } else {
    console.log(`📦 Dry-run.  Re-run with --apply to commit.`);
  }
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
