import { readFileSync, writeFileSync } from 'fs';

// Read current file (has the 90 original restaurants + ARCHETYPES, but broken CITIES header)
const current = readFileSync('src/data/restaurants.js', 'utf8');

// Read new restaurants
const newData = readFileSync('all_new_restaurants.js', 'utf8');

// Read the correct header
const header = readFileSync('header.js', 'utf8');

// Extract just the RESTAURANTS array content from current file
const restStart = current.indexOf('export const RESTAURANTS = [');
const archStart = current.indexOf('\nexport const ARCHETYPES');
const restaurantsSection = current.substring(restStart, archStart);

// Extract ARCHETYPES from current file
const archetypes = current.substring(archStart);

// Clean new restaurants - strip comments and blank lines
const cleanedNew = newData
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && line.trim() !== '')
  .join('\n')
  .trim();

// Remove the closing ]; from restaurants section to inject new ones
const restaurantsOpen = restaurantsSection.trimEnd().replace(/\];?\s*$/, '');

// Build final file
const final = header + restaurantsOpen + ',\n' + cleanedNew + '\n];\n' + archetypes;

writeFileSync('src/data/restaurants.js', final);
const count = (final.match(/\{ id:/g) || []).length;
console.log('Done! Total restaurants:', count);
