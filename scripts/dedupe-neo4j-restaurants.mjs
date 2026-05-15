/**
 * Merge duplicate Restaurant nodes in Neo4j into one canonical node
 * per logical r.id.
 *
 * Background: legacy seed runs sometimes wrote Restaurant nodes with
 * `id` as a Cypher Integer and other runs wrote String, so MERGE on
 * `Restaurant {id: $id}` happily created a second node each time the
 * type flipped. Today there are ~515 logical restaurants with at
 * least one duplicate node (522 extra nodes total). Most queries
 * already work because the iOS unlove/unwatchlist code is now
 * type-coerced — but graph algorithms (taste compat, who-to-follow,
 * collaborative filtering) see the dupes as separate restaurants,
 * skewing overlap counts.
 *
 * Strategy: use apoc.refactor.mergeNodes per dupe set. It moves every
 * relationship from the duplicates onto the canonical node (combining
 * properties when conflicts exist) then deletes the duplicates.
 *
 * Safe to re-run. Reports per-id merge count + total cleaned.
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

const driver = neo4j.driver(env.VITE_NEO4J_URI, neo4j.auth.basic(env.VITE_NEO4J_USER, env.VITE_NEO4J_PASSWORD));
const session = driver.session();

// 1. Find every logical r.id with > 1 Restaurant node.
const dupesQuery = `
  MATCH (r:Restaurant)
  WITH toString(r.id) AS rid, COLLECT(r) AS nodes
  WHERE size(nodes) > 1
  RETURN rid, size(nodes) AS count
  ORDER BY count DESC
`;
const dupesResult = await session.run(dupesQuery);
console.log(`Found ${dupesResult.records.length} restaurant ids with duplicates.`);
console.log(`Top 5 (most-duplicated):`);
for (const rec of dupesResult.records.slice(0, 5)) {
  console.log(`  rid=${rec.get('rid')} → ${rec.get('count').toInt()} nodes`);
}
console.log();

// 2. Merge each set. We do this one rid at a time to keep transactions
//    small and the failure blast radius tight. apoc.refactor.mergeNodes
//    combines properties (keeping the canonical's value when there's a
//    conflict) and rewrites every incoming/outgoing relationship.
let totalMerged = 0;
let failures = 0;
for (const rec of dupesResult.records) {
  const rid = rec.get('rid');
  try {
    const merge = await session.run(`
      MATCH (r:Restaurant)
      WHERE toString(r.id) = $rid
      WITH COLLECT(r) AS nodes
      CALL apoc.refactor.mergeNodes(nodes, {properties: 'discard', mergeRels: true}) YIELD node
      RETURN COUNT(node) AS merged
    `, { rid });
    const merged = merge.records[0].get('merged').toInt();
    totalMerged += merged;
  } catch (e) {
    console.error(`  rid=${rid} merge failed: ${e.message}`);
    failures++;
  }
}

console.log(`Merged ${totalMerged} dupe sets · ${failures} failures.`);

// 3. Confirm.
const after = await session.run(`
  MATCH (r:Restaurant)
  WITH toString(r.id) AS rid, COUNT(r) AS n
  WHERE n > 1
  RETURN COUNT(rid) AS dupes, SUM(n-1) AS extras
`);
console.log('After — restaurants with dupes:', after.records[0].get('dupes').toInt(),
            '— extra nodes:', after.records[0].get('extras').toInt());

await session.close();
await driver.close();
