#!/usr/bin/env node
/**
 * inspect-dedupe.mjs
 * ==================
 *
 * Visual sanity-check for dedupe-restaurants.mjs.  Pulls the SAME duplicate
 * groups (same place_id + same coords) and writes an HTML side-by-side
 * report so you can eyeball every canonical pick BEFORE committing.
 *
 * For each group it shows every row's name / neighborhood / price /
 * description / cuisine / tags — with the rule's current canonical pick
 * highlighted in green.  Rows where the canonical has clearly worse metadata
 * than a dupe are visually obvious, and you can tell me "flip group X to
 * row Y" and I'll add overrides to the merge script.
 *
 * Usage:
 *   cd cooked
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/inspect-dedupe.mjs
 *   open /tmp/cooked-dedupe-inspect.html
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'node:process';
import { writeFileSync } from 'node:fs';

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

const METADATA_FIELDS = [
  'id', 'name', 'city', 'neighborhood', 'cuisine', 'price', 'rating',
  'google_rating', 'description', 'about', 'vibe', 'known_for',
  'tags', 'must_order', 'best_for', 'place_id', 'lat', 'lng', 'updated_at',
];

async function loadAllWithMeta() {
  const PAGE = 1000;
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('restaurants')
      .select(METADATA_FIELDS.join(','))
      .not('place_id', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
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

async function enrichCounts(groups) {
  const allIds = groups.flat().map(r => String(r.id));
  const [photos, interactions] = await Promise.all([
    supabase.from('restaurant_photos').select('restaurant_id').in('restaurant_id', allIds),
    supabase.from('restaurant_interactions').select('restaurant_id').in('restaurant_id', allIds),
  ]);
  const pCount = new Map();
  const iCount = new Map();
  (photos.data || []).forEach(r => pCount.set(r.restaurant_id, (pCount.get(r.restaurant_id) || 0) + 1));
  (interactions.data || []).forEach(r => iCount.set(r.restaurant_id, (iCount.get(r.restaurant_id) || 0) + 1));
  for (const g of groups) {
    for (const r of g) {
      r._photos = pCount.get(String(r.id)) || 0;
      r._interactions = iCount.get(String(r.id)) || 0;
    }
  }
  return groups;
}

function pickCanonical(group) {
  return [...group].sort((a, b) => {
    if (b._interactions !== a._interactions) return b._interactions - a._interactions;
    if (b._photos !== a._photos) return b._photos - a._photos;
    return a.id - b.id;
  })[0];
}

function esc(v) {
  if (v == null) return '<span class="null">—</span>';
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="null">—</span>';
    return v.map(x => `<span class="tag">${String(x).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]))}</span>`).join(' ');
  }
  const s = String(v);
  return s.replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
}

function fmtRow(r, isCanonical, groupIdx) {
  const cls = isCanonical ? 'row canonical' : 'row dupe';
  const badge = isCanonical
    ? '<span class="badge keep">KEEP (rule)</span>'
    : `<button class="flip" data-group="${groupIdx}" data-id="${r.id}">flip to this</button>`;
  return `
    <div class="${cls}" data-group="${groupIdx}" data-id="${r.id}">
      <div class="row-header">
        <span class="id">#${r.id}</span>
        ${badge}
        <span class="meta">photos=${r._photos} · interactions=${r._interactions}</span>
      </div>
      <table>
        <tr><th>name</th><td><b>${esc(r.name)}</b></td></tr>
        <tr><th>neighborhood</th><td>${esc(r.neighborhood)}</td></tr>
        <tr><th>cuisine</th><td>${esc(r.cuisine)}</td></tr>
        <tr><th>price</th><td>${esc(r.price)}</td></tr>
        <tr><th>rating</th><td>${esc(r.rating)} (google: ${esc(r.google_rating)})</td></tr>
        <tr><th>description</th><td class="desc">${esc(r.description)}</td></tr>
        <tr><th>about</th><td class="desc">${esc(r.about)}</td></tr>
        <tr><th>vibe</th><td>${esc(r.vibe)}</td></tr>
        <tr><th>known_for</th><td>${esc(r.known_for)}</td></tr>
        <tr><th>tags</th><td>${esc(r.tags)}</td></tr>
        <tr><th>must_order</th><td>${esc(r.must_order)}</td></tr>
        <tr><th>best_for</th><td>${esc(r.best_for)}</td></tr>
      </table>
    </div>`;
}

(async () => {
  console.log('🔎 Loading …');
  const rows = await loadAllWithMeta();
  const byKey = new Map();
  for (const r of rows) {
    const k = coordKey(r);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  const groups = [];
  for (const [, list] of byKey) if (list.length > 1) groups.push(list);

  await enrichCounts(groups);
  groups.sort((a, b) => (a[0].city || '').localeCompare(b[0].city || '') || (a[0].name || '').localeCompare(b[0].name || ''));

  const bodyParts = groups.map((g, i) => {
    const canonical = pickCanonical(g);
    const sorted = [canonical, ...g.filter(r => r.id !== canonical.id)];
    return `
      <section class="group" id="g${i}">
        <h2>Group ${i + 1} · ${esc(canonical.city)} · ${esc(canonical.name)}</h2>
        <div class="rows">
          ${sorted.map(r => fmtRow(r, r.id === canonical.id, i)).join('')}
        </div>
      </section>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Dedupe inspector — ${groups.length} groups</title>
<style>
  * { box-sizing: border-box; }
  body { background: #0a0a0f; color: #f5f0eb; font-family: system-ui, sans-serif; padding: 24px; margin: 0; }
  h1 { margin: 0 0 8px; }
  p.lead { color: #999; margin: 0 0 24px; }
  #summary { position: sticky; top: 0; background: #0a0a0f; border-bottom: 1px solid #333; padding: 12px 0; margin-bottom: 24px; z-index: 10; display: flex; gap: 12px; align-items: center; }
  #summary button { background: #ff9632; color: #000; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-weight: 600; }
  section.group { margin-bottom: 32px; border-bottom: 1px solid #222; padding-bottom: 24px; }
  h2 { margin: 0 0 12px; font-size: 18px; color: #ff9632; }
  .rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
  .row { background: #16161d; border-radius: 10px; padding: 12px; border: 2px solid transparent; }
  .row.canonical { border-color: #3ea570; background: #14211a; }
  .row.dupe.override { border-color: #ff9632; background: #261c12; }
  .row-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .id { font-family: monospace; color: #999; }
  .badge { background: #3ea570; color: #000; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
  .badge.override { background: #ff9632; }
  button.flip { background: transparent; color: #ff9632; border: 1px solid #ff9632; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
  button.flip.active { background: #ff9632; color: #000; }
  .meta { color: #999; font-size: 12px; margin-left: auto; }
  table { width: 100%; font-size: 12px; border-collapse: collapse; }
  th { text-align: left; color: #888; font-weight: 400; width: 100px; padding: 2px 4px; vertical-align: top; }
  td { padding: 2px 4px; color: #f5f0eb; }
  td.desc { color: #ccc; line-height: 1.4; }
  .tag { background: #2a2a36; padding: 1px 5px; border-radius: 3px; font-size: 11px; margin: 1px; display: inline-block; }
  .null { color: #555; }
</style>
</head>
<body>
<div id="summary">
  <h1 style="margin:0;font-size:18px;">Dedupe inspector · ${groups.length} groups</h1>
  <span style="color:#999;">Green = rule's pick. Click "flip to this" on a dupe to override.</span>
  <span style="flex:1"></span>
  <span id="overrideCount">0 overrides</span>
  <button id="copyBtn">Copy overrides</button>
</div>
${bodyParts}
<script>
  const LS_KEY = 'cooked_dedupe_overrides_v1';
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
  function save(x) { localStorage.setItem(LS_KEY, JSON.stringify(x)); }
  let overrides = load();

  function applyUi() {
    // reset all
    document.querySelectorAll('.row').forEach(el => {
      el.classList.remove('override');
      const btn = el.querySelector('button.flip');
      if (btn) btn.classList.remove('active');
    });
    Object.entries(overrides).forEach(([grp, id]) => {
      const target = document.querySelector(\`.row.dupe[data-group="\${grp}"][data-id="\${id}"]\`);
      if (target) {
        target.classList.add('override');
        const btn = target.querySelector('button.flip');
        if (btn) btn.classList.add('active');
      }
    });
    document.getElementById('overrideCount').textContent = Object.keys(overrides).length + ' overrides';
  }

  document.querySelectorAll('button.flip').forEach(btn => {
    btn.addEventListener('click', () => {
      const grp = btn.dataset.group;
      const id = btn.dataset.id;
      if (overrides[grp] === id) delete overrides[grp];
      else overrides[grp] = id;
      save(overrides);
      applyUi();
    });
  });

  document.getElementById('copyBtn').addEventListener('click', async () => {
    const list = Object.values(overrides);
    if (!list.length) { alert('No overrides set yet. Click "flip to this" on rows where the rule picked wrong.'); return; }
    const text = list.join(',');
    await navigator.clipboard.writeText(text);
    alert('Copied ' + list.length + ' override IDs to clipboard:\\n\\n' + text + '\\n\\nPaste to Claude Code.');
  });

  applyUi();
</script>
</body></html>`;

  const out = '/tmp/cooked-dedupe-inspect.html';
  writeFileSync(out, html);
  console.log(`✅ Wrote ${out}`);
  console.log(`   Open it: open ${out}`);
  console.log(`   ${groups.length} groups · eyeball the green (rule's pick) per row.`);
})().catch(err => { console.error('❌', err); process.exit(1); });
