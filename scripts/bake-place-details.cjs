const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RESTAURANTS_PATH = path.join(__dirname, "../src/data/restaurants.js");
const PROGRESS_PATH = path.join(__dirname, "bake-place-details-progress.json");
const DELAY_MS = 200;

function getApiKey() {
  if (process.env.VITE_GOOGLE_PLACES_KEY) return process.env.VITE_GOOGLE_PLACES_KEY;
  const envPath = path.join(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    const match = env.match(/VITE_GOOGLE_PLACES_KEY=(.+)/);
    if (match) return match[1].trim();
  }
  return null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchPlaceDetails(restaurant, apiKey) {
  const query = `${restaurant.name} ${restaurant.neighborhood || ""} ${restaurant.city}`.trim();
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.formattedAddress,places.regularOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount" },
    body: JSON.stringify({ textQuery: query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;
  const pd = {};
  if (place.formattedAddress) pd.address = place.formattedAddress;
  if (place.internationalPhoneNumber) pd.phone = place.internationalPhoneNumber;
  if (place.websiteUri) pd.website = place.websiteUri;
  if (place.rating) pd.googleRating = place.rating;
  if (place.userRatingCount) pd.ratingCount = place.userRatingCount;
  if (place.regularOpeningHours?.weekdayDescriptions) pd.hours = place.regularOpeningHours.weekdayDescriptions;
  return Object.keys(pd).length ? pd : null;
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) { console.error("No API key found in .env.local"); process.exit(1); }

  console.log("Reading restaurants.js...");
  const content = fs.readFileSync(RESTAURANTS_PATH, "utf8");
  const lines = content.split("\n");
  const entryRegex = /^\{ id:(\d+),/;

  const toProcess = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(entryRegex);
    if (m && !lines[i].includes("placeData:")) toProcess.push(i);
  }

  console.log(`Already have placeData: ${lines.filter(l => l.includes("placeData:")).length}`);
  console.log(`Need to fetch: ${toProcess.length}`);
  if (toProcess.length === 0) { console.log("Nothing to do!"); return; }
  console.log(`Estimated time: ~${Math.ceil((toProcess.length * DELAY_MS) / 60000)} minutes`);
  console.log(`Estimated cost: ~$${(toProcess.length * 0.017).toFixed(2)}\n`);

  const rawContent = content
    .replace(/export const CITIES.*?;/s, "const CITIES = [];")
    .replace(/export const CITY_GROUPS.*?;/s, "const CITY_GROUPS = {};")
    .replace(/export const CITY_COORDS.*?;/s, "const CITY_COORDS = {};")
    .replace(/export const ARCHETYPES.*?;/s, "const ARCHETYPES = [];")
    .replace(/export const ALL_TAGS.*?;/s, "const ALL_TAGS = [];")
    .replace(/export const RESTAURANTS/s, "const RESTAURANTS");
  const ctx = {};
  vm.runInNewContext(rawContent, ctx);
  const byId = {};
  for (const r of ctx.RESTAURANTS) byId[r.id] = r;

  let progress = {};
  if (fs.existsSync(PROGRESS_PATH)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"));
    console.log(`Resuming from previous progress (${Object.keys(progress).length} cached)\n`);
  }

  let done = 0, failed = 0, notFound = 0;

  for (const lineIdx of toProcess) {
    const id = parseInt(lines[lineIdx].match(entryRegex)[1]);
    const restaurant = byId[id];
    if (!restaurant) { failed++; continue; }

    if (progress[id] !== undefined) {
      if (progress[id]) lines[lineIdx] = lines[lineIdx].replace(/\},\s*$/, `, placeData:${JSON.stringify(progress[id])} },`);
      done++; continue;
    }

    try {
      const pd = await fetchPlaceDetails(restaurant, apiKey);
      if (pd) {
        progress[id] = pd;
        lines[lineIdx] = lines[lineIdx].replace(/\},\s*$/, `, placeData:${JSON.stringify(pd)} },`);
      } else {
        progress[id] = null;
        notFound++;
      }
      done++;
    } catch (err) {
      failed++;
      console.error(`  Error: ${restaurant.name}: ${err.message}`);
      if (err.message.includes("429")) { console.log("Rate limited — waiting 30s..."); await sleep(30000); }
    }

    if (done % 50 === 0 && done > 0) {
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
      fs.writeFileSync(RESTAURANTS_PATH, lines.join("\n"));
      console.log(`  Saved. ${done}/${toProcess.length} done (${notFound} not found, ${failed} errors)`);
    } else if (done % 10 === 0 && done > 0) {
      process.stdout.write(`  ${done}/${toProcess.length}\n`);
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(RESTAURANTS_PATH, lines.join("\n"));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
  console.log(`\nDone! ${done} processed, ${notFound} not found, ${failed} errors`);
}

main().catch(console.error);
