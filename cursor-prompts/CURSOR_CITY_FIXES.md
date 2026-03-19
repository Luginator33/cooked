# City and Coordinate Fixes for restaurants.js

Run this Node script to fix all city/coordinate issues in `src/data/restaurants.js`:

```
node << 'EOF'
const fs = require('fs');
const path = '/Users/lugapodesta/Dropbox (Personal)/1. CLAUDE/projects/cooked/src/data/restaurants.js';
let content = fs.readFileSync(path, 'utf8');

// ── 1. FIX WRONG CITY + WRONG COORDINATES ────────────────────────────────────
// Contramar, El Hidalguense, Maximo Bistrot are Mexico City restaurants
// wrongly tagged as Playa del Carmen with Playa del Carmen coordinates

content = content.replace(
  /name: ?"Contramar", ?city: ?"Playa del Carmen"/g,
  'name: "Contramar", city: "Mexico City"'
);
content = content.replace(
  /name: ?"El Hidalguense", ?city: ?"Playa del Carmen"/g,
  'name: "El Hidalguense", city: "Mexico City"'
);
content = content.replace(
  /name: ?"Maximo Bistrot", ?city: ?"Playa del Carmen"/g,
  'name: "Maximo Bistrot", city: "Mexico City"'
);

// Fix their coordinates (they currently have Playa del Carmen coords)
// Contramar - Colonia Roma, Mexico City
content = content.replace(
  /lat: ?20\.6295586, ?lng: ?-87\.0738851, ?name: ?"Contramar"/g,
  'lat: 19.4137, lng: -99.1679, name: "Contramar"'
);
// El Hidalguense - Colonia Roma, Mexico City  
content = content.replace(
  /lat: ?20\.6295586, ?lng: ?-87\.0738851, ?name: ?"El Hidalguense"/g,
  'lat: 19.4188, lng: -99.1712, name: "El Hidalguense"'
);
// Maximo Bistrot - Colonia Roma, Mexico City
content = content.replace(
  /lat: ?20\.6295586, ?lng: ?-87\.0738851, ?name: ?"Maximo Bistrot"/g,
  'lat: 19.4137, lng: -99.1689, name: "Maximo Bistrot"'
);

// ── 2. CITY REMAPPINGS FROM SPREADSHEET ──────────────────────────────────────

// Le Cannet → city becomes "Cannes", neighborhood stays "Le Cannet"
content = content.replace(/city: ?"Le Cannet"/g, 'city: "Cannes"');

// Santa Gertrudis → city becomes "Ibiza", neighborhood stays "Santa Gertrudis"
content = content.replace(/city: ?"Santa Gertrudis"/g, 'city: "Ibiza"');

// Brighton → city becomes "UK"
content = content.replace(/city: ?"Brighton"/g, 'city: "UK"');

// Windsor → city becomes "UK"
content = content.replace(/city: ?"Windsor"/g, 'city: "UK"');

// Chipping Norton → city becomes "UK"
content = content.replace(/city: ?"Chipping Norton"/g, 'city: "UK"');

// Frome → city becomes "UK"
content = content.replace(/city: ?"Frome"/g, 'city: "UK"');

// Wailea → city becomes "Maui"
content = content.replace(/city: ?"Wailea"/g, 'city: "Maui"');

// Miami Beach → city becomes "Miami", neighborhood stays "Miami Beach"
content = content.replace(/city: ?"Miami Beach"/g, 'city: "Miami"');

// Westlake Village → city becomes "Ventura County", neighborhood stays "Westlake Village"
content = content.replace(/city: ?"Westlake Village"/g, 'city: "Ventura County"');

// Thousand Oaks → city becomes "Ventura County", neighborhood stays "Thousand Oaks"
content = content.replace(/city: ?"Thousand Oaks"/g, 'city: "Ventura County"');

// Savannah → stays Savannah (already correct, no change needed)
// Scottsdale → stays Scottsdale (already correct, no change needed)

fs.writeFileSync(path, content, 'utf8');
console.log('All city fixes applied successfully');
EOF
```
