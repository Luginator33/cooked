/**
 * Data cleanup for bugs 17, 19, 20 (June 6 bug squash session).
 * - A-Frame: permanently closed
 * - King's Fish House Calabasas: permanently closed
 * - Felix (id 724867): tagged as LA but address is Hong Kong → fix city
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = {};
readFileSync('/Users/lugapodesta/Dropbox (Personal)/1. CLAUDE/projects/cooked/.env', 'utf8')
  .split('\n').forEach(line => { const [k, ...v] = line.split('='); if (k && v.length) env[k.trim()] = v.join('=').trim(); });
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const fixes = [
  { id: 1774244880687, name: 'A-Frame',                       is_closed: true,                                              reason: 'permanently closed (bug 17)' },
  { id: 36281,         name: "King's Fish House Calabasas",   is_closed: true,                                              reason: 'permanently closed (bug 19)' },
  // Felix Hong Kong was tagged as LA — its address + Tsim Sha Tsui
  // neighborhood are HK. Felix Trattoria (id 35018) in Venice is the LA
  // Felix and is unaffected.
  { id: 724867,        name: 'Felix',                         city: 'Hong Kong', neighborhood: 'Tsim Sha Tsui',             reason: 'address is Hong Kong, was tagged as LA (bug 20)' },
];

let ok = 0, fail = 0;
for (const f of fixes) {
  const { id, name, reason, ...patch } = f;
  const { error } = await supabase.from('restaurants').update(patch).eq('id', id);
  if (error) { console.log(`[FAIL] ${id} (${name}): ${error.message}`); fail++; }
  else { console.log(`[OK]   ${id} (${name}) ← ${reason}`); ok++; }
}
console.log(`\n${ok} ok / ${fail} fail`);
