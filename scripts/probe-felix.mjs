import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = {};
readFileSync('/Users/lugapodesta/Dropbox (Personal)/1. CLAUDE/projects/cooked/.env', 'utf8')
  .split('\n').forEach(line => { const [k, ...v] = line.split('='); if (k && v.length) env[k.trim()] = v.join('=').trim(); });
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Check Felix by both ID 724867 (the bug-reported one) and by name search.
console.log('--- Felix by ID 724867 ---');
const { data: byId } = await supabase.from('restaurants').select('id, name, city, neighborhood, address, place_id, google_rating, google_reviews, is_closed, is_pending_review').eq('id', 724867).maybeSingle();
console.log(byId);

console.log('\n--- All restaurants named Felix ---');
const { data: byName } = await supabase.from('restaurants').select('id, name, city, neighborhood, address, place_id, google_rating, google_reviews, is_closed, is_pending_review').ilike('name', '%Felix%').limit(20);
console.log(JSON.stringify(byName, null, 2));

console.log('\n--- A-Frame ---');
const { data: aframe } = await supabase.from('restaurants').select('id, name, city, neighborhood, is_closed, is_pending_review').eq('id', 1774244880687).maybeSingle();
console.log(aframe);

console.log('\n--- Kings Fish House Calabasas ---');
const { data: kings } = await supabase.from('restaurants').select('id, name, city, neighborhood, is_closed, is_pending_review').eq('id', 36281).maybeSingle();
console.log(kings);

console.log('\n--- Yama Shisha (cuisine/instagram bug 30) ---');
const { data: yama } = await supabase.from('restaurants').select('id, name, city, cuisine, instagram_url, tags').eq('id', 1774244880895).maybeSingle();
console.log(yama);
