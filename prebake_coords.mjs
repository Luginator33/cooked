#!/usr/bin/env node
// prebake_coords.mjs
// Run once: node prebake_coords.mjs YOUR_GOOGLE_KEY
// Geocodes all restaurants and saves coords to _backups/coords_cache.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GOOGLE_KEY = process.env.VITE_GOOGLE_PLACES_KEY || process.argv[2];
if (!GOOGLE_KEY) {
  console.error('Usage: node prebake_coords.mjs YOUR_GOOGLE_KEY');
  console.error('Or:    VITE_GOOGLE_PLACES_KEY=your_key node prebake_coords.mjs');
  process.exit(1);
}

const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');
const CACHE_PATH = path.join(__dirname, '_backups/coords_cache.json');

// Load existing cache so we can resume if interrupted
let cache = {};
if (fs.existsSync(CACHE_PATH)) {
  cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  console.log(`Resuming — loaded ${Object.keys(cache).length} cached coords`);
}

async function geocode(name, neighborhood, city) {
  const q = encodeURIComponent(`${name} ${neighborhood || ''} ${city}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.results?.[0]?.geometry?.location) {
    return data.results[0].geometry.location;
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const src = fs.readFileSync(RESTAURANTS_PATH, 'utf8');

  // Extract id, name, neighborhood, city from each restaurant object using regex
  const pattern = /\{\s*id:\s*(\d+)\s*,\s*name:\s*["'`]([^"'`]+)["'`][^}]*?city:\s*["'`]([^"'`]+)["'`]/gs;
  const neighborhoodPattern = /neighborhood:\s*["'`]([^"'`]*)["'`]/;
  
  const restaurants = [];
  let m;
  while ((m = pattern.exec(src)) !== null) {
    const id = m[1];
    const name = m[2];
    const city = m[3];
    // Try to get neighborhood from the same block
    const block = src.slice(Math.max(0, m.index - 50), m.index + 400);
    const nbMatch = block.match(neighborhoodPattern);
    const neighborhood = nbMatch ? nbMatch[1] : '';
    restaurants.push({ id, name, neighborhood, city });
  }

  console.log(`Found ${restaurants.length} restaurants in restaurants.js`);
  
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of restaurants) {
    if (cache[r.id]) {
      skipped++;
      continue;
    }

    const loc = await geocode(r.name, r.neighborhood, r.city);
    if (loc) {
      cache[r.id] = { lat: loc.lat, lng: loc.lng };
      fetched++;
      process.stdout.write(`✓ [${r.id}] ${r.name} (${r.city}): ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}\n`);
    } else {
      failed++;
      console.warn(`✗ Could not geocode: ${r.name} (${r.city})`);
    }

    // Save cache every 50 fetches so we can resume if interrupted
    if (fetched > 0 && fetched % 50 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`--- Saved cache (${fetched} fetched so far) ---`);
    }

    await sleep(110); // ~9 req/sec, well under quota
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`\nDone! Fetched: ${fetched}, Skipped (cached): ${skipped}, Failed: ${failed}`);
  console.log(`Cache saved to ${CACHE_PATH}`);
  console.log(`\nNow run: node inject_coords.mjs`);
}

main().catch(console.error);
