const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RESTAURANTS_PATH = path.join(__dirname, "../src/data/restaurants.js");

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

async function geocode(restaurant) {
  const query = [restaurant.name, restaurant.neighborhood, restaurant.city].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": "CookedApp/1.0" } });
  const data = await res.json();
  if (data[0]?.lat) return { lat: parseFloat(parseFloat(data[0].lat).toFixed(6)), lng: parseFloat(parseFloat(data[0].lon).toFixed(6)) };
  return null;
}

async function fetchPlaceDetails(restaurant, apiKey) {
  const query = `${restaurant.name} ${restaurant.neighborhood || ""} ${restaurant.city}`.trim();
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.formattedAddress,places.regularOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount" },
    body: JSON.stringify({ textQuery: query }),
  });
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
  console.log("Reading restaurants.js...");
  const content = fs.readFileSync(RESTAURANTS_PATH, "utf8");
  const lines = content.split("\n");
  const entryRegex = /^\{ id:(\d+),/;

  const needsCoords = [], needsDetails = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(entryRegex);
    if (!m) continue;
    if (!lines[i].includes(", lat:")) needsCoords.push(i);
    if (!lines[i].includes("placeData:")) needsDetails.push(i);
  }

  console.log(`Missing coords: ${needsCoords.length}`);
  console.log(`Missing placeData: ${needsDetails.length}`);
  if (needsCoords.length === 0 && needsDetails.length === 0) { console.log("All entries already baked!"); return; }

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

  if (needsCoords.length > 0) {
    console.log(`\nGeocoding ${needsCoords.length} entries via Nominatim (free)...`);
    for (const lineIdx of needsCoords) {
      const id = parseInt(lines[lineIdx].match(entryRegex)[1]);
      const r = byId[id]; if (!r) continue;
      const coords = await geocode(r);
      if (coords) {
        lines[lineIdx] = lines[lineIdx].replace(/\},\s*$/, `, lat:${coords.lat}, lng:${coords.lng} },`);
        console.log(`  coords: ${r.name}`);
      } else {
        console.log(`  no result: ${r.name}`);
      }
      await sleep(1100);
    }
  }

  if (needsDetails.length > 0 && apiKey) {
    console.log(`\nFetching place details for ${needsDetails.length} entries (~$${(needsDetails.length * 0.017).toFixed(2)})...`);
    for (const lineIdx of needsDetails) {
      const id = parseInt(lines[lineIdx].match(entryRegex)[1]);
      const r = byId[id]; if (!r) continue;
      try {
        const pd = await fetchPlaceDetails(r, apiKey);
        if (pd) {
          lines[lineIdx] = lines[lineIdx].replace(/\},\s*$/, `, placeData:${JSON.stringify(pd)} },`);
          console.log(`  details: ${r.name}`);
        } else {
          console.log(`  not found: ${r.name}`);
        }
      } catch (e) {
        console.log(`  error: ${r.name}: ${e.message}`);
      }
      await sleep(200);
    }
  } else if (needsDetails.length > 0 && !apiKey) {
    console.log("\nSkipping placeData — no API key found in .env.local");
  }

  fs.writeFileSync(RESTAURANTS_PATH, lines.join("\n"));
  console.log("\nDone! restaurants.js updated.");
}

main().catch(console.error);
