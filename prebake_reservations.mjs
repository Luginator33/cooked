#!/usr/bin/env node
// prebake_reservations.mjs
// Detects reservation platform (Resy, OpenTable, Tock, SevenRooms) for each restaurant
// by checking their website and Google Maps data already in restaurants.js
// Then injects resyUrl / openTableUrl / tockUrl / reservationUrl into restaurants.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GOOGLE_KEY = process.env.VITE_GOOGLE_PLACES_KEY || process.argv[2];

const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');
const CACHE_PATH = path.join(__dirname, '_backups/reservations_cache.json');

// Load existing cache
let cache = {};
if (fs.existsSync(CACHE_PATH)) {
  cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const done = Object.keys(cache).length;
  console.log(`Resuming — ${done} already checked`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Detect reservation platform from website URL
function detectFromWebsite(website) {
  if (!website) return null;
  const w = website.toLowerCase();
  if (w.includes('resy.com')) return { platform: 'resy', url: website };
  if (w.includes('opentable.com')) return { platform: 'opentable', url: website };
  if (w.includes('tock.com')) return { platform: 'tock', url: website };
  if (w.includes('sevenrooms.com')) return { platform: 'sevenrooms', url: website };
  if (w.includes('exploretock.com')) return { platform: 'tock', url: website };
  return null;
}

// Search for restaurant on Resy and OpenTable via Google
async function searchReservationLinks(name, city, googleKey) {
  if (!googleKey) return null;
  
  try {
    // Search Google Places for reservation links
    const query = encodeURIComponent(`${name} ${city} reservation resy OR opentable OR tock`);
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${googleKey}`, {
    });
    // We can't easily get reservation URLs from Maps API alone
    // Better approach: construct Resy/OT search URLs
    return null;
  } catch(e) {
    return null;
  }
}

// Build Resy search URL for a restaurant
function resySearchUrl(name, city) {
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const citySlug = city.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
  return `https://resy.com/cities/${citySlug}?query=${encodeURIComponent(name)}`;
}

// Build OpenTable search URL
function openTableSearchUrl(name, city) {
  return `https://www.opentable.com/s?query=${encodeURIComponent(name + ' ' + city)}`;
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
    const websiteM = /website:\s*["'`]([^"'`]*)["'`]/.exec(obj);
    const placeIdM = /placeId:\s*["'`]([^"'`]*)["'`]/.exec(obj);
    const hasRes = /resyUrl:|openTableUrl:|tockUrl:/.test(obj);
    const isBar = /isBar:\s*true/.test(obj);

    if (!idM || !nameM || !cityM) continue;
    if (hasRes) continue; // already done

    restaurants.push({
      id: idM[1],
      name: nameM[1],
      city: cityM[1],
      website: websiteM?.[1] || '',
      placeId: placeIdM?.[1] || '',
      isBar,
    });
  }

  console.log(`Found ${restaurants.length} restaurants to check`);

  let processed = 0;
  let hasReservations = 0;

  for (const r of restaurants) {
    if (cache[r.id] !== undefined) continue;

    // Check website for known platforms
    const fromWebsite = detectFromWebsite(r.website);
    
    if (fromWebsite) {
      cache[r.id] = fromWebsite;
      hasReservations++;
      process.stdout.write(`✓ [${r.id}] ${r.name} → ${fromWebsite.platform}\n`);
    } else {
      // No direct platform detected — store null so we skip next time
      cache[r.id] = null;
      process.stdout.write(`- [${r.id}] ${r.name}\n`);
    }

    processed++;

    if (processed % 200 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`--- Checkpoint: ${processed} processed, ${hasReservations} with reservations ---`);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`\nDone! ${hasReservations} restaurants have direct reservation links`);
  console.log(`For the rest, we'll show Resy/OpenTable search links`);
  console.log(`\nInjecting into restaurants.js...`);

  // Now search Resy/OT for restaurants without direct links
  // using Google Places API to check if they have reservation links
  if (GOOGLE_KEY) {
    console.log(`Checking Google Places for reservation links...`);
    let gFetched = 0;
    
    for (const r of restaurants) {
      if (cache[r.id] && cache[r.id] !== null) continue; // already has direct link
      if (cache[r.id] === null && gFetched > 100) continue; // limit API calls
      
      try {
        // Use Places API to get reservations URL if available
        if (r.placeId) {
          const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_KEY,
              'X-Goog-FieldMask': 'places.id,places.reservable,places.websiteUri',
            },
            body: JSON.stringify({ textQuery: `${r.name} ${r.city}`, maxResultCount: 1 }),
          });
          const data = await res.json();
          const place = data.places?.[0];
          if (place?.reservable && place.websiteUri) {
            const detected = detectFromWebsite(place.websiteUri);
            if (detected) {
              cache[r.id] = detected;
              hasReservations++;
              process.stdout.write(`✓ [${r.id}] ${r.name} → ${detected.platform} (Google)\n`);
            }
          }
          gFetched++;
          await sleep(110);
        }
      } catch(e) {}
    }
  }

  // Inject into restaurants.js
  let updatedSrc = src;
  let patched = 0;

  for (const [id, resData] of Object.entries(cache)) {
    if (!resData) continue;

    const alreadyCheck = new RegExp(`id:\\s*${id}\\s*,[\\s\\S]{0,100}resyUrl:`);
    if (alreadyCheck.test(updatedSrc)) continue;

    let injection = '';
    if (resData.platform === 'resy') {
      injection = ` resyUrl: "${resData.url}",`;
    } else if (resData.platform === 'opentable') {
      injection = ` openTableUrl: "${resData.url}",`;
    } else if (resData.platform === 'tock') {
      injection = ` tockUrl: "${resData.url}",`;
    } else if (resData.platform === 'sevenrooms') {
      injection = ` sevenRoomsUrl: "${resData.url}",`;
    }

    if (!injection) continue;

    const inject = new RegExp(`(id:\\s*${id}\\s*,)`);
    const newSrc = updatedSrc.replace(inject, `$1${injection}`);
    if (newSrc !== updatedSrc) {
      updatedSrc = newSrc;
      patched++;
    }
  }

  fs.writeFileSync(RESTAURANTS_PATH + '.bak4', src);
  fs.writeFileSync(RESTAURANTS_PATH, updatedSrc);
  console.log(`\nInjected reservation links for ${patched} restaurants`);
  console.log(`All done! Restart npm run dev.`);
}

main().catch(console.error);
