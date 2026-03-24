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
     SET r.name = $name, r.city = $city, r.cuisine = $cuisine
     MERGE (c:City {name: $city})
     MERGE (r)-[:LOCATED_IN]->(c)`,
    { id: String(r.id), name: r.name || '', city: r.city || '', cuisine: r.cuisine || '' }
  );
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
