#!/usr/bin/env node
/**
 * probe-place-photos.mjs
 * ======================
 *
 * Diagnostic: for each place_id passed in, call the Google Places v1 API
 * two ways (fields query param AND FieldMask header) and dump the raw
 * response so we can see exactly why the backfill gets "no photos" back.
 *
 * Usage:
 *   GOOGLE_PLACES_KEY=xxxx node scripts/probe-place-photos.mjs \
 *     ChIJPc5_YrssDogRv52SdUZKBwc \
 *     ChIJWVBAAP4PdkgRu5dzwSX4vq8
 */

import dotenv from 'dotenv';
import process from 'node:process';
import { argv } from 'node:process';

dotenv.config();
dotenv.config({ path: '.env.local' });

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY || process.env.VITE_GOOGLE_PLACES_KEY;
if (!GOOGLE_PLACES_KEY) {
  console.error('❌ GOOGLE_PLACES_KEY required');
  process.exit(1);
}

const placeIds = argv.slice(2);
if (placeIds.length === 0) {
  console.error('❌ pass at least one place_id');
  process.exit(1);
}

async function probe(placeId) {
  console.log(`\n==== ${placeId} ====`);

  // Method A — current script: ?fields=photos
  try {
    const urlA = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=photos`;
    const rA = await fetch(urlA, { headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY } });
    const bodyA = await rA.text();
    console.log(`A [?fields=photos]   status=${rA.status}  body=${bodyA.slice(0, 400)}`);
  } catch (e) { console.log(`A failed: ${e.message}`); }

  // Method B — FieldMask header
  try {
    const urlB = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const rB = await fetch(urlB, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': 'photos',
      },
    });
    const bodyB = await rB.text();
    console.log(`B [X-Goog-FieldMask] status=${rB.status}  body=${bodyB.slice(0, 400)}`);
  } catch (e) { console.log(`B failed: ${e.message}`); }

  // Method C — wildcard field mask to see the whole place
  try {
    const urlC = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const rC = await fetch(urlC, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,photos',
      },
    });
    const bodyC = await rC.text();
    console.log(`C [id+name+photos]   status=${rC.status}  body=${bodyC.slice(0, 600)}`);
  } catch (e) { console.log(`C failed: ${e.message}`); }
}

for (const id of placeIds) {
  await probe(id);
}
