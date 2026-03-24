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
