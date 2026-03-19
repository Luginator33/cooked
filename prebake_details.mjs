#!/usr/bin/env node
// prebake_details.mjs
// Fetches Google Place Details for all restaurants using Places API (New)
// Same API endpoints already working in the app

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GOOGLE_KEY = process.env.VITE_GOOGLE_PLACES_KEY || process.argv[2];
if (!GOOGLE_KEY) {
  console.error('Usage: VITE_GOOGLE_PLACES_KEY=your_key node prebake_details.mjs');
  process.exit(1);
}

const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');
const CACHE_PATH = path.join(__dirname, '_backups/details_cache.json');

// Load existing cache
let cache = {};
if (fs.existsSync(CACHE_PATH)) {
  cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const good = Object.values(cache).filter(v => !v.failed).length;
  console.log(`Resuming — ${good} cached, ${Object.keys(cache).length} total`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPlaceDetails(name, neighborhood, city, lat, lng) {
  try {
    const body = {
      textQuery: `${name} ${neighborhood || ''} ${city}`,
      maxResultCount: 1,
    };

    if (lat && lng) {
      body.locationBias = {
        circle: { center: { latitude: parseFloat(lat), longitude: parseFloat(lng) }, radius: 500 }
      };
    }

    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.priceLevel,places.rating,places.userRatingCount,places.googleMapsUri',
      },
      body: JSON.stringify(body),
    });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.error(`API error ${searchRes.status}: ${err.slice(0, 150)}`);
      return null;
    }

    const data = await searchRes.json();
    const place = data.places?.[0];
    if (!place) return null;

    return {
      placeId: place.id || '',
      address: place.formattedAddress || '',
      phone: place.nationalPhoneNumber || '',
      website: place.websiteUri || '',
      googleMapsUrl: place.googleMapsUri || '',
      googleRating: place.rating || null,
      googleReviews: place.userRatingCount || null,
      priceLevel: place.priceLevel || null,
      hours: place.regularOpeningHours?.weekdayDescriptions || [],
    };
  } catch (e) {
    console.error(`Fetch error for ${name}:`, e.message);
    return null;
  }
}

async function main() {
  const src = fs.readFileSync(RESTAURANTS_PATH, 'utf8');

  const pattern = /\{[^{}]*id:\s*(\d+)[^{}]*\}/gs;
  const restaurants = [];
  let m;

  while ((m = pattern.exec(src)) !== null) {
    const obj = m[0];
    const idM = /id:\s*(\d+)/.exec(obj);
    const nameM = /name:\s*["'`]([^"'`]+)["'`]/.exec(obj);
    const cityM = /city:\s*["'`]([^"'`]+)["'`]/.exec(obj);
    const nbM = /neighborhood:\s*["'`]([^"'`]*)["'`]/.exec(obj);
    const latM = /lat:\s*([-\d.]+)/.exec(obj);
    const lngM = /lng:\s*([-\d.]+)/.exec(obj);
    const hasPlaceId = /placeId:\s*["']/.test(obj);

    if (!idM || !nameM || !cityM) continue;
    if (hasPlaceId) continue;

    restaurants.push({
      id: idM[1],
      name: nameM[1],
      city: cityM[1],
      neighborhood: nbM?.[1] || '',
      lat: latM?.[1] || '',
      lng: lngM?.[1] || '',
    });
  }

  console.log(`Found ${restaurants.length} restaurants needing details`);

  // Test API first
  console.log(`\nTesting API...`);
  const test = restaurants[0];
  const testResult = await fetchPlaceDetails(test.name, test.neighborhood, test.city, test.lat, test.lng);
  if (!testResult) {
    console.error(`API test failed. Check your key and that Places API (New) is enabled at console.cloud.google.com`);
    process.exit(1);
  }
  console.log(`✓ API working! ${test.name} → ${testResult.address}`);
  cache[test.id] = testResult;

  let fetched = 1;
  let failed = 0;

  for (let i = 1; i < restaurants.length; i++) {
    const r = restaurants[i];

    if (cache[r.id] && !cache[r.id].failed) continue;

    const details = await fetchPlaceDetails(r.name, r.neighborhood, r.city, r.lat, r.lng);

    if (details) {
      cache[r.id] = details;
      fetched++;
      process.stdout.write(`✓ [${r.id}] ${r.name}\n`);
    } else {
      failed++;
      cache[r.id] = { failed: true };
      process.stdout.write(`✗ [${r.id}] ${r.name}\n`);
    }

    if ((fetched + failed) % 100 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`--- Checkpoint: ${fetched} ok, ${failed} failed ---`);
    }

    await sleep(120);
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`\nDone! Fetched: ${fetched}, Failed: ${failed}`);
  console.log(`Now injecting into restaurants.js...`);

  let updatedSrc = src;
  let patched = 0;

  for (const [id, details] of Object.entries(cache)) {
    if (details.failed || !details.placeId) continue;

    const alreadyCheck = new RegExp(`id:\\s*${id}\\s*,[\\s\\S]{0,100}placeId:`);
    if (alreadyCheck.test(updatedSrc)) continue;

    const hoursStr = details.hours?.length
      ? ` hours: ${JSON.stringify(details.hours)},` : '';

    const parts = [
      details.placeId ? ` placeId: "${details.placeId}",` : '',
      details.address ? ` address: "${details.address.replace(/"/g, '\\"')}",` : '',
      details.phone ? ` phone: "${details.phone}",` : '',
      details.website ? ` website: "${details.website}",` : '',
      details.googleMapsUrl ? ` googleMapsUrl: "${details.googleMapsUrl}",` : '',
      details.googleRating ? ` googleRating: ${details.googleRating},` : '',
      details.googleReviews ? ` googleReviews: ${details.googleReviews},` : '',
      hoursStr,
    ].filter(Boolean).join('');

    if (!parts) continue;

    const inject = new RegExp(`(id:\\s*${id}\\s*,)`);
    const newSrc = updatedSrc.replace(inject, `$1${parts}`);
    if (newSrc !== updatedSrc) {
      updatedSrc = newSrc;
      patched++;
    }
  }

  fs.writeFileSync(RESTAURANTS_PATH + '.bak3', src);
  fs.writeFileSync(RESTAURANTS_PATH, updatedSrc);
  console.log(`Injected details for ${patched} restaurants into restaurants.js`);
  console.log(`All done!`);
}

main().catch(console.error);
