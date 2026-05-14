/**
 * Mark bug_reports rows as resolved.
 *
 * Usage:
 *   node scripts/resolve-bugs.mjs <full_uuid> [<full_uuid> ...]
 *
 * Each id gets `status='resolved'`, `resolved_at=now()`, and `admin_notes`
 * set to the supplied --note (or a default tag).
 *
 * Optional flag:
 *   --note "Free-text reason"
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from ../.env (bypasses RLS so we can flip
 * status on rows that didn't originate from the current user).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
let note = 'Resolved in iOS build.';
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--note' && args[i + 1]) {
    note = args[i + 1];
    i++;
  } else {
    ids.push(args[i]);
  }
}

if (ids.length === 0) {
  console.error('Usage: node scripts/resolve-bugs.mjs <id> [<id> ...] [--note "reason"]');
  process.exit(1);
}

async function main() {
  let resolvedCount = 0;
  for (const id of ids) {
    const { data: row, error: matchErr } = await supabase
      .from('bug_reports')
      .select('id, description')
      .eq('id', id)
      .maybeSingle();

    if (matchErr) { console.error(`[${id}] lookup error:`, matchErr.message); continue; }
    if (!row)     { console.warn(`[${id}] no match`); continue; }

    const { error: updErr } = await supabase
      .from('bug_reports')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        admin_notes: note,
      })
      .eq('id', row.id);

    if (updErr) {
      console.error(`[${row.id}] update error:`, updErr.message);
    } else {
      console.log(`[${row.id}] resolved — "${(row.description || '').slice(0, 60)}"`);
      resolvedCount++;
    }
  }
  console.log(`\nResolved ${resolvedCount} / ${ids.length}.`);
}

main();
