const fs = require('fs');
let content = fs.readFileSync('src/data/restaurants.js', 'utf8');
const cutPoint = content.indexOf('{ id:5001');
if (cutPoint === -1) { console.log('cutpoint not found'); process.exit(1); }
let restored = content.substring(0, cutPoint).trimEnd();
restored = restored.replace(/,\s*,$/, '').replace(/,\s*$/, '');
restored += '\n];\n\nexport const ARCHETYPES = [\n  { id: "adventurer", label: "The Adventurer", emoji: "🌶️", desc: "You chase heat, novelty, and the unknown." },\n  { id: "purist", label: "The Purist", emoji: "⭐", desc: "You believe the best food needs no embellishment." },\n  { id: "socialite", label: "The Socialite", emoji: "🥂", desc: "The scene is part of the meal for you." },\n  { id: "gourmand", label: "The Gourmand", emoji: "🍽️", desc: "Tasting menus and Michelin stars are your love language." },\n  { id: "localist", label: "The Localist", emoji: "🗺️", desc: "You eat where the locals eat, full stop." },\n  { id: "hedonist", label: "The Hedonist", emoji: "🧈", desc: "Butter, cream, excess — no apologies." },\n];\n';
fs.writeFileSync('src/data/restaurants.js', restored);
console.log('Restored! Entry count:', (restored.match(/{ id:/g) || []).length);
