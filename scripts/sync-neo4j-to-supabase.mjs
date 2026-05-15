/**
 * One-time sync: make every user's Neo4j LOVED + WATCHLISTED edges
 * match their Supabase user_data.loved / .watchlist arrays.
 *
 * Fixes drift left by an iOS unlove bug (2026-05-14) where
 * Neo4jService.unloveRestaurant / unwatchlistRestaurant used
 *   MATCH ... -[rel:LOVED]-> (r:Restaurant {id: $restaurantId})
 * which only deleted the edge to the Restaurant node whose r.id type
 * matched the parameter exactly. Some Restaurant nodes have r.id as
 * Cypher Integer, others as String (from old seed runs), so the
 * stricter MATCH left stale edges behind on the "wrong" duplicate.
 *
 * What this does, per user:
 *   1. Pull Supabase user_data.loved / .watchlist as the source of truth.
 *   2. Delete any LOVED / WATCHLISTED edge in Neo4j whose Restaurant id
 *      isn't in the Supabase set.
 *   3. Dedupe duplicate edges (one user → one Restaurant id → keep one
 *      edge, regardless of how many duplicate Restaurant nodes exist
 *      with that id).
 *
 * Safe to re-run. Reports the per-user delta.
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
const session = driver.session();

const { data: users } = await supabase
  .from('user_data')
  .select('clerk_user_id, profile_name, loved, watchlist');

let totalRemoved = 0;
let totalDeduped = 0;

for (const u of users) {
  const id = u.clerk_user_id;
  const supaLoved = (u.loved || []).map(String);
  const supaWatch = (u.watchlist || []).map(String);

  // 1. Remove LOVED edges not in Supabase.
  const removeLoves = await session.run(`
    MATCH (x:User {id: $id})-[rel:LOVED]->(r:Restaurant)
    WHERE NOT (toString(r.id) IN $keep)
    DELETE rel
    RETURN COUNT(rel) AS removed
  `, { id, keep: supaLoved });
  const lovesRemoved = removeLoves.records[0].get('removed').toInt();

  // 2. Remove WATCHLISTED edges not in Supabase.
  const removeWatch = await session.run(`
    MATCH (x:User {id: $id})-[rel:WATCHLISTED]->(r:Restaurant)
    WHERE NOT (toString(r.id) IN $keep)
    DELETE rel
    RETURN COUNT(rel) AS removed
  `, { id, keep: supaWatch });
  const watchRemoved = removeWatch.records[0].get('removed').toInt();

  // 3. Dedupe LOVED — keep one edge per logical r.id.
  const dedupeLoves = await session.run(`
    MATCH (x:User {id: $id})-[rel:LOVED]->(r:Restaurant)
    WITH toString(r.id) AS rid, COLLECT(rel) AS edges
    WHERE size(edges) > 1
    UNWIND edges[1..] AS stale
    DELETE stale
    RETURN COUNT(stale) AS dropped
  `, { id });
  const lovesDeduped = dedupeLoves.records[0].get('dropped').toInt();

  // 4. Dedupe WATCHLISTED.
  const dedupeWatch = await session.run(`
    MATCH (x:User {id: $id})-[rel:WATCHLISTED]->(r:Restaurant)
    WITH toString(r.id) AS rid, COLLECT(rel) AS edges
    WHERE size(edges) > 1
    UNWIND edges[1..] AS stale
    DELETE stale
    RETURN COUNT(stale) AS dropped
  `, { id });
  const watchDeduped = dedupeWatch.records[0].get('dropped').toInt();

  if (lovesRemoved || watchRemoved || lovesDeduped || watchDeduped) {
    const name = (u.profile_name || id).padEnd(22);
    console.log(`${name} | loves -${lovesRemoved} stale, -${lovesDeduped} dup | watch -${watchRemoved} stale, -${watchDeduped} dup`);
    totalRemoved += lovesRemoved + watchRemoved;
    totalDeduped += lovesDeduped + watchDeduped;
  }
}

console.log(`\nTotal: removed ${totalRemoved} stale edges + deduped ${totalDeduped} duplicate edges`);

await session.close();
await driver.close();
