#!/usr/bin/env node
// ============================================================
// bake_photos.cjs  —  run from project root:
//   node bake_photos.cjs ~/Downloads/cooked_photos.json
//
// Takes the cooked_photos.json downloaded from the app and
// permanently writes the Google Places photo URLs into
// restaurants.js so they survive any localStorage wipe.
// ============================================================
const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node bake_photos.cjs ~/Downloads/cooked_photos.json");
  process.exit(1);
}

const photoMap = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const ids = Object.keys(photoMap);
console.log(`📸 Photo map loaded: ${ids.length} entries`);

const RESTAURANTS_PATH = path.join(__dirname, "src/data/restaurants.js");
let src = fs.readFileSync(RESTAURANTS_PATH, "utf8");
const originalLen = src.length;

let updated = 0;
for (const id of ids) {
  const { img, img2 } = photoMap[id];
  if (!img) continue;

  // Match the restaurant object by id and replace its img/img2 fields
  // Pattern: img:"...", img2:"..."  within an object containing id:NNNN
  const idPattern = new RegExp(
    `(\\{ id:${id},[^}]*?)img:"[^"]*", img2:"[^"]*"`,
    "g"
  );
  const before = src;
  src = src.replace(idPattern, `$1img:"${img}", img2:"${img2}"`);
  if (src !== before) updated++;
}

fs.writeFileSync(RESTAURANTS_PATH, src, "utf8");
console.log(`✅ Baked ${updated} photo URLs into restaurants.js`);
console.log(`   File size: ${originalLen.toLocaleString()} → ${src.length.toLocaleString()} bytes`);
console.log(`\n💡 Restart your dev server to see the changes.`);
