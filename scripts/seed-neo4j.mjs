import { createClient } from '@supabase/supabase-js';
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const driver = neo4j.driver(
  process.env.VITE_NEO4J_URI,
  neo4j.auth.basic(process.env.VITE_NEO4J_USER, process.env.VITE_NEO4J_PASSWORD)
);

async function run(cypher, params = {}) {
  const session = driver.session();
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function seed() {
  console.log('Step 1: Seeding restaurants from restaurants.js...');
  const { RESTAURANTS: restaurants } = await import('../src/data/restaurants.js');

  let count = 0;
  for (const r of restaurants) {
    await run(
      `MERGE (r:Restaurant {id: $id})
       SET r.name = $name, r.city = $city, r.cuisine = $cuisine
       MERGE (c:City {name: $city})
       MERGE (r)-[:LOCATED_IN]->(c)`,
      { id: String(r.id), name: r.name || '', city: r.city || '', cuisine: r.cuisine || '' }
    );
    count++;
    if (count % 100 === 0) console.log(`  ${count} restaurants seeded...`);
  }
  console.log(`  Done — ${count} restaurants`);

  console.log('Step 2: Seeding users + loves from Supabase...');
  const { data: users } = await supabase
    .from('user_data')
    .select('clerk_user_id, profile_name, profile_username, loved, heat');

  for (const user of users || []) {
    const id = user.clerk_user_id;
    if (!id) continue;
    await run(
      `MERGE (u:User {id: $id}) SET u.name = $name, u.username = $username`,
      { id, name: user.profile_name || '', username: user.profile_username || '' }
    );
    const loved = user.loved || user.heat?.loved || [];
    for (const restId of loved) {
      await run(
        `MERGE (u:User {id: $userId})
         MERGE (r:Restaurant {id: $restId})
         MERGE (u)-[:LOVED]->(r)`,
        { userId: id, restId: String(restId) }
      );
    }
    console.log(`  Seeded ${user.profile_name || id} with ${loved.length} loves`);
  }

  console.log('Step 3: Seeding follows from Supabase...');
  const { data: follows } = await supabase
    .from('follows')
    .select('follower_id, following_id');
  for (const f of follows || []) {
    await run(
      `MERGE (a:User {id: $followerId})
       MERGE (b:User {id: $followingId})
       MERGE (a)-[:FOLLOWS]->(b)`,
      { followerId: f.follower_id, followingId: f.following_id }
    );
  }
  console.log(`  Done — ${follows?.length || 0} follows`);

  console.log('Step 4: Seeding city follows from Supabase...');
  const { data: cityFollows } = await supabase
    .from('city_follows')
    .select('clerk_user_id, city');
  for (const cf of cityFollows || []) {
    await run(
      `MERGE (u:User {id: $userId})
       MERGE (c:City {name: $city})
       MERGE (u)-[:FOLLOWS_CITY]->(c)`,
      { userId: cf.clerk_user_id, city: cf.city }
    );
  }
  console.log(`  Done — ${cityFollows?.length || 0} city follows`);

  await driver.close();
  console.log('Seeding complete!');
}

seed().catch(e => { console.error(e); process.exit(1); });
