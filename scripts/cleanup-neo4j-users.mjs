/**
 * Reconcile Neo4j User nodes against Supabase `user_data` rows.
 *
 * What it does (one shot):
 *   1. Delete every Neo4j User node whose `id` doesn't match a real
 *      `user_data.clerk_user_id`. Catches old mock data, test
 *      placeholder strings (`mock_1`, `REPLACE_WITH_YOUR_CLERK_USER_ID`,
 *      `Sarah Miller`), null-id nodes, and Clerk re-auth duplicates
 *      (a second Luga node showed up during the 2026-05-14 audit).
 *   2. For every real user, MERGE the User node + SET `name` and
 *      `avatarUrl` from Supabase. Some real users had `name=null` in
 *      Neo4j because their Clerk webhook fired before their profile
 *      was filled in — the Phase2Sheets `hydratedUserNames` workaround
 *      was masking this. Now Neo4j has the data natively.
 *
 * Safe to re-run. After running, Neo4j should match Supabase 1:1
 * (16 nodes today, every one with a real Clerk id + name + avatar).
 */

import neo4j from 'neo4j-driver';
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
const driver = neo4j.driver(env.VITE_NEO4J_URI, neo4j.auth.basic(env.VITE_NEO4J_USER, env.VITE_NEO4J_PASSWORD));
const s = driver.session();

const { data: real } = await supabase
  .from('user_data')
  .select('clerk_user_id, profile_name, profile_username, avatar_url, profile_photo');
const realIds = real.map(r => r.clerk_user_id);
console.log(`Real Supabase users: ${realIds.length}`);

// 1. Delete orphan User nodes.
const del = await s.run(`
  MATCH (u:User)
  WHERE u.id IS NULL OR NOT (u.id IN $keepIds)
  DETACH DELETE u
  RETURN COUNT(u) AS deleted
`, { keepIds: realIds });
console.log(`Deleted orphan User nodes: ${del.records[0].get('deleted').toInt()}`);

// 2. Re-sync name + avatar on every real user.
let synced = 0;
for (const u of real) {
  const name = u.profile_name || u.profile_username || null;
  const avatar = u.avatar_url || u.profile_photo || null;
  if (!name && !avatar) continue;
  await s.run(`
    MERGE (u:User {id: $id})
    SET u.name = $name, u.avatarUrl = $avatar
  `, { id: u.clerk_user_id, name, avatar });
  synced++;
}
console.log(`Re-synced name + avatar on real users: ${synced}`);

const total = await s.run('MATCH (u:User) RETURN COUNT(u) AS c');
const noName = await s.run(`MATCH (u:User) WHERE u.name IS NULL OR u.name = '' OR u.name = 'User' RETURN COUNT(u) AS c`);
console.log(`\nFinal — total User nodes: ${total.records[0].get('c').toInt()} · with no name: ${noName.records[0].get('c').toInt()}`);

await s.close();
await driver.close();
