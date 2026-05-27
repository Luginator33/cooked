// ─── home-feed-cypher.js ──────────────────────────────────────────────────────
//
// Server-side port of the 17 iOS Neo4j "home feed" rails. Each entry exports
// the EXACT Cypher string from `cooked-ios/cooked/Services/Neo4jService.swift`
// plus a `parseRow` function that decodes one Aura Query API v2 row into a
// `RecommendedRestaurant`-shaped object.
//
// AURA RESPONSE SHAPE (verified against `handleNeo4jQuery` in
// `cooked-proxy-full.js` — the worker passes the upstream body through
// unchanged, and iOS reads `json.data.values` as `[[Any]]`):
//
//   {
//     "data": {
//       "fields": ["id", "name", "city", ...],
//       "values": [
//         [<col0>, <col1>, <col2>, ...],   // row 0
//         [<col0>, <col1>, <col2>, ...],   // row 1
//         ...
//       ]
//     }
//   }
//
// Each `parseRow` takes ONE row's values array (e.g. `[<col0>, <col1>, ...]`)
// and returns `{ id, name, city, cuisine, neighborhood, rating, loveCount,
// reason }`. Caller iterates over `data.values` and applies parseRow per row,
// dropping null returns (matching Swift's `compactMap`).
//
// PARAMETER SHAPES are documented on each rail. Required keys map 1:1 to the
// Cypher `$placeholders`. Defaults match the Swift defaults.
//
// All rails return shape: { id: number, name: string, city: string|null,
// cuisine: string|null, neighborhood: string|null, rating: number|null,
// loveCount: number|null, reason: string|null }.

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Restaurant IDs in Neo4j may have been stored as Int (iOS bootstrap) or
/// String (legacy web seeding). Mirrors `Neo4jService.coerceInt` in Swift.
function coerceInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  // Neo4j integer driver objects (Aura v2 sometimes returns {low, high})
  if (typeof value === "object" && "low" in value && typeof value.low === "number") {
    return value.low;
  }
  return null;
}

/// Coerces Aura's loose number representations to a JS number. Used for
/// `rating` (double) and counts that we want as Number rather than Int.
function coerceNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && "low" in value && typeof value.low === "number") {
    return value.low;
  }
  return null;
}

function coerceString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return String(value);
}

function coerceStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string");
}

// ── Rails ───────────────────────────────────────────────────────────────────

const HOME_FEED_CYPHER = {

  // ── 1. getRisingRestaurants ────────────────────────────────────────────────
  // Most-buzz restaurants in the last 30 days. Weighted multi-signal score:
  //   share = 5pts, reservation = 4pts, dm = 3.5pts, love = 3pts, watchlist = 1pt.
  // Params: { userId: string|null, limit: number = 5 }
  rising: {
    statement: `MATCH (u:User)-[rel]->(r:Restaurant)
WHERE type(rel) IN ['LOVED', 'WATCHLISTED', 'SHARED', 'RESERVED', 'DMD']
  AND rel.timestamp > datetime() - duration('P30D')
  AND ($userId IS NULL OR NOT EXISTS {
      MATCH (me:User {id: $userId})-[:LOVED]->(r)
  })
WITH r,
     count(DISTINCT CASE type(rel) WHEN 'LOVED' THEN u END) AS loveCount,
     count(DISTINCT CASE type(rel) WHEN 'WATCHLISTED' THEN u END) AS watchCount,
     count(CASE type(rel) WHEN 'SHARED' THEN rel END) AS shareCount,
     count(CASE type(rel) WHEN 'RESERVED' THEN rel END) AS reserveCount,
     count(CASE type(rel) WHEN 'DMD' THEN rel END) AS dmCount
WITH r, loveCount, watchCount, shareCount, reserveCount, dmCount,
     (loveCount * 3.0) + (watchCount * 1.0) + (shareCount * 5.0)
      + (reserveCount * 4.0) + (dmCount * 3.5) AS buzzScore
WHERE buzzScore > 0
ORDER BY buzzScore DESC, coalesce(r.rating, 0) DESC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating,
       loveCount, watchCount, shareCount, reserveCount, dmCount, buzzScore`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const loves = coerceInt(values[6]) ?? 0;
      const watches = coerceInt(values[7]) ?? 0;
      const shares = coerceInt(values[8]) ?? 0;
      // Most descriptive reason: largest single signal wins.
      let reason;
      if (shares > 0) reason = `${shares} friend${shares === 1 ? "" : "s"} sharing it`;
      else if (loves > 0) reason = `${loves} recent love${loves === 1 ? "" : "s"}`;
      else if (watches > 0) reason = `${watches} saving it`;
      else reason = "Trending";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: loves,
        reason,
      };
    },
  },

  // ── 2. getHiddenGems ───────────────────────────────────────────────────────
  // High-rated restaurants that almost no one has loved yet.
  // Threshold: loveCount <= 2 (works at 5-user scale; revisit at ~50 users).
  // Params: { userId: string|null, limit: number = 5 }
  hiddenGems: {
    statement: `MATCH (r:Restaurant)
WHERE r.rating >= 4.0 AND r.rating <= 5.0
  AND ($userId IS NULL OR NOT EXISTS {
      MATCH (me:User {id: $userId})-[:LOVED]->(r)
  })
OPTIONAL MATCH (u:User)-[:LOVED]->(r)
WITH r, count(u) AS loveCount
WHERE loveCount <= 2
ORDER BY r.rating DESC, loveCount ASC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating, loveCount`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const count = coerceInt(values[6]) ?? 0;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: count,
        reason: count === 0 ? "Undiscovered" : `Only ${count} people know`,
      };
    },
  },

  // ── 3. getYoudLoveThis ─────────────────────────────────────────────────────
  // Collaborative filter: places loved by users who love what you love.
  // scopeToMyCities (default true) restricts results to the viewer's cities.
  // Params: { userId: string, limit: number = 6, scopeCities: boolean = true }
  youdLoveThis: {
    statement: `MATCH (me:User {id: $userId})-[:LOVED]->(myR:Restaurant)
WITH me, collect(DISTINCT myR.city) AS myCities, collect(DISTINCT myR) AS myLoves
UNWIND myLoves AS r
MATCH (r)<-[:LOVED]-(similar:User)
WHERE similar.id <> $userId
MATCH (similar)-[:LOVED]->(rec:Restaurant)
WHERE NOT (me)-[:LOVED]->(rec) AND rec.id <> r.id
  AND ($scopeCities = false OR rec.city IN myCities)
WITH rec, count(DISTINCT similar) AS matchCount
ORDER BY matchCount DESC, coalesce(rec.rating, 0) DESC
LIMIT $limit
RETURN rec.id AS id, rec.name AS name, rec.city AS city, rec.cuisine AS cuisine,
       rec.neighborhood AS neighborhood, rec.rating AS rating, matchCount`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const matches = coerceInt(values[6]) ?? 0;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: matches,
        reason: `${matches} taste matches`,
      };
    },
  },

  // ── 4. getFriendsRecentLoves ───────────────────────────────────────────────
  // Restaurants loved by friends (FOLLOWS) within the last 30 days, ordered
  // by love timestamp DESC. Returns `friend.name` so HomeView can render
  // "Loved by <name>".
  // Params: { userId: string, limit: number = 10 }
  friendsRecentLoves: {
    statement: `MATCH (me:User {id: $userId})-[:FOLLOWS]->(friend:User)-[l:LOVED]->(r:Restaurant)
WHERE l.timestamp > datetime() - duration('P30D')
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating,
       friend.name AS friendName
ORDER BY l.timestamp DESC
LIMIT $limit`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: null,
        reason: `Loved by ${coerceString(values[6]) ?? "a friend"}`,
      };
    },
  },

  // ── 5. getInnerCircle ──────────────────────────────────────────────────────
  // Restaurants where >= 3 followed users LOVED. friendCount returned in
  // `loveCount` so HomeView can choose between warm phrasing and the numeric
  // "8 friends love it" past 3.
  // Params: { userId: string, limit: number = 25 }
  innerCircle: {
    statement: `MATCH (me:User {id: $userId})-[:FOLLOWS]->(friend:User)-[:LOVED]->(r:Restaurant)
WHERE NOT EXISTS { MATCH (me)-[:LOVED]->(r) }
WITH r, count(DISTINCT friend) AS friendCount
WHERE friendCount >= 3
ORDER BY friendCount DESC, coalesce(r.rating, 0) DESC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating, friendCount`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const count = coerceInt(values[6]) ?? 3;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: count,
        reason: `${count} friends love it`,
      };
    },
  },

  // ── 6. getBothSaving ───────────────────────────────────────────────────────
  // Both viewer AND a followed friend WATCHLISTED the same restaurant.
  // Returns friend's display name in `reason` so HomeView can render
  // "You + <name> saved this". Picks first friend deterministically via
  // ORDER BY friend.id when multiple friends saved the same place.
  // Params: { userId: string, limit: number = 25 }
  bothSaving: {
    statement: `MATCH (me:User {id: $userId})-[:WATCHLISTED]->(r:Restaurant)
MATCH (me)-[:FOLLOWS]->(friend:User)-[:WATCHLISTED]->(r)
WHERE NOT EXISTS { MATCH (me)-[:LOVED]->(r) }
WITH r, friend
ORDER BY friend.id
WITH r, head(collect(friend)) AS f
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating,
       f.name AS friendName
ORDER BY coalesce(r.rating, 0) DESC
LIMIT $limit`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const friendName = coerceString(values[6]) ?? "a friend";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: null,
        reason: friendName,
      };
    },
  },

  // ── 7. getCirclesTopByCity ─────────────────────────────────────────────────
  // For each city the viewer FOLLOWS_CITY, the #1 restaurant among friend
  // graph (by friend love count). One row per city. Returns city name in
  // `reason` so HomeView can render "Your circle's #1 in <city>".
  // Params: { userId: string, limit: number = 25 }
  circlesTopByCity: {
    statement: `MATCH (me:User {id: $userId})-[:FOLLOWS_CITY]->(c:City)
WITH me, collect(c.name) AS cities
MATCH (me)-[:FOLLOWS]->(friend:User)-[:LOVED]->(r:Restaurant)
WHERE r.city IN cities AND NOT EXISTS { MATCH (me)-[:LOVED]->(r) }
WITH r, r.city AS city, count(DISTINCT friend) AS friendCount
ORDER BY friendCount DESC, coalesce(r.rating, 0) DESC
WITH city, head(collect({r: r, c: friendCount})) AS top
RETURN top.r.id AS id, top.r.name AS name, top.r.city AS city,
       top.r.cuisine AS cuisine, top.r.neighborhood AS neighborhood,
       top.r.rating AS rating, top.c AS friendCount, city AS cityName
LIMIT $limit`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const cityName = coerceString(values[7]) ?? coerceString(values[2]) ?? "";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[6]),
        reason: cityName,
      };
    },
  },

  // ── 8. getTastemakerApproved ───────────────────────────────────────────────
  // Restaurants loved by users with >= 3 followers. Surfaces signal beyond
  // viewer's direct social graph. Returns tastemaker's display name in
  // `reason` so HomeView can render "<name> co-signs this".
  // Params: { userId: string, limit: number = 25 }
  tastemakerApproved: {
    statement: `MATCH (tm:User)
WITH tm, size([(u:User)-[:FOLLOWS]->(tm) | u]) AS followers
WHERE followers >= 3
MATCH (tm)-[:LOVED]->(r:Restaurant)
WHERE NOT EXISTS { MATCH (me:User {id: $userId})-[:LOVED]->(r) }
WITH r, collect(DISTINCT tm.name)[0] AS tastemakerName, count(DISTINCT tm) AS tasteCount
ORDER BY tasteCount DESC, coalesce(r.rating, 0) DESC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating,
       tastemakerName, tasteCount`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const name = coerceString(values[6]) ?? "A tastemaker";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[7]),
        reason: name,
      };
    },
  },

  // ── 9. getCookedTopByCity ──────────────────────────────────────────────────
  // For each city viewer follows, the restaurant with the highest community
  // LOVED count. Different from circlesTopByCity (friend-graph scoped) —
  // this is the broader community's top pick. Returns city name in `reason`
  // so HomeView can render "Cooked's #1 in <city>".
  // Params: { userId: string, limit: number = 25 }
  cookedTopByCity: {
    statement: `MATCH (me:User {id: $userId})-[:FOLLOWS_CITY]->(c:City)
WITH me, collect(c.name) AS cities
MATCH (r:Restaurant)
WHERE r.city IN cities AND NOT EXISTS { MATCH (me)-[:LOVED]->(r) }
OPTIONAL MATCH (:User)-[:LOVED]->(r)
WITH r, count(*) AS loveCount
WHERE loveCount > 0
WITH r.city AS city, r, loveCount
ORDER BY loveCount DESC, coalesce(r.rating, 0) DESC
WITH city, head(collect({r: r, c: loveCount})) AS top
RETURN top.r.id AS id, top.r.name AS name, top.r.city AS city,
       top.r.cuisine AS cuisine, top.r.neighborhood AS neighborhood,
       top.r.rating AS rating, top.c AS loveCount, city AS cityName
LIMIT $limit`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const cityName = coerceString(values[7]) ?? coerceString(values[2]) ?? "";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[6]),
        reason: cityName,
      };
    },
  },

  // ── 10. getLevelUp ─────────────────────────────────────────────────────────
  // A higher-rated restaurant sharing 3+ tags with a place the viewer
  // already loved. Returns basis restaurant's name in `reason` so HomeView
  // can render "Level up: <basis>". Ordered by the rating delta so the
  // strongest upgrades surface first.
  // Params: { userId: string, limit: number = 25 }
  levelUp: {
    statement: `MATCH (me:User {id: $userId})-[:LOVED]->(loved:Restaurant)-[:HAS_TAG]->(t:Tag)
WITH me, loved, collect(t.name) AS tags
MATCH (cand:Restaurant)-[:HAS_TAG]->(ct:Tag)
WHERE ct.name IN tags AND cand.id <> loved.id
  AND NOT EXISTS { MATCH (me)-[:LOVED]->(cand) }
WITH me, loved, cand, count(DISTINCT ct.name) AS sharedTags
WHERE sharedTags >= 3
  AND coalesce(cand.rating, 0) > coalesce(loved.rating, 0)
ORDER BY (coalesce(cand.rating, 0) - coalesce(loved.rating, 0)) DESC, sharedTags DESC
LIMIT $limit
RETURN cand.id AS id, cand.name AS name, cand.city AS city, cand.cuisine AS cuisine,
       cand.neighborhood AS neighborhood, cand.rating AS rating,
       loved.name AS basis, sharedTags`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const basis = coerceString(values[6]) ?? "";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[7]),
        reason: basis,
      };
    },
  },

  // ── 11. getBullseye ────────────────────────────────────────────────────────
  // Restaurants matching the viewer's top-3 most-frequent tags. Rare hit
  // (requires 3 tag matches) — when it lands, it's a strong personalization
  // signal.
  // Params: { userId: string, limit: number = 25 }
  bullseye: {
    statement: `MATCH (me:User {id: $userId})-[:LOVED]->(:Restaurant)-[:HAS_TAG]->(t:Tag)
WITH me, t.name AS tag, count(*) AS freq
ORDER BY freq DESC LIMIT 3
WITH me, collect(tag) AS topTags
MATCH (cand:Restaurant)-[:HAS_TAG]->(ct:Tag)
WHERE ct.name IN topTags AND NOT EXISTS { MATCH (me)-[:LOVED]->(cand) }
WITH cand, count(DISTINCT ct.name) AS matched
WHERE matched >= 3
ORDER BY matched DESC, coalesce(cand.rating, 0) DESC
LIMIT $limit
RETURN cand.id AS id, cand.name AS name, cand.city AS city, cand.cuisine AS cuisine,
       cand.neighborhood AS neighborhood, cand.rating AS rating, matched`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[6]),
        reason: "Bullseye",
      };
    },
  },

  // ── 12. getNearbyPick ──────────────────────────────────────────────────────
  // Proximity-based recommendation anchored on a place the viewer loved
  // (within 800m). Tag-derived category context ("Drinks near" / "Brunch
  // near" / "Dessert near" / "Walk from") is computed in JS after Cypher
  // returns — Cypher returns the raw tag list and JS does the English match.
  //
  // Encoded in `reason` as "<context>||<anchor>" so HomeView can split both
  // pieces back out. The `||` separator is unique enough that no restaurant
  // or context phrase will collide with it.
  // Params: { userId: string, limit: number = 25 }
  nearbyPick: {
    statement: `MATCH (me:User {id: $userId})-[:LOVED]->(anchor:Restaurant)
WHERE anchor.lat IS NOT NULL AND anchor.lng IS NOT NULL
WITH me, anchor, point({latitude: anchor.lat, longitude: anchor.lng}) AS aPoint
MATCH (cand:Restaurant)
WHERE cand.id <> anchor.id
  AND cand.lat IS NOT NULL AND cand.lng IS NOT NULL
  AND NOT EXISTS { MATCH (me)-[:LOVED]->(cand) }
WITH me, anchor, cand,
     point.distance(aPoint, point({latitude: cand.lat, longitude: cand.lng})) AS meters
WHERE meters < 800
OPTIONAL MATCH (cand)-[:HAS_TAG]->(tag:Tag)
WITH anchor, cand, meters, collect(tag.name) AS candTags
ORDER BY meters ASC, coalesce(cand.rating, 0) DESC
LIMIT $limit
RETURN cand.id AS id, cand.name AS name, cand.city AS city, cand.cuisine AS cuisine,
       cand.neighborhood AS neighborhood, cand.rating AS rating,
       anchor.name AS anchorName, candTags, meters`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const anchorName = coerceString(values[6]) ?? "a place you love";
      const tags = coerceStringArray(values[7]);
      // Category-aware context. Tag lookup is case-insensitive so a
      // mixed-case "Cocktail Bar" tag still matches. Ordered: drinks beat
      // coffee beats dessert beats walk-from default. (A bar that also tags
      // "Café" reads as "Drinks near" — the more unusual / interesting
      // outing wins.)
      const lowered = new Set(tags.map((t) => t.toLowerCase()));
      const drinks = new Set(["cocktail bar", "bar", "wine bar", "speakeasy"]);
      const brunch = new Set(["brunch", "coffee", "café", "cafe", "bakery"]);
      const dessert = new Set(["dessert", "ice cream", "patisserie"]);
      const intersects = (a, b) => {
        for (const v of a) if (b.has(v)) return true;
        return false;
      };
      let context;
      if (intersects(lowered, drinks)) context = "Drinks near";
      else if (intersects(lowered, brunch)) context = "Brunch near";
      else if (intersects(lowered, dessert)) context = "Dessert near";
      else context = "Walk from";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: null,
        reason: `${context}||${anchorName}`,
      };
    },
  },

  // ── 13. getUpAndComing ─────────────────────────────────────────────────────
  // Neighborhoods seeing an interaction surge in the last 30 days vs the
  // prior 90. Returns restaurants in those neighborhoods with the rising
  // neighborhood name in `reason` so HomeView can render
  // "Up-and-coming: <neighborhood>".
  //
  // Threshold: >= 5 recent interactions AND recent > prior * 1.6. Picks the
  // top 5 surging neighborhoods, then returns restaurants from those
  // neighborhoods ordered by rating.
  // Params: { userId: string, limit: number = 25 }
  upAndComing: {
    statement: `MATCH (u:User)-[rel]->(r:Restaurant)
WHERE r.neighborhood IS NOT NULL
  AND type(rel) IN ['LOVED','WATCHLISTED','SHARED','RESERVED','DMD']
WITH r.neighborhood AS hood, r.city AS city, rel.timestamp AS ts
WITH hood, city,
     sum(CASE WHEN ts > datetime() - duration('P30D') THEN 1 ELSE 0 END) AS recent,
     sum(CASE WHEN ts > datetime() - duration('P120D')
               AND ts < datetime() - duration('P30D') THEN 1 ELSE 0 END) AS prior
WHERE recent >= 5 AND recent > prior * 1.6
WITH hood, city, recent - prior AS lift
ORDER BY lift DESC
LIMIT 5
MATCH (cand:Restaurant {neighborhood: hood, city: city})
WHERE NOT EXISTS { MATCH (me:User {id: $userId})-[:LOVED]->(cand) }
RETURN cand.id AS id, cand.name AS name, cand.city AS city, cand.cuisine AS cuisine,
       cand.neighborhood AS neighborhood, cand.rating AS rating, hood AS surgingHood
ORDER BY coalesce(cand.rating, 0) DESC
LIMIT $limit`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const hood = coerceString(values[6]) ?? coerceString(values[4]) ?? "this neighborhood";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: null,
        reason: hood,
      };
    },
  },

  // ── 14. getHotOffGrill ─────────────────────────────────────────────────────
  // Recently-created restaurants with >= 3 loves.
  // SCHEMA NOTE: Restaurant nodes don't have a `createdAt` property in the
  // current schema. We use love-timestamp-based "fresh interactions" as the
  // proxy: a restaurant accumulating loves over the last 30 days but with
  // zero loves before that reads as "new on the scene." Requires
  // priorLoves * 2 < recentLoves (recent activity is 2x prior).
  // Params: { userId: string, limit: number = 25 }
  hotOffGrill: {
    statement: `MATCH (r:Restaurant)
WHERE NOT EXISTS { MATCH (me:User {id: $userId})-[:LOVED]->(r) }
OPTIONAL MATCH (:User)-[recentLove:LOVED]->(r)
  WHERE recentLove.timestamp > datetime() - duration('P30D')
WITH r, count(recentLove) AS recentLoves
WHERE recentLoves >= 3
OPTIONAL MATCH (:User)-[priorLove:LOVED]->(r)
  WHERE priorLove.timestamp < datetime() - duration('P30D')
WITH r, recentLoves, count(priorLove) AS priorLoves
WHERE priorLoves * 2 < recentLoves
ORDER BY recentLoves DESC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating, recentLoves`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[6]),
        reason: "Hot off the grill",
      };
    },
  },

  // ── 15. getCrowdPleaser ────────────────────────────────────────────────────
  // High SHARE + DMD count in the last 90 days. Surfaces places people keep
  // sending to friends — a stronger "everyone loves this" signal than raw
  // love counts, since sharing is an active export of recommendation.
  // Threshold: socialScore >= 5.
  // Params: { userId: string, limit: number = 25 }
  crowdPleaser: {
    statement: `MATCH (r:Restaurant)
WHERE NOT EXISTS { MATCH (me:User {id: $userId})-[:LOVED]->(r) }
OPTIONAL MATCH (:User)-[s:SHARED]->(r)
  WHERE s.timestamp > datetime() - duration('P90D')
WITH r, count(s) AS shareCount
OPTIONAL MATCH (:User)-[d:DMD]->(r)
  WHERE d.timestamp > datetime() - duration('P90D')
WITH r, shareCount, count(d) AS dmCount
WITH r, shareCount + dmCount AS socialScore
WHERE socialScore >= 5
ORDER BY socialScore DESC, coalesce(r.rating, 0) DESC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating, socialScore`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[6]),
        reason: "Crowd pleaser",
      };
    },
  },

  // ── 16. getCrossCuisineRecs ────────────────────────────────────────────────
  // Cross-cuisine fallback: "same city, different cuisine." Tag overlap
  // would be ideal but with a tiny graph HAS_TAG edges may be missing —
  // this fallback ensures the rail has signal at small scale.
  // Params: { userId: string, limit: number = 6 }
  crossCuisine: {
    statement: `MATCH (me:User {id: $userId})-[:LOVED]->(r:Restaurant)
WITH me, collect(DISTINCT r.city) AS myCities, collect(DISTINCT r.cuisine) AS myCuisines
MATCH (rec:Restaurant)
WHERE rec.city IN myCities
      AND rec.cuisine IS NOT NULL
      AND NOT rec.cuisine IN myCuisines
      AND NOT (me)-[:LOVED]->(rec)
WITH rec, coalesce(rec.rating, 0) AS score
ORDER BY score DESC
LIMIT $limit
RETURN rec.id AS id, rec.name AS name, rec.city AS city, rec.cuisine AS cuisine,
       rec.neighborhood AS neighborhood, rec.rating AS rating, score`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: null,
        reason: "Same vibes, new cuisine",
      };
    },
  },

  // ── 17. getTrendingInFollowedCities ────────────────────────────────────────
  // Trending restaurants in cities the user follows (last 30 days, multi-
  // signal buzz like Rising). Same weighted score as Rising, scoped to the
  // viewer's followed cities (excludes own activity via `u.id <> $userId`).
  // Params: { userId: string, limit: number = 6 }
  trendingInFollowedCities: {
    statement: `MATCH (me:User {id: $userId})-[:FOLLOWS_CITY]->(c:City)
WITH me, collect(c.name) AS cityNames
MATCH (u:User)-[rel]->(r:Restaurant)
WHERE r.city IN cityNames
  AND type(rel) IN ['LOVED', 'WATCHLISTED', 'SHARED', 'RESERVED', 'DMD']
  AND rel.timestamp > datetime() - duration('P30D')
  AND u.id <> $userId
  AND NOT EXISTS { MATCH (me)-[:LOVED]->(r) }
WITH r,
     count(DISTINCT CASE type(rel) WHEN 'LOVED' THEN u END) AS loveCount,
     count(DISTINCT CASE type(rel) WHEN 'WATCHLISTED' THEN u END) AS watchCount,
     count(CASE type(rel) WHEN 'SHARED' THEN rel END) AS shareCount,
     count(CASE type(rel) WHEN 'RESERVED' THEN rel END) AS reserveCount,
     count(CASE type(rel) WHEN 'DMD' THEN rel END) AS dmCount
WITH r, loveCount,
     (loveCount * 3.0) + (watchCount * 1.0) + (shareCount * 5.0)
      + (reserveCount * 4.0) + (dmCount * 3.5) AS buzzScore
WHERE buzzScore > 0
ORDER BY buzzScore DESC, coalesce(r.rating, 0) DESC
LIMIT $limit
RETURN r.id AS id, r.name AS name, r.city AS city, r.cuisine AS cuisine,
       r.neighborhood AS neighborhood, r.rating AS rating, loveCount`,
    parseRow: (values) => {
      const id = coerceInt(values[0]);
      if (id === null) return null;
      const cityName = coerceString(values[2]) ?? "";
      return {
        id,
        name: coerceString(values[1]) ?? "Unknown",
        city: coerceString(values[2]),
        cuisine: coerceString(values[3]),
        neighborhood: coerceString(values[4]),
        rating: coerceNumber(values[5]),
        loveCount: coerceInt(values[6]),
        reason: cityName === "" ? "Trending" : `Trending in ${cityName}`,
      };
    },
  },
};
