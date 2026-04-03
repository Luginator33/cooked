/**
 * Export open bug reports from Supabase for Claude Code
 * Run: node scripts/export-bugs.mjs
 * Then paste the output or say "check the bugs file"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: bugs, error } = await supabase
    .from('bug_reports')
    .select('*')
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }
  if (!bugs || bugs.length === 0) { console.log('No open bugs!'); return; }

  let output = `# Open Bug Reports (${new Date().toISOString().slice(0, 10)})\n\n`;
  output += `${bugs.length} open/in-progress bugs\n\n`;

  bugs.forEach((b, i) => {
    output += `---\n\n`;
    output += `## Bug ${i + 1}: ${b.description?.slice(0, 80)}\n\n`;
    output += `- **Status:** ${b.status}\n`;
    output += `- **Reporter:** ${b.user_name || 'Anonymous'} (${b.user_email || '—'})\n`;
    output += `- **Platform:** ${b.platform || '—'}\n`;
    output += `- **Page/Tab:** ${b.page || '—'} / ${b.tab || '—'}\n`;
    output += `- **Screen:** ${b.screen_width}×${b.screen_height}\n`;
    if (b.restaurant_name) output += `- **Restaurant:** ${b.restaurant_name} (ID: ${b.restaurant_id})\n`;
    if (b.viewing_user_id) output += `- **Viewing user:** ${b.viewing_user_id}\n`;
    output += `- **URL:** ${b.url || '—'}\n`;
    output += `- **Submitted:** ${b.created_at}\n`;
    if (b.admin_notes) output += `- **Admin notes:** ${b.admin_notes}\n`;
    output += `\n**Full description:**\n${b.description}\n\n`;
    if (b.screenshot_url) {
      output += `**Screenshot:** [base64 image attached — ${Math.round(b.screenshot_url.length / 1024)}KB]\n\n`;
    }
  });

  const outPath = join(__dirname, '..', 'BUGS.md');
  writeFileSync(outPath, output);
  console.log(`Exported ${bugs.length} bugs to BUGS.md`);
  console.log(`Tell Claude Code: "check BUGS.md and fix the open bugs"`);
}

main();
