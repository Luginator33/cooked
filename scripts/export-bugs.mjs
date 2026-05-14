/**
 * Export open bug reports from Supabase for Claude Code.
 *
 * Run: node scripts/export-bugs.mjs
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from `.env` if present (bypasses RLS so all
 * bug rows are visible regardless of the caller). Falls back to VITE_SUPABASE_ANON_KEY
 * which only sees the caller's own rows post-RLS lockdown.
 *
 * Side effects:
 *   - BUGS.md         (markdown summary at repo root)
 *   - BUGS_SCREENSHOTS/<id>.jpg  (one file per bug that has a screenshot — base64 JPEG decoded)
 *
 * After running, tell Claude: "check BUGS.md and the screenshots."
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

// Prefer service role (bypasses RLS) so admins always see every bug.
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const usingServiceRole = !!env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(env.VITE_SUPABASE_URL, key);

async function main() {
  console.log(`Auth: ${usingServiceRole ? 'SERVICE_ROLE (full access)' : 'anon key (RLS-limited — admin-only rows hidden)'}`);

  const { data: bugs, error } = await supabase
    .from('bug_reports')
    .select('*')
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }
  if (!bugs || bugs.length === 0) { console.log('No open bugs!'); return; }

  // Prepare screenshots dir
  const shotsDir = join(__dirname, '..', 'BUGS_SCREENSHOTS');
  if (!existsSync(shotsDir)) mkdirSync(shotsDir, { recursive: true });

  let output = `# Open Bug Reports (${new Date().toISOString().slice(0, 10)})\n\n`;
  output += `${bugs.length} open/in-progress bugs · screenshots in \`BUGS_SCREENSHOTS/\`\n\n`;

  let savedShots = 0;
  bugs.forEach((b, i) => {
    output += `---\n\n`;
    output += `## Bug ${i + 1}: ${b.description?.slice(0, 80) || '(no description)'}\n\n`;
    output += `- **ID:** \`${b.id}\`\n`;
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
    output += `\n**Description:**\n${b.description}\n\n`;

    if (b.screenshot_url) {
      // Stored as data URL: "data:image/jpeg;base64,...."
      const m = /^data:image\/[a-z]+;base64,(.+)$/i.exec(b.screenshot_url);
      if (m) {
        const buf = Buffer.from(m[1], 'base64');
        const ext = b.screenshot_url.startsWith('data:image/png') ? 'png' : 'jpg';
        const filePath = join(shotsDir, `${b.id}.${ext}`);
        writeFileSync(filePath, buf);
        output += `**Screenshot:** \`BUGS_SCREENSHOTS/${b.id}.${ext}\` (${Math.round(buf.length / 1024)}KB)\n\n`;
        savedShots += 1;
      } else {
        output += `**Screenshot:** raw URL — ${b.screenshot_url.slice(0, 100)}…\n\n`;
      }
    }
  });

  const outPath = join(__dirname, '..', 'BUGS.md');
  writeFileSync(outPath, output);
  console.log(`Exported ${bugs.length} bugs to BUGS.md`);
  console.log(`Saved ${savedShots} screenshots to BUGS_SCREENSHOTS/`);
  console.log(`Tell Claude: "check BUGS.md and the screenshots"`);
}

main();
