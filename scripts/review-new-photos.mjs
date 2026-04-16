#!/usr/bin/env node
/**
 * review-new-photos.mjs
 * =====================
 *
 * Full photo-approval page for every restaurant that has photos.  Each
 * restaurant row shows all its photos side-by-side.  Two-tier workflow:
 *
 *   FAST LANE — just pick the best:
 *     Click a photo → it turns green (✓ PICKED).  That marks it as the
 *     keeper; the other photos on that row will be deleted when you
 *     "Save all" at the top.  Click the same photo again to un-pick.
 *
 *   POWER TOOLS (per restaurant, top-right of each row):
 *     🗑  Delete ONE bad photo       — hover a photo, click the trash icon
 *     🔄 Refresh the whole row       — re-pulls 5 new photos from Google
 *
 *   SAVE ALL at the top combines everything into:
 *     - SQL that deletes every non-picked photo (per-row "keep only this")
 *       + SQL that deletes individually-killed photos
 *     - A backfill command for restaurants you flagged 🔄
 *
 * Your marks auto-save to localStorage — close the tab and come back.
 *
 * Usage:
 *   cd cooked
 *   # default — restaurants with 2+ photos (i.e. the fresh 5-photo fallback
 *   # pulls that haven't been hand-picked yet; 1-photo restaurants were
 *   # curated weeks ago so we skip them)
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/review-new-photos.mjs
 *
 *   # include 1-photo restaurants too (full review):
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/review-new-photos.mjs --all
 *
 *   # custom threshold:
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/review-new-photos.mjs --min-photos 3
 *
 *   # or pass an explicit list of restaurant ids:
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/review-new-photos.mjs \
 *     --ids 20005,35161,35346,35351,35442
 *
 *   open photos-new-review.html
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { argv } from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jfwtyqyglxknubvhgifw.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('❌ Need SUPABASE_SERVICE_ROLE_KEY in env or .env.local');
  process.exit(1);
}

const OUTPUT = 'photos-new-review.html';

const FLAG_IDS = (() => {
  const i = argv.indexOf('--ids');
  if (i < 0) return null;
  const csv = argv[i + 1] || '';
  return csv.split(',').map(s => s.trim()).filter(Boolean).map(Number);
})();

// How few photos is "already curated" and should be hidden from this review.
// Default = 1 (hide 1-photo restaurants; review only the 2+ that came from
// the 5-photo fallback pull).  Override with --min-photos 3 etc.
const MIN_PHOTOS = (() => {
  const i = argv.indexOf('--min-photos');
  if (i < 0) return 2;
  const n = parseInt(argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
})();
const FLAG_ALL = argv.includes('--all'); // shortcut: include 1-photo rows too

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

async function pageAll(tableQuery, pageSize = 1000) {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await tableQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function loadAllPhotos() {
  // No .in() filter when doing a full scan — safer & simpler to page.
  return pageAll(() => supabase.from('restaurant_photos').select('restaurant_id, photo_url'));
}

async function loadPhotosForIds(ids) {
  const { data, error } = await supabase
    .from('restaurant_photos')
    .select('restaurant_id, photo_url')
    .in('restaurant_id', ids.map(String));
  if (error) throw error;
  return data || [];
}

async function loadRestaurantsByIds(numericIds) {
  // Chunk to respect PostgREST URL length limits.
  const chunkSize = 500;
  const out = new Map();
  for (let i = 0; i < numericIds.length; i += chunkSize) {
    const chunk = numericIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, city, place_id')
      .in('id', chunk);
    if (error) throw error;
    for (const r of data || []) out.set(Number(r.id), r);
  }
  return out;
}

function renderHtml(restaurants, photosById) {
  const sections = restaurants.map(r => {
    const photos = photosById.get(Number(r.id)) || [];
    const mapsHref = r.place_id
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}&query_place_id=${encodeURIComponent(r.place_id)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (r.city || ''))}`;
    const thumbs = photos.map((url, i) => `
      <div class="thumb" data-rid="${r.id}" data-url="${escapeHtml(url)}">
        <img loading="lazy" src="${escapeHtml(url)}" alt="photo ${i + 1}">
        <div class="thumb-badge">#${i + 1}</div>
        <div class="pick-stamp">✓ PICKED</div>
        <button class="kill" title="Delete ONLY this photo">🗑</button>
      </div>`).join('');
    return `
      <section class="rest" data-rid="${r.id}" id="r-${r.id}">
        <header>
          <div class="title">
            <h2>${escapeHtml(r.name)}</h2>
            <div class="sub">${escapeHtml(r.city || '—')} · <span class="count">${photos.length}</span> photo${photos.length === 1 ? '' : 's'}</div>
          </div>
          <div class="acts">
            <a class="map-link" href="${escapeHtml(mapsHref)}" target="_blank" rel="noreferrer">google maps ↗</a>
            <button class="refresh-all" data-rid="${r.id}" title="Re-pull 5 fresh photos from Google">🔄 Refresh all</button>
          </div>
        </header>
        <div class="strip">
          ${photos.length ? thumbs : '<div class="empty">no photos on file</div>'}
        </div>
      </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Cooked — Photo review (${restaurants.length} restaurants)</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0f; color: #f5f0eb; font-family: -apple-system, system-ui, sans-serif; padding-bottom: 80px; }
  #top { position: sticky; top: 0; z-index: 20; background: rgba(10,10,15,0.95); backdrop-filter: blur(8px); padding: 12px 18px; border-bottom: 1px solid #222; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  #top .brand { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 700; font-size: 18px; white-space: nowrap; }
  #top .brand .accent { color: #ff9632; }
  #top input { flex: 1; min-width: 180px; padding: 8px 12px; border-radius: 8px; border: 1px solid #333; background: #15151a; color: #f5f0eb; font-size: 13px; }
  #top input:focus { outline: none; border-color: #ff9632; }
  #top .stats { color: #999; font-size: 12px; white-space: nowrap; }
  #top .stats strong { color: #3ea570; }
  #top .stats strong.kill { color: #e04545; }
  #top .stats strong.refresh { color: #ff9632; }
  #top button.save { background: #3ea570; color: #000; border: 0; border-radius: 8px; padding: 8px 16px; font-weight: 700; cursor: pointer; font-size: 13px; }
  #top button.save:disabled { background: #333; color: #666; cursor: not-allowed; }
  .hint { background: #15151a; border-left: 3px solid #ff9632; padding: 10px 14px; margin: 14px; border-radius: 6px; color: #ccc; font-size: 12px; line-height: 1.45; }
  .hint strong { color: #f5f0eb; }
  section.rest { margin: 0 14px 16px; background: #13131a; border-radius: 12px; overflow: hidden; }
  section.rest.done { opacity: 0.55; }
  section.rest > header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; gap: 10px; flex-wrap: wrap; border-bottom: 1px solid #1f1f26; }
  section.rest h2 { margin: 0; font-size: 15px; color: #ff9632; }
  section.rest .sub { color: #888; font-size: 11px; margin-top: 2px; }
  section.rest .sub .count { color: #ccc; }
  section.rest .acts { display: flex; gap: 10px; align-items: center; }
  section.rest .acts a { color: #888; font-size: 11px; text-decoration: none; }
  section.rest .acts a:hover { color: #ff9632; }
  section.rest .acts .refresh-all { background: transparent; color: #ff9632; border: 1px solid #ff9632; border-radius: 6px; padding: 5px 10px; font-size: 11px; cursor: pointer; }
  section.rest .acts .refresh-all.active { background: #ff9632; color: #000; }
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; padding: 10px; }
  .thumb { position: relative; background: #1a1a22; border-radius: 8px; overflow: hidden; aspect-ratio: 4/3; cursor: pointer; border: 2px solid transparent; transition: border-color 0.1s, transform 0.1s; }
  .thumb:hover { border-color: #555; }
  .thumb.picked { border-color: #3ea570; }
  .thumb.killed { opacity: 0.32; border-color: #e04545; }
  .thumb.killed.picked { border-color: #e04545; } /* kill wins over pick */
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
  .thumb .thumb-badge { position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.78); padding: 1px 6px; border-radius: 3px; font-size: 10px; color: #ddd; }
  .thumb .pick-stamp { position: absolute; bottom: 6px; left: 6px; background: #3ea570; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; display: none; }
  .thumb.picked .pick-stamp { display: block; }
  .thumb.picked.killed .pick-stamp { display: none; }
  .thumb .kill { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.78); color: #f5f0eb; border: 1px solid rgba(255,255,255,0.2); border-radius: 5px; padding: 2px 6px; font-size: 11px; cursor: pointer; opacity: 0; transition: opacity 0.1s; }
  .thumb:hover .kill { opacity: 1; }
  .thumb.killed .kill { background: #e04545; color: #fff; opacity: 1; }
  .empty { grid-column: 1 / -1; text-align: center; color: #666; padding: 22px; font-size: 12px; }
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
  .modal-bg.show { display: flex; }
  .modal { background: #15151a; border-radius: 12px; padding: 20px; max-width: 780px; width: 100%; max-height: 90vh; overflow-y: auto; }
  .modal h3 { margin: 0 0 6px; }
  .modal p { color: #aaa; font-size: 13px; line-height: 1.5; }
  .modal pre { background: #0a0a0f; border: 1px solid #333; border-radius: 6px; padding: 10px; color: #ff9632; font-family: ui-monospace, monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; max-height: 260px; overflow-y: auto; }
  .modal .row { display: flex; gap: 10px; margin-top: 12px; }
  .modal button { flex: 1; background: #ff9632; color: #000; border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
  .modal button.secondary { background: transparent; border: 1px solid #444; color: #ccc; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #3c8b4a; color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 60; }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<div id="top">
  <div class="brand">cook<span class="accent">ed</span> · photos</div>
  <input id="search" placeholder="search name or city…" oninput="filter()">
  <div class="stats">
    <strong id="pickCount">0</strong> picked ·
    <strong class="kill" id="killCount">0</strong> killed ·
    <strong class="refresh" id="refreshCount">0</strong> refresh
  </div>
  <button class="save" id="saveBtn" disabled>Save all</button>
</div>

<div class="hint">
  <strong>Fast lane:</strong> click the best photo in each row — it turns green (✓ PICKED). That marks it as the keeper; the other photos in that row will be deleted when you hit <strong>Save all</strong>. Click again to un-pick.<br>
  <strong>Per-photo:</strong> hover a photo to reveal 🗑 — clicks mark it for deletion without touching the others. <strong>Whole row broken?</strong> hit 🔄 Refresh all (top-right of the row) to re-pull 5 new photos from Google.
</div>

${sections}

<div id="modal" class="modal-bg" onclick="if(event.target===this)hideModal()">
  <div class="modal">
    <h3>Do these in order</h3>
    <p><strong>1.</strong> Paste this SQL into Supabase → SQL editor (removes non-picked + individually-killed photos):</p>
    <pre id="sqlBlock"></pre>
    <p><strong>2.</strong> Then this in Terminal (re-pulls restaurants you flagged 🔄):</p>
    <pre id="cmdBlock"></pre>
    <div class="row">
      <button class="secondary" onclick="hideModal()">Close</button>
      <button onclick="copyAll()">Copy both to clipboard</button>
    </div>
  </div>
</div>
<div id="toast" class="toast">Copied ✓</div>

<script>
const LS_KEY = 'cooked_new_photos_actions_v2';
const state = (() => {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
})();
// state = { picks: { [rid]: picked_url }, kills: [url, ...], refresh: [rid, ...] }
state.picks   = state.picks   || {};
state.kills   = state.kills   || [];
state.refresh = state.refresh || [];
const killed  = new Set(state.kills);
const refresh = new Set(state.refresh.map(String));

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    picks:   state.picks,
    kills:   [...killed],
    refresh: [...refresh],
  }));
}

function paint() {
  document.querySelectorAll('section.rest').forEach(sec => {
    const rid = sec.dataset.rid;
    const pickedUrl = state.picks[rid];
    sec.querySelectorAll('.thumb').forEach(t => {
      const url = t.dataset.url;
      t.classList.toggle('picked', url === pickedUrl);
      t.classList.toggle('killed', killed.has(url));
    });
    sec.querySelector('button.refresh-all').classList.toggle('active', refresh.has(rid));
    // "done" marker: any action taken on this row
    const touched = pickedUrl || refresh.has(rid) ||
      [...sec.querySelectorAll('.thumb')].some(t => killed.has(t.dataset.url));
    sec.classList.toggle('done', !!touched);
  });
  const pickCount = Object.keys(state.picks).length;
  document.getElementById('pickCount').textContent = pickCount;
  document.getElementById('killCount').textContent = killed.size;
  document.getElementById('refreshCount').textContent = refresh.size;
  document.getElementById('saveBtn').disabled = (pickCount + killed.size + refresh.size) === 0;
}

// ---- Event wiring ----
document.querySelectorAll('.thumb').forEach(t => {
  // Main click = toggle pick
  t.addEventListener('click', e => {
    if (e.target.classList.contains('kill')) return; // let kill handler take it
    const rid = t.dataset.rid;
    const url = t.dataset.url;
    if (state.picks[rid] === url) delete state.picks[rid];
    else state.picks[rid] = url;
    save(); paint();
  });
  // Kill button
  const killBtn = t.querySelector('.kill');
  if (killBtn) {
    killBtn.addEventListener('click', e => {
      e.stopPropagation();
      const url = t.dataset.url;
      if (killed.has(url)) killed.delete(url);
      else killed.add(url);
      save(); paint();
    });
  }
});
document.querySelectorAll('button.refresh-all').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const rid = String(btn.dataset.rid);
    if (refresh.has(rid)) refresh.delete(rid);
    else refresh.add(rid);
    save(); paint();
  });
});

function filter() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  document.querySelectorAll('section.rest').forEach(sec => {
    if (!q) { sec.style.display = ''; return; }
    const h2 = sec.querySelector('h2')?.textContent.toLowerCase() || '';
    const sub = sec.querySelector('.sub')?.textContent.toLowerCase() || '';
    sec.style.display = (h2.includes(q) || sub.includes(q)) ? '' : 'none';
  });
}

function sqlEscape(s) { return "'" + s.replace(/'/g, "''") + "'"; }

function buildOutputs() {
  const sqlLines = [];
  // Pick-based: for each restaurant with a pick, delete every other photo
  // (we build this by combining per-row deletes, one per non-picked URL)
  // It's cleaner to issue DELETE ... WHERE restaurant_id = X AND photo_url <> 'keeper'
  // but we don't have access to other URLs here unless we enumerate them — which we do from the DOM.
  for (const [rid, keeper] of Object.entries(state.picks)) {
    const section = document.getElementById('r-' + rid);
    if (!section) continue;
    const others = [...section.querySelectorAll('.thumb')]
      .map(t => t.dataset.url)
      .filter(u => u && u !== keeper);
    if (others.length === 0) continue;
    sqlLines.push('-- keep 1 for r=' + rid + ' (' + (section.querySelector('h2')?.textContent || '') + ')');
    sqlLines.push('DELETE FROM restaurant_photos WHERE restaurant_id = ' + sqlEscape(rid) + ' AND photo_url IN (');
    sqlLines.push('  ' + others.map(sqlEscape).join(',\\n  '));
    sqlLines.push(');');
    sqlLines.push('');
  }
  // Individually killed photos (that weren't already covered by a pick above)
  const pickedUrls = new Set(Object.values(state.picks));
  const pickedRids = new Set(Object.keys(state.picks));
  const orphanKills = [...killed].filter(u => {
    // If the URL was already picked, dropping it would wipe the keeper — skip (they can unpick first)
    if (pickedUrls.has(u)) return false;
    // If this URL belongs to a row that already has a pick, it's already being deleted
    for (const rid of pickedRids) {
      const section = document.getElementById('r-' + rid);
      if (section && [...section.querySelectorAll('.thumb')].some(t => t.dataset.url === u)) return false;
    }
    return true;
  });
  if (orphanKills.length) {
    sqlLines.push('-- individual photo deletes');
    sqlLines.push('DELETE FROM restaurant_photos WHERE photo_url IN (');
    sqlLines.push('  ' + orphanKills.map(sqlEscape).join(',\\n  '));
    sqlLines.push(');');
  }
  const sql = sqlLines.length ? sqlLines.join('\\n') : '-- (nothing to delete)';

  const cmd = refresh.size === 0
    ? '# (no restaurants flagged for full refresh)'
    : 'cd "/Users/lugapodesta/Dropbox (Personal)/1. CLAUDE/projects/cooked" && \\\\\\n  SUPABASE_SERVICE_ROLE_KEY=PASTE_YOUR_KEY \\\\\\n  node scripts/backfill-photos.mjs --refresh-restaurants ' + [...refresh].join(',');
  return { sql, cmd };
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const { sql, cmd } = buildOutputs();
  document.getElementById('sqlBlock').textContent = sql;
  document.getElementById('cmdBlock').textContent = cmd;
  document.getElementById('modal').classList.add('show');
});

function hideModal() { document.getElementById('modal').classList.remove('show'); }
function copyAll() {
  const combined = document.getElementById('sqlBlock').textContent + '\\n\\n' + document.getElementById('cmdBlock').textContent;
  navigator.clipboard.writeText(combined).then(() => {
    const t = document.getElementById('toast');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1500);
    hideModal();
  });
}
window.hideModal = hideModal; window.copyAll = copyAll;

paint();
</script>
</body></html>`;
}

(async () => {
  let targetIds;
  let photoRows;
  if (FLAG_IDS && FLAG_IDS.length) {
    targetIds = FLAG_IDS;
    console.log(`🔧 Scoped to ${targetIds.length} restaurant id(s) via --ids`);
    photoRows = await loadPhotosForIds(targetIds);
  } else {
    console.log(`🔧 Loading all photos…`);
    photoRows = await loadAllPhotos();
    targetIds = Array.from(new Set(photoRows.map(p => Number(p.restaurant_id)))).filter(n => !Number.isNaN(n));
    console.log(`   ${photoRows.length} photo rows across ${targetIds.length} restaurants`);
  }

  console.log(`🔧 Loading restaurant metadata…`);
  const restMap = await loadRestaurantsByIds(targetIds);

  // Bucket photos per restaurant, ours-first so hero is stable.
  const photosById = new Map();
  for (const p of photoRows) {
    const id = Number(p.restaurant_id);
    if (!photosById.has(id)) photosById.set(id, []);
    photosById.get(id).push(p.photo_url);
  }
  for (const arr of photosById.values()) {
    arr.sort((a, b) => {
      const ao = (a || '').toLowerCase().includes('supabase.co/storage/') ? 0 : 1;
      const bo = (b || '').toLowerCase().includes('supabase.co/storage/') ? 0 : 1;
      return ao - bo;
    });
  }

  // Build restaurants list in stable alpha order by name, filtering by MIN_PHOTOS.
  const threshold = FLAG_ALL ? 1 : MIN_PHOTOS;
  const restaurantsAll = targetIds
    .map(id => restMap.get(id))
    .filter(Boolean);
  const restaurants = restaurantsAll
    .filter(r => (photosById.get(Number(r.id))?.length || 0) >= threshold)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Distribution — useful for confirming we're reviewing the right bucket.
  const dist = new Map();
  for (const r of restaurantsAll) {
    const n = photosById.get(Number(r.id))?.length || 0;
    dist.set(n, (dist.get(n) || 0) + 1);
  }
  const distKeys = [...dist.keys()].sort((a, b) => a - b);
  console.log(`   distribution: ${distKeys.map(k => `${k}ph=${dist.get(k)}`).join('  ')}`);
  console.log(`   filter: ≥${threshold} photo(s) → ${restaurants.length} restaurant(s) in review`);
  const totalPhotos = restaurants.reduce((n, r) => n + (photosById.get(Number(r.id))?.length || 0), 0);
  console.log(`   total photos in review: ${totalPhotos}`);

  const html = renderHtml(restaurants, photosById);
  fs.writeFileSync(OUTPUT, html);
  const abs = path.resolve(OUTPUT);
  console.log(`\n📄 Wrote ${OUTPUT}`);
  console.log(`   open "${abs}"`);
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
