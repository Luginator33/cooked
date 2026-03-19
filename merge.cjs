const fs = require('fs');
const existing = fs.readFileSync('src/data/restaurants.js', 'utf8');
const newData = fs.readFileSync('all_new_restaurants.js', 'utf8');
const cleaned = newData.replace(/\/\/[^\n]*/g, '').replace(/\n\s*\n/g, '\n').trim();
const updated = existing.replace(/\n\];\n\nexport const ARCHETYPES/, ',\n' + cleaned + '\n];\n\nexport const ARCHETYPES');
fs.writeFileSync('src/data/restaurants.js', updated);
const count = (updated.match(/{ id:/g) || []).length;
console.log('Done! Total restaurants:', count);
