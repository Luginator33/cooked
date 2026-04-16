#!/usr/bin/env node
/**
 * review-photos.mjs
 * =================
 *
 * Builds a scrollable HTML page of every restaurant and its hero photo.
 * You scan through, click "🚩 Mark as bad" on any that look wrong,
 * then copy one command at the top and paste in terminal — that
 * command refreshes all flagged restaurants at once with fresh photos
 * from Google.
 *
 * Usage:
 *   cd cooked
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/review-photos.mjs
 *   open photos-report.html
 *
 * Read-only — no DB writes from this script.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jfwtyqyglxknubvhgifw.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('❌ Need SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in env or .env.local');
  process.exit(1);
}

const OUTPUT = 'photos-report.html';
const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

async function pageThrough(query, pageSize = 1000) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function loadAllPhotos() {
  return pageThrough(() => supabase.from('restaurant_photos').select('restaurant_id, photo_url'));
}

async function loadAllRestaurants() {
  return pageThrough(() => supabase.from('restaurants').select('id, name, city, place_id'));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function renderHtml(entries) {
  const cards = entries.map(e => {
    const hero = e.photos[0] || '';
    const mapsHref = e.place_id
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.name)}&query_place_id=${encodeURIComponent(e.place_id)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.name + ' ' + (e.city || ''))}`;
    const searchText = escapeHtml((e.name + ' ' + (e.city || '')).toLowerCase());
    return `
    <div class="card" data-id="${escapeHtml(e.id)}" data-search="${searchText}">
      <div class="hero">
        ${hero ? `<img loading="lazy" src="${escapeHtml(hero)}" alt="${escapeHtml(e.name)}">` : '<div class="placeholder">no photo</div>'}
        <div class="marked-stamp">MARKED</div>
      </div>
      <div class="meta">
        <div class="name">${escapeHtml(e.name)}</div>
        <div class="sub">${escapeHtml(e.city || '—')}</div>
        <div class="actions">
          <button class="flag-btn" onclick="toggleFlag('${escapeHtml(e.id)}', this)">🚩 Mark as bad</button>
          <a class="map-link" href="${escapeHtml(mapsHref)}" target="_blank" rel="noreferrer">google maps ↗</a>
        </div>
      </div>
    </div>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Cooked — Photo Review (${entries.length} restaurants)</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0f; color: #f5f0eb; font-family: -apple-system, system-ui, sans-serif; padding-bottom: 80px; }
  header { position: sticky; top: 0; background: rgba(10,10,15,0.95); backdrop-filter: blur(10px); padding: 14px 20px; border-bottom: 1px solid #222; z-index: 20; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header .brand { font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-weight: 700; font-size: 20px; white-space: nowrap; }
  header .brand .accent { color: #ff9632; }
  header input { flex: 1; min-width: 180px; padding: 9px 14px; border-radius: 8px; border: 1px solid #333; background: #15151a; color: #f5f0eb; font-size: 14px; }
  header input:focus { outline: none; border-color: #ff9632; }
  header .count { color: #888; font-size: 13px; white-space: nowrap; }
  header .count strong { color: #ff9632; }
  .fix-btn { background: #ff9632; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
  .fix-btn:hover { background: #ffa85b; }
  .fix-btn:disabled { background: #333; color: #666; cursor: not-allowed; }
  .fix-btn.copied { background: #3c8b4a; }
  .instructions { background: #15151a; border-left: 3px solid #ff9632; padding: 12px 16px; margin: 16px; border-radius: 6px; color: #ccc; font-size: 13px; line-height: 1.5; }
  .instructions strong { color: #f5f0eb; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; padding: 0 16px 16px; }
  .card { background: #15151a; border-radius: 12px; overflow: hidden; border: 2px solid #222; transition: border-color 0.15s, opacity 0.15s; position: relative; }
  .card:hover { border-color: #444; }
  .card.flagged { border-color: #e04545; }
  .card .marked-stamp { display: none; position: absolute; top: 10px; left: 10px; background: #e04545; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
  .card.flagged .marked-stamp { display: block; }
  .hero { aspect-ratio: 4/3; overflow: hidden; background: #1a1a22; position: relative; }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero .placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #555; font-size: 12px; }
  .meta { padding: 10px 12px 12px; }
  .name { font-weight: 600; font-size: 14px; line-height: 1.25; }
  .sub { color: #999; font-size: 12px; margin-top: 3px; }
  .actions { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; gap: 8px; }
  .flag-btn { flex: 1; background: transparent; color: #ccc; border: 1px solid #333; border-radius: 6px; padding: 7px 8px; font-size: 12px; cursor: pointer; transition: all 0.15s; font-weight: 500; }
  .flag-btn:hover { background: #1a1a22; color: #f5f0eb; border-color: #555; }
  .card.flagged .flag-btn { background: #e04545; color: #fff; border-color: #e04545; }
  .card.flagged .flag-btn::before { content: '✓ MARKED — click to unmark'; }
  .card.flagged .flag-btn span { display: none; }
  .map-link { color: #888; font-size: 11px; text-decoration: none; white-space: nowrap; }
  .map-link:hover { color: #ff9632; }
  .empty { padding: 40px; text-align: center; color: #666; }
  .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #3c8b4a; color: #fff; padding: 12px 22px; border-radius: 24px; font-size: 14px; opacity: 0; transition: opacity 0.25s, transform 0.25s; pointer-events: none; z-index: 50; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(-6px); }
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100; display: none; align-items: center; justify-content: center; padding: 20px; }
  .modal-bg.show { display: flex; }
  .modal { background: #15151a; border-radius: 12px; padding: 24px; max-width: 700px; width: 100%; max-height: 90vh; overflow-y: auto; }
  .modal h2 { margin: 0 0 8px; font-size: 18px; }
  .modal p { color: #aaa; font-size: 13px; line-height: 1.5; margin: 8px 0; }
  .modal pre { background: #0a0a0f; border: 1px solid #333; border-radius: 6px; padding: 12px; font-family: ui-monospace, monospace; font-size: 12px; color: #ff9632; white-space: pre-wrap; word-break: break-all; margin: 12px 0; }
  .modal .row { display: flex; gap: 10px; margin-top: 16px; }
  .modal button { background: #ff9632; color: #fff; border: none; border-radius: 8px; padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; flex: 1; }
  .modal button.secondary { background: transparent; border: 1px solid #444; color: #ccc; }
  .modal button:hover { opacity: 0.9; }
</style>
</head>
<body>

<header>
  <div class="brand">cook<span class="accent">ed</span> · photos</div>
  <input id="search" placeholder="search name or city…" oninput="filter()">
  <div class="count"><strong id="flaggedCount">0</strong> flagged · <span id="totalCount">${entries.length}</span> restaurants</div>
  <button id="fixBtn" class="fix-btn" onclick="showFixModal()" disabled>Copy fix command</button>
</header>

<div class="instructions">
  <strong>How to use:</strong> Scroll through. When a photo looks wrong (promo poster, wrong restaurant, totally off), click <strong>🚩 Mark as bad</strong>. At the end, click <strong>Copy fix command</strong> at the top — paste it in Terminal and all your marked restaurants get fresh photos from Google at once. Your marks save automatically (safe to close the tab).
</div>

<div id="grid" class="grid">${cards}</div>

<div id="toast" class="toast">Copied to clipboard ✓</div>

<div id="modal" class="modal-bg" onclick="if(event.target===this) hideFixModal()">
  <div class="modal">
    <h2>Copy this command</h2>
    <p>Paste it in your Terminal (the one you used to run the backfill). Replace <code>PASTE_YOUR_KEY</code> with your Supabase service role key (same as last time).</p>
    <pre id="fixCmd"></pre>
    <p>It'll refresh <strong id="modalCount">0</strong> restaurants — takes about <strong id="modalTime">a few seconds</strong>. Each one gets 5 fresh photos from Google.</p>
    <div class="row">
      <button class="secondary" onclick="hideFixModal()">Close</button>
      <button onclick="copyFixCmd()">Copy command</button>
    </div>
  </div>
</div>

<script>
const LS_KEY = 'cooked_photo_review_flags_v1';
const flagged = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(flagged)));
}

function refreshUI() {
  for (const c of document.querySelectorAll('.card')) {
    const id = c.dataset.id;
    if (flagged.has(id)) c.classList.add('flagged');
    else c.classList.remove('flagged');
  }
  const n = flagged.size;
  document.getElementById('flaggedCount').textContent = n;
  const btn = document.getElementById('fixBtn');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'Copy fix command' : 'Copy fix command (' + n + ')';
}

function toggleFlag(id) {
  if (flagged.has(id)) flagged.delete(id);
  else flagged.add(id);
  save();
  refreshUI();
}

function filter() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  let visible = 0;
  for (const c of document.querySelectorAll('.card')) {
    const match = !q || c.dataset.search.includes(q);
    c.style.display = match ? '' : 'none';
    if (match) visible++;
  }
  document.getElementById('totalCount').textContent = q ? visible + ' match' + (visible === 1 ? '' : 'es') : '${entries.length} restaurants';
}

function showFixModal() {
  if (flagged.size === 0) return;
  const ids = Array.from(flagged).join(',');
  const cmd = 'cd "/Users/lugapodesta/Dropbox (Personal)/1. CLAUDE/projects/cooked" && SUPABASE_SERVICE_ROLE_KEY=PASTE_YOUR_KEY node scripts/backfill-photos.mjs --refresh-restaurants ' + ids;
  document.getElementById('fixCmd').textContent = cmd;
  document.getElementById('modalCount').textContent = flagged.size;
  document.getElementById('modalTime').textContent = flagged.size < 10 ? 'a few seconds' : (flagged.size < 100 ? 'about a minute' : Math.ceil(flagged.size / 100) + ' minutes or so');
  document.getElementById('modal').classList.add('show');
}

function hideFixModal() {
  document.getElementById('modal').classList.remove('show');
}

function copyFixCmd() {
  const cmd = document.getElementById('fixCmd').textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    const t = document.getElementById('toast');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
    hideFixModal();
  });
}

document.querySelectorAll('.card').forEach(c => {
  c.addEventListener('click', (e) => {
    // Don't toggle when clicking the maps link
    if (e.target.closest('.map-link')) return;
    toggleFlag(c.dataset.id);
  });
});

refreshUI();
</script>
</body></html>`;
}

// --- Main -----------------------------------------------------------------

(async () => {
  console.log(`🔧 Loading photos…`);
  const rows = await loadAllPhotos();
  console.log(`   ${rows.length} photo rows total`);

  console.log(`🔧 Loading restaurants…`);
  const restaurants = await loadAllRestaurants();
  console.log(`   ${restaurants.length} restaurants in DB`);

  const restaurantsById = new Map();
  for (const r of restaurants) restaurantsById.set(String(r.id), r);

  // Group photos by restaurant, prefer our-hosted ones as "hero".
  const photosByRestaurant = new Map();
  for (const r of rows) {
    const id = String(r.restaurant_id);
    if (!photosByRestaurant.has(id)) photosByRestaurant.set(id, []);
    photosByRestaurant.get(id).push(r.photo_url);
  }

  // Sort so Supabase-hosted URLs come first (those are the ones the app will show).
  for (const arr of photosByRestaurant.values()) {
    arr.sort((a, b) => {
      const aOurs = (a || '').toLowerCase().includes('supabase.co/storage/') ? 0 : 1;
      const bOurs = (b || '').toLowerCase().includes('supabase.co/storage/') ? 0 : 1;
      return aOurs - bOurs;
    });
  }

  const entries = Array.from(photosByRestaurant.entries())
    .map(([id, photos]) => {
      const r = restaurantsById.get(id);
      return {
        id,
        name: r?.name || '(unknown)',
        city: r?.city || '',
        place_id: r?.place_id || null,
        photos: photos.filter(Boolean),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const html = renderHtml(entries);
  fs.writeFileSync(OUTPUT, html);
  const abs = path.resolve(OUTPUT);
  console.log(`\n📄 Wrote ${OUTPUT} — ${entries.length} restaurants`);
  console.log(`\nOpen it:\n  open "${abs}"`);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
