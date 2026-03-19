#!/usr/bin/env node
// fix_cities.mjs
// Fixes incorrect city tags and geotags in restaurants.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');

const GOOGLE_KEY = process.env.VITE_GOOGLE_PLACES_KEY || process.argv[2];

let src = fs.readFileSync(RESTAURANTS_PATH, 'utf8');
fs.writeFileSync(RESTAURANTS_PATH + '.bak2', src);
console.log('Backed up restaurants.js → restaurants.js.bak2');

// ─── CITY FIXES ───────────────────────────────────────────────────────────────
const cityFixes = [
  { name: "Experimental Cocktail Club", city: "London" },
  { name: "Joe's Shanghai", city: "New York" },
  { name: "Sunn's", city: "New York" },
  { name: "169 Bar", city: "New York" },
  { name: "Noodle & Beer Chinatown", city: "London" },
  { name: "Tei-An", city: "Dallas" },
  { name: "Mister Jiu's", city: "San Francisco" },
  { name: "Arnold's Country Kitchen", city: "Nashville" },
  { name: "The Patterson House", city: "Nashville" },
  { name: "Noble Experiment", city: "San Diego" },
  { name: "Baby Bistro", city: "Los Angeles" },
  { name: "Lock & Key", city: "Los Angeles" },
  { name: "Sushi Sonagi", city: "Los Angeles" },
  { name: "The Prince", city: "Los Angeles" },
  { name: "R Bar", city: "Los Angeles" },
  { name: "Decibel Sound & Drink", city: "Los Angeles" },
  { name: "Park's BBQ", city: "Los Angeles" },
  { name: "HanEuem", city: "Los Angeles" },
  { name: "Anju House", city: "Los Angeles" },
  { name: "Double D's", city: "Dallas" },
  { name: "The Sylvester", city: "Miami" },
  { name: "Taikun Sushi", city: "New York" },
  { name: "Mēdūza Mediterrania", city: "New York" },
  { name: "The Skylark", city: "New York" },
  { name: "FUHU", city: "New York" },
  { name: "Jimmy's Corner", city: "New York" },
  { name: "Valerie", city: "New York" },
  { name: "Don Antonio", city: "New York" },
  { name: "The Grill's Bar Room", city: "New York" },
  { name: "Monkey Bar", city: "New York" },
  { name: "The Polo Bar", city: "New York" },
  { name: "Gnocchi on 9th", city: "New York" },
  { name: "The Lobby Bar at Hotel Chelsea", city: "New York" },
  { name: "The Eighth", city: "New York" },
  { name: "Raines Law Room", city: "New York" },
  { name: "Clemente Bar", city: "New York" },
  { name: "Shuka", city: "New York" },
  { name: "Sadelle's New York", city: "New York" },
  { name: "Blue Ribbon Brasserie", city: "New York" },
  { name: "Lupe's East L.A. Kitchen", city: "New York" },
  { name: "Cafe Select", city: "New York" },
  { name: "La Mercerie", city: "New York" },
];

// ─── GEOTAG FIXES ─────────────────────────────────────────────────────────────
// Correct coordinates fetched manually
const geoFixes = [
  // Apothéke LA — the LA location on Cahuenga Blvd
  { name: "Apothéke", city: "Los Angeles", lat: 34.1016, lng: -118.3347 },
  // Ko — 8 Extra Place, NYC
  { name: "Ko", city: "New York", lat: 40.7265, lng: -73.9933 },
  // Al's Place — Valencia St, San Francisco
  { name: "Al's Place", city: "San Francisco", lat: 37.7537, lng: -122.4213 },
];

let cityFixed = 0;
let geoFixed = 0;

// Fix cities
for (const fix of cityFixes) {
  // Find the restaurant block by name and fix its city field
  // Pattern: name: "Fix Name", ... city: "WrongCity"
  // We need to find the name, then find the city field within the same object
  
  const escapedName = fix.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Find position of this restaurant's name
  const nameRegex = new RegExp(`name:\\s*["'\`]${escapedName}["'\`]`);
  const nameMatch = nameRegex.exec(src);
  
  if (!nameMatch) {
    console.warn(`⚠ Not found: ${fix.name}`);
    continue;
  }
  
  // Find the city field after this name (within next 500 chars)
  const afterName = src.slice(nameMatch.index, nameMatch.index + 600);
  const cityRegex = /city:\s*["'`]([^"'`]+)["'`]/;
  const cityMatch = cityRegex.exec(afterName);
  
  if (!cityMatch) {
    console.warn(`⚠ No city field found near: ${fix.name}`);
    continue;
  }
  
  const oldCity = cityMatch[1];
  if (oldCity === fix.city) {
    console.log(`✓ Already correct: ${fix.name} → ${fix.city}`);
    continue;
  }
  
  // Replace that specific city occurrence
  const globalPos = nameMatch.index + cityMatch.index;
  const oldStr = cityMatch[0];
  const newStr = oldStr.replace(oldCity, fix.city);
  src = src.slice(0, globalPos) + newStr + src.slice(globalPos + oldStr.length);
  
  console.log(`✓ City fixed: ${fix.name}: "${oldCity}" → "${fix.city}"`);
  cityFixed++;
}

// Fix geotags
for (const fix of geoFixes) {
  const escapedName = fix.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameRegex = new RegExp(`name:\\s*["'\`]${escapedName}["'\`]`);
  const nameMatch = nameRegex.exec(src);
  
  if (!nameMatch) {
    console.warn(`⚠ Not found for geotag: ${fix.name}`);
    continue;
  }
  
  const afterName = src.slice(nameMatch.index, nameMatch.index + 600);
  
  // Fix lat
  const latRegex = /lat:\s*[-\d.]+/;
  const lngRegex = /lng:\s*[-\d.]+/;
  const latMatch = latRegex.exec(afterName);
  const lngMatch = lngRegex.exec(afterName);
  
  if (latMatch && lngMatch) {
    const latPos = nameMatch.index + latMatch.index;
    const lngPos = nameMatch.index + lngMatch.index;
    
    // Replace lng first (higher index) to avoid offset issues
    if (lngPos > latPos) {
      src = src.slice(0, lngPos) + `lng: ${fix.lng}` + src.slice(lngPos + lngMatch[0].length);
      src = src.slice(0, latPos) + `lat: ${fix.lat}` + src.slice(latPos + latMatch[0].length);
    } else {
      src = src.slice(0, latPos) + `lat: ${fix.lat}` + src.slice(latPos + latMatch[0].length);
      // recalculate lng position after lat change
      const afterNameNew = src.slice(nameMatch.index, nameMatch.index + 600);
      const lngMatchNew = lngRegex.exec(afterNameNew);
      if (lngMatchNew) {
        const lngPosNew = nameMatch.index + lngMatchNew.index;
        src = src.slice(0, lngPosNew) + `lng: ${fix.lng}` + src.slice(lngPosNew + lngMatchNew[0].length);
      }
    }
    console.log(`✓ Geotag fixed: ${fix.name} → ${fix.lat}, ${fix.lng}`);
    geoFixed++;
  } else {
    console.warn(`⚠ No lat/lng found near: ${fix.name}`);
  }
}

fs.writeFileSync(RESTAURANTS_PATH, src);
console.log(`\nDone! City fixes: ${cityFixed}, Geotag fixes: ${geoFixed}`);
console.log('restaurants.js updated.');
