// ─── feed-scoring.js ──────────────────────────────────────────────────────────
//
// Server-side port of iOS `FeedScoringService` (see
// `cooked-ios/cooked/Services/FlameScoreService.swift` — search "Phase 2: Feed
// Scoring"). Pure (stateless) per-(viewer, restaurant) score. Each component
// returns 0..1; weights are applied in the aggregate.
//
// Missing inputs degrade gracefully: each component that lacks data
// contributes 0. Cold-start (zero loves) reduces to base quality only,
// matching Discover's behavior.
//
// FORMULA (locked Phase 2):
//
//   total = baseQuality · w1
//         + tasteMatch  · w2
//         + socialProof · w3
//         + freshness   · w4
//         + contextFit  · w5
//         − negative    · w6
//
// Cold-start (`viewer.lovedIds.size === 0`): every component except
// `baseQuality` returns 0, so the score reduces to flame + photos + bio.
//
// SHAPE EXPECTATIONS:
//
//   restaurant: {
//     id: number,
//     tags: string[]|null,
//     cuisine: string|null,
//     neighborhood: string|null,
//     city: string|null,
//     photoUrl: string|null,
//     description: string|null,
//     googleReviews: number|null
//   }
//
//   flameScore: number (0..5)
//
//   viewer: {
//     lovedIds: Set<number>,
//     watchlistIds: Set<number>,
//     nopedIds: Set<number>,
//     negativeReviewIds: Set<number>,
//     lovedTags: Set<string>,
//     lovedCuisines: Set<string>,
//     lovedNeighborhoods: Set<string>,
//     vibes: Set<string>,
//     followedCities: Set<string>,
//     friendLoveCountByRestaurant: Map<number, number>,
//     tastemakerRestaurants: Set<number>,
//     friendReviewedWithPhotos: Set<number>,
//     friendFoundRestaurants: Set<number>,
//     friendsNegativeReviewCountByRestaurant: Map<number, number>
//   }
//
//   engagement: { impressions: number, taps: number, lastImpressionAt: Date|null } | null
//
//   context: { now: Date }
//

// ── Weights ─────────────────────────────────────────────────────────────────
//
// All weights in one place so tuning is one-stop. Started conservative per
// discussion 2026-05-25:
// - Negative weight = 2.5 (the doc said 3.0; we softened it because our
//   5-user dataset means noisy engagement → crank up at ~100 users).
// - taste_match remains the biggest positive (2.5).
const FEED_SCORING_WEIGHTS = {
  baseQuality:     1.0,
  tasteMatch:      2.5,
  socialProof:     2.0,
  freshness:       1.5,
  contextFit:      1.0,
  // Subtracted from the total. Smaller than the doc's 3.0 because engagement
  // signals are noisy at our scale.
  negativeSignals: 2.5,
};

// ── Math helpers ────────────────────────────────────────────────────────────

/// Standard sigmoid. `sigmoid(0) = 0.5`. We typically call with
/// `sigmoid(x/N - 1)` so x = N maps to 0.5 — a "halfway threshold."
function sigmoid(x) {
  return 1.0 / (1.0 + Math.exp(-x));
}

/// Jaccard similarity |A ∩ B| / |A ∪ B|. Returns 0 for either-empty to
/// avoid the false-positive "no-tag restaurant perfectly matches a no-tag
/// viewer" case.
function jaccard(a, b) {
  if (!a || !b) return 0;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  // Iterate the smaller set for the intersection count.
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of smaller) {
    if (larger.has(v)) intersection += 1;
  }
  // |A ∪ B| = |A| + |B| − |A ∩ B|
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ── Components (each returns 0..1) ──────────────────────────────────────────

/// 0.6 · normalized flame
/// + 0.2 · sigmoid(googleReviews / 500 − 1)  (500 reviews ≈ 0.5)
/// + 0.1 · has photo
/// + 0.1 · has bio
function baseQuality(restaurant, flameScore) {
  const clampedFlame = Math.max(0, Math.min(5, Number(flameScore) || 0));
  const flame = clampedFlame / 5.0;
  const reviews = Number(restaurant.googleReviews ?? 0);
  const reviewsTerm = sigmoid(reviews / 500.0 - 1.0);
  const hasPhoto = restaurant.photoUrl ? 1.0 : 0.0;
  const hasBio = restaurant.description && restaurant.description.length > 0 ? 1.0 : 0.0;
  return 0.6 * flame + 0.2 * reviewsTerm + 0.1 * hasPhoto + 0.1 * hasBio;
}

/// 0.4 · jaccard(restaurant.tags, viewer.lovedTags)
/// + 0.3 · cuisine in viewer.lovedCuisines
/// + 0.2 · jaccard(restaurant.tags, viewer.vibes)
/// + 0.1 · neighborhood in viewer.lovedNeighborhoods
function tasteMatch(restaurant, viewer) {
  const tags = new Set(Array.isArray(restaurant.tags) ? restaurant.tags : []);
  const tagOverlap = jaccard(tags, viewer.lovedTags);

  const cuisineMatch = restaurant.cuisine && viewer.lovedCuisines.has(restaurant.cuisine) ? 1.0 : 0.0;

  const vibeOverlap = jaccard(tags, viewer.vibes);

  const neighborhoodMatch = restaurant.neighborhood && viewer.lovedNeighborhoods.has(restaurant.neighborhood)
    ? 1.0
    : 0.0;

  return 0.4 * tagOverlap + 0.3 * cuisineMatch + 0.2 * vibeOverlap + 0.1 * neighborhoodMatch;
}

/// 0.4 · sigmoid(friendLoveCount/3 − 1)  (3 friends → 0.5)
/// + 0.2 · tastemaker friend loved
/// + 0.2 · friend posted review with photos
/// + 0.2 · friend FOUND this via Find import (added 2026-05-25)
function socialProof(restaurant, viewer) {
  const rid = restaurant.id;
  const friendCount = Number(viewer.friendLoveCountByRestaurant.get(rid) ?? 0);
  const loveTerm = sigmoid(friendCount / 3.0 - 1.0);

  const tastemaker = viewer.tastemakerRestaurants.has(rid) ? 1.0 : 0.0;
  const withPhotos = viewer.friendReviewedWithPhotos.has(rid) ? 1.0 : 0.0;
  const friendFound = viewer.friendFoundRestaurants.has(rid) ? 1.0 : 0.0;

  return 0.4 * loveTerm + 0.2 * tastemaker + 0.2 * withPhotos + 0.2 * friendFound;
}

/// 0.7 · exp(−daysSinceShown / 7)         (never-shown = 1.0)
/// + 0.3 · friend FOUND this recently (per product call 2026-05-25)
function freshness(restaurant, viewer, engagement, context) {
  let daysSinceShown;
  if (!engagement || !engagement.lastImpressionAt) {
    daysSinceShown = Infinity;
  } else {
    // context.now and engagement.lastImpressionAt are Date instances.
    // Swift uses `timeIntervalSince(last)` which is seconds; divide by 86400.
    const seconds = (context.now.getTime() - engagement.lastImpressionAt.getTime()) / 1000.0;
    daysSinceShown = seconds / 86_400.0;
  }
  // exp(-Infinity / 7) = 0; matches Swift's exp(-Infinity) = 0.
  const decayTerm = Math.exp(-Math.max(0, daysSinceShown) / 7.0);

  const friendFound = viewer.friendFoundRestaurants.has(restaurant.id) ? 1.0 : 0.0;

  return 0.7 * decayTerm + 0.3 * friendFound;
}

/// 0.5 · city in viewer.followedCities
/// + 0.5 · neighborhood in viewer.lovedNeighborhoods
/// (Time-of-day flavor cut per product call — overlaps Mood Pills UX.)
function contextFit(restaurant, viewer) {
  const cityMatch = restaurant.city && viewer.followedCities.has(restaurant.city) ? 1.0 : 0.0;
  const hoodFollow = restaurant.neighborhood && viewer.lovedNeighborhoods.has(restaurant.neighborhood)
    ? 1.0
    : 0.0;
  return 0.5 * cityMatch + 0.5 * hoodFollow;
}

/// 0.35 · (passed AND <3 friends loved) — defensive net; Phase 0 already
///         filters these at candidate stage, so this is rarely > 0
/// + 0.25 · sigmoid(impressionsWithoutTap / 5 − 1)  (5 dry shows ≈ 0.5)
/// + 0.25 · viewer reviewed this ≤2★
/// + 0.15 · friend-propagation: count of friends who rated it ≤2★
///          (added Build 60 — locked decision #7)
/// Disliked-cuisines term: deferred (no signal source yet).
function negativeSignals(restaurant, viewer, engagement) {
  const rid = restaurant.id;
  const friendCount = Number(viewer.friendLoveCountByRestaurant.get(rid) ?? 0);

  const passedTerm = viewer.nopedIds.has(rid) && friendCount < 3 ? 1.0 : 0.0;

  const impressions = engagement?.impressions ?? 0;
  const taps = engagement?.taps ?? 0;
  const dryImpressions = Math.max(0, impressions - taps);
  const dryTerm = sigmoid(dryImpressions / 5.0 - 1.0);

  const lowReviewTerm = viewer.negativeReviewIds.has(rid) ? 1.0 : 0.0;

  // Friend-propagation: only fires when ≥1 friend panned the place. Sigmoid
  // centered at 2 friends so two panners ≈ 0.5, five panners ≈ 0.82. The
  // explicit `=== 0 ? 0` avoids the sigmoid floor (~0.27) penalizing places
  // no friend rated low.
  const friendNegCount = Number(viewer.friendsNegativeReviewCountByRestaurant.get(rid) ?? 0);
  const friendNegTerm = friendNegCount === 0 ? 0 : sigmoid(friendNegCount / 2.0 - 1.0);

  return 0.35 * passedTerm + 0.25 * dryTerm + 0.25 * lowReviewTerm + 0.15 * friendNegTerm;
}

// ── Main entry point ────────────────────────────────────────────────────────

/// Pure scoring engine. Computes a per-(viewer, restaurant) score from the
/// locked Phase 2 formula. Stateless — call with whatever inputs you have.
/// Each component returns 0..1; weights are applied in the aggregate.
///
/// Returns: { total, baseQuality, tasteMatch, socialProof, freshness,
///            contextFit, negative }
function scoreRestaurant(restaurant, flameScore, viewer, engagement, context) {
  // Cold-start: zero loves means we have no taste signal. Rank by base
  // quality only — matches Discover today, smooth UX for brand-new users
  // who haven't built a profile yet.
  const isColdStart = viewer.lovedIds.size === 0;

  const baseQ  = baseQuality(restaurant, flameScore);
  const tasteM = isColdStart ? 0 : tasteMatch(restaurant, viewer);
  const social = isColdStart ? 0 : socialProof(restaurant, viewer);
  const fresh  = isColdStart ? 0 : freshness(restaurant, viewer, engagement, context);
  const ctx    = isColdStart ? 0 : contextFit(restaurant, viewer);
  const neg    = isColdStart ? 0 : negativeSignals(restaurant, viewer, engagement);

  const total = baseQ  * FEED_SCORING_WEIGHTS.baseQuality
              + tasteM * FEED_SCORING_WEIGHTS.tasteMatch
              + social * FEED_SCORING_WEIGHTS.socialProof
              + fresh  * FEED_SCORING_WEIGHTS.freshness
              + ctx    * FEED_SCORING_WEIGHTS.contextFit
              - neg    * FEED_SCORING_WEIGHTS.negativeSignals;

  return {
    total,
    baseQuality: baseQ,
    tasteMatch: tasteM,
    socialProof: social,
    freshness: fresh,
    contextFit: ctx,
    negative: neg,
  };
}
