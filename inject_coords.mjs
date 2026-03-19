#!/usr/bin/env node
// inject_coords.mjs
// Run after prebake_coords.mjs: node inject_coords.mjs
// Reads _backups/coords_cache.json and patches lat/lng into restaurants.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');
const CACHE_PATH = path.join(__dirname, '_backups/coords_cache.json');

if (!fs.existsSync(CACHE_PATH)) {
  console.error('No cache found at', CACHE_PATH);
  console.error('Run prebake_coords.mjs first.');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
console.log(`Loaded ${Object.keys(cache).length} coords from cache`);

let src = fs.readFileSync(RESTAURANTS_PATH, 'utf8');

// Backup before modifying
fs.writeFileSync(RESTAURANTS_PATH + '.bak', src);
console.log('Backed up restaurants.js → restaurants.js.bak');

let patched = 0;
let alreadyHas = 0;

for (const [id, { lat, lng }] of Object.entries(cache)) {
  // Skip if this restaurant already has lat/lng
  // Check: find "id: 1234," then look ahead ~300 chars for "lat:"
  const alreadyCheck = new RegExp(`id:\\s*${id}\\s*,[\\s\\S]{0,300}lat:`);
  if (alreadyCheck.test(src)) {
    alreadyHas++;
    continue;
  }

  // Inject lat/lng immediately after "id: 1234,"
  const inject = new RegExp(`(id:\\s*${id}\\s*,)`);
  const newSrc = src.replace(inject, `$1 lat: ${lat}, lng: ${lng},`);
  
  if (newSrc !== src) {
    src = newSrc;
    patched++;
    if (patched % 200 === 0) {
      console.log(`Patched ${patched}...`);
    }
  }
}

fs.writeFileSync(RESTAURANTS_PATH, src);
console.log(`\nDone!`);
console.log(`  Patched: ${patched}`);
console.log(`  Already had coords: ${alreadyHas}`);
console.log(`\nrestaurants.js now has lat/lng for all restaurants.`);
console.log(`\nFinal step: update Discover.jsx map section to use r.lat/r.lng.`);
