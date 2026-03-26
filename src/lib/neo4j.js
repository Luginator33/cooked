import neo4j from 'neo4j-driver';

const URI = import.meta.env.VITE_NEO4J_URI;
const USER = import.meta.env.VITE_NEO4J_USER;
const PASSWORD = import.meta.env.VITE_NEO4J_PASSWORD;

let driver;

function getDriver() {
  if (!driver && URI && USER && PASSWORD) {
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  }
  return driver;
}

export async function runQuery(cypher, params = {}) {
  const d = getDriver();
  if (!d) return [];
  const session = d.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } catch (e) {
    console.error('[Neo4j]', e);
    return [];
  } finally {
    await session.close();
  }
}

export async function getFriendsWhoLovedRestaurant(myClerkId, restaurantId) {
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:FOLLOWS]->(friend)-[:LOVED]->(r:Restaurant {id: $restId})
     RETURN friend.id AS id, friend.name AS name, friend.username AS username`,
    { myId: myClerkId, restId: String(restaurantId) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    username: rec.get('username'),
  }));
}

export async function getTrendingInFollowedCities(myClerkId, limit = 10) {
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:FOLLOWS_CITY]->(city)<-[:LOCATED_IN]-(r:Restaurant)
     MATCH (anyone)-[:LOVED]->(r)
     RETURN r.id AS id, r.name AS name, r.city AS city, count(*) AS loveCount
     ORDER BY loveCount DESC
     LIMIT $limit`,
    { myId: myClerkId, limit: neo4j.int(limit) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    city: rec.get('city'),
    loveCount: rec.get('loveCount').toNumber(),
  }));
}

export async function syncUser(clerkUserId, name, username) {
  if (!clerkUserId) return;
  await runQuery(
    `MERGE (u:User {id: $id}) SET u.name = $name, u.username = $username`,
    { id: clerkUserId, name: name || '', username: username || '' }
  );
}

export async function syncRestaurant(r) {
  if (!r?.id) return;
  await runQuery(
    `MERGE (r:Restaurant {id: $id})
     SET r.name = $name, r.city = $city, r.cuisine = $cuisine,
         r.price = $price, r.neighborhood = $neighborhood,
         r.rating = $rating, r.lat = $lat, r.lng = $lng
     MERGE (c:City {name: $city})
     MERGE (r)-[:LOCATED_IN]->(c)`,
    {
      id: String(r.id),
      name: r.name || '',
      city: r.city || '',
      cuisine: r.cuisine || '',
      price: r.price || '',
      neighborhood: r.neighborhood || '',
      rating: r.rating || 0,
      lat: r.lat || 0,
      lng: r.lng || 0,
    }
  );
  // Sync tags as separate Tag nodes
  const tags = r.tags;
  if (Array.isArray(tags) && tags.length > 0) {
    await runQuery(
      `MATCH (r:Restaurant {id: $id})
       UNWIND $tags AS tagName
       MERGE (t:Tag {name: tagName})
       MERGE (r)-[:HAS_TAG]->(t)`,
      { id: String(r.id), tags }
    );
  }
}

export async function syncLove(clerkUserId, restaurantId) {
  if (!clerkUserId || !restaurantId) return;
  await runQuery(
    `MERGE (u:User {id: $userId})
     MERGE (r:Restaurant {id: $restId})
     MERGE (u)-[l:LOVED]->(r)
     SET l.timestamp = datetime()`,
    { userId: clerkUserId, restId: String(restaurantId) }
  );
}

export async function removeLove(clerkUserId, restaurantId) {
  if (!clerkUserId || !restaurantId) return;
  await runQuery(
    `MATCH (u:User {id: $userId})-[l:LOVED]->(r:Restaurant {id: $restId})
     DELETE l`,
    { userId: clerkUserId, restId: String(restaurantId) }
  );
}

export async function syncFollow(followerClerkId, followingClerkId) {
  if (!followerClerkId || !followingClerkId) return;
  await runQuery(
    `MERGE (a:User {id: $followerId})
     MERGE (b:User {id: $followingId})
     MERGE (a)-[:FOLLOWS]->(b)`,
    { followerId: followerClerkId, followingId: followingClerkId }
  );
}

export async function removeFollow(followerClerkId, followingClerkId) {
  if (!followerClerkId || !followingClerkId) return;
  await runQuery(
    `MATCH (a:User {id: $followerId})-[f:FOLLOWS]->(b:User {id: $followingId})
     DELETE f`,
    { followerId: followerClerkId, followingId: followingClerkId }
  );
}

export async function syncCityFollow(clerkUserId, cityName) {
  if (!clerkUserId || !cityName) return;
  await runQuery(
    `MERGE (u:User {id: $userId})
     MERGE (c:City {name: $city})
     MERGE (u)-[:FOLLOWS_CITY]->(c)`,
    { userId: clerkUserId, city: cityName }
  );
}

export async function removeCityFollow(clerkUserId, cityName) {
  if (!clerkUserId || !cityName) return;
  await runQuery(
    `MATCH (u:User {id: $userId})-[f:FOLLOWS_CITY]->(c:City {name: $city})
     DELETE f`,
    { userId: clerkUserId, city: cityName }
  );
}

// Get taste fingerprint for a user
export async function getTasteFingerprint(clerkUserId) {
  if (!clerkUserId) return null;

  // Get all loved restaurants with their properties
  const records = await runQuery(
    `MATCH (u:User {id: $userId})-[:LOVED]->(r:Restaurant)
     RETURN r.cuisine AS cuisine, r.city AS city, r.id AS id`,
    { userId: clerkUserId }
  );

  if (!records.length) return null;

  const cuisines = {};
  const cities = {};
  const ids = [];

  records.forEach(rec => {
    const cuisine = rec.get('cuisine') || 'Unknown';
    const city = rec.get('city') || 'Unknown';
    const id = rec.get('id');
    cuisines[cuisine] = (cuisines[cuisine] || 0) + 1;
    cities[city] = (cities[city] || 0) + 1;
    ids.push(id);
  });

  const sortedCuisines = Object.entries(cuisines)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const sortedCities = Object.entries(cities)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return {
    totalLoves: records.length,
    topCuisines: sortedCuisines.slice(0, 8),
    topCities: sortedCities.slice(0, 6),
    restaurantIds: ids,
  };
}

// Get Cooked Score for a user
export async function getCookedScore(clerkUserId) {
  if (!clerkUserId) return 0;

  // Points for restaurants you loved that others in network later loved
  const discoveryRecords = await runQuery(
    `MATCH (u:User {id: $userId})-[myLove:LOVED]->(r:Restaurant)<-[theirLove:LOVED]-(other:User)
     WHERE other.id <> $userId
     AND myLove.timestamp < theirLove.timestamp
     RETURN count(*) AS discoveryPoints`,
    { userId: clerkUserId }
  );

  // City diversity bonus
  const cityRecords = await runQuery(
    `MATCH (u:User {id: $userId})-[:LOVED]->(r:Restaurant)
     RETURN count(DISTINCT r.city) AS cityCount`,
    { userId: clerkUserId }
  );

  // Total loves
  const loveRecords = await runQuery(
    `MATCH (u:User {id: $userId})-[:LOVED]->(r:Restaurant)
     RETURN count(*) AS loveCount`,
    { userId: clerkUserId }
  );

  const discoveryPoints = discoveryRecords[0]?.get('discoveryPoints')?.toNumber() || 0;
  const cityCount = cityRecords[0]?.get('cityCount')?.toNumber() || 0;
  const loveCount = loveRecords[0]?.get('loveCount')?.toNumber() || 0;

  return (discoveryPoints * 3) + (loveCount * 1) + (cityCount * 2);
}

// Get people with similar taste
export async function getPeopleLikeYou(clerkUserId, limit = 5) {
  if (!clerkUserId) return [];
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:LOVED]->(r:Restaurant)<-[:LOVED]-(other:User)
     WHERE other.id <> $myId
     RETURN other.id AS id, other.name AS name, other.username AS username,
            count(r) AS sharedCount
     ORDER BY sharedCount DESC
     LIMIT $limit`,
    { myId: clerkUserId, limit: neo4j.int(limit) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    username: rec.get('username'),
    sharedCount: rec.get('sharedCount').toNumber(),
  }));
}

// Get who to follow (friends of friends with taste overlap)
export async function getWhoToFollow(clerkUserId, limit = 5) {
  if (!clerkUserId) return [];
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:FOLLOWS]->(friend)-[:FOLLOWS]->(candidate:User)
     WHERE candidate.id <> $myId
     AND NOT (me)-[:FOLLOWS]->(candidate)
     MATCH (me)-[:LOVED]->(r:Restaurant)<-[:LOVED]-(candidate)
     RETURN candidate.id AS id, candidate.name AS name,
            candidate.username AS username,
            count(r) AS sharedCount
     ORDER BY sharedCount DESC
     LIMIT $limit`,
    { myId: clerkUserId, limit: neo4j.int(limit) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    username: rec.get('username'),
    sharedCount: rec.get('sharedCount').toNumber(),
  }));
}

// ── NEW FEATURES ──────────────────────────────────────────────

// Seed all restaurants to the graph (one-time backfill)
export async function seedAllRestaurants(restaurants, onProgress) {
  const BATCH_SIZE = 50;
  for (let i = 0; i < restaurants.length; i += BATCH_SIZE) {
    const batch = restaurants.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(r => syncRestaurant(r)));
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, restaurants.length), restaurants.length);
  }
}

// Overlap: restaurants both you and another user love
export async function getOverlapRestaurants(myClerkId, theirClerkId) {
  if (!myClerkId || !theirClerkId) return [];
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:LOVED]->(r:Restaurant)<-[:LOVED]-(them:User {id: $theirId})
     RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
            r.neighborhood AS neighborhood, r.rating AS rating`,
    { myId: myClerkId, theirId: theirClerkId }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    city: rec.get('city'),
    cuisine: rec.get('cuisine'),
    neighborhood: rec.get('neighborhood'),
    rating: rec.get('rating')?.toNumber?.() ?? rec.get('rating'),
  }));
}

// "You'd Love This" — collaborative filtering recommendations
export async function getYoudLoveThis(clerkUserId, limit = 10) {
  if (!clerkUserId) return [];
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:LOVED]->(r:Restaurant)<-[:LOVED]-(similar:User)
     WHERE similar.id <> $myId
     WITH me, similar, count(r) AS overlap
     ORDER BY overlap DESC
     LIMIT 20
     MATCH (similar)-[:LOVED]->(rec:Restaurant)
     WHERE NOT (me)-[:LOVED]->(rec)
     RETURN rec.id AS id, rec.name AS name, rec.city AS city, rec.cuisine AS cuisine,
            rec.price AS price, rec.rating AS rating, rec.neighborhood AS neighborhood,
            count(DISTINCT similar) AS weight,
            collect(DISTINCT similar.name)[..3] AS recommenders
     ORDER BY weight DESC
     LIMIT $limit`,
    { myId: clerkUserId, limit: neo4j.int(limit) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    city: rec.get('city'),
    cuisine: rec.get('cuisine'),
    price: rec.get('price'),
    rating: rec.get('rating')?.toNumber?.() ?? rec.get('rating'),
    neighborhood: rec.get('neighborhood'),
    weight: rec.get('weight').toNumber(),
    recommenders: rec.get('recommenders'),
  }));
}

// Rising Restaurants — most loved in last 30 days
export async function getRisingRestaurants(limit = 10) {
  const records = await runQuery(
    `MATCH (u:User)-[l:LOVED]->(r:Restaurant)
     WHERE l.timestamp > datetime() - duration('P30D')
     RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
            r.rating AS rating, count(u) AS recentLoves
     ORDER BY recentLoves DESC
     LIMIT $limit`,
    { limit: neo4j.int(limit) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    city: rec.get('city'),
    cuisine: rec.get('cuisine'),
    rating: rec.get('rating')?.toNumber?.() ?? rec.get('rating'),
    recentLoves: rec.get('recentLoves').toNumber(),
  }));
}

// Hidden Gems — good rated spots that haven't been widely discovered yet
export async function getHiddenGems(limit = 10) {
  const records = await runQuery(
    `MATCH (r:Restaurant)
     WHERE r.rating >= 8.0 AND r.rating < 9.5
     OPTIONAL MATCH (u:User)-[:LOVED]->(r)
     WITH r, count(u) AS loveCount
     WHERE loveCount <= 2
     RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
            r.rating AS rating, r.price AS price, r.neighborhood AS neighborhood,
            loveCount
     ORDER BY r.rating DESC, loveCount ASC
     LIMIT $limit`,
    { limit: neo4j.int(limit) }
  );
  return records.map(rec => ({
    id: rec.get('id'),
    name: rec.get('name'),
    city: rec.get('city'),
    cuisine: rec.get('cuisine'),
    rating: rec.get('rating')?.toNumber?.() ?? rec.get('rating'),
    price: rec.get('price'),
    neighborhood: rec.get('neighborhood'),
    loveCount: rec.get('loveCount').toNumber(),
  }));
}

// City Readiness — how explored each followed city is
export async function getCityReadiness(clerkUserId) {
  if (!clerkUserId) return [];
  const records = await runQuery(
    `MATCH (me:User {id: $myId})-[:FOLLOWS_CITY]->(c:City)<-[:LOCATED_IN]-(r:Restaurant)
     WITH me, c, collect(DISTINCT r) AS allRests
     UNWIND allRests AS r
     OPTIONAL MATCH (me)-[l:LOVED]->(r)
     WITH c, count(DISTINCT r) AS totalInCity, count(DISTINCT l) AS lovedInCity,
          collect(DISTINCT r.cuisine) AS allCuisines,
          collect(DISTINCT CASE WHEN l IS NOT NULL THEN r.cuisine ELSE NULL END) AS triedCuisinesRaw
     WITH c, totalInCity, lovedInCity,
          CASE WHEN totalInCity > 0 THEN toFloat(lovedInCity) / totalInCity ELSE 0 END AS pctExplored,
          allCuisines, [x IN triedCuisinesRaw WHERE x IS NOT NULL] AS triedCuisines
     RETURN c.name AS city, totalInCity, lovedInCity, pctExplored,
            [cuisine IN allCuisines WHERE NOT cuisine IN triedCuisines] AS untriedCuisines
     ORDER BY pctExplored DESC`,
    { myId: clerkUserId }
  );
  return records.map(rec => ({
    city: rec.get('city'),
    totalInCity: rec.get('totalInCity').toNumber(),
    lovedInCity: rec.get('lovedInCity').toNumber(),
    pctExplored: rec.get('pctExplored'),
    untriedCuisines: (rec.get('untriedCuisines') || []).filter(Boolean),
  }));
}

// 6 Degrees — shortest path between two restaurants through users
export async function getSixDegrees(restaurantId1, restaurantId2) {
  if (!restaurantId1 || !restaurantId2) return null;
  const records = await runQuery(
    `MATCH (r1:Restaurant {id: $id1}), (r2:Restaurant {id: $id2})
     MATCH path = shortestPath((r1)-[:LOVED*..12]-(r2))
     RETURN [n IN nodes(path) |
       CASE WHEN n:Restaurant THEN {type: 'restaurant', id: n.id, name: n.name, city: n.city}
            WHEN n:User THEN {type: 'user', id: n.id, name: n.name, username: n.username}
            ELSE {type: 'unknown'} END
     ] AS chain,
     length(path) AS pathLength`,
    { id1: String(restaurantId1), id2: String(restaurantId2) }
  );
  if (!records.length) return null;
  return {
    chain: records[0].get('chain'),
    pathLength: records[0].get('pathLength').toNumber(),
  };
}

// ── ADMIN FUNCTIONS ──────────────────────────────────────────

export async function getGraphStats() {
  const [users, restaurants, loves, follows, cities] = await Promise.all([
    runQuery('MATCH (u:User) RETURN count(u) AS c'),
    runQuery('MATCH (r:Restaurant) RETURN count(r) AS c'),
    runQuery('MATCH ()-[l:LOVED]->() RETURN count(l) AS c'),
    runQuery('MATCH ()-[f:FOLLOWS]->() RETURN count(f) AS c'),
    runQuery('MATCH (c:City) RETURN count(c) AS c'),
  ]);
  return {
    users: users[0]?.get('c')?.toNumber() || 0,
    restaurants: restaurants[0]?.get('c')?.toNumber() || 0,
    loves: loves[0]?.get('c')?.toNumber() || 0,
    follows: follows[0]?.get('c')?.toNumber() || 0,
    cities: cities[0]?.get('c')?.toNumber() || 0,
  };
}

export async function transferLoves(fromId, toId) {
  await runQuery(
    `MATCH (u:User)-[l:LOVED]->(from:Restaurant {id: $fromId})
     MERGE (to:Restaurant {id: $toId})
     MERGE (u)-[nl:LOVED]->(to)
     SET nl.timestamp = l.timestamp
     DELETE l`,
    { fromId: String(fromId), toId: String(toId) }
  );
}

export async function deleteUserFromGraph(clerkUserId) {
  await runQuery(
    `MATCH (u:User {id: $userId}) DETACH DELETE u`,
    { userId: clerkUserId }
  );
}
