#!/usr/bin/env node
// generate_kb.mjs
// Generates a compact knowledge base from restaurants.js
// Output: _backups/restaurant_kb_compact.txt
// This gets embedded in ChatBot.jsx as the auto-generated section

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RESTAURANTS_PATH = path.join(__dirname, 'src/data/restaurants.js');
const OUTPUT_PATH = path.join(__dirname, '_backups/restaurant_kb_compact.txt');

// Read restaurants.js and extract the array
const src = fs.readFileSync(RESTAURANTS_PATH, 'utf8');

// Use regex to extract all restaurant objects
const pattern = /\{[^{}]*id:\s*\d+[^{}]*name:\s*["'`][^"'`]+["'`][^{}]*\}/gs;
const matches = [...src.matchAll(pattern)];

console.log(`Found ${matches.length} restaurant objects`);

function extractField(obj, field) {
  const patterns = [
    new RegExp(`${field}:\\s*["'\`]([^"'\`]*)["'\`]`),
    new RegExp(`${field}:\\s*(\\d+(?:\\.\\d+)?)`),
  ];
  for (const p of patterns) {
    const m = p.exec(obj);
    if (m) return m[1];
  }
  return '';
}

function extractTags(obj) {
  const m = /tags:\s*\[([^\]]*)\]/.exec(obj);
  if (!m) return '';
  return m[1].replace(/["'`\s]/g, '').split(',').filter(Boolean).slice(0, 4).join(', ');
}

function extractIsBar(obj) {
  return /isBar:\s*true/.test(obj);
}

// Group by city
const byCity = {};
const restaurants = [];

for (const match of matches) {
  const obj = match[0];
  const id = extractField(obj, 'id');
  const name = extractField(obj, 'name');
  const city = extractField(obj, 'city');
  const neighborhood = extractField(obj, 'neighborhood');
  const cuisine = extractField(obj, 'cuisine');
  const price = extractField(obj, 'price');
  const rating = extractField(obj, 'rating');
  const tags = extractTags(obj);
  const desc = extractField(obj, 'desc');
  const isBar = extractIsBar(obj);

  if (!name || !city) continue;

  restaurants.push({ id, name, city, neighborhood, cuisine, price, rating, tags, desc, isBar });

  if (!byCity[city]) byCity[city] = [];
  byCity[city].push({ name, neighborhood, cuisine, price, rating, tags, desc, isBar });
}

console.log(`Parsed ${restaurants.length} restaurants across ${Object.keys(byCity).length} cities`);

// Generate compact KB
let kb = `## AUTO-GENERATED RESTAURANT DATABASE\n`;
kb += `> ${restaurants.length} restaurants across ${Object.keys(byCity).length} cities\n`;
kb += `> Format: Name | Neighborhood | Cuisine | Price | Rating | Tags\n\n`;

for (const [city, rests] of Object.entries(byCity).sort()) {
  kb += `### ${city} (${rests.length} spots)\n`;
  for (const r of rests.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))) {
    const line = [
      r.name,
      r.neighborhood || '',
      r.cuisine || '',
      r.price || '',
      r.rating ? `★${r.rating}` : '',
      r.tags || '',
    ].filter(Boolean).join(' | ');
    kb += `${line}\n`;
    if (r.desc && r.desc.length > 10 && !r.desc.includes('celebrated') && !r.desc.includes('A celebrated')) {
      kb += `  → ${r.desc}\n`;
    }
  }
  kb += '\n';
}

fs.writeFileSync(OUTPUT_PATH, kb);
console.log(`\nWrote ${kb.length} chars (${Math.round(kb.length/4)} tokens estimated)`);
console.log(`Saved to ${OUTPUT_PATH}`);

// Also write just the stats
const stats = Object.entries(byCity).sort().map(([city, rests]) => `${city}: ${rests.length}`).join(', ');
console.log(`\nCity breakdown: ${stats}`);
