import { readFileSync, writeFileSync } from 'fs';

const existing = readFileSync('src/data/restaurants.js', 'utf8');
const newData = readFileSync('all_new_restaurants.js', 'utf8');

// Strip comments and blank lines
const cleaned = newData
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && line.trim() !== '')
  .join('\n')
  .trim();

const updated = existing.replace(
  /\n\];\n\nexport const ARCHETYPES/,
  ',\n' + cleaned + '\n];\n\nexport const ARCHETYPES'
);

writeFileSync('src/data/restaurants.js', updated);
const count = (updated.match(/\{ id:/g) || []).length;
console.log('Done! Total restaurants:', count);
