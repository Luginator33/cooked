/**
 * Delete orphan User nodes (and all their relationships) from Neo4j.
 *
 * Run: node scripts/cleanup-neo4j-orphans.mjs
 *
 * The two IDs are the same ones nuked from Supabase via
 * sql/ship13_cleanup_orphan_users.sql:
 *   - user_3BmMHr6t010TX9eyxnUNA1RIDoA — Andrew Hague's OLD Clerk ID
 *   - user_3DVVFBRO8oodyBvX7DAlxACqVOT — unknown user who never finished onboarding
 *
 * DETACH DELETE wipes the User node + every relationship (LOVED,
 * WATCHLISTED, FOLLOWS, etc.) in one shot.
 */

import neo4j from 'neo4j-driver';
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

const ORPHANS = [
  'user_3BmMHr6t010TX9eyxnUNA1RIDoA',
  'user_3DVVFBRO8oodyBvX7DAlxACqVOT',
];

const driver = neo4j.driver(
  env.VITE_NEO4J_URI,
  neo4j.auth.basic(env.VITE_NEO4J_USER, env.VITE_NEO4J_PASSWORD)
);

const session = driver.session();
try {
  for (const id of ORPHANS) {
    // Count relationships before delete so we can report what we nuked.
    // Neo4j 5+ requires the COUNT{} subquery here; the older size((u)--())
    // pattern expression is deprecated.
    const before = await session.run(
      'MATCH (u:User {id: $id}) RETURN COUNT { (u)--() } AS relCount, u.name AS name',
      { id }
    );
    const row = before.records[0];
    const relCount = row ? row.get('relCount').toInt() : 0;
    const name = row ? (row.get('name') || '(no name)') : '(node not found)';

    if (!row) {
      console.log(`[${id}] no node found — skip`);
      continue;
    }

    const del = await session.run(
      'MATCH (u:User {id: $id}) DETACH DELETE u RETURN COUNT(u) AS deleted',
      { id }
    );
    const deleted = del.records[0]?.get('deleted')?.toInt() || 0;
    console.log(`[${id}] (${name}) deleted ${deleted} node + ${relCount} relationships`);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await session.close();
  await driver.close();
}

console.log('\nDone.');
