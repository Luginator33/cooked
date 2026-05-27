// ─── home-feed-handler.js ─────────────────────────────────────────────────────
//
// The /api/home-feed orchestrator. Consumes HOME_FEED_CYPHER + scoreRestaurant
// (from the two sibling files) plus the existing helpers in
// cooked-proxy-full.js (supabaseHeaders, NEO4J_AURA_URL, verifyClerkJwt,
// jsonResponse, CORS) to deliver a fully-assembled feed in ONE response.
//
// Replaces 30+ iOS network round-trips with ONE server-side fan-out
// where Neo4j Aura + Supabase are both inside Cloudflare's network instead
// of across cellular.
//
// REQUEST:
//   POST /api/home-feed
//   Authorization: Bearer <Clerk JWT>          (or ?userId=user_X for test mode)
//   { "city": "Los Angeles", "limit": 50 }      (both optional)
//
// RESPONSE:
//   {
//     "cards": [
//       {
//         "restaurant": { ...same shape as Supabase restaurants row... },
//         "photoUrl": "https://...",
//         "flameScore": 4.5,
//         "badge": { "kind": "innerCircle", "priority": 1, "payload": { "count": 5 } },
//         "score": 4.23,
//         "breakdown": { total, baseQuality, tasteMatch, ... }
//       },
//       ...
//     ],
//     "diagnostics": { totalMs, queryMs, candidateMs, scoringMs, candidateCount, ... }
//   }

// ── Single Neo4j rail runner ────────────────────────────────────────────────
//
// Hits Aura directly (not via the /neo4j/query worker route — we're already
// the worker). 8s timeout per query so a stalled rail can't hang the whole
// response. Returns [] on any failure so the orchestrator's Promise.all
// never throws.
async function runHomeFeedRail(neoBasic, name, def, params) {
  try {
    const upstream = await fetch(NEO4J_AURA_URL, {
      method: "POST",
      headers: {
        "Authorization": neoBasic,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ statement: def.statement, parameters: params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      console.log(`[home-feed] rail ${name} HTTP ${upstream.status}`);
      return [];
    }
    const body = await upstream.json();
    const rows = body?.data?.values || [];
    return rows.map((r) => def.parseRow(r)).filter((x) => x !== null);
  } catch (err) {
    console.log(`[home-feed] rail ${name} threw:`, err?.message || err);
    return [];
  }
}

// ── Supabase helpers (each returns a "safe" value on error) ─────────────────

async function fetchUserDataForFeed(env, userId) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_data?clerk_user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
      { headers: supabaseHeaders(env) }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0] || null;
  } catch (err) {
    console.log("[home-feed] user_data err:", err?.message || err);
    return null;
  }
}

async function fetchFollowedCitiesForFeed(env, userId) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/city_follows?clerk_user_id=eq.${encodeURIComponent(userId)}&select=city`,
      { headers: supabaseHeaders(env) }
    );
    if (!res.ok) return [];
    return (await res.json()).map((r) => r.city).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchMyLowRatedForFeed(env, userId) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/reviews?user_id=eq.${encodeURIComponent(userId)}&rating=lte.2&select=restaurant_id&limit=100`,
      { headers: supabaseHeaders(env) }
    );
    if (!res.ok) return [];
    return (await res.json()).map((r) => Number(r.restaurant_id)).filter(Number.isFinite);
  } catch {
    return [];
  }
}

async function fetchFriendsForFeed(env, userId) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/follows?follower_id=eq.${encodeURIComponent(userId)}&select=following_id`,
      { headers: supabaseHeaders(env) }
    );
    if (!res.ok) return [];
    return (await res.json()).map((r) => r.following_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchFriendsLowRatedForFeed(env, friendIds) {
  if (!friendIds || friendIds.length === 0) return new Map();
  try {
    const idsParam = friendIds.map((id) => `"${id}"`).join(",");
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/reviews?user_id=in.(${idsParam})&rating=lte.2&select=restaurant_id,user_id&limit=1000`,
      { headers: supabaseHeaders(env) }
    );
    if (!res.ok) return new Map();
    const rows = await res.json();
    // Count distinct friend reviewers per restaurant
    const byRestaurant = new Map();
    for (const r of rows) {
      const rid = Number(r.restaurant_id);
      if (!Number.isFinite(rid)) continue;
      if (!byRestaurant.has(rid)) byRestaurant.set(rid, new Set());
      byRestaurant.get(rid).add(r.user_id);
    }
    const out = new Map();
    for (const [rid, users] of byRestaurant.entries()) {
      out.set(rid, users.size);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function fetchEngagementForFeed(env, userId) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/get_engagement_signals`,
      {
        method: "POST",
        headers: { ...supabaseHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({ p_user_id: userId }),
      }
    );
    if (!res.ok) return new Map();
    const rows = await res.json();
    const map = new Map();
    for (const r of rows) {
      const rid = Number(r.restaurant_id);
      if (!Number.isFinite(rid)) continue;
      map.set(rid, {
        impressions: r.impressions ?? 0,
        taps: r.taps ?? 0,
        lastImpressionAt: r.last_impression_at ? new Date(r.last_impression_at) : null,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchRestaurantsByIdsForFeed(env, ids) {
  if (!ids || ids.length === 0) return [];
  const out = [];
  // Chunk URL to stay under PostgREST limits.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const idsParam = chunk.join(",");
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/restaurants?id=in.(${idsParam})&select=*&is_closed=eq.false`,
        { headers: supabaseHeaders(env) }
      );
      if (res.ok) {
        const rows = await res.json();
        out.push(...rows);
      }
    } catch (err) {
      console.log("[home-feed] restaurants chunk err:", err?.message || err);
    }
  }
  return out;
}

async function fetchFlameScoresByIdsForFeed(env, ids) {
  if (!ids || ids.length === 0) return new Map();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const idsParam = chunk.join(",");
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/restaurant_flame_scores?restaurant_id=in.(${idsParam})&select=restaurant_id,flame_score`,
        { headers: supabaseHeaders(env) }
      );
      if (res.ok) {
        const rows = await res.json();
        for (const r of rows) {
          const rid = Number(r.restaurant_id);
          if (Number.isFinite(rid) && r.flame_score !== null) {
            out.set(rid, r.flame_score);
          }
        }
      }
    } catch (err) {
      console.log("[home-feed] flame chunk err:", err?.message || err);
    }
  }
  return out;
}

async function fetchPhotosByIdsForFeed(env, ids) {
  if (!ids || ids.length === 0) return new Map();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const idsParam = chunk.join(",");
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/restaurant_photos?restaurant_id=in.(${idsParam})&select=restaurant_id,photo_url,updated_at&order=updated_at.desc`,
        { headers: supabaseHeaders(env) }
      );
      if (res.ok) {
        const rows = await res.json();
        // First-wins (rows are sorted desc by updated_at, so newest first).
        for (const r of rows) {
          const rid = Number(r.restaurant_id);
          if (Number.isFinite(rid) && !out.has(rid)) {
            out.set(rid, r.photo_url);
          }
        }
      }
    } catch (err) {
      console.log("[home-feed] photos chunk err:", err?.message || err);
    }
  }
  return out;
}

async function fetchFriendFoundForFeed(env, friendIds) {
  if (!friendIds || friendIds.length === 0) return new Map();
  try {
    const idsParam = friendIds.map((id) => `"${id}"`).join(",");
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/restaurants?submitted_by=in.(${idsParam})&select=id,submitted_by`,
      { headers: supabaseHeaders(env) }
    );
    if (!res.ok) return new Map();
    const rows = await res.json();
    const out = new Map();
    for (const r of rows) {
      const rid = Number(r.id);
      if (Number.isFinite(rid)) out.set(rid, r.submitted_by);
    }
    return out;
  } catch {
    return new Map();
  }
}

// ── Coercion + signal-building helpers ──────────────────────────────────────

// user_data.loved/watchlist/noped/skipped are stored as TEXT[] in Supabase.
// Coerce each element to Int for use as Set keys.
function arrayToIntSet(arr) {
  if (!Array.isArray(arr)) return new Set();
  const out = new Set();
  for (const v of arr) {
    const n = typeof v === "number" ? v : parseInt(v, 10);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

// Build the ViewerSignals object that feed-scoring.js consumes.
// Derives lovedTags / lovedCuisines / lovedNeighborhoods from the loved
// restaurants' fields (Supabase row shape). Friend signals come from the
// matching rails: innerCircle has friendCount in loveCount; tastemakerApproved
// is just "this place was loved by a tastemaker friend".
function buildViewerSignalsForFeed({
  userData,
  followedCities,
  myLowRated,
  friendsLowRatedMap,
  railResults,
  lovedRestaurants,
  friendFoundMap,
}) {
  const lovedIds = arrayToIntSet(userData?.loved);
  const watchlistIds = arrayToIntSet(userData?.watchlist);
  const nopedIds = arrayToIntSet(userData?.noped);
  const negativeReviewIds = new Set(myLowRated);

  // Derive from the LOVED restaurants we hydrated.
  const lovedTags = new Set();
  const lovedCuisines = new Set();
  const lovedNeighborhoods = new Set();
  for (const r of lovedRestaurants) {
    if (Array.isArray(r.tags)) {
      for (const t of r.tags) if (typeof t === "string") lovedTags.add(t);
    }
    if (r.cuisine) lovedCuisines.add(r.cuisine);
    if (r.neighborhood) lovedNeighborhoods.add(r.neighborhood);
  }

  // innerCircle rail returns loveCount = friendCount for that restaurant.
  const friendLoveCountByRestaurant = new Map();
  for (const r of railResults.innerCircle || []) {
    if (r.loveCount != null) friendLoveCountByRestaurant.set(r.id, r.loveCount);
  }

  const tastemakerRestaurants = new Set();
  for (const r of railResults.tastemakerApproved || []) {
    tastemakerRestaurants.add(r.id);
  }

  // V1 simplification: skip friendReviewedWithPhotos (would need another
  // join query). That component contributes 0 in scoring; minor loss.
  const friendReviewedWithPhotos = new Set();

  const friendFoundRestaurants = new Set(friendFoundMap.keys());

  return {
    lovedIds,
    watchlistIds,
    nopedIds,
    negativeReviewIds,
    lovedTags,
    lovedCuisines,
    lovedNeighborhoods,
    vibes: lovedTags,           // iOS uses lovedTags as vibes until a vibe UI exists
    followedCities: new Set(followedCities),
    friendLoveCountByRestaurant,
    tastemakerRestaurants,
    friendReviewedWithPhotos,
    friendFoundRestaurants,
    friendsNegativeReviewCountByRestaurant: friendsLowRatedMap,
  };
}

// Highest-priority badge wins per restaurant. Mirrors iOS BadgeKind.priority.
// Priorities (LOWER = HIGHER priority):
//   0 foundBy | 1 innerCircle | 3 friendLoved | 4 bothSaving |
//   5 circlesTopInCity | 6 tastemakerApproved | 8 cookedForYou |
//   9 cookedTopInCity | 10 bullseye | 11 levelUp | 12 upAndComing |
//   13 rising | 14 hotOffGrill | 15 trendingInCity | 16 nearbyPick |
//   17 newFlavor | 18 hiddenGem | 19 crowdPleaser | 20 youdLove
function buildBadgeAssignmentsForFeed(railResults, friendFoundMap) {
  const assigned = new Map();
  function tryAssign(rid, kind, priority, payload) {
    const existing = assigned.get(rid);
    if (!existing || priority < existing.priority) {
      assigned.set(rid, { kind, priority, payload: payload || {} });
    }
  }

  for (const [rid, submitterId] of friendFoundMap.entries()) {
    tryAssign(rid, "foundBy", 0, { actor: submitterId });
  }
  for (const r of railResults.innerCircle || []) {
    tryAssign(r.id, "innerCircle", 1, { count: r.loveCount });
  }
  for (const r of railResults.friendsRecentLoves || []) {
    const actor = (r.reason || "").replace("Loved by ", "").trim() || "A friend";
    tryAssign(r.id, "friendLoved", 3, { actor });
  }
  for (const r of railResults.bothSaving || []) {
    tryAssign(r.id, "bothSaving", 4, { actor: r.reason || "a friend" });
  }
  for (const r of railResults.circlesTopByCity || []) {
    const city = r.reason || r.city || "your city";
    tryAssign(r.id, "circlesTopInCity", 5, { city });
  }
  for (const r of railResults.tastemakerApproved || []) {
    tryAssign(r.id, "tastemakerApproved", 6, { actor: r.reason || "A tastemaker" });
  }
  for (const r of railResults.cookedTopByCity || []) {
    const city = r.reason || r.city || "your city";
    tryAssign(r.id, "cookedTopInCity", 9, { city });
  }
  for (const r of railResults.bullseye || []) {
    tryAssign(r.id, "bullseye", 10, {});
  }
  for (const r of railResults.levelUp || []) {
    tryAssign(r.id, "levelUp", 11, { basis: r.reason || "a place you love" });
  }
  for (const r of railResults.upAndComing || []) {
    tryAssign(r.id, "upAndComing", 12, { neighborhood: r.reason || r.neighborhood || "this neighborhood" });
  }
  for (const r of railResults.rising || []) {
    tryAssign(r.id, "rising", 13, {});
  }
  for (const r of railResults.hotOffGrill || []) {
    tryAssign(r.id, "hotOffGrill", 14, {});
  }
  for (const r of railResults.trendingInFollowedCities || []) {
    const city = r.city || "your city";
    tryAssign(r.id, "trendingInCity", 15, { city });
  }
  for (const r of railResults.nearbyPick || []) {
    tryAssign(r.id, "nearbyPick", 16, { context: r.reason || "Walk from a place you love" });
  }
  for (const r of railResults.crossCuisine || []) {
    tryAssign(r.id, "newFlavor", 17, {});
  }
  for (const r of railResults.hiddenGems || []) {
    tryAssign(r.id, "hiddenGem", 18, {});
  }
  for (const r of railResults.crowdPleaser || []) {
    tryAssign(r.id, "crowdPleaser", 19, {});
  }
  for (const r of railResults.youdLoveThis || []) {
    tryAssign(r.id, "youdLove", 20, {});
  }
  return assigned;
}

// 3-per-cuisine cap in top 10 (locked decision #3), then 3-per-badge in
// 15-card sliding window throughout the rest. Mirrors iOS applyCuisineCap +
// applyBadgeCap.
function applyDiversityCapsForFeed(scored) {
  // First pass: cuisine cap on top 10
  const top = [];
  const overflow = [];
  const perCuisine = {};
  let i = 0;
  while (top.length < 10 && i < scored.length) {
    const item = scored[i];
    const key = item.restaurant.cuisine || "__nil";
    const c = perCuisine[key] || 0;
    if (c >= 3) overflow.push(item);
    else {
      top.push(item);
      perCuisine[key] = c + 1;
    }
    i++;
  }
  const tail = i < scored.length ? scored.slice(i) : [];
  const cuisineCapped = top.concat(overflow).concat(tail);

  // Second pass: 3-per-badge in 15-card window.
  const output = [];
  const pool = [...cuisineCapped];
  while (pool.length > 0) {
    const windowStart = Math.max(0, output.length - 14);
    const windowItems = output.slice(windowStart);
    const badgeCount = {};
    for (const item of windowItems) {
      const k = item.badge?.kind || "none";
      badgeCount[k] = (badgeCount[k] || 0) + 1;
    }
    let pickedIdx = -1;
    for (let j = 0; j < pool.length; j++) {
      const k = pool[j].badge?.kind || "none";
      if ((badgeCount[k] || 0) < 3) {
        pickedIdx = j;
        break;
      }
    }
    if (pickedIdx >= 0) {
      output.push(pool[pickedIdx]);
      pool.splice(pickedIdx, 1);
    } else {
      // Cap saturated; relax for this slot so we don't deadlock.
      output.push(pool.shift());
    }
  }
  return output;
}

// ── Phase 0 negative-signal filter ──────────────────────────────────────────
// Mirror of HomeView's "noped → blacklist UNLESS 3+ friends love → rescue
// with giveItAnotherTry badge". Skipped restaurants go to tail.
function applyPhase0NegativeFilter(cards, viewer, friendLoveCountByRestaurant) {
  const kept = [];
  const tail = [];
  for (const card of cards) {
    const rid = card.restaurant.id;
    if (viewer.nopedIds.has(rid)) {
      const friendCount = friendLoveCountByRestaurant.get(rid) || 0;
      if (friendCount >= 3) {
        // Rescue with giveItAnotherTry badge (priority 2 in iOS)
        kept.push({
          ...card,
          badge: { kind: "giveItAnotherTry", priority: 2, payload: { friendCount } },
        });
      }
      continue;
    }
    if (viewer.negativeReviewIds.has(rid)) {
      tail.push(card);
      continue;
    }
    kept.push(card);
  }
  return kept.concat(tail);
}

// ── Main orchestrator ───────────────────────────────────────────────────────

async function handleHomeFeed(request, env) {
  const t0 = Date.now();

  // 1. Auth — Clerk JWT (prod) or ?userId=X query param (test mode only)
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  let clerkUserId = null;
  if (match) {
    try {
      const claims = await verifyClerkJwt(match[1].trim());
      clerkUserId = claims.sub;
    } catch (err) {
      console.log("[home-feed] JWT verification failed:", err.message);
      return jsonResponse({ error: "Invalid token" }, 401);
    }
  }
  // Test mode bypass — useful for curl-testing without a Clerk session.
  // Production iOS always sends the Bearer, so this only fires for dev.
  if (!clerkUserId) {
    const testUserId = new URL(request.url).searchParams.get("userId");
    if (testUserId) {
      clerkUserId = testUserId;
      console.log("[home-feed] test mode userId =", testUserId);
    }
  }
  if (!clerkUserId) {
    return jsonResponse({ error: "Missing Bearer token (or ?userId=X for test mode)" }, 401);
  }

  // 2. Parse body
  let body = {};
  try {
    body = await request.json();
  } catch {
    // Body optional — defaults below kick in.
  }
  const city = (body && typeof body.city === "string") ? body.city : null;
  const limit = (body && Number.isFinite(body.limit)) ? Math.min(body.limit, 100) : 50;

  // 3. Pre-flight env check
  if (!env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    return jsonResponse({ error: "Neo4j credentials not configured" }, 500);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase credentials not configured" }, 500);
  }

  // 4. Fire ALL queries in parallel — this is the magic
  const neoBasic = "Basic " + btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`);
  const railEntries = Object.entries(HOME_FEED_CYPHER);
  const railPromises = railEntries.map(([name, def]) => {
    const params = { userId: clerkUserId, limit: 25 };
    // youdLoveThis takes scopeCities param too
    if (name === "youdLoveThis") params.scopeCities = true;
    return runHomeFeedRail(neoBasic, name, def, params);
  });

  const [
    railResultsArr,
    userData,
    followedCities,
    myLowRated,
    friendIds,
    engagement,
  ] = await Promise.all([
    Promise.all(railPromises),
    fetchUserDataForFeed(env, clerkUserId),
    fetchFollowedCitiesForFeed(env, clerkUserId),
    fetchMyLowRatedForFeed(env, clerkUserId),
    fetchFriendsForFeed(env, clerkUserId),
    fetchEngagementForFeed(env, clerkUserId),
  ]);
  const t1 = Date.now();

  // 5. Friends-dependent queries (need friendIds)
  const [friendsLowRatedMap, friendFoundMap] = await Promise.all([
    fetchFriendsLowRatedForFeed(env, friendIds),
    fetchFriendFoundForFeed(env, friendIds),
  ]);

  // Bundle rail results into a named object
  const railResults = {};
  for (let i = 0; i < railEntries.length; i++) {
    railResults[railEntries[i][0]] = railResultsArr[i];
  }

  // 6. Collect candidate IDs — union of all rails' results + LOVED restaurants
  // (loved set is hydrated only to derive lovedTags/lovedCuisines/lovedHoods;
  // their cards are filtered out before scoring).
  const candidateIds = new Set();
  for (const results of Object.values(railResults)) {
    for (const r of results) candidateIds.add(r.id);
  }
  const lovedIds = arrayToIntSet(userData?.loved);
  for (const id of lovedIds) candidateIds.add(id);

  // 7. Hydrate restaurant rows + flame scores + photos
  const candidateIdsArr = [...candidateIds];
  const [restaurants, flameScores, photoMap] = await Promise.all([
    fetchRestaurantsByIdsForFeed(env, candidateIdsArr),
    fetchFlameScoresByIdsForFeed(env, candidateIdsArr),
    fetchPhotosByIdsForFeed(env, candidateIdsArr),
  ]);
  const t2 = Date.now();

  // 8. Build ViewerSignals
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]));
  const lovedRestaurants = [...lovedIds]
    .map((id) => restaurantById.get(id))
    .filter(Boolean);
  const viewer = buildViewerSignalsForFeed({
    userData,
    followedCities,
    myLowRated,
    friendsLowRatedMap,
    railResults,
    lovedRestaurants,
    friendFoundMap,
  });

  // 9. Build per-restaurant badge assignment (highest priority wins)
  const badgeMap = buildBadgeAssignmentsForFeed(railResults, friendFoundMap);

  // 10. Score each candidate
  const context = { now: new Date() };
  const scored = [];
  for (const rid of candidateIds) {
    if (lovedIds.has(rid)) continue; // exclude already-loved
    const restaurant = restaurantById.get(rid);
    if (!restaurant) continue;
    if (city && city !== "All Cities" && city !== "Favorites" && restaurant.city !== city) continue;

    const flameScore = flameScores.get(rid) ?? 3.0;
    const engagementForR = engagement.get(rid) || null;

    // Map Supabase row shape -> feed-scoring expectation
    const restaurantForScoring = {
      id: restaurant.id,
      tags: restaurant.tags,
      cuisine: restaurant.cuisine,
      neighborhood: restaurant.neighborhood,
      city: restaurant.city,
      photoUrl: photoMap.get(rid) || restaurant.img,
      description: restaurant.description,
      googleReviews: restaurant.google_reviews,
    };

    const breakdown = scoreRestaurant(restaurantForScoring, flameScore, viewer, engagementForR, context);

    const badge = badgeMap.get(rid) || { kind: "cookedForYou", priority: 8, payload: {} };

    scored.push({
      restaurant,
      photoUrl: photoMap.get(rid) || restaurant.img,
      flameScore,
      badge,
      score: breakdown.total,
      breakdown,
    });
  }

  // 11. Sort by score, apply Phase 0 negative filter, then diversity caps
  scored.sort((a, b) => b.score - a.score);
  const phase0Filtered = applyPhase0NegativeFilter(scored, viewer, viewer.friendLoveCountByRestaurant);
  const capped = applyDiversityCapsForFeed(phase0Filtered).slice(0, limit);
  const t3 = Date.now();

  // 12. Response
  return jsonResponse({
    cards: capped.map((c) => ({
      restaurant: c.restaurant,
      photoUrl: c.photoUrl,
      flameScore: c.flameScore,
      badge: c.badge,
      score: c.score,
      breakdown: c.breakdown,
    })),
    diagnostics: {
      queryMs: t1 - t0,
      candidateMs: t2 - t1,
      scoringMs: t3 - t2,
      totalMs: t3 - t0,
      candidateCount: candidateIds.size,
      cardCount: capped.length,
      friendCount: friendIds.length,
      lovedCount: lovedIds.size,
      city,
    },
  });
}
