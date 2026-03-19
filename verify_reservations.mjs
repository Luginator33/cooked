#!/usr/bin/env node
// verify_reservations.mjs
// Checks each restaurant against Resy and OpenTable by fetching the URL
// and seeing if it 404s or not. Saves results to _backups/reservations_verified.json
// Then injects resyUrl / openTableUrl into restaurants.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');
const CACHE_PATH = path.join(__dirname, '_backups/reservations_verified.json');

// Load existing cache
let cache = {};
if (fs.existsSync(CACHE_PATH)) {
  cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  console.log(`Resuming — ${Object.keys(cache).length} already checked`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const RESY_CITY_CODES = {
  "Los Angeles": "la", "New York": "nyc", "Chicago": "chi",
  "San Francisco": "sf", "Miami": "miami", "Austin": "austin",
  "Nashville": "nashville", "Dallas": "dallas", "San Diego": "sandiego",
  "Portland": "portland", "London": "london", "Paris": "paris",
  "Barcelona": "barcelona", "Tokyo": "tokyo", "Copenhagen": "copenhagen",
  "Seoul": "seoul", "Dubai": "dubai", "Lisbon": "lisbon",
  "Mexico City": "mexico-city",
};

function makeSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });
    return res.status < 400;
  } catch(e) {
    return false;
  }
}

async function main() {
  const src = fs.readFileSync(RESTAURANTS_PATH, 'utf8');

  // Extract restaurants
  const pattern = /\{[^{}]*id:\s*(\d+)[^{}]*\}/gs;
  const restaurants = [];
  let m;

  while ((m = pattern.exec(src)) !== null) {
    const obj = m[0];
    const idM = /id:\s*(\d+)/.exec(obj);
    const nameM = /name:\s*["'`]([^"'`]+)["'`]/.exec(obj);
    const cityM = /city:\s*["'`]([^"'`]+)["'`]/.exec(obj);
    const isBar = /isBar:\s*true/.test(obj);

    if (!idM || !nameM || !cityM) continue;
    if (isBar) continue; // skip bars
    if (!RESY_CITY_CODES[cityM[1]]) continue; // skip cities not on Resy

    restaurants.push({ id: idM[1], name: nameM[1], city: cityM[1] });
  }

  console.log(`Checking ${restaurants.length} restaurants (non-bars in supported cities)...`);

  let checked = 0;
  let hasResy = 0;
  let hasOT = 0;

  for (const r of restaurants) {
    if (cache[r.id] !== undefined) continue;

    const slug = makeSlug(r.name);
    const cityCode = RESY_CITY_CODES[r.city];
    const resyUrl = `https://resy.com/cities/${cityCode}/venues/${slug}`;
    const otUrl = `https://www.opentable.com/${slug}`;

    const [resyOk, otOk] = await Promise.all([
      checkUrl(resyUrl),
      checkUrl(otUrl),
    ]);

    cache[r.id] = {
      resy: resyOk ? resyUrl : null,
      openTable: otOk ? otUrl : null,
    };

    checked++;
    if (resyOk) hasResy++;
    if (otOk) hasOT++;

    const status = [resyOk ? '✓Resy' : '✗Resy', otOk ? '✓OT' : '✗OT'].join(' ');
    process.stdout.write(`${status} [${r.id}] ${r.name}\n`);

    if (checked % 100 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`--- Checkpoint: ${checked} checked, ${hasResy} Resy, ${hasOT} OT ---`);
    }

    await sleep(200); // be gentle with their servers
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`\nDone! Checked: ${checked}, On Resy: ${hasResy}, On OpenTable: ${hasOT}`);
  console.log(`\nInjecting into restaurants.js...`);

  // Inject verified URLs
  let updatedSrc = src;
  let patched = 0;

  for (const [id, data] of Object.entries(cache)) {
    if (!data.resy && !data.openTable) continue;

    // Skip if already has these fields
    const alreadyCheck = new RegExp(`id:\\s*${id}\\s*,[\\s\\S]{0,150}(resyUrl:|openTableUrl:)`);
    if (alreadyCheck.test(updatedSrc)) continue;

    const parts = [
      data.resy ? ` resyUrl: "${data.resy}",` : '',
      data.openTable ? ` openTableUrl: "${data.openTable}",` : '',
    ].filter(Boolean).join('');

    if (!parts) continue;

    const inject = new RegExp(`(id:\\s*${id}\\s*,)`);
    const newSrc = updatedSrc.replace(inject, `$1${parts}`);
    if (newSrc !== updatedSrc) {
      updatedSrc = newSrc;
      patched++;
    }
  }

  fs.writeFileSync(RESTAURANTS_PATH + '.bak5', src);
  fs.writeFileSync(RESTAURANTS_PATH, updatedSrc);
  console.log(`Injected reservation URLs for ${patched} restaurants.`);
  console.log(`All done!`);
}

main().catch(console.error);
