const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RESTAURANTS_PATH = path.join(__dirname, "../src/data/restaurants.js");
const PROGRESS_PATH = path.join(__dirname, "bake-coords-progress.json");
const DELAY_MS = 1100;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function geocode(restaurant) {
  const query = [restaurant.name, restaurant.neighborhood, restaurant.city].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": "CookedApp/1.0" } });
  const data = await res.json();
  if (data[0]?.lat) return { lat: parseFloat(parseFloat(data[0].lat).toFixed(6)), lng: parseFloat(parseFloat(data[0].lon).toFixed(6)) };
  const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(restaurant.name + ", " + restaurant.city)}&format=json&limit=1`;
  const res2 = await fetch(url2, { headers: { "User-Agent": "CookedApp/1.0" } });
  const data2 = await res2.json();
  if (data2[0]?.lat) return { lat: parseFloat(parseFloat(data2[0].lat).toFixed(6)), lng: parseFloat(parseFloat(data2[0].lon).toFixed(6)) };
  return null;
}

async function main() {
  console.log("Reading restaurants.js...");
  const content = fs.readFileSync(RESTAURANTS_PATH, "utf8");
  const lines = content.split("\n");
  const entryRegex = /^\{ id:(\d+),/;

  const toProcess = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(entryRegex);
    if (m && !lines[i].includes(", lat:")) toProcess.push(i);
  }

  console.log(`Already geocoded: ${lines.length - toProcess.length}`);
  console.log(`Need to geocode: ${toProcess.length}`);
  if (toProcess.length === 0) { console.log("Nothing to do!"); return; }
  console.log(`Estimated time: ~${Math.ceil((toProcess.length * DELAY_MS) / 60000)} minutes\n`);

  const rawContent = content
    .replace(/export const CITIES.*?;/s, "const CITIES = [];")
    .replace(/export const CITY_GROUPS.*?;/s, "const CITY_GROUPS = {};")
    .replace(/export const CITY_COORDS.*?;/s, "const CITY_COORDS = {};")
    .replace(/export const ARCHETYPES.*?;/s, "const ARCHETYPES = [];")
    .replace(/export const ALL_TAGS.*?;/s, "const ALL_TAGS = [];")
    .replace(/export const RESTAURANTS/s, "const RESTAURANTS");
  const sandbox = {
    Array, Object, Set, Number, String, Boolean, Math, JSON,
    parseInt, parseFloat, undefined, NaN, Infinity,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(rawContent, ctx);
  const byId = {};
  const arr = ctx.RESTAURANTS;
  if (!Array.isArray(arr)) throw new Error("RESTAURANTS is not an array");
  for (const r of arr) byId[r.id] = r;

  let progress = {};
  if (fs.existsSync(PROGRESS_PATH)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf8"));
    console.log(`Resuming from previous progress (${Object.keys(progress).length} cached)\n`);
  }

  let done = 0, failed = 0;

  for (const lineIdx of toProcess) {
    const id = parseInt(lines[lineIdx].match(entryRegex)[1]);
    const restaurant = byId[id];
    if (!restaurant) { failed++; continue; }

    if (progress[id] !== undefined) {
      if (progress[id]) lines[lineIdx] = lines[lineIdx].replace(/\},\s*$/, `, lat:${progress[id].lat}, lng:${progress[id].lng} },`);
      done++; continue;
    }

    try {
      const coords = await geocode(restaurant);
      if (coords) {
        progress[id] = coords;
        lines[lineIdx] = lines[lineIdx].replace(/\},\s*$/, `, lat:${coords.lat}, lng:${coords.lng} },`);
        done++;
      } else {
        progress[id] = null;
        failed++;
        console.log(`  No result: ${restaurant.name}, ${restaurant.city}`);
      }
    } catch (err) {
      failed++;
      console.error(`  Error for ${restaurant.name}:`, err.message);
    }

    if (done % 50 === 0 && done > 0) {
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
      fs.writeFileSync(RESTAURANTS_PATH, lines.join("\n"));
      console.log(`  Saved. ${done}/${toProcess.length} done (${failed} failed)`);
    } else if (done % 10 === 0 && done > 0) {
      process.stdout.write(`  ${done}/${toProcess.length}\n`);
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(RESTAURANTS_PATH, lines.join("\n"));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
  console.log(`\nDone! ${done} geocoded, ${failed} failed`);
}

main().catch(console.error);
