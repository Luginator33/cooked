/**
 * Cooked Proxy Worker — Cloudflare Worker
 *
 * Routes:
 *   POST /           — Claude API proxy (existing)
 *   POST /fetch-url  — Fetch a single URL, return extracted text
 *   POST /crawl      — Fetch a page, follow all links, fetch those too
 *   POST /neo4j/query — Authenticated Neo4j proxy (Clerk JWT required)
 *   GET  /auto-research/status — Check last auto-research run
 *   POST /auto-research/run   — Manually trigger auto-research
 *
 * Cron trigger:
 *   Runs auto-research twice a week (configured in wrangler.toml or dashboard)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── HTML text extraction ──────────────────────────────────
function extractText(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ── Extract links from HTML ───────────────────────────────
function extractLinks(html) {
  const links = [];
  const seen = new Set();
  const regex = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let url = match[1];
    try {
      const u = new URL(url);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "igshid"].forEach(p => u.searchParams.delete(p));
      url = u.toString();
    } catch { continue; }
    if (seen.has(url)) continue;
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|mp4|mp3)(\?|$)/i.test(url)) continue;
    if (/(facebook\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|login|signup|privacy|terms|mailto:)/i.test(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links;
}

// ── Fetch a single URL ────────────────────────────────────
async function fetchUrl(url) {
  // 10s hard cap on the page fetch. Without it, a slow/hanging
  // upstream (cough michelin.com cough) would keep the await open
  // until Cloudflare's wall-clock limit kills the worker — no
  // catch handler runs, no finishScrapeLog row gets written, and
  // the cron looks like a black box. AbortSignal.timeout throws an
  // AbortError after 10s, which the outer source loop catches and
  // logs. 2026-05-16.
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return { html, text: extractText(html), url: res.url };
}

// ── Route: POST /extract-from-social ──────────────────────
//
// Pulls structured place data out of a TikTok or Instagram URL. iOS
// calls this from the "+ Add a find" sheet on the user's Profile.
// Response shape:
//   {
//     platform: 'tiktok' | 'instagram',
//     caption: string,                  // original creator caption
//     author: string|null,              // @handle if available
//     thumbnail: string|null,           // post thumbnail URL
//     poi: { name, address, city } | null,  // TikTok-only tagged location
//     identifiedPlaces: [
//       { name, city, neighborhood, type, confidence }
//     ]
//   }
// iOS then:
//   - For each identifiedPlace, search local restaurants for a match.
//   - If match → write a row to restaurant_community_blurbs (enrichment
//     only; not a "find").
//   - If no match → Google Places lookup + insert restaurant with
//     submitted_by + source_url + submission_opinions, is_pending_review
//     = true. Lands in Admin → Review.

async function handleExtractFromSocial(request, env) {
  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return jsonResponse({ error: "url required" }, 400);
  }
  const lower = url.toLowerCase();
  const isTikTok = lower.includes("tiktok.com");
  const isInstagram = lower.includes("instagram.com");
  if (!isTikTok && !isInstagram) {
    return jsonResponse({ error: "Only TikTok and Instagram URLs are supported." }, 400);
  }

  // ── Cache check ─────────────────────────────────────────
  // Same URL submitted twice within 30 days returns the cached
  // identifiedPlaces immediately. Skips: TikTok HTML scrape,
  // Render transcribe (RapidAPI quota, Whisper $$$), Claude vision.
  //
  // Cached responses carry a `cacheHit: true` flag in the debug envelope
  // so we can see hit/miss patterns in the iOS logs.
  const cacheK = socialImportCacheKey(url);
  if (cacheK && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const hit = await socialImportCacheGet(env, cacheK);
      if (hit) {
        console.log(`[extract-from-social] cache HIT for ${cacheK}`);
        return jsonResponse({
          ...hit,
          debug: { ...(hit.debug || {}), cacheHit: true, cacheKey: cacheK },
        });
      }
    } catch (err) {
      console.log(`[extract-from-social] cache read err (continuing): ${err.message}`);
    }
  }

  // Pull cheap metadata signals first (caption / POI / hashtags via OG
  // fallback). For TikTok this is fast and often enough. Instagram has
  // no public OG path so we'll go straight to the transcribe service.
  let signals = { caption: null, poi: null, author: null, thumbnail: null, finalUrl: url };
  if (isTikTok) {
    try {
      signals = await extractTikTokSignals(url);
    } catch (err) {
      console.log("[extract-from-social] TikTok HTML scrape failed:", err.message);
      // Don't return — transcript path below may still succeed.
    }
  }

  // Phase 2: always call the transcribe service when it's configured.
  //
  // The previous "skip if POI tag present" shortcut backfired —
  // TikTok's page state contains multiple poi blocks (related videos,
  // ads), and our regex picked the wrong one for a "Top 5 NYC" video
  // that had no real tagged location. Cost of always transcribing
  // (~$0.03 with vision) is small enough that skipping isn't worth
  // the false-negative risk.
  //
  // The transcribe service handles BOTH videos and photo carousels
  // (returning frames vs image_urls accordingly), so this single call
  // covers every content type.
  const shouldTranscribe = true;

  let transcript = null;
  let transcribeError = null;
  // frames[] = base64 video frames; imageUrls[] = direct CDN URLs
  // (photo carousels). Both flow through to Claude as image blocks.
  let frames = [];
  let imageUrls = [];
  let isVideo = true;
  // Debug fields — surfaced in the response so we can see what the
  // worker decided to do without needing Cloudflare logs.
  let dbgShouldTranscribe = shouldTranscribe;
  let dbgTranscribeConfigured = !!(env.TRANSCRIBE_SERVICE_URL && env.TRANSCRIBE_SHARED_SECRET);
  let dbgTranscribeAttempted = false;
  let dbgTranscribeMs = null;
  if (shouldTranscribe && env.TRANSCRIBE_SERVICE_URL && env.TRANSCRIBE_SHARED_SECRET) {
    dbgTranscribeAttempted = true;
    const tStart = Date.now();
    try {
      const t = await transcribeVideo(env, url);
      dbgTranscribeMs = Date.now() - tStart;
      transcript = t.transcript || null;
      frames = Array.isArray(t.frames) ? t.frames : [];
      imageUrls = Array.isArray(t.image_urls) ? t.image_urls : [];
      isVideo = t.is_video !== false;
      // The transcribe service also returns its view of the
      // description / title / uploader / thumbnail — fill in any
      // blanks the HTML scrape missed.
      if (!signals.caption && t.description) signals.caption = t.description;
      if (!signals.author && t.uploader) signals.author = t.uploader;
      if (!signals.thumbnail && t.thumbnail) signals.thumbnail = t.thumbnail;
      console.log(`[extract-from-social] transcribed ${transcript?.length || 0} chars, ${frames.length} frames, ${imageUrls.length} carousel imgs, ${t.elapsed_s}s`);
    } catch (err) {
      dbgTranscribeMs = Date.now() - tStart;
      transcribeError = err.message;
      console.log("[extract-from-social] transcribe failed:", err.message);
    }
  } else if (shouldTranscribe) {
    console.log("[extract-from-social] would transcribe but TRANSCRIBE_SERVICE_URL not configured");
  }

  // Ask Claude to identify places from everything we have — caption,
  // transcript, AND any video frames or carousel images. The prompt
  // tells it to read text from images (sign names, "Top 5" lists,
  // overlay captions).
  let identifiedPlaces;
  // Diagnostic: how many image blocks Claude actually received (after
  // dropping any frame entries with no data field) + Claude's raw
  // first 500 chars on a 0-places case. Lets us see whether Claude
  // (a) saw zero images, (b) saw images but identified nothing, or
  // (c) emitted text we failed to parse as JSON.
  let imageBlocksSent = 0;
  let claudeReply = null;
  let claudeReplyLength = 0;
  let claudeStopReason = null;
  let claudeParseError = null;
  try {
    const r = await identifyPlacesFromSignals(env, {
      ...signals,
      transcript,
      frames,
      imageUrls,
    });
    identifiedPlaces = r.places;
    imageBlocksSent = r.imageBlocksSent;
    claudeReply = r.claudeReply;
    claudeReplyLength = r.claudeReplyLength;
    claudeStopReason = r.claudeStopReason;
    claudeParseError = r.parseError;
  } catch (err) {
    console.log("[extract-from-social] Claude error:", err.message);
    identifiedPlaces = [];
  }

  // Track whether the cache write succeeded so the response can
  // expose it for diagnostics on a miss-then-write call.
  let dbgCacheWrote = false;
  let dbgCacheWriteErr = null;

  const responsePayload = {
    platform: isTikTok ? "tiktok" : "instagram",
    caption: signals.caption || "",
    author: signals.author || null,
    thumbnail: signals.thumbnail || null,
    poi: signals.poi || null,
    transcript: transcript || null,
    transcribeError,  // null on success, surfaced for debugging
    isVideo,
    framesCount: frames.length,
    imageUrlsCount: imageUrls.length,
    identifiedPlaces,
    // Debug envelope — readable by iOS for in-app diagnostics + test
    // scripts. Tells us exactly what the worker decided.
    debug: {
      shouldTranscribe: dbgShouldTranscribe,
      transcribeServiceConfigured: dbgTranscribeConfigured,
      transcribeAttempted: dbgTranscribeAttempted,
      transcribeMs: dbgTranscribeMs,
      hadPoi: !!signals.poi,
      captionLength: (signals.caption || "").length,
      cacheHit: false,
      cacheKey: cacheK,
      // Vision-pipeline diagnostics. imageBlocksSent is the count
      // AFTER filtering out frame objects with no data field — a
      // discrepancy with framesCount means the transcribe service
      // returned empty frame stubs. claudeReply is the first 500
      // chars of Claude's raw text — surfaced ONLY when zero places
      // were identified, so a debugger can see whether Claude said
      // "no specific names visible" vs emitted invalid JSON.
      imageBlocksSent,
      // claudeReply (first 800 chars), length, and stop_reason are
      // surfaced ONLY when identifiedPlaces ended up empty — happy
      // path responses stay tight. If stop_reason is "max_tokens"
      // we now know Claude's reply was truncated and our fallback
      // {...}-extractor will have already recovered partial entries.
      claudeReply: identifiedPlaces.length === 0 ? claudeReply : null,
      claudeReplyLength: identifiedPlaces.length === 0 ? claudeReplyLength : null,
      claudeStopReason: identifiedPlaces.length === 0 ? claudeStopReason : null,
      claudeParseError: identifiedPlaces.length === 0 ? claudeParseError : null,
    },
  };

  // ── Cache write ─────────────────────────────────────────
  // Only cache when we got SOMETHING worth caching — at least an
  // identified place, OR a caption + transcript that Claude saw.
  // If transcribe failed and Claude returned [], the next attempt
  // might succeed (transient RapidAPI rate limit, network blip), so
  // don't poison the cache with the empty result.
  const worthCaching = identifiedPlaces.length > 0
    || (signals.caption && transcript)
    || (frames.length > 0 && identifiedPlaces.length === 0); // vision saw something even if Claude found nothing
  if (worthCaching && cacheK && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await socialImportCacheSet(env, cacheK, responsePayload);
      dbgCacheWrote = true;
      console.log(`[extract-from-social] cached ${identifiedPlaces.length} places under ${cacheK}`);
    } catch (err) {
      dbgCacheWriteErr = err.message;
      console.log(`[extract-from-social] cache write err: ${err.message}`);
    }
  }

  // Surface write status in the debug envelope so we can see hit /
  // miss / write-fail patterns in iOS logs without raw Cloudflare logs.
  responsePayload.debug.cacheWrote = dbgCacheWrote;
  responsePayload.debug.cacheWriteErr = dbgCacheWriteErr;
  responsePayload.debug.cacheable = !!worthCaching;
  responsePayload.debug.supabaseConfigured =
    !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

  return jsonResponse(responsePayload);
}

// ── Route: POST /extract-from-article ────────────────────────
//
// Pulls restaurant mentions out of a generic article URL (Eater maps,
// Infatuation guides, NY Times restaurant lists, blog posts, etc.).
// iOS routes here when the pasted URL isn't TikTok or Instagram.
//
// Response shape mirrors /extract-from-social so iOS reuses the same
// `SocialExtractResponse` decoder + downstream enrich/find flow:
//   { platform: 'article', caption, author, thumbnail, poi: null,
//     identifiedPlaces: [...], debug: {...} }
//
// Uses the same Supabase cache as social imports (different key prefix).
async function handleExtractFromArticle(request, env) {
  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return jsonResponse({ error: "url required" }, 400);
  }
  // Profile URLs ARE allowed here — a restaurant's IG or TikTok profile
  // is just an HTML page with name + bio + location. The article
  // pipeline (fetch HTML → Claude → places) handles it cleanly. Only
  // reject TT/IG POST URLs (those still need the video-transcribe path
  // on /extract-from-social).
  const lower = url.toLowerCase();
  const isSocialPost = (lower.includes("tiktok.com") || lower.includes("instagram.com"))
    && /\/(p|reel|reels|tv|video)\//.test(lower);
  if (isSocialPost) {
    return jsonResponse({
      error: "TikTok/Instagram POST URLs should hit /extract-from-social"
    }, 400);
  }
  const isSocialProfile = (lower.includes("tiktok.com") || lower.includes("instagram.com"))
    && !isSocialPost;

  // Cache check — articles get shared more than TikToks so cache hits
  // are common. Same Supabase table, different key prefix.
  const cacheK = articleCacheKey(url);
  if (cacheK && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const hit = await socialImportCacheGet(env, cacheK);
      if (hit) {
        console.log(`[extract-from-article] cache HIT for ${cacheK}`);
        return jsonResponse({
          ...hit,
          debug: { ...(hit.debug || {}), cacheHit: true, cacheKey: cacheK },
        });
      }
    } catch (err) {
      console.log(`[extract-from-article] cache read err (continuing): ${err.message}`);
    }
  }

  // Fetch the article HTML + extract readable text.
  let fetched;
  try {
    fetched = await fetchUrl(url);
  } catch (err) {
    return jsonResponse({ error: `Couldn't fetch article: ${err.message}` }, 502);
  }

  const articleText = (fetched.text || "").trim();
  if (articleText.length < 200) {
    return jsonResponse({
      error: "Article body was too short to extract from (paywall / JS-rendered / wrong URL?)"
    }, 422);
  }

  // Pull OG metadata for the article's title + image + author. Lets the
  // iOS results sheet show a hero thumbnail + headline matching what
  // the user saw on the source page.
  const meta = extractArticleMeta(fetched.html, fetched.url);

  // Cap the body we send to Claude. Eater maps cap around ~30KB; long
  // listicles can hit 80KB+. ~60KB ≈ 15k tokens — plenty of headroom
  // under Sonnet's input limit, predictable cost (~$0.05).
  const MAX_CHARS = 60000;
  const truncated = articleText.length > MAX_CHARS;
  const body = truncated ? articleText.slice(0, MAX_CHARS) : articleText;

  let identifiedPlaces = [];
  let claudeReply = null;
  let claudeReplyLength = 0;
  let claudeStopReason = null;
  let claudeParseError = null;
  try {
    const r = await identifyPlacesFromArticle(env, {
      url: fetched.url,
      title: meta.title,
      author: meta.author,
      bodyText: body,
      // Profile pages need a different prompt — they're about
      // exactly ONE place (the restaurant's own account), not a
      // listicle of many.
      isProfile: isSocialProfile,
    });
    identifiedPlaces = r.places;
    claudeReply = r.claudeReply;
    claudeReplyLength = r.claudeReplyLength;
    claudeStopReason = r.claudeStopReason;
    claudeParseError = r.parseError;
  } catch (err) {
    console.log("[extract-from-article] Claude error:", err.message);
  }

  let dbgCacheWrote = false;
  let dbgCacheWriteErr = null;

  const responsePayload = {
    platform: "article",
    caption: meta.title || "",
    author: meta.author || null,
    thumbnail: meta.image || null,
    poi: null,
    transcript: null,
    transcribeError: null,
    isVideo: false,
    framesCount: 0,
    imageUrlsCount: 0,
    identifiedPlaces,
    debug: {
      cacheHit: false,
      cacheKey: cacheK,
      articleLength: articleText.length,
      truncated,
      claudeReply: identifiedPlaces.length === 0 ? claudeReply : null,
      claudeReplyLength: identifiedPlaces.length === 0 ? claudeReplyLength : null,
      claudeStopReason: identifiedPlaces.length === 0 ? claudeStopReason : null,
      claudeParseError: identifiedPlaces.length === 0 ? claudeParseError : null,
    },
  };

  // Only cache when we got something usable — empty results may be a
  // transient Claude blip and re-fetching can recover.
  if (identifiedPlaces.length > 0 && cacheK && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await socialImportCacheSet(env, cacheK, responsePayload);
      dbgCacheWrote = true;
      console.log(`[extract-from-article] cached ${identifiedPlaces.length} places under ${cacheK}`);
    } catch (err) {
      dbgCacheWriteErr = err.message;
      console.log(`[extract-from-article] cache write err: ${err.message}`);
    }
  }
  responsePayload.debug.cacheWrote = dbgCacheWrote;
  responsePayload.debug.cacheWriteErr = dbgCacheWriteErr;

  return jsonResponse(responsePayload);
}

// Article cache key — same shape as social to share the table, but
// prefixed with 'article:' so the two don't collide on equivalent URLs.
function articleCacheKey(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return `article:${u.hostname}${path}`;
  } catch {
    return null;
  }
}

// Best-effort OG/Twitter card extraction — title, author byline, hero
// image. Falls back to <title> tag when og:title is missing.
function extractArticleMeta(html, finalUrl) {
  const m = (re) => {
    const x = html.match(re);
    return x ? x[1].trim() : null;
  };
  // Common meta tag patterns — try OG first, then Twitter, then bare.
  const title =
    m(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    m(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
    m(/<title[^>]*>([^<]+)<\/title>/i) ||
    null;
  const image =
    m(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    m(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    null;
  const author =
    m(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i) ||
    m(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i) ||
    null;
  // Heuristic: if og:image is a relative URL, resolve against the final
  // article URL (after redirects).
  let resolvedImage = image;
  if (image && !/^https?:\/\//i.test(image)) {
    try { resolvedImage = new URL(image, finalUrl).toString(); } catch {}
  }
  return { title, image: resolvedImage, author };
}

// Ask Claude to pull every restaurant/bar/cafe mentioned in the
// article body. Tailored prompt: article writers list places with full
// names + neighborhoods + sometimes addresses, so the extraction is
// usually higher-precision than the TikTok pipeline.
//
// When isProfile=true, the URL is a social profile page (IG @handle
// or TikTok @user) — the prompt narrows to extracting THE SINGLE place
// the profile represents, NOT a list.
async function identifyPlacesFromArticle(env, { url, title, author, bodyText, isProfile = false }) {
  const profilePrompt = `You are extracting the restaurant that owns this social profile page.

Profile URL: ${url}
Page title: ${title || "(no title)"}
Page author/handle: ${author || "(unknown)"}

Page text (may include bio, recent post captions, location, contact info):
"""
${bodyText}
"""

Return ONLY a JSON array with AT MOST ONE entry — the single restaurant/bar/cafe/hotel this account represents:
{ "name": "...", "city": "...", "neighborhood": "...", "type": "restaurant|bar|hotel|cafe", "confidence": "high|medium|low" }

Rules:
- Use the account's display name, NOT the @handle, when the display name is the real restaurant name.
- City + neighborhood are usually in the bio ("Italian in Silver Lake, LA") or address area.
- If the page is clearly a food influencer/critic and NOT a single restaurant's account, return [].
- If the page lists multiple locations (e.g. a chain), return only the parent/brand entry.
- Confidence "high" only when name AND city are both clear from the bio.
- Return [] if you can't identify the place with reasonable confidence.`;

  const articlePrompt = `You are extracting restaurant/bar/cafe/hotel mentions from a food article.

Article URL: ${url}
Article title: ${title || "(no title)"}
Article author: ${author || "(unknown)"}

Article body (may be truncated):
"""
${bodyText}
"""

Return ONLY a JSON array of every distinct place RECOMMENDED in the article. Each entry:
{ "name": "...", "city": "...", "neighborhood": "...", "type": "restaurant|bar|hotel|cafe", "confidence": "high|medium|low" }

Rules:
- Eater maps, Infatuation guides, NYT lists, etc. usually have one numbered place per section. Extract them all (up to 60).
- The article's TITLE often names the city ("Best California Burritos in San Diego") — use that city for every entry when no other city is given.
- Skip places mentioned in passing as a comparison (e.g. "if you've been to Carbone in NY, you'll recognize the vibe"). Only include the article's actual recommendations.
- Skip non-restaurant venues (museums, parks, hotels — unless the article is specifically about hotel bars/restaurants).
- Skip dish names. "California burrito" is a dish; "Lolita's Taco Shop" is a place.
- If a neighborhood is mentioned in the section (often as a tag like "BARRIO LOGAN"), include it.
- Confidence "high" when the place has a clear name + address/neighborhood in the article. "medium" when name only. "low" when ambiguous.
- Don't invent. If the truncated body cuts off mid-list, only return what you saw.
- Return [] if nothing is clearly a recommended place.`;

  const prompt = isProfile ? profilePrompt : articlePrompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000, // articles can carry 30-50 places easily
      system: "Return ONLY valid JSON. No markdown fences, no preamble.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const stopReason = data.stop_reason || null;
  let text = data.content?.[0]?.text || "[]";
  const fullText = text;
  text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let parsed = [];
  let parseError = null;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) parsed = j;
  } catch (err) {
    parseError = err.message;
    // Same fallback as the social handler — pull complete {...} blocks
    // out of a truncated/malformed response so we don't lose everything
    // to a single dangling entry.
    const objMatches = text.match(/\{[^{}]*\}/g) || [];
    for (const o of objMatches) {
      try { parsed.push(JSON.parse(o)); } catch {}
    }
  }
  return {
    places: parsed,
    claudeReply: fullText.slice(0, 800),
    claudeReplyLength: fullText.length,
    claudeStopReason: stopReason,
    parseError,
  };
}

// ── Social-import cache helpers ─────────────────────────────
//
// Lightweight Supabase-backed cache for /extract-from-social responses.
// Key = hostname + path (sans query string + trailing slash). 30-day TTL.

function socialImportCacheKey(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

const SOCIAL_IMPORT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function socialImportCacheGet(env, key) {
  const params = new URLSearchParams();
  params.set("url_key", `eq.${key}`);
  params.set("select", "payload,cached_at");
  params.set("limit", "1");
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/social_import_cache?${params}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  // TTL check happens client-side here (rather than in SQL) so we can
  // keep the row around for analytics — `cached_at DESC` is a useful
  // "most-requested posts" index — but only USE it if recent enough.
  const ageMs = Date.now() - new Date(row.cached_at).getTime();
  if (ageMs > SOCIAL_IMPORT_CACHE_TTL_MS) return null;
  return row.payload || null;
}

async function socialImportCacheSet(env, key, payload) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/social_import_cache`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      // Upsert on conflict so re-fetches refresh the cached_at and
      // overwrite any stale payload. Cleaner than DELETE + INSERT.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      url_key: key,
      payload,
      cached_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`supabase upsert: HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }
}

// Call the cooked-video-transcribe Render service. Returns the
// transcribe payload or throws with the error message.
async function transcribeVideo(env, url) {
  const endpoint = env.TRANSCRIBE_SERVICE_URL.replace(/\/$/, "") + "/transcribe";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shared-Secret": env.TRANSCRIBE_SHARED_SECRET,
    },
    body: JSON.stringify({ url }),
  });
  // Read the body once as text so we never lose it. Then attempt to
  // parse as JSON to extract the {error: ...} field. Earlier code
  // called res.json() inside a try/catch which sometimes consumed
  // the body before our error path could read it — leaving the
  // user with a bare "HTTP 502" and no clue why.
  const bodyText = await res.text();
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.parse(bodyText)?.error || ""; } catch {}
    // If JSON parse failed, surface a snippet of the raw body so we
    // at least see the upstream error (e.g. RapidAPI quota messages,
    // Cloudflare error pages).
    if (!detail) detail = bodyText.slice(0, 200).replace(/\s+/g, " ").trim();
    // Map common RapidAPI/quota errors to friendlier copy.
    if (detail.includes("quota") || detail.includes("429")) {
      throw new Error("Instagram API quota reached for this month. We're working on it — try again in a few days or paste a TikTok link.");
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  try {
    return JSON.parse(bodyText);
  } catch (err) {
    throw new Error(`transcribe service returned non-JSON: ${bodyText.slice(0, 200)}`);
  }
}

// Resolve short URLs + fetch the canonical /video/{id} page and pull out
// every signal we care about. TikTok page state has surprising amounts
// of useful data embedded as JSON — POI tags include full address.
async function extractTikTokSignals(url) {
  // Resolve short-link redirects to the canonical /@user/video/<id> URL.
  // We used to do this with HEAD, but TikTok's `vm.tiktok.com` / `t/`
  // shortlinks (the kind you get from the Share sheet) sometimes 405 on
  // HEAD or return a JS-redirect page instead of an HTTP redirect, so
  // the HEAD response stays on the shortlink URL and the scrape below
  // grabs nothing. GET is slower but always lands on the canonical URL.
  // (Bug 2026-05-13: "i put in this tiktok t/ link and it says it
  // couldn't find" — affected every shareable TikTok URL.)
  const headRes = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const finalUrl = headRes.url || url;

  // Two-pass fetch:
  //   1. Chrome UA — when TikTok serves the real SSR page (still works for
  //      many videos), we get the rich `desc` + `poi` + `author` blob.
  //   2. Facebook crawler UA — when TikTok serves the generic
  //      "Make Your Day" landing page (most photo carousels + an
  //      increasing % of videos), the FB UA still gets us the
  //      `og:description` meta tag with the actual caption embedded
  //      after the like/comment counts.
  // Combining both means we degrade gracefully instead of returning
  // empty fields and a "we found nothing" UX.
  const chromeUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const fbUA = "facebookexternalhit/1.1";

  const res = await fetch(finalUrl, {
    headers: {
      "User-Agent": chromeUA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Caption — the most reliable signal, in "desc" field
  const captionMatch = html.match(/"desc":"((?:[^"\\]|\\.){10,2000})"/);
  let caption = captionMatch
    ? JSON.parse(`"${captionMatch[1]}"`)  // decode unicode escapes
    : null;

  // POI (tagged location) — name + full address + city.
  //
  // TikTok page state has multiple `"poi":{...}` blocks (related
  // videos, ads, suggestions). A real creator-tagged POI for the
  // current post has BOTH a non-empty address AND a non-empty city —
  // recommendations and false-positive matches usually don't. So we
  // scan ALL poi blocks and keep only one that passes that bar.
  let poi = null;
  const poiBlocks = [...html.matchAll(/"poi":\{([^{}]|\{[^{}]*\})*\}/g)];
  for (const m of poiBlocks) {
    const block = m[0];
    const name = block.match(/"name":"((?:[^"\\]|\\.)+)"/)?.[1];
    const address = block.match(/"address":"((?:[^"\\]|\\.)+)"/)?.[1];
    const city = block.match(/"city":"((?:[^"\\]|\\.)+)"/)?.[1];
    const category = block.match(/"category":"((?:[^"\\]|\\.)+)"/)?.[1];
    // Strict: must have name AND address AND city, all non-empty.
    // This rejects the related-video / recommendation noise that
    // ships with just a name field (or empty strings).
    if (name && name !== "null" && address && city) {
      poi = {
        name: name.replace(/\\u002F/g, "/"),
        address: address.replace(/\\u002F/g, "/"),
        city: city.replace(/\\u002F/g, "/"),
        category: category || null,
      };
      break;  // first strict match wins (closest to top of page state)
    }
  }

  // Author handle
  let author = html.match(/"author":\{[^}]*"uniqueId":"([^"]+)"/)?.[1] || null;

  // Thumbnail (cover image URL)
  let thumbnail = html.match(/"cover":"(https?:[^"]+)"/)?.[1]?.replace(/\\u002F/g, "/") || null;

  // If the Chrome-UA fetch returned the generic landing page (no caption
  // AND no POI), retry with the Facebook crawler UA to at least pull
  // OG metadata out. This is the path for TikTok photo carousels and
  // many bot-gated videos.
  if (!caption && !poi) {
    try {
      const fbRes = await fetch(finalUrl, {
        headers: {
          "User-Agent": fbUA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      if (fbRes.ok) {
        const fbHtml = await fbRes.text();
        // og:description on TikTok looks like one of:
        //   `80.4K likes, 237 comments. "actual caption"`     ← fancy quotes
        //   `80.4K likes, 237 comments. "actual caption"`     ← straight quotes
        //   `80.4K likes, 237 comments. actual caption`       ← no wrapping quotes
        // First strip the "NK likes, M comments." prefix, then peel any
        // quote wrapping around the remainder. Robust to all three.
        const ogDesc = fbHtml.match(/property="og:description"\s+content="([^"]+)"/)?.[1];
        if (ogDesc) {
          // “ and ” are the curly double quotes; using escapes
          // here so the source bytes can't get mangled by a paste-into-
          // editor that auto-corrects exotic chars.
          let stripped = ogDesc
            // "80.4K likes, 237 comments. " or "127 likes, 5 comments. "
            .replace(/^\s*[\d.,]+K?\s+likes,?\s*\d*\s*comments?\.?\s*/i, "")
            .trim();
          // Peel one layer of wrapping quotes (curly or straight)
          stripped = stripped
            .replace(/^[“"](.*)[”"]\s*$/s, "$1")
            .trim();
          caption = decodeHtmlEntities(stripped || ogDesc);
          console.log("[extract] OG-fallback caption:", caption?.slice(0, 120));
        }
        // og:title looks like "TikTok · Karen Vestli" — pull the
        // username out as a fallback author when the SSR blob is gone.
        if (!author) {
          const ogTitle = fbHtml.match(/property="og:title"\s+content="([^"]+)"/)?.[1];
          if (ogTitle) {
            const named = ogTitle.match(/TikTok\s*[·•∙]\s*(.+)/)?.[1];
            if (named) author = decodeHtmlEntities(named.trim());
          }
        }
        if (!thumbnail) {
          const ogImage = fbHtml.match(/property="og:image"\s+content="([^"]+)"/)?.[1];
          if (ogImage) thumbnail = decodeHtmlEntities(ogImage);
        }
      }
    } catch (err) {
      console.log("[extract] FB-UA fallback failed:", err.message);
    }
  }

  return { caption, poi, author, thumbnail, finalUrl };
}

// Minimal HTML-entity decode for the few entities TikTok actually
// emits in OG meta tags (&amp;, &quot;, &#39;, &lt;, &gt;). Worker
// runtime has no DOMParser so a tiny inline pass is the simplest fix.
function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Send caption + POI + hashtags to Claude and ask it to return a clean
// list of restaurant/bar/hotel candidates. Heavy prompt engineering here
// because creators tag a LOT of irrelevant hashtags (#foodie, #fyp) and
// we don't want Claude inventing places.
// Returned alongside the parsed places so callers can see:
//   - how many image blocks Claude actually got (vs framesCount which
//     counts before the empty-data filter)
//   - the raw text Claude returned, when no places were extracted
//     (so a "no match" case can be diagnosed without Cloudflare logs).
//
// The worker's response stitches these into debug.{imageBlocksSent,
// claudeReply} only on the "0 places" path so successful runs stay
// tight. (Bug diagnosis 2026-05-18: mattconcierge IG post that
// the user said had "pages listed on the carousel" but returned
// identifiedPlaces=[].)
async function identifyPlacesFromSignals(env, signals) {
  const parts = [];
  parts.push(`Caption: ${signals.caption || "(no caption)"}`);
  if (signals.poi) {
    parts.push(`Tagged location: ${signals.poi.name}${signals.poi.address ? " — " + signals.poi.address : ""}`);
  }
  if (signals.author) parts.push(`Posted by: @${signals.author}`);
  if (signals.transcript) {
    // Whisper output. The creator's voice — often where restaurant
    // names actually live. Full transcript is small enough to drop
    // straight in.
    parts.push(`Video transcript (auto-generated): ${signals.transcript}`);
  }

  // Image blocks — frames are inline base64 (from the Render service
  // for videos), image_urls are direct TikTok CDN URLs (for photo
  // carousels). Claude accepts both formats in the same request.
  // Cap at 8 images total to stay well under the per-request budget
  // and keep cost predictable (~$0.04 max for an 8-image carousel).
  const imageBlocks = [];
  const frames = Array.isArray(signals.frames) ? signals.frames : [];
  const urls = Array.isArray(signals.imageUrls) ? signals.imageUrls : [];
  for (const f of frames.slice(0, 8)) {
    if (!f?.data) continue;
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: f.media_type || "image/jpeg",
        data: f.data,
      },
    });
  }
  const remaining = 8 - imageBlocks.length;
  for (const u of urls.slice(0, remaining)) {
    imageBlocks.push({
      type: "image",
      source: { type: "url", url: u },
    });
  }

  const contextNote = imageBlocks.length > 0
    ? `\n\n${imageBlocks.length} image${imageBlocks.length === 1 ? "" : "s"} from the post follow. Read any visible text — restaurant names on signs, menu headers, on-screen captions, "Top N" lists, location stickers.`
    : "";

  const prompt = `You are extracting restaurant/bar/hotel mentions from a TikTok or Instagram food post.

${parts.join("\n")}${contextNote}

Return ONLY a JSON array of places explicitly mentioned. Each entry:
{ "name": "...", "city": "...", "neighborhood": "...", "type": "restaurant|bar|hotel|cafe", "confidence": "high|medium|low" }

Signal priority (most → least reliable):
1. Tagged location (POI) — verbatim truth. Use the name exactly. Confidence "high".
2. Restaurant name VISIBLE in an image (sign, menu, overlay text, "Top 5" list slide) — high confidence, this is the creator's intent.
3. Video transcript naming a specific place — the creator literally said it.
   Match phrases like "this is [Name]", "we're at [Name]", "[Name] in [City]".
   Confidence "high" if name + location both stated, "medium" if name only.
4. Caption naming a place explicitly (not just a hashtag).
5. Hashtags as a last resort.

A single post can name MANY places — especially "Top 5 NYC spots" style lists. Extract every distinct place, in the order they appear. Up to 20 places per post.

Rules:
- READ TEXT IN IMAGES carefully. Slideshow lists like "1. Carbone 2. Lilia 3. Don Angie" should produce 3 entries.
- Decode hashtags: #folkspizzeria → "Folks Pizzeria", #grandcentralmarket → "Grand Central Market".
- City hashtags help: #losangelesfood / #culvercity / #nycfood → use the city as a hint for ALL extracted places when no other city is given.
- Skip generic hashtags: #foodie, #fyp, #viral, #dinnerideas, #pizza, #foodtiktok, #datenight, #yum, #placestovisit.
- Skip dish names: "carbonara", "ramen", "matcha" are not places.
- Whisper transcripts have typos in proper nouns. "Soosh by Boo" → most likely "Sushi by Bou", confidence "medium".
- If the transcript is just music ("[Music]", "♪") or silent, ignore it and rely on images/caption.
- If you can read a restaurant name from an image AND hear it confirmed in audio, confidence "high".
- Don't invent places. If an image shows food but no name is visible, don't guess.
- Return [] if nothing is clearly a place.`;

  // User content is a mix of text + images. The text instruction goes
  // first so Claude sees the task, then the images, then a tiny
  // closing nudge to ground its output.
  const userContent = [{ type: "text", text: prompt }];
  for (const img of imageBlocks) userContent.push(img);
  if (imageBlocks.length > 0) {
    userContent.push({
      type: "text",
      text: "Now produce the JSON array. Include every place you can identify from the text AND the images.",
    });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      // 4000 tokens — a luxury concierge carousel with 8 slides can
      // list 20-30 places. The previous 1500 ceiling was getting hit
      // by mattconcierge / "Top 30 St Tropez spots" style posts,
      // truncating the JSON mid-entry and making JSON.parse fail,
      // which dropped ALL identified places to []. Bug diagnosis
      // 2026-05-18: ~5 entries visible in the first 500 chars
      // suggested Claude was producing a long list when truncated.
      max_tokens: 4000,
      system: "Return ONLY valid JSON. No markdown fences, no preamble.",
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const stopReason = data.stop_reason || null;
  let text = data.content?.[0]?.text || "[]";
  // Strip any accidental markdown fences
  text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  let parsed = [];
  let parseError = null;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) parsed = j;
  } catch (err) {
    parseError = err.message;
    // Fallback: extract individual {...} objects from a truncated /
    // malformed array. Common cause: max_tokens cut Claude off mid-
    // entry, leaving a dangling object + no closing bracket. We
    // greedy-match every complete `{ ... }` block in the text and
    // parse each one. Anything that fails to parse gets skipped.
    // Bug 2026-05-18: 1500-token ceiling truncated mattconcierge's
    // St Tropez carousel — 5+ named bars got dropped.
    const objects = text.match(/\{[^{}]*\}/g) || [];
    for (const obj of objects) {
      try {
        const o = JSON.parse(obj);
        if (o && typeof o === "object" && o.name) parsed.push(o);
      } catch {}
    }
  }
  return {
    places: parsed,
    imageBlocksSent: imageBlocks.length,
    claudeReply: text.slice(0, 800),
    claudeReplyLength: text.length,
    claudeStopReason: stopReason,
    parseError,
  };
}

// ── Route: POST /fetch-url ────────────────────────────────
async function handleFetchUrl(request) {
  try {
    const { url } = await request.json();
    if (!url) return jsonResponse({ error: "url required" }, 400);
    const result = await fetchUrl(url);
    return jsonResponse({
      url: result.url,
      text: result.text.slice(0, 15000),
      length: result.text.length,
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── Route: POST /crawl ───────────────────────────────────
async function handleCrawl(request) {
  try {
    const { url, max_pages = 20 } = await request.json();
    if (!url) return jsonResponse({ error: "url required" }, 400);

    const mainPage = await fetchUrl(url);
    const links = extractLinks(mainPage.html);

    const isLinkInBio = /(likeshop|linktr|linkin\.bio|beacons|campsite|snipfeed|stan\.store)/i.test(url);

    let targetLinks;
    if (isLinkInBio) {
      targetLinks = links.slice(0, max_pages);
    } else {
      targetLinks = links.filter(l => {
        try {
          const path = new URL(l).pathname;
          return path.split("/").filter(Boolean).length >= 2 && path.length > 15;
        } catch { return false; }
      }).slice(0, max_pages);
    }

    const pages = await Promise.allSettled(
      targetLinks.map(async (link) => {
        try {
          const result = await fetchUrl(link);
          return { url: link, text: result.text.slice(0, 8000) };
        } catch {
          return { url: link, text: "", error: true };
        }
      })
    );

    const results = pages
      .filter(p => p.status === "fulfilled" && p.value.text.length > 100)
      .map(p => p.value);

    return jsonResponse({
      main_page: { url: mainPage.url, text: mainPage.text.slice(0, 8000) },
      pages: results,
      total_links_found: links.length,
      pages_fetched: results.length,
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ── Supabase helper ──────────────────────────────────────
async function supabaseQuery(env, method, table, params = {}) {
  // CRITICAL: use SERVICE_ROLE_KEY, not ANON_KEY.
  // This helper is used for server-side writes (auto-research crawl,
  // saving chatbot_research / research_new_places / patching
  // research_sources). The anon key gets blocked by RLS on those
  // tables — service_role bypasses RLS, which is what we want for a
  // trusted server-side worker.
  //
  // This was the cause of the silent April 23 → May 12 auto-research
  // outage: every write failed with an RLS error, but the worker
  // swallowed the error in per-source try/catch blocks and the cron
  // reported "Success" because the scheduled handler had already
  // returned (via waitUntil).
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  const headers = {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "POST" ? "return=representation" : undefined,
  };

  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      url.searchParams.set(k, v);
    }
  }

  const options = { method, headers: Object.fromEntries(Object.entries(headers).filter(([, v]) => v)) };
  if (params.body) options.body = JSON.stringify(params.body);

  const res = await fetch(url.toString(), options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${err}`);
  }
  // Handle 204 No Content + empty bodies gracefully. Without the
  // Prefer:return=representation header, PostgREST returns an empty
  // 204 for PATCH/DELETE. Calling res.json() on that throws
  // "Unexpected end of JSON input" which crashed the cron when no
  // POST preceded the PATCH (zero-result runs). 2026-05-15.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// ── Claude API helper ────────────────────────────────────
async function askClaude(env, text) {
  // 15s ceiling on Claude per page. Same reason as fetchUrl above —
  // a stalled Anthropic response would burn the worker's wall-clock
  // and abort finishScrapeLog. The inner per-page try/catch around
  // askClaude already handles thrown errors gracefully so the loop
  // can continue to the next page.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `You are a restaurant/hotel/bar knowledge extractor for the app "Cooked". Given content from a blog, article, or website, do TWO things:

1. KNOWLEDGE SUMMARY: Extract key restaurant, bar, hotel, and nightlife insights into a concise snippet (3-8 sentences). Focus on: place names, specific dishes, chef names, vibes, neighborhoods, insider tips.

2. NEW PLACES: List EVERY restaurant, bar, hotel, or nightlife venue mentioned. Format each as:
NEW_PLACE: Name | City | Neighborhood | Cuisine/Type | Price ($-$$$$) | One-line description

Be thorough. Put knowledge summary first, then NEW_PLACE lines at the end.

If the content isn't about food/restaurants/hotels/bars/nightlife, say "NOT_RELEVANT" and nothing else.`,
      messages: [{ role: "user", content: text.slice(0, 10000) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ── Parse Claude response ────────────────────────────────
function parseClaudeResponse(summary, sourceUrl) {
  if (summary.includes("NOT_RELEVANT")) return { knowledge: null, places: [] };
  const places = [];
  const knowledgeLines = [];
  summary.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed.match(/^[-\d.]*\s*NEW_PLACE\s*:/)) {
      const parts = trimmed.replace(/^[-\d.]*\s*NEW_PLACE\s*:\s*/, "").split("|").map(s => s.trim());
      if (parts.length >= 3) {
        places.push({
          name: parts[0], city: parts[1], neighborhood: parts[2],
          cuisine: parts[3] || "", price: parts[4] || "", description: parts[5] || "",
          source_url: sourceUrl || null, status: "pending",
        });
      }
    } else {
      knowledgeLines.push(line);
    }
  });
  return { knowledge: knowledgeLines.join("\n").trim(), places };
}

// ── Auto-research: crawl sources and save results ────────
/// Insert a scrape_log row at the START of a run with success=false.
/// Returns the inserted id so the caller can UPDATE the row at the
/// end with final stats. This gives us a paper trail even when the
/// worker times out mid-run (Cloudflare's CPU/wall-clock limit kills
/// the script before it reaches the final write).
async function startScrapeLog(env, startedAt) {
  try {
    const rows = await supabaseQuery(env, "POST", "scrape_log", {
      body: {
        started_at: startedAt,
        finished_at: startedAt,
        success: false,
        knowledge_count: 0,
        places_count: 0,
        error: "RUN_IN_PROGRESS",
        log: "(started)",
      },
    });
    return rows?.[0]?.id || null;
  } catch (e) {
    console.log(`[scrape_log] start-write failed: ${e.message}`);
    return null;
  }
}

/// UPDATE the row created by startScrapeLog with final stats. If the
/// id is null (insert failed), we silently skip — best-effort logging.
async function finishScrapeLog(env, id, { success, log, knowledge, places, error }) {
  if (!id) return;
  try {
    await supabaseQuery(env, "PATCH", `scrape_log?id=eq.${id}`, {
      body: {
        finished_at: new Date().toISOString(),
        success,
        knowledge_count: knowledge ?? 0,
        places_count: places ?? 0,
        error: error || null,
        log: (log || []).join("\n"),
      },
    });
  } catch (e) {
    console.log(`[scrape_log] finish-write failed: ${e.message}`);
  }
}

/// Mid-run progress write. If the worker dies after this (Cloudflare
/// wall-clock kill, etc.) we at least know how far it got. Cheap
/// PATCH that overwrites the log field with current contents.
async function progressScrapeLog(env, id, log) {
  if (!id) return;
  try {
    await supabaseQuery(env, "PATCH", `scrape_log?id=eq.${id}`, {
      body: { log: (log || []).join("\n") },
    });
  } catch (e) {
    // Silent — best-effort breadcrumb.
  }
}

async function runAutoResearch(env) {
  const log = [];
  const startedAt = new Date().toISOString();
  // 2026-05-15 rewrite: process ONE source per cron run. Each source
  // has up to N pages crawled, each page = 1 Claude call (~3-10s).
  // Cloudflare workers cap wall-clock at 30s (paid plan, less on free)
  // so trying to do 3 sources × 10 pages would silently time out
  // mid-run and the worker would die before reaching writeScrapeLog.
  // ONE source × 5 pages keeps us comfortably under the budget.
  const MAX_SOURCES_PER_RUN = 1;
  // Bumped down 5→2 (2026-05-16). Some sources (Michelin, 50 Best)
  // serve huge HTML and slow Claude responses, blowing Cloudflare's
  // ~30s wall-clock budget for waitUntil. 2 pages × 15s Claude max
  // = 30s + a few seconds for fetches. Fits comfortably.
  const MAX_PAGES_PER_SOURCE = 2;
  // Write a "started" row up front so even a timeout leaves evidence.
  // We UPDATE this row at the end (finishScrapeLog).
  const logRowId = await startScrapeLog(env, startedAt);
  try {
    // Oldest first so the cron eventually visits every source.
    // PostgREST: `order=last_crawled.asc.nullsfirst&limit=3` → priority
    // queue of "least-recently-crawled" sources.
    const sources = await supabaseQuery(env, "GET", "research_sources", {
      query: {
        "active": "eq.true",
        "select": "*",
        "order": "last_crawled.asc.nullsfirst",
        "limit": String(MAX_SOURCES_PER_RUN),
      },
    });

    if (!sources.length) {
      log.push("No active sources configured");
      await finishScrapeLog(env, logRowId, { success: true, log, knowledge: 0, places: 0 });
      return { success: true, log };
    }

    log.push(`Picked ${sources.length} sources (oldest last_crawled first)`);
    await progressScrapeLog(env, logRowId, log);

    let totalKnowledge = 0;
    let totalPlaces = 0;

    for (const source of sources) {
      try {
        log.push(`Crawling: ${source.url}`);
        await progressScrapeLog(env, logRowId, log);

        // Crawl the source
        const mainPage = await fetchUrl(source.url);
        const links = extractLinks(mainPage.html);

        // Cap pages-per-source to MAX_PAGES_PER_SOURCE regardless of
        // whatever the DB row says — keeps total Claude calls bounded
        // so the worker doesn't time out.
        const maxPages = Math.min(source.max_pages || 10, MAX_PAGES_PER_SOURCE);
        const targetLinks = links.filter(l => {
          try {
            const path = new URL(l).pathname;
            return path.split("/").filter(Boolean).length >= 2 && path.length > 15;
          } catch { return false; }
        }).slice(0, maxPages);

        // Fetch pages
        const pageResults = await Promise.allSettled(
          targetLinks.map(async (link) => {
            try {
              const result = await fetchUrl(link);
              return { url: link, text: result.text.slice(0, 8000) };
            } catch {
              return { url: link, text: "", error: true };
            }
          })
        );

        const pages = pageResults
          .filter(p => p.status === "fulfilled" && p.value.text.length > 100)
          .map(p => p.value);

        log.push(`  Fetched ${pages.length} pages from ${source.url}`);
        await progressScrapeLog(env, logRowId, log);

        // Process each page through Claude
        let sourceKnowledge = [];
        let sourcePlaces = [];

        for (const page of pages) {
          try {
            const summary = await askClaude(env, page.text);
            const parsed = parseClaudeResponse(summary, page.url);
            if (parsed.knowledge) sourceKnowledge.push(parsed.knowledge);
            sourcePlaces.push(...parsed.places);
          } catch (err) {
            log.push(`  Error processing ${page.url}: ${err.message}`);
          }
        }

        // Deduplicate places
        const seen = new Set();
        sourcePlaces = sourcePlaces.filter(p => {
          const key = `${p.name.toLowerCase()}|${p.city.toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Save knowledge
        if (sourceKnowledge.length > 0) {
          const combined = sourceKnowledge.join("\n\n---\n\n");
          await supabaseQuery(env, "POST", "chatbot_research", {
            body: {
              url: source.url,
              summary: combined.slice(0, 8000),
              source_type: "auto_crawl",
              created_by: "auto_research",
            },
          });
          totalKnowledge++;
        }

        // Save new places
        if (sourcePlaces.length > 0) {
          await supabaseQuery(env, "POST", "research_new_places", {
            body: sourcePlaces,
          });
          totalPlaces += sourcePlaces.length;
        }

        // ALWAYS bump last_crawled on a successful fetch (even if
        // Claude found nothing on the linked pages). Otherwise we'd
        // pick the same source forever every run and never cycle to
        // the next-oldest. Zero-result sources just go to the back
        // of the queue and get retried on their normal turn.
        // (Fix on top of 2026-05-15 fix that intended to retry but
        // turned into a stuck-on-source loop.)
        await supabaseQuery(env, "PATCH", `research_sources?id=eq.${source.id}`, {
          body: { last_crawled: new Date().toISOString() },
        });
        if (sourceKnowledge.length > 0 || sourcePlaces.length > 0) {
          log.push(`  Saved ${sourceKnowledge.length} knowledge entries, ${sourcePlaces.length} new places (last_crawled bumped)`);
        } else {
          log.push(`  Zero results from Claude on this source's pages (last_crawled bumped — will rotate to next source on next run)`);
        }

      } catch (err) {
        log.push(`  Error crawling ${source.url}: ${err.message}`);
      }
    }

    log.push(`Done! ${totalKnowledge} knowledge entries, ${totalPlaces} new places total`);
    await finishScrapeLog(env, logRowId, {
      success: true,
      log,
      knowledge: totalKnowledge,
      places: totalPlaces,
    });
    return { success: true, totalKnowledge, totalPlaces, log };

  } catch (err) {
    log.push(`Fatal error: ${err.message}`);
    await finishScrapeLog(env, logRowId, { success: false, log, knowledge: 0, places: 0, error: err.message });
    return { success: false, error: err.message, log };
  }
}

// ╔════════════════════════════════════════════════════════╗
// ║  PUSH NOTIFICATIONS  (APNs via token-based auth)       ║
// ╚════════════════════════════════════════════════════════╝
//
// Env vars required in Cloudflare:
//   APNS_KEY_ID      — 10-char Key ID from the APNs auth key (e.g. 4F3FCFBNHR)
//   APNS_TEAM_ID     — 10-char Apple Team ID (e.g. Q7JF27M927)
//   APNS_BUNDLE_ID   — com.cookedapp.cooked
//   APNS_P8_KEY      — full .p8 file contents (multi-line PEM, including
//                      -----BEGIN PRIVATE KEY----- / -----END PRIVATE KEY-----)
//   SUPABASE_URL              — https://jfwtyqyglxknubvhgifw.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service role key (server-side only, bypasses RLS)
//
//   SUPABASE_WEBHOOK_SECRET  — shared secret sent in `x-webhook-secret` header
//                              from Supabase Database Webhooks (follows, DMs, etc.)
//   ADMIN_PUSH_SECRET        — shared secret sent in `x-admin-secret` header
//                              from the PWA admin panel. Required on /push/send
//                              and /push/broadcast in addition to the admin
//                              user id check (defense-in-depth).
//
// Endpoints:
//   POST /push/send       — admin → one user
//   POST /push/broadcast  — admin → every user with a token
//   POST /push/event      — Supabase DB webhook → auto-pushes for follows/DMs/etc.
//
// Auth:
//   /push/send, /push/broadcast — x-admin-secret header must match
//                                 ADMIN_PUSH_SECRET AND body.admin_clerk_user_id
//                                 must match a user_data row with is_admin=true.
//   /push/event — x-webhook-secret header must equal SUPABASE_WEBHOOK_SECRET.

const APNS_JWT_CACHE = { token: null, expiresAt: 0 };

function base64UrlEncode(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlEncodeString(str) {
  return base64UrlEncode(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getApnsJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (APNS_JWT_CACHE.token && APNS_JWT_CACHE.expiresAt > now + 60) {
    return APNS_JWT_CACHE.token;
  }
  const header = { alg: "ES256", kid: env.APNS_KEY_ID, typ: "JWT" };
  const claims = { iss: env.APNS_TEAM_ID, iat: now };
  const signingInput =
    base64UrlEncodeString(JSON.stringify(header)) + "." +
    base64UrlEncodeString(JSON.stringify(claims));
  const keyData = pemToArrayBuffer(env.APNS_P8_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = signingInput + "." + base64UrlEncode(sig);
  APNS_JWT_CACHE.token = jwt;
  APNS_JWT_CACHE.expiresAt = now + 50 * 60;
  return jwt;
}

async function sbFetch(env, path, init = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    // Scrub raw PostgREST bodies — they leak schema info. Log full detail
    // server-side, surface only the status code to callers.
    console.log(`[push] Supabase ${res.status} on ${path}: ${text}`);
    throw new Error(`Supabase ${res.status}`);
  }
  return res;
}

// Constant-time string compare — defense-in-depth against timing attacks on
// our webhook/admin shared secrets. Through Cloudflare's edge, the practical
// timing signal is negligible, but the cost is ~5 lines and sets a good pattern.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= ae[i] ^ be[i];
  return diff === 0;
}

async function verifyAdmin(env, clerkUserId) {
  if (!clerkUserId) return false;
  const res = await sbFetch(env,
    `user_data?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=is_admin&limit=1`
  );
  const rows = await res.json();
  return rows.length > 0 && rows[0].is_admin === true;
}

async function tokensForUser(env, clerkUserId) {
  const res = await sbFetch(env,
    `user_push_tokens?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=device_token,platform`
  );
  return res.json();
}

async function allTokens(env) {
  // Paginate via Range headers. PostgREST caps each response at db-max-rows
  // (Supabase default: 1000) and silently truncates — so a single select
  // would drop devices past row 1000 once the fleet grows.
  const PAGE = 500;
  const out = [];
  let offset = 0;
  while (true) {
    const res = await sbFetch(env,
      `user_push_tokens?select=clerk_user_id,device_token,platform&order=id.asc`,
      { headers: { "Range-Unit": "items", "Range": `${offset}-${offset + PAGE - 1}` } }
    );
    const page = await res.json();
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function deleteDeadToken(env, deviceToken) {
  // APNs 410 = token permanently invalid (app uninstalled, token rotated).
  // Prune so future broadcasts don't keep retrying dead endpoints.
  try {
    await sbFetch(env,
      `user_push_tokens?device_token=eq.${encodeURIComponent(deviceToken)}`,
      { method: "DELETE" }
    );
    console.log(`[push] pruned dead token ${deviceToken.slice(0, 8)}…`);
  } catch (err) {
    console.log(`[push] prune failed for ${deviceToken.slice(0, 8)}…: ${err.message}`);
  }
}

async function logSend(env, entry) {
  try {
    await sbFetch(env, "notifications_log", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.log("[push] log write failed:", err.message);
  }
}

async function sendOne(env, jwt, token, platform, title, body, payload) {
  const host = platform === "ios_sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  // Spread caller-supplied payload FIRST so our `aps` dictionary wins. Prevents
  // a malicious/buggy `payload.aps` from overriding the alert we just built
  // (silent pushes, alert stripping, sound/badge tampering). The caller can
  // still attach arbitrary top-level keys for deep-linking (notification_id etc).
  const callerPayload = payload || {};
  const safeCallerPayload = { ...callerPayload };
  delete safeCallerPayload.aps; // hard-block aps override
  const apsPayload = {
    ...safeCallerPayload,
    // No `badge` key here. iOS auto-increments the app icon badge by
    // exactly +1 per delivered notification when badge is omitted —
    // which is the behavior we want. Hard-coding badge:1 caused the
    // "stuck red dot" bug: every push pinned the badge to 1, so even
    // after the app cleared it on foreground, the next push restored
    // it to 1 forever. Bug 2026-05-13.
    aps: { alert: { title, body }, sound: "default" },
  };
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": env.APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(apsPayload),
  });
  const responseText = res.ok ? "" : await res.text();
  // 410 Unregistered → token permanently dead. Prune so we don't keep retrying.
  if (res.status === 410) {
    await deleteDeadToken(env, token);
  }
  return { status: res.status, response: responseText };
}

// Defense-in-depth admin auth: require BOTH the shared secret header AND an
// admin user_id. Clerk IDs leak in profile URLs and follow graphs — they are
// NOT secrets — so the body field alone can't gate these endpoints.
async function verifyAdminAuth(request, env, body) {
  const provided = request.headers.get("x-admin-secret") || "";
  if (!env.ADMIN_PUSH_SECRET || !timingSafeEqual(provided, env.ADMIN_PUSH_SECRET)) {
    return { ok: false, code: 401, error: "Not authorized" };
  }
  if (!(await verifyAdmin(env, body.admin_clerk_user_id))) {
    return { ok: false, code: 403, error: "Not authorized" };
  }
  return { ok: true };
}

async function handlePushSend(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const { admin_clerk_user_id, recipient_clerk_user_id, title, body: msgBody, payload } = body;
  if (!title || !msgBody || !recipient_clerk_user_id) {
    return jsonResponse({ error: "Missing title, body, or recipient_clerk_user_id" }, 400);
  }
  const auth = await verifyAdminAuth(request, env, body);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.code);

  const tokens = await tokensForUser(env, recipient_clerk_user_id);
  if (tokens.length === 0) {
    await logSend(env, {
      recipient_id: recipient_clerk_user_id, sender_id: admin_clerk_user_id,
      category: "admin_direct", title, body: msgBody, payload: payload || null,
      apns_status: null, apns_response: "No tokens on file",
    });
    return jsonResponse({ sent: 0, note: "recipient has no registered devices" });
  }
  const jwt = await getApnsJwt(env);
  const results = await Promise.all(
    tokens.map(t => sendOne(env, jwt, t.device_token, t.platform, title, msgBody, payload)
      .then(r => ({ token: t.device_token.slice(0, 8) + "…", platform: t.platform, ...r }))
    )
  );
  // Log after sends so a slow Supabase insert doesn't stall APNs delivery.
  await Promise.all(results.map((r, i) => logSend(env, {
    recipient_id: recipient_clerk_user_id, sender_id: admin_clerk_user_id,
    category: "admin_direct", title, body: msgBody, payload: payload || null,
    apns_status: r.status, apns_response: r.response,
  })));
  const sent = results.filter(r => r.status === 200).length;
  return jsonResponse({ sent, tried: results.length });
}

// ─── Auto-push from Supabase DB webhooks ─────────────────────────────────────
//
// Supabase Database Webhook POSTs JSON like:
//   { type: "INSERT", table: "notifications", record: { ... }, old_record: null }
// We wire two webhooks in the Supabase dashboard (notifications INSERT,
// messages INSERT). Both hit this one endpoint with the shared secret header.

function mapNotifTypeToPrefKey(type) {
  // notifications.type → notification_prefs.type (key mismatch for one row)
  if (type === "friend_visited_city") return "friend_visited_your_city";
  return type;
}

async function isNotifPrefEnabled(env, clerkUserId, prefKey) {
  // notification_prefs stores each pref key as its own column on a single
  // row-per-user, e.g. { clerk_user_id, followed_you, friend_new_find, ... }.
  try {
    const res = await sbFetch(env,
      `notification_prefs?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=*&limit=1`
    );
    const rows = await res.json();
    if (rows.length === 0) return true; // no prefs row yet → default ON
    const val = rows[0][prefKey];
    if (val === undefined || val === null) return true; // column missing / unset → default ON
    return val !== false;
  } catch (err) {
    console.log("[push] pref lookup failed:", err.message);
    return true; // fail open — better to send than drop
  }
}

async function getDisplayName(env, clerkUserId) {
  if (!clerkUserId) return "Someone";
  try {
    const res = await sbFetch(env,
      `user_data?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=profile_name,profile_username&limit=1`
    );
    const rows = await res.json();
    if (rows.length === 0) return "Someone";
    const r = rows[0];
    return r.profile_name || r.profile_username || "Someone";
  } catch { return "Someone"; }
}

function formatNotifCopy(type, actorName, restaurantName) {
  const rest = restaurantName || "a restaurant";
  switch (type) {
    case "followed_you":
      return { title: "New follower", body: `${actorName} started following you` };
    case "friend_loved_your_watchlist":
      return { title: "Watchlist love", body: `${actorName} loved ${rest}` };
    case "friend_new_find":
      return { title: "New find", body: `${actorName} added ${rest} as a new find` };
    case "friend_watchlisted":
      return { title: "Added to list", body: `${actorName} added ${rest} to their list` };
    case "moment_liked":
      return restaurantName
        ? { title: "Moment liked", body: `${actorName} liked your moment about ${restaurantName}` }
        : { title: "Moment liked", body: `${actorName} liked one of your moments` };
    case "mentioned":
      return restaurantName
        ? { title: "Mentioned", body: `${actorName} mentioned you in a review of ${restaurantName}` }
        : { title: "Mentioned", body: `${actorName} mentioned you` };
    case "friend_visited_city":
      return { title: "Friend in your city", body: `${actorName} checked out ${rest}` };
    case "restaurant_trending":
      return { title: "Trending 🔥", body: `${rest} is trending right now` };
    default:
      return { title: "cooked", body: `${actorName} has an update for you` };
  }
}

async function dispatchPush(env, recipientId, senderId, category, title, body, payload, logBody) {
  // `logBody` (optional) is the body to persist to notifications_log when it
  // differs from what's delivered to APNs — specifically for DMs, where we
  // want the preview on the device but a generic placeholder in the admin log
  // to avoid exposing private message content in the admin History UI.
  const storedBody = logBody ?? body;
  const tokens = await tokensForUser(env, recipientId);
  if (tokens.length === 0) {
    await logSend(env, {
      recipient_id: recipientId, sender_id: senderId, category, title, body: storedBody,
      payload: payload || null, apns_status: null, apns_response: "No tokens on file",
    });
    return { sent: 0, tried: 0, note: "no devices" };
  }
  const jwt = await getApnsJwt(env);
  // Parallelise — user may have multiple devices; no reason to send serially.
  const results = await Promise.all(
    tokens.map(t => sendOne(env, jwt, t.device_token, t.platform, title, body, payload))
  );
  await Promise.all(results.map(r => logSend(env, {
    recipient_id: recipientId, sender_id: senderId, category, title, body: storedBody,
    payload: payload || null, apns_status: r.status, apns_response: r.response,
  })));
  return { sent: results.filter(r => r.status === 200).length, tried: results.length };
}

// Codepoint-safe truncation. `String.prototype.slice` works in UTF-16 code
// units; cutting in the middle of a surrogate pair (e.g. most emoji) produces
// a lone surrogate that iOS renders as U+FFFD (replacement char). This slices
// by codepoint and strips any dangling combining marks at the seam.
function truncateSafe(s, max) {
  const cps = Array.from(s);
  if (cps.length <= max) return s;
  return cps.slice(0, max - 1).join("") + "…";
}

// In-memory dedup cache so Supabase webhook retries (at-least-once delivery)
// don't re-push already-delivered events. Scoped to a single Worker isolate
// lifetime — for stronger guarantees across restarts we'd need a unique
// constraint on notifications_log(payload->notification_id). Good enough for
// the retry-within-seconds case that's by far the most common.
const DISPATCHED_RECENTLY = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;
function markDispatched(key) {
  const now = Date.now();
  DISPATCHED_RECENTLY.set(key, now);
  if (DISPATCHED_RECENTLY.size > 500) {
    for (const [k, t] of DISPATCHED_RECENTLY) {
      if (now - t > DEDUP_TTL_MS) DISPATCHED_RECENTLY.delete(k);
    }
  }
}
function alreadyDispatched(key) {
  const t = DISPATCHED_RECENTLY.get(key);
  if (!t) return false;
  if (Date.now() - t > DEDUP_TTL_MS) {
    DISPATCHED_RECENTLY.delete(key);
    return false;
  }
  return true;
}

async function handlePushEvent(request, env) {
  const secret = request.headers.get("x-webhook-secret");
  if (!env.SUPABASE_WEBHOOK_SECRET || !timingSafeEqual(secret || "", env.SUPABASE_WEBHOOK_SECRET)) {
    return jsonResponse({ error: "Not authorized" }, 401);
  }
  let payload;
  try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  if (payload.type !== "INSERT") {
    return jsonResponse({ ok: true, skipped: `non-insert event (${payload.type})` });
  }
  const table = payload.table;
  const record = payload.record || {};

  if (table === "notifications") {
    const { user_id, type, from_user_id, restaurant_name, id } = record;
    if (!user_id || !type) return jsonResponse({ error: "Missing user_id or type" }, 400);
    if (from_user_id && from_user_id === user_id) {
      return jsonResponse({ ok: true, skipped: "self-action" });
    }
    const dedupKey = `notif:${id}`;
    if (alreadyDispatched(dedupKey)) {
      return jsonResponse({ ok: true, skipped: "already dispatched (retry)" });
    }
    const prefKey = mapNotifTypeToPrefKey(type);
    if (!(await isNotifPrefEnabled(env, user_id, prefKey))) {
      return jsonResponse({ ok: true, skipped: "pref disabled", type });
    }
    const actorName = await getDisplayName(env, from_user_id);
    const { title, body } = formatNotifCopy(type, actorName, restaurant_name);
    const result = await dispatchPush(env, user_id, from_user_id, type, title, body, { notification_id: id, kind: type });
    markDispatched(dedupKey);
    return jsonResponse({ ok: true, ...result, type });
  }

  if (table === "messages") {
    const { sender_id, recipient_id, content, restaurant_name, id } = record;
    if (!recipient_id) return jsonResponse({ error: "Missing recipient_id" }, 400);
    if (sender_id === recipient_id) {
      return jsonResponse({ ok: true, skipped: "self-message" });
    }
    const dedupKey = `msg:${id}`;
    if (alreadyDispatched(dedupKey)) {
      return jsonResponse({ ok: true, skipped: "already dispatched (retry)" });
    }
    const senderName = await getDisplayName(env, sender_id);
    let body;
    if (content && content.trim()) {
      body = truncateSafe(content, 120);
    } else if (restaurant_name) {
      body = `shared ${restaurant_name} 🍽`;
    } else {
      body = "sent you a message";
    }
    // Do NOT persist raw DM content in notifications_log — it would let any
    // admin read private messages in the Push History UI. Keep the preview
    // on-device (via APNs body) but write a generic placeholder to the log.
    const logBody = "new direct message";
    const result = await dispatchPush(
      env, recipient_id, sender_id, "new_dm", senderName, body,
      { message_id: id, conversation_with: sender_id },
      logBody
    );
    markDispatched(dedupKey);
    return jsonResponse({ ok: true, ...result });
  }

  return jsonResponse({ ok: true, skipped: `unknown table ${table}` });
}

async function handlePushBroadcast(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const { admin_clerk_user_id, title, body: msgBody, payload } = body;
  if (!title || !msgBody) return jsonResponse({ error: "Missing title or body" }, 400);
  const auth = await verifyAdminAuth(request, env, body);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.code);

  const tokens = await allTokens(env);
  if (tokens.length === 0) return jsonResponse({ sent: 0, note: "no registered devices" });
  const jwt = await getApnsJwt(env);

  // Parallelise sends in chunks. Serial loops hit the 30s wall-time limit
  // around ~200-400 users (2 subrequests each); Promise.all in chunks of
  // CHUNK keeps latency flat at ~APNs RTT regardless of fleet size.
  // Cloudflare Workers cap subrequests at 1000/request on the paid plan — so
  // one broadcast scales cleanly to ~500 devices without hitting limits.
  // For larger fleets, offload to a Cloudflare Queue.
  const CHUNK = 50;
  const results = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const chunkResults = await Promise.all(chunk.map((t, idx) =>
      sendOne(env, jwt, t.device_token, t.platform, title, msgBody, payload)
        .then(r => ({ clerk_user_id: t.clerk_user_id, ...r }))
    ));
    results.push(...chunkResults);
  }
  await Promise.all(results.map(r => logSend(env, {
    recipient_id: r.clerk_user_id, sender_id: admin_clerk_user_id,
    category: "admin_broadcast", title, body: msgBody, payload: payload || null,
    apns_status: r.status, apns_response: r.response,
  })));
  const sent = results.filter(r => r.status === 200).length;
  const failed = results.length - sent;
  return jsonResponse({ sent, failed, tried: tokens.length });
}

// ─── Neo4j proxy ─────────────────────────────────────────────────────────────
//
// iOS used to embed the Neo4j Aura username + password directly in the binary —
// anyone who downloaded the IPA could `strings` them out in 30 seconds and gain
// read+write to the entire social graph (wipe loves, inject fake follows,
// manipulate flame scores). This route moves credentials server-side: the iOS
// app sends its Clerk session JWT in `Authorization: Bearer …`, the worker
// verifies the JWT against Clerk's JWKS, and only then forwards the Cypher
// statement to Aura with HTTP Basic auth from env secrets.
//
// Env vars required in Cloudflare:
//   NEO4J_USER     — Aura database id used as the basic-auth username
//   NEO4J_PASSWORD — Aura database password
//
// Endpoint:
//   POST /neo4j/query   body: { statement: "MATCH ...", parameters: {...} }
//
// Auth:
//   Authorization: Bearer <Clerk session JWT>
//   Verified against the Clerk frontend API's JWKS endpoint. JWKS is cached for
//   1 hour in worker memory to keep latency tight. Rejects unsigned tokens,
//   expired tokens, and tokens from any other issuer.

// Hard-coded — iOS Neo4jService had this same string baked in; if Aura ever
// rotates the host we promote it to a secret. Single source of truth lives
// here now so iOS can stay credential-free.
const NEO4J_AURA_URL = "https://854f6d17.databases.neo4j.io/db/854f6d17/query/v2";

// Clerk frontend API host. Derived from the publishable key shipped in iOS
// (`pk_test_c2F2aW5nLWFsaWVuLTE0LmNsZXJrLmFjY291bnRzLmRldiQ` → base64-decodes
// to `saving-alien-14.clerk.accounts.dev$`). If we ever move to production
// Clerk the issuer flips and these two constants must update in lockstep.
const CLERK_ISSUER = "https://saving-alien-14.clerk.accounts.dev";
const CLERK_JWKS_URL = `${CLERK_ISSUER}/.well-known/jwks.json`;

// Module-level cache for the JWKS keyset. Clerk rotates signing keys
// infrequently; a 1-hour TTL is the same window Clerk's own docs recommend.
const CLERK_JWKS_CACHE = { keys: null, expiresAt: 0 };

async function fetchClerkJwks() {
  const now = Date.now();
  if (CLERK_JWKS_CACHE.keys && CLERK_JWKS_CACHE.expiresAt > now) {
    return CLERK_JWKS_CACHE.keys;
  }
  const res = await fetch(CLERK_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const json = await res.json();
  const keys = Array.isArray(json.keys) ? json.keys : [];
  CLERK_JWKS_CACHE.keys = keys;
  CLERK_JWKS_CACHE.expiresAt = now + 60 * 60 * 1000; // 1 hour
  return keys;
}

// base64url → Uint8Array (RFC 7515). Web Crypto's `crypto.subtle.verify`
// wants raw bytes, but JWTs ship base64url-encoded with padding stripped, so
// we re-pad and atob() into a Uint8Array.
function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Import a JWK (the JSON shape Clerk publishes at /.well-known/jwks.json) as
// a CryptoKey suitable for `crypto.subtle.verify`. Clerk currently signs with
// RS256 (RSA-SHA256); if that ever flips to ES256 we'll add a branch here.
async function importJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/**
 * Verify a Clerk session JWT.
 *   1. Parse header + payload (rejects malformed tokens)
 *   2. Require alg == "RS256" — blocks the "alg: none" downgrade attack
 *   3. Look up the signing key by `kid` from Clerk's cached JWKS
 *   4. Verify the RSA-SHA256 signature using Web Crypto
 *   5. Check `iss` matches the expected Clerk issuer
 *   6. Check `exp` / `nbf` / `iat` against the current clock (60s skew)
 *
 * Returns the decoded payload on success (caller pulls `sub` for the Clerk
 * user id). Throws on any failure — caller maps to 401.
 */
async function verifyClerkJwt(token) {
  if (typeof token !== "string") throw new Error("Token must be a string");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const [headerB64, payloadB64, signatureB64] = parts;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    throw new Error("Invalid JWT encoding");
  }

  if (header.alg !== "RS256") throw new Error(`Unsupported JWT alg: ${header.alg}`);
  if (!header.kid) throw new Error("JWT missing kid header");

  const keys = await fetchClerkJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found in JWKS");

  const cryptoKey = await importJwk(jwk);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    signature,
    data
  );
  if (!valid) throw new Error("Signature verification failed");

  if (payload.iss !== CLERK_ISSUER) throw new Error(`Bad issuer: ${payload.iss}`);

  const now = Math.floor(Date.now() / 1000);
  const SKEW = 60;
  if (typeof payload.exp === "number" && payload.exp + SKEW < now) {
    throw new Error("Token expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf - SKEW > now) {
    throw new Error("Token not yet valid");
  }
  if (typeof payload.iat === "number" && payload.iat - SKEW > now) {
    throw new Error("Token issued in the future");
  }

  return payload;
}

async function handleNeo4jQuery(request, env) {
  // 1. Extract + verify the Clerk JWT.
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return jsonResponse({ error: "Missing Bearer token" }, 401);
  }
  const token = match[1].trim();
  let claims;
  try {
    claims = await verifyClerkJwt(token);
  } catch (err) {
    console.log("[neo4j/query] JWT verification failed:", err.message);
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  // claims.sub = Clerk user id. Not currently used for authz — today's
  // model is "anyone with a valid Clerk session can hit Neo4j" (same
  // access the iOS app had before, just no longer wide open to anyone
  // with the IPA). Future: per-user rate limit / write gating.
  void claims;

  // 2. Parse the request body.
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { statement, parameters } = body || {};
  if (typeof statement !== "string" || !statement.trim()) {
    return jsonResponse({ error: "statement (string) required" }, 400);
  }
  const params = (parameters && typeof parameters === "object" && !Array.isArray(parameters))
    ? parameters
    : {};

  // 3. Check credentials are configured.
  if (!env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    console.log("[neo4j/query] NEO4J_USER / NEO4J_PASSWORD not set");
    return jsonResponse({ error: "Neo4j credentials not configured" }, 500);
  }

  // 4. Forward to Aura with Basic auth + 15s timeout.
  const basic = btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`);
  let upstream;
  try {
    upstream = await fetch(NEO4J_AURA_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ statement, parameters: params }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.log("[neo4j/query] Aura fetch failed:", err.message);
    return jsonResponse({ error: "Upstream unavailable" }, 502);
  }

  // 5. Pass the Aura response body through unchanged — iOS callers
  // expect the exact `{ data: { fields, values } }` shape.
  const responseText = await upstream.text();
  return new Response(responseText, {
    status: upstream.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Phase 1B — card_events → Neo4j sync ──────────────────────
//
// Reads new card_events rows from Supabase every 15 minutes and
// upserts them into Neo4j as IMPRESSED / TAPPED / PASSED / SKIPPED
// relationships. Impressions aggregate by (user, restaurant, week)
// so the graph stays small at scale; passes/skips/taps are per-event
// because their timestamps matter (e.g. for the 30-day blacklist).
//
// Idempotent — uses card_events_sync_state to track last_event_id.
// Re-running the same window writes the same MERGE statements,
// which Neo4j handles safely.
//
// Triggered by Cloudflare cron `*/15 * * * *` (configure in dashboard).
//
async function syncCardEventsToNeo4j(env) {
  const t0 = Date.now();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    console.log("[event-sync] missing env — skipping");
    return;
  }

  // 1. Read the sync watermark.
  const stateRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/card_events_sync_state?id=eq.1&select=last_event_id`,
    { headers: supabaseHeaders(env) }
  );
  if (!stateRes.ok) {
    console.log("[event-sync] couldn't read sync_state:", stateRes.status);
    return;
  }
  const stateRows = await stateRes.json();
  const lastId = (stateRows?.[0]?.last_event_id ?? 0);
  console.log(`[event-sync] starting from event id=${lastId}`);

  // 2. Pull new events. Cap at 5000/run to keep one tick bounded.
  const BATCH_CAP = 5000;
  const eventsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/card_events?id=gt.${lastId}&order=id.asc&limit=${BATCH_CAP}&select=id,user_id,restaurant_id,kind,at`,
    { headers: supabaseHeaders(env) }
  );
  if (!eventsRes.ok) {
    console.log("[event-sync] events query failed:", eventsRes.status);
    return;
  }
  const events = await eventsRes.json();
  if (!Array.isArray(events) || events.length === 0) {
    console.log("[event-sync] nothing to sync");
    return;
  }
  console.log(`[event-sync] pulled ${events.length} events`);

  // 3. Aggregate impressions by (user, restaurant, week). Other event
  //    kinds stay per-event because their timestamps matter (passes
  //    drive the 30-day blacklist, taps the engagement score, etc.).
  const impressionAgg = new Map(); // key: "user|rid|YYYY-WW" → {userId, restaurantId, weekStart, count, lastAt}
  const perEvent = []; // [{userId, restaurantId, kind, at}]

  for (const e of events) {
    if (!e.user_id || !e.restaurant_id) continue;
    if (e.kind === "impression") {
      const week = isoWeek(e.at);
      const key = `${e.user_id}|${e.restaurant_id}|${week}`;
      const slot = impressionAgg.get(key);
      if (slot) {
        slot.count++;
        if (e.at > slot.lastAt) slot.lastAt = e.at;
      } else {
        impressionAgg.set(key, {
          userId: e.user_id,
          restaurantId: e.restaurant_id,
          weekStart: weekStartIso(e.at),
          count: 1,
          lastAt: e.at,
        });
      }
    } else {
      perEvent.push({
        userId: e.user_id,
        restaurantId: e.restaurant_id,
        kind: e.kind,
        at: e.at,
      });
    }
  }

  // 4. Write to Neo4j. Aggregated impressions: one MERGE per agg
  //    bucket that adds to the count. Per-event: MERGE with the
  //    individual timestamp. Each MERGE is a separate Aura call,
  //    so cap parallelism to avoid hammering.
  const neoBasic = "Basic " + btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`);
  let wrote = 0, failed = 0;

  // 4a. Impressions
  for (const agg of impressionAgg.values()) {
    const cypher = `
      MERGE (u:User {id: $userId})
      MERGE (r:Restaurant {id: toString($restaurantId)})
      MERGE (u)-[rel:IMPRESSED {weekStart: $weekStart}]->(r)
      ON CREATE SET rel.count = $count, rel.lastAt = datetime($lastAt)
      ON MATCH SET rel.count = rel.count + $count,
                   rel.lastAt = CASE WHEN datetime($lastAt) > rel.lastAt
                                     THEN datetime($lastAt) ELSE rel.lastAt END
    `;
    const params = {
      userId: agg.userId,
      restaurantId: agg.restaurantId,
      weekStart: agg.weekStart,
      count: agg.count,
      lastAt: agg.lastAt,
    };
    try {
      const r = await neoExec(env, neoBasic, cypher, params);
      if (r.ok) wrote++; else failed++;
    } catch { failed++; }
  }

  // 4b. Per-event: TAPPED / PASSED / SKIPPED / LOVE / LOVE_TAP /
  //     BOOKMARK_TAP / SHARE_TAP. Map to Neo4j relationship kinds.
  //     LOVED already exists in the graph (via InteractionLogger) —
  //     a Heat-game love is the same signal. We skip duplicating it
  //     here; existing path writes it via the love toggle.
  for (const ev of perEvent) {
    const rel = relForEventKind(ev.kind);
    if (!rel) continue;  // unknown / skipped kind
    const cypher = `
      MERGE (u:User {id: $userId})
      MERGE (r:Restaurant {id: toString($restaurantId)})
      MERGE (u)-[edge:${rel} {at: datetime($at)}]->(r)
    `;
    try {
      const res = await neoExec(env, neoBasic, cypher, {
        userId: ev.userId,
        restaurantId: ev.restaurantId,
        at: ev.at,
      });
      if (res.ok) wrote++; else failed++;
    } catch { failed++; }
  }

  // 5. Advance the watermark.
  const newLast = events[events.length - 1].id;
  const updRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/card_events_sync_state?id=eq.1`,
    {
      method: "PATCH",
      headers: { ...supabaseHeaders(env), "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ last_event_id: newLast, last_run_at: new Date().toISOString() }),
    }
  );
  if (!updRes.ok) {
    console.log("[event-sync] couldn't update sync_state:", updRes.status);
  }

  const elapsed = Date.now() - t0;
  console.log(`[event-sync] done — ${wrote} writes, ${failed} failures, ${elapsed}ms, new last_id=${newLast}`);
}

// Map a card_events.kind to a Neo4j relationship name.
function relForEventKind(kind) {
  switch (kind) {
    case "tap":          return "TAPPED";
    case "pass":         return "PASSED";
    case "skip":         return "SKIPPED";
    case "love_tap":     return "LOVED_FROM_CARD";  // distinct from full LOVE
    case "bookmark_tap": return "WATCHLISTED_FROM_CARD";
    case "share_tap":    return "SHARED_FROM_CARD";
    case "love":         return null; // existing path writes LOVED — don't duplicate
    default:             return null;
  }
}

// Single Aura request — pulled into its own helper because we make
// dozens per sync run.
async function neoExec(env, basicAuth, statement, parameters) {
  return await fetch(NEO4J_AURA_URL, {
    method: "POST",
    headers: {
      "Authorization": basicAuth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ statement, parameters }),
    signal: AbortSignal.timeout(8000),
  });
}

function supabaseHeaders(env) {
  return {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

// ISO 8601 week-of-year string used to bucket impressions.
// "2026-W21" — standardised, sortable, language-agnostic.
function isoWeek(isoTs) {
  const d = new Date(isoTs);
  // Get Thursday in current week (ISO week-numbering rule).
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Monday of the week as ISO timestamp (used as the canonical "weekStart"
// stored on IMPRESSED edges).
function weekStartIso(isoTs) {
  const d = new Date(isoTs);
  const day = (d.getUTCDay() + 6) % 7; // 0=Mon ... 6=Sun
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString();
}

// One-time reconcile: bring Neo4j LOVED / WATCHLISTED / FOLLOWS into
// sync with the Supabase source of truth. Going forward,
// InteractionLogger.unlove/unwatchlist already cascade properly to
// Neo4j — but anything that happened BEFORE those paths shipped left
// orphan edges in the graph. This route deletes them.
//
// Triggered via POST /admin/reconcile-neo4j-state. Reports per-user
// counts of deleted edges + final per-edge totals.
async function reconcileNeo4jToSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    return { error: "missing env" };
  }
  const usersRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_data?select=clerk_user_id,loved,watchlist`,
    { headers: supabaseHeaders(env) }
  );
  if (!usersRes.ok) return { error: `users fetch ${usersRes.status}` };
  const users = await usersRes.json();
  const followsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/follows?select=follower_id,following_id`,
    { headers: supabaseHeaders(env) }
  );
  const allFollows = followsRes.ok ? await followsRes.json() : [];
  const followsByUser = {};
  for (const row of allFollows) {
    (followsByUser[row.follower_id] ||= []).push(row.following_id);
  }

  const neoBasic = "Basic " + btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`);
  let lovedDeleted = 0, watchlistDeleted = 0, followsDeleted = 0;

  for (const u of users ?? []) {
    const userId = u.clerk_user_id;
    const currentLoved = (u.loved ?? []).map(Number).filter(Number.isFinite);
    const currentWatchlist = (u.watchlist ?? []).map(Number).filter(Number.isFinite);
    const currentFollows = followsByUser[userId] ?? [];

    // LOVED reconcile — delete edges to Restaurants no longer in
    // current loved[]. rest.id is stored as STRING in Neo4j, so we
    // compare against the current list as strings too (no int
    // coercion needed). Parens around the NOT (x IN y) matter —
    // bare `NOT x IN y` parses as `(NOT x) IN y` in Cypher.
    const currentLovedStr = currentLoved.map(String);
    try {
      const cypher = currentLovedStr.length === 0
        ? `MATCH (u:User {id: $userId})-[r:LOVED]->()
           WITH r, count(r) AS n DELETE r RETURN n`
        : `MATCH (u:User {id: $userId})-[r:LOVED]->(rest:Restaurant)
           WHERE NOT (toString(rest.id) IN $current)
           WITH r, count(r) AS n DELETE r RETURN n`;
      const res = await neoExec(env, neoBasic, cypher, { userId, current: currentLovedStr });
      if (res.ok) {
        const d = await res.json();
        lovedDeleted += (d?.data?.values?.[0]?.[0] ?? 0);
      }
    } catch {}

    // WATCHLISTED reconcile
    const currentWatchlistStr = currentWatchlist.map(String);
    try {
      const cypher = currentWatchlistStr.length === 0
        ? `MATCH (u:User {id: $userId})-[r:WATCHLISTED]->()
           WITH r, count(r) AS n DELETE r RETURN n`
        : `MATCH (u:User {id: $userId})-[r:WATCHLISTED]->(rest:Restaurant)
           WHERE NOT (toString(rest.id) IN $current)
           WITH r, count(r) AS n DELETE r RETURN n`;
      const res = await neoExec(env, neoBasic, cypher, { userId, current: currentWatchlistStr });
      if (res.ok) {
        const d = await res.json();
        watchlistDeleted += (d?.data?.values?.[0]?.[0] ?? 0);
      }
    } catch {}

    // FOLLOWS reconcile — only edges to OTHER User nodes (the
    // FOLLOWS-to-:City legacy edges get cleaned separately below).
    // User.id is already STRING — compare directly.
    try {
      const cypher = currentFollows.length === 0
        ? `MATCH (u:User {id: $userId})-[r:FOLLOWS]->(other:User)
           WITH r, count(r) AS n DELETE r RETURN n`
        : `MATCH (u:User {id: $userId})-[r:FOLLOWS]->(other:User)
           WHERE NOT (other.id IN $current)
           WITH r, count(r) AS n DELETE r RETURN n`;
      const res = await neoExec(env, neoBasic, cypher, { userId, current: currentFollows });
      if (res.ok) {
        const d = await res.json();
        followsDeleted += (d?.data?.values?.[0]?.[0] ?? 0);
      }
    } catch {}
  }

  // Legacy FOLLOWS-to-City → FOLLOWS_CITY conversion. Those 22 stale
  // edges we saw earlier were created before the FOLLOWS_CITY
  // relationship type existed. Convert + delete.
  let legacyFollowsCityConverted = 0;
  try {
    const cypher = `
      MATCH (u:User)-[r:FOLLOWS]->(c:City)
      MERGE (u)-[:FOLLOWS_CITY]->(c)
      DELETE r
      RETURN count(r) AS n
    `;
    const res = await neoExec(env, neoBasic, cypher, {});
    if (res.ok) {
      const d = await res.json();
      legacyFollowsCityConverted = (d?.data?.values?.[0]?.[0] ?? 0);
    }
  } catch {}

  return {
    users: users?.length ?? 0,
    lovedDeleted,
    watchlistDeleted,
    followsDeleted,
    legacyFollowsCityConverted,
  };
}

// One-time backfill: import existing user_data.noped + .skipped
// arrays into Neo4j as PASSED / SKIPPED edges with at=NOW (we have
// no historical timestamps). Call once after Phase 1B ships.
//
// Triggered via POST /admin/backfill-card-events (admin-only check
// would happen in the route handler; for now it's just present).
async function backfillNopedSkippedToNeo4j(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    return { error: "missing env" };
  }
  const usersRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_data?select=clerk_user_id,noped,skipped`,
    { headers: supabaseHeaders(env) }
  );
  if (!usersRes.ok) return { error: `users fetch ${usersRes.status}` };
  const users = await usersRes.json();
  const neoBasic = "Basic " + btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`);
  let passed = 0, skipped = 0;
  const now = new Date().toISOString();
  for (const u of users ?? []) {
    for (const rid of (u.noped ?? [])) {
      try {
        const r = await neoExec(env, neoBasic,
          `MERGE (us:User {id: $userId}) MERGE (rs:Restaurant {id: toString($restaurantId)})
           MERGE (us)-[:PASSED {at: datetime($at)}]->(rs)`,
          { userId: u.clerk_user_id, restaurantId: Number(rid), at: now });
        if (r.ok) passed++;
      } catch {}
    }
    for (const rid of (u.skipped ?? [])) {
      try {
        const r = await neoExec(env, neoBasic,
          `MERGE (us:User {id: $userId}) MERGE (rs:Restaurant {id: toString($restaurantId)})
           MERGE (us)-[:SKIPPED {at: datetime($at)}]->(rs)`,
          { userId: u.clerk_user_id, restaurantId: Number(rid), at: now });
        if (r.ok) skipped++;
      } catch {}
    }
  }
  return { passed, skipped, users: users?.length ?? 0 };
}


// ════════════════════════════════════════════════════════════════════════════
// /api/home-feed — Server-side feed assembly (Build 64+)
// ════════════════════════════════════════════════════════════════════════════
// Inlined from worker/feed-scoring.js + worker/home-feed-cypher.js +
// worker/home-feed-handler.js. Standalone files preserved in the repo for
// reference / future maintenance — all three are inlined here so the
// Cloudflare dashboard paste-deploy continues to work with a single source
// file.
//
// Why: iOS used to fire 30+ separate network round-trips per home load.
// This endpoint collapses them into ONE response by running everything
// server-side where Neo4j Aura + Supabase are inside Cloudflare's network.

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

// ─── Recap moments (Phase C — Build 69) ─────────────────────────────────────
//
// Auto-generated digest cards that make the feed feel alive even at low
// scale. Aggregates friend activity into patterns like "Katie loved 4
// places in Mexico City this week" — pure data manipulation, no new infra.
//
// Two patterns ship in Build 69:
//   1. friend-by-city — friend who loved 2+ places in same city, last 14d
//   2. friend-this-period — any friend with 2+ loves total in last 14d
//
// Both thresholds are intentionally low (2 over 14 days) because at our
// current 18-user scale, friends don't generate enough activity to fire
// the stricter 3-in-7-days pattern. As the user base grows, we can
// tighten back up; for now, low thresholds ensure SOMETHING shows.

const RECAP_FRIEND_BY_CITY_CYPHER = `
MATCH (me:User {id: $userId})-[:FOLLOWS]->(friend:User)-[l:LOVED]->(r:Restaurant)
WHERE l.timestamp > datetime() - duration('P14D')
  AND r.city IS NOT NULL
  AND r.city <> ''
WITH friend, r.city AS city, count(r) AS loveCount,
     collect({id: r.id, name: r.name})[..5] AS restaurants
WHERE loveCount >= 2
RETURN friend.id AS friendId,
       friend.name AS friendName,
       city,
       loveCount,
       restaurants
ORDER BY loveCount DESC
LIMIT 5`;

// Fallback pattern: any friend who's been active recently. Fires when
// the friend hasn't concentrated their loves in one city, but has been
// loving across multiple places. "Katie loved 3 places this week."
const RECAP_FRIEND_THIS_PERIOD_CYPHER = `
MATCH (me:User {id: $userId})-[:FOLLOWS]->(friend:User)-[l:LOVED]->(r:Restaurant)
WHERE l.timestamp > datetime() - duration('P14D')
  AND r.name IS NOT NULL
WITH friend, count(r) AS loveCount,
     collect({id: r.id, name: r.name})[..5] AS restaurants,
     collect(DISTINCT r.city)[..3] AS cities
WHERE loveCount >= 2
RETURN friend.id AS friendId,
       friend.name AS friendName,
       loveCount,
       restaurants,
       cities
ORDER BY loveCount DESC
LIMIT 5`;

// Phase C-2 — cuisine spike. A friend has been on a flavor kick:
// 2+ loves of the same cuisine in the past 14 days. Generates "Stella's
// been on a sushi kick" / "Madison loved 4 Mexican spots lately" recaps
// — high product value because it reveals taste shifts, not just where
// friends are eating.
const RECAP_CUISINE_SPIKE_CYPHER = `
MATCH (me:User {id: $userId})-[:FOLLOWS]->(friend:User)-[l:LOVED]->(r:Restaurant)
WHERE l.timestamp > datetime() - duration('P14D')
  AND r.cuisine IS NOT NULL
  AND r.cuisine <> ''
WITH friend, r.cuisine AS cuisine, count(r) AS loveCount,
     collect({id: r.id, name: r.name})[..5] AS restaurants
WHERE loveCount >= 2
RETURN friend.id AS friendId,
       friend.name AS friendName,
       cuisine,
       loveCount,
       restaurants
ORDER BY loveCount DESC
LIMIT 5`;

// Phase C-2 — friend milestone. A friend just crossed a round-number
// total love count (25 / 50 / 100 / 250 / 500) during the past 14 days.
// "Stella just hit 100 loved places!" — rare-but-eventful, biggest
// dopamine hit of the three new patterns. We check `crossed`:
// totalLoves >= milestone AND (totalLoves - lovesLast14d) < milestone
// means the friend was BELOW the threshold 14 days ago and crossed it
// since. Returns the largest crossed milestone if multiple match.
const RECAP_FRIEND_MILESTONE_CYPHER = `
MATCH (me:User {id: $userId})-[:FOLLOWS]->(friend:User)-[l:LOVED]->(:Restaurant)
WITH friend,
     count(l) AS totalLoves,
     count(CASE WHEN l.timestamp > datetime() - duration('P14D') THEN 1 END) AS recentLoves
WHERE recentLoves > 0
WITH friend, totalLoves, recentLoves,
     [m IN [25, 50, 100, 250, 500]
      WHERE totalLoves >= m AND (totalLoves - recentLoves) < m] AS crossed
WHERE size(crossed) > 0
WITH friend, totalLoves, recentLoves, crossed[-1] AS milestone
OPTIONAL MATCH (friend)-[lr:LOVED]->(r:Restaurant)
WHERE lr.timestamp > datetime() - duration('P14D')
  AND r.name IS NOT NULL
WITH friend, totalLoves, milestone,
     collect({id: r.id, name: r.name})[..5] AS recentRestaurants
RETURN friend.id AS friendId,
       friend.name AS friendName,
       milestone,
       totalLoves,
       recentRestaurants
ORDER BY milestone DESC, totalLoves DESC
LIMIT 3`;

async function runRecapCypher(neoBasic, statement, userId) {
  try {
    const upstream = await fetch(NEO4J_AURA_URL, {
      method: "POST",
      headers: { "Authorization": neoBasic, "Content-Type": "application/json" },
      body: JSON.stringify({ statement, parameters: { userId } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      console.log(`[recap] HTTP ${upstream.status}`);
      return [];
    }
    const body = await upstream.json();
    return body?.data?.values || [];
  } catch (err) {
    console.log(`[recap] threw:`, err?.message || err);
    return [];
  }
}

async function fetchRecapMoments(neoBasic, userId) {
  // Run all four queries in parallel so total wall time stays small.
  // Aura handles N independent reads concurrently with no penalty.
  const [byCityRows, thisPeriodRows, cuisineRows, milestoneRows] = await Promise.all([
    runRecapCypher(neoBasic, RECAP_FRIEND_BY_CITY_CYPHER, userId),
    runRecapCypher(neoBasic, RECAP_FRIEND_THIS_PERIOD_CYPHER, userId),
    runRecapCypher(neoBasic, RECAP_CUISINE_SPIKE_CYPHER, userId),
    runRecapCypher(neoBasic, RECAP_FRIEND_MILESTONE_CYPHER, userId),
  ]);

  // Friend milestones — highest priority. "Stella just hit 100 loved places!"
  // Rare-but-eventful so they go first in the dedupe chain.
  const milestoneRecaps = milestoneRows.map((values) => {
    const friendId = coerceString(values[0]);
    const friendName = coerceString(values[1]);
    const milestone = coerceInt(values[2]);
    const totalLoves = coerceInt(values[3]);
    const rawList = Array.isArray(values[4]) ? values[4] : [];
    const restaurants = rawList.map((r) => ({
      id: coerceInt(r?.id),
      name: coerceString(r?.name),
    })).filter((r) => r.id !== null);
    if (!friendId || !friendName || milestone === null) return null;
    return {
      kind: "friendMilestone",
      friendId,
      friendName,
      count: milestone,
      restaurants,
      title: `${friendName} just hit ${milestone} loved places`,
      subtitle: totalLoves !== null && totalLoves > milestone
        ? `${totalLoves} total — and counting`
        : "a fresh milestone",
    };
  }).filter((r) => r !== null);

  // Cuisine spikes — "Stella's been on a sushi kick"
  // Skip friends already covered by a milestone recap (they win).
  const milestoneFriendIds = new Set(milestoneRecaps.map((r) => r.friendId));
  const cuisineRecaps = cuisineRows.map((values) => {
    const friendId = coerceString(values[0]);
    const friendName = coerceString(values[1]);
    const cuisine = coerceString(values[2]);
    const loveCount = coerceInt(values[3]);
    const rawList = Array.isArray(values[4]) ? values[4] : [];
    const restaurants = rawList.map((r) => ({
      id: coerceInt(r?.id),
      name: coerceString(r?.name),
    })).filter((r) => r.id !== null);
    if (!friendId || !friendName || !cuisine || loveCount === null) return null;
    if (milestoneFriendIds.has(friendId)) return null;
    return {
      kind: "cuisineSpike",
      friendId,
      friendName,
      city: null,
      count: loveCount,
      restaurants,
      cuisine,
      title: `${friendName} loved ${loveCount} ${cuisine} ${loveCount === 1 ? "spot" : "spots"} lately`,
      subtitle: "in the last 2 weeks",
    };
  }).filter((r) => r !== null);

  // Parse friend-by-city — skip friends already covered upstream.
  const claimedFriendIds = new Set([
    ...milestoneFriendIds,
    ...cuisineRecaps.map((r) => r.friendId),
  ]);
  const byCityRecaps = byCityRows.map((values) => {
    const friendId = coerceString(values[0]);
    const friendName = coerceString(values[1]);
    const city = coerceString(values[2]);
    const loveCount = coerceInt(values[3]);
    const rawList = Array.isArray(values[4]) ? values[4] : [];
    const restaurants = rawList.map((r) => ({
      id: coerceInt(r?.id),
      name: coerceString(r?.name),
    })).filter((r) => r.id !== null);
    if (!friendId || !friendName || !city || loveCount === null) return null;
    if (claimedFriendIds.has(friendId)) return null;
    return {
      kind: "friendByCity",
      friendId,
      friendName,
      city,
      count: loveCount,
      restaurants,
      title: `${friendName} loved ${loveCount} places in ${city}`,
      subtitle: "in the last 2 weeks",
    };
  }).filter((r) => r !== null);

  // Parse friend-this-period (fallback — only include friends NOT
  // already represented upstream so we don't duplicate.)
  byCityRecaps.forEach((r) => claimedFriendIds.add(r.friendId));
  const periodRecaps = thisPeriodRows.map((values) => {
    const friendId = coerceString(values[0]);
    const friendName = coerceString(values[1]);
    const loveCount = coerceInt(values[2]);
    const rawList = Array.isArray(values[3]) ? values[3] : [];
    const restaurants = rawList.map((r) => ({
      id: coerceInt(r?.id),
      name: coerceString(r?.name),
    })).filter((r) => r.id !== null);
    const cities = Array.isArray(values[4])
      ? values[4].filter((c) => typeof c === "string")
      : [];
    if (!friendId || !friendName || loveCount === null) return null;
    if (claimedFriendIds.has(friendId)) return null;
    return {
      kind: "friendThisPeriod",
      friendId,
      friendName,
      count: loveCount,
      restaurants,
      cities,
      title: `${friendName} loved ${loveCount} places`,
      subtitle: "in the last 2 weeks",
    };
  }).filter((r) => r !== null);

  // Priority order: milestones (rarest/most eventful), cuisine spikes
  // (taste signal), city concentration, generic period fallback.
  return [
    ...milestoneRecaps,
    ...cuisineRecaps,
    ...byCityRecaps,
    ...periodRecaps,
  ].slice(0, 5);
}

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

  // ── Build 66 perf fix: response caching ──────────────────────────────
  // 2026-05-27: TTL kept at 60s. We tried bumping to 300s but the
  // user actions ("I just loved this — why is it still in my feed?")
  // would feel laggy. Disk IO relief comes from disabling the
  // 15-min Neo4j sync cron instead. iOS-side filtering of own
  // actions handles instant reflection separately.
  // Cache the assembled feed for 60 seconds per (userId, city). Repeat
  // opens within the TTL window return the cached body in <50ms instead
  // of re-running the 17 Neo4j rails + 5 Supabase queries (~8s).
  //
  // Cache API requires GET-style URLs as keys. We build a deterministic
  // synthetic URL — never actually fetched, just used as the cache key.
  // The `?nocache=1` query param lets us bypass for testing.
  const url = new URL(request.url);
  const bypassCache = url.searchParams.get("nocache") === "1";
  const cache = caches.default;
  const cityKey = encodeURIComponent(city || "_all_");
  const cacheKey = new Request(
    `https://cooked-proxy.cache/api/home-feed?user=${encodeURIComponent(clerkUserId)}&city=${cityKey}`,
    { method: "GET" }
  );
  if (!bypassCache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cacheT = Date.now() - t0;
      console.log(`[home-feed] CACHE HIT for ${clerkUserId} / ${city || "all"} (${cacheT}ms)`);
      const headers = new Headers(cached.headers);
      headers.set("X-Cache", "HIT");
      headers.set("X-Cache-Ms", String(cacheT));
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
  }
  console.log(`[home-feed] cache miss for ${clerkUserId} / ${city || "all"} — running full pipeline`);

  // Build 64 DEBUG: one synchronous diagnostic Supabase call. Surfaces the
  // raw HTTP status + body so we can see exactly why queries are failing.
  // Remove after the root cause is fixed.
  const _debugSupabase = { status: null, bodyLen: null, snippet: null, urlLen: null, hasSupabaseUrl: !!env.SUPABASE_URL, hasServiceKey: !!env.SUPABASE_SERVICE_ROLE_KEY, supabaseUrlPrefix: (env.SUPABASE_URL || "").slice(0, 40), serviceKeyLen: (env.SUPABASE_SERVICE_ROLE_KEY || "").length };
  try {
    const debugUrl = `${env.SUPABASE_URL}/rest/v1/user_data?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=clerk_user_id&limit=1`;
    _debugSupabase.urlLen = debugUrl.length;
    const debugRes = await fetch(debugUrl, { headers: supabaseHeaders(env) });
    _debugSupabase.status = debugRes.status;
    const debugBody = await debugRes.text();
    _debugSupabase.bodyLen = debugBody.length;
    _debugSupabase.snippet = debugBody.slice(0, 300);
  } catch (err) {
    _debugSupabase.status = -1;
    _debugSupabase.snippet = "EXCEPTION: " + String(err?.message || err);
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
  // Phase C: fetch recap moments in parallel with friend signals.
  // Two patterns: friend-by-city (richer) and friend-this-period (fallback).
  const [friendsLowRatedMap, friendFoundMap, recapMoments] = await Promise.all([
    fetchFriendsLowRatedForFeed(env, friendIds),
    fetchFriendFoundForFeed(env, friendIds),
    fetchRecapMoments(neoBasic, clerkUserId),
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

  // 12. Response — DETAILED diagnostics for debugging which query is failing
  const railsThatReturned = {};
  for (const [name, results] of Object.entries(railResults)) {
    if (results.length > 0) railsThatReturned[name] = results.length;
  }
  const responseBody = {
    cards: capped.map((c) => ({
      restaurant: c.restaurant,
      photoUrl: c.photoUrl,
      flameScore: c.flameScore,
      badge: c.badge,
      score: c.score,
      breakdown: c.breakdown,
    })),
    // Phase C: digest cards iOS will interleave into the feed.
    // Empty array on slow networks / missing data / no patterns found.
    recapMoments,
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
      // Build 64 debugging — pinpoint which query is returning empty
      userDataLoaded: userData !== null,
      userDataLovedArrayLen: Array.isArray(userData?.loved) ? userData.loved.length : -1,
      userDataWatchlistArrayLen: Array.isArray(userData?.watchlist) ? userData.watchlist.length : -1,
      followedCitiesCount: followedCities.length,
      myLowRatedCount: myLowRated.length,
      friendsLowRatedSize: friendsLowRatedMap.size,
      friendFoundSize: friendFoundMap.size,
      engagementSize: engagement.size,
      restaurantsHydratedCount: restaurants.length,
      flameScoresLoadedCount: flameScores.size,
      photosLoadedCount: photoMap.size,
      railsThatReturned,
      sampleCandidateIds: [...candidateIds].slice(0, 5),
      clerkUserIdResolved: clerkUserId,
      recapMomentsCount: recapMoments.length,
      _debugSupabase,
    },
  };

  // Build 66 perf: store the response in the Cache API for 60s so the
  // next call with the same (userId, city) returns instantly. Cache
  // requires Cache-Control header to honor the TTL.
  const response = jsonResponse(responseBody);
  const cacheable = new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=60",
      "X-Cache": "MISS",
      "X-Cache-Ms": String(Date.now() - t0),
    },
  });
  // Use waitUntil so the cache write doesn't block the response.
  // Falls back to a direct await if ctx isn't available (we don't
  // always have it in this scope — see the route handler).
  try {
    await cache.put(cacheKey, cacheable.clone());
  } catch (err) {
    console.log("[home-feed] cache.put err:", err?.message || err);
  }
  return cacheable;
}

// ────────────────────────────────────────────────────────────────────────
// /admin/cleanup-orphan-photos — delete files in Supabase Storage that
// aren't referenced by any database table. One-time use; safe to re-run.
// ────────────────────────────────────────────────────────────────────────
//
// USAGE
//   Dry run (lists what would be deleted, doesn't actually delete):
//     curl -X POST 'https://.../admin/cleanup-orphan-photos?dryRun=1'
//   Real run:
//     curl -X POST 'https://.../admin/cleanup-orphan-photos'
//
// SAFETY
//   - Only deletes files in restaurant-photos and avatars buckets
//   - A file is "orphan" iff NO table row references its path
//   - Idempotent — second run finds 0 new orphans
//   - dryRun=1 returns the count + first 10 sample paths without deleting
//   - Hits Supabase service_role API so RLS doesn't matter
//
// AUDIT QUERIES (already run)
//   restaurant-photos: 4,969 orphans / 17,818 total (~1.7 GB freed)
//   avatars:           26 orphans / 38 total (~67 MB freed)

async function fetchOrphanPaths(env, bucket) {
  // PostgREST caps RPC responses at 1000 rows project-wide; Range header
  // doesn't override it for SECURITY DEFINER functions. So we paginate
  // via p_offset / p_limit args to the SQL function instead. Loops until
  // a page returns fewer than `pageSize` rows.
  const pageSize = 1000;
  const maxPages = 20; // safety: 20 × 1000 = 20k orphans max per bucket
  const orphans = [];
  let orphanSize = 0;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/list_storage_orphans`,
      {
        method: "POST",
        headers: { ...supabaseHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({
          p_bucket: bucket,
          p_offset: offset,
          p_limit: pageSize,
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`list_storage_orphans ${bucket} HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const rows = await res.json();
    for (const r of rows) {
      if (r.name) orphans.push(r.name);
      const sz = Number(r.size || 0);
      if (Number.isFinite(sz)) orphanSize += sz;
    }
    console.log(`[cleanup] ${bucket} page ${page}: +${rows.length} (total ${orphans.length})`);
    if (rows.length < pageSize) break;
  }
  console.log(`[cleanup] ${bucket}: ${orphans.length} orphans, ${Math.round(orphanSize / 1024 / 1024)} MB`);
  return { totalFiles: -1, orphans, orphanSize };
}

async function deleteOrphans(env, bucket, paths) {
  // Supabase Storage supports batch delete: POST with body { prefixes: [...] }
  // We chunk in batches of 200 to keep request sizes manageable.
  let deleted = 0;
  const chunkSize = 200;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const res = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/${bucket}`,
      {
        method: "DELETE",
        headers: { ...supabaseHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: chunk }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.log(`[cleanup] delete batch ${i} HTTP ${res.status}: ${text.slice(0, 200)}`);
      continue; // skip the failed batch, keep going
    }
    deleted += chunk.length;
  }
  return deleted;
}

async function handleCleanupOrphanPhotos(request, env) {
  const t0 = Date.now();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase env not configured" }, 500);
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const bucketsParam = url.searchParams.get("buckets") || "restaurant-photos,avatars";
  const buckets = bucketsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const summary = {};
  for (const bucket of buckets) {
    try {
      const { totalFiles, orphans, orphanSize } = await fetchOrphanPaths(env, bucket);
      summary[bucket] = {
        totalFiles,
        orphansFound: orphans.length,
        orphanSizeMb: Math.round((orphanSize / 1024 / 1024) * 10) / 10,
        deleted: 0,
        sampleOrphans: orphans.slice(0, 10),
      };
      if (!dryRun && orphans.length > 0) {
        summary[bucket].deleted = await deleteOrphans(env, bucket, orphans);
      }
    } catch (err) {
      summary[bucket] = { error: err.message || String(err) };
    }
  }
  return jsonResponse({
    mode: dryRun ? "dry-run" : "real",
    summary,
    elapsedMs: Date.now() - t0,
  });
}

// ────────────────────────────────────────────────────────────────────────
// /admin/migrate-photos-to-cloudflare — move Supabase Storage photos to
// Cloudflare Images one batch at a time. Idempotent: only operates on
// rows whose photo_url still points at Supabase.
// ────────────────────────────────────────────────────────────────────────
//
// FLOW
//   1. Query restaurant_photos rows where photo_url is still a Supabase URL
//   2. For each row, ask Cloudflare Images to fetch the URL (so we don't
//      have to download to the worker — Cloudflare grabs it directly)
//   3. Cloudflare returns variants[]; we store variants[0] (the "public"
//      delivery URL) back into restaurant_photos.photo_url
//   4. Subsequent dry-runs naturally exclude already-migrated rows
//
// USAGE
//   Dry run:  curl -X POST 'https://.../admin/migrate-photos-to-cloudflare?dryRun=1'
//   Real:     curl -X POST 'https://.../admin/migrate-photos-to-cloudflare'
//   Bigger batch: ?limit=100 (default 50, max 200)
//
//   For full migration, loop in shell:
//     while true; do
//       r=$(curl -sX POST '.../admin/migrate-photos-to-cloudflare')
//       echo "$r"
//       remaining=$(echo "$r" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("remaining",0))')
//       [ "$remaining" -le 0 ] && break
//       sleep 2
//     done

async function cfImagesUploadFromUrl(env, sourceUrl, metadata) {
  // Cloudflare's "upload by URL" form endpoint. Cloudflare fetches the
  // source directly so the worker isn't a bandwidth bottleneck.
  const formData = new FormData();
  formData.append("url", sourceUrl);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/images/v1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_TOKEN}`,
      },
      body: formData,
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const errorMsg = data.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`CF Images upload: ${errorMsg}`);
  }
  // data.result.variants is an array of delivery URLs. First one is the
  // default "public" variant which serves the original size. We store
  // that as the new canonical URL; iOS can later request named variants
  // by swapping the last URL segment (/card, /thumb, etc.).
  const variants = data.result?.variants || [];
  if (variants.length === 0) {
    throw new Error("CF Images: response missing variants");
  }
  return {
    cloudflareImageId: data.result.id,
    publicUrl: variants[0],
  };
}

async function updateRestaurantPhotoUrl(env, oldPhotoUrl, newUrl) {
  // restaurant_photos has no id column — photo_url IS the unique key.
  // We have to URL-encode the old URL to make it a valid query param.
  const encoded = encodeURIComponent(oldPhotoUrl);
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/restaurant_photos?photo_url=eq.${encoded}`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders(env),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ photo_url: newUrl, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB update HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function handleMigratePhotosToCloudflare(request, env) {
  const t0 = Date.now();

  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_IMAGES_TOKEN) {
    return jsonResponse({
      error: "Cloudflare Images credentials not configured (need CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_IMAGES_TOKEN)",
    }, 500);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase env not configured" }, 500);
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const requestedLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.max(1, Math.min(200, isFinite(requestedLimit) ? requestedLimit : 50));
  const concurrency = Math.max(1, Math.min(10,
    parseInt(url.searchParams.get("concurrency") || "5", 10)));

  // Count total un-migrated. restaurant_photos has no id column —
  // we select restaurant_id instead and let PostgREST's count header
  // give us the total via the content-range trick.
  const countRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/restaurant_photos?photo_url=like.*supabase.co/storage*&photo_url=not.like.*imagedelivery.net*&select=restaurant_id`,
    {
      method: "HEAD",
      headers: {
        ...supabaseHeaders(env),
        Prefer: "count=exact",
        Range: "0-0",
        "Range-Unit": "items",
      },
    }
  );
  const contentRange = countRes.headers.get("content-range") || "";
  const total = parseInt(contentRange.split("/")[1] || "-1", 10);

  // Fetch this batch of un-migrated photos
  const fetchRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/restaurant_photos?photo_url=like.*supabase.co/storage*&photo_url=not.like.*imagedelivery.net*&select=photo_url,restaurant_id&limit=${limit}`,
    { headers: supabaseHeaders(env) }
  );
  if (!fetchRes.ok) {
    const txt = await fetchRes.text();
    return jsonResponse({ error: `Query failed: ${fetchRes.status} ${txt.slice(0, 200)}` }, 500);
  }
  const photos = await fetchRes.json();

  if (dryRun) {
    return jsonResponse({
      mode: "dry-run",
      totalRemaining: total,
      thisBatchSize: photos.length,
      sample: photos.slice(0, 5).map((p) => ({
        restaurantId: p.restaurant_id,
        photoUrl: (p.photo_url || "").slice(0, 120),
      })),
      elapsedMs: Date.now() - t0,
    });
  }

  if (photos.length === 0) {
    return jsonResponse({
      mode: "real",
      processed: 0,
      migrated: 0,
      failed: 0,
      remaining: 0,
      message: "Migration complete — no more Supabase-hosted photos.",
      elapsedMs: Date.now() - t0,
    });
  }

  // Migrate the batch with bounded parallelism.
  let migrated = 0;
  let failed = 0;
  const errors = [];

  async function migrateOne(photo) {
    try {
      const { publicUrl } = await cfImagesUploadFromUrl(env, photo.photo_url, {
        sourceTable: "restaurant_photos",
        restaurantId: String(photo.restaurant_id),
      });
      await updateRestaurantPhotoUrl(env, photo.photo_url, publicUrl);
      migrated++;
    } catch (err) {
      failed++;
      if (errors.length < 10) {
        errors.push({
          restaurantId: photo.restaurant_id,
          photoUrl: (photo.photo_url || "").slice(0, 80),
          error: String(err.message || err).slice(0, 200),
        });
      }
    }
  }

  for (let i = 0; i < photos.length; i += concurrency) {
    const chunk = photos.slice(i, i + concurrency);
    await Promise.all(chunk.map(migrateOne));
  }

  return jsonResponse({
    mode: "real",
    processed: photos.length,
    migrated,
    failed,
    remaining: Math.max(0, total - migrated),
    errors,
    elapsedMs: Date.now() - t0,
  });
}

// ── Main handler ──────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Social import — extract places from a TikTok or Instagram URL
    if (request.method === "POST" && path === "/extract-from-social") {
      try { return await handleExtractFromSocial(request, env); }
      catch (err) { console.log("[extract-from-social] error:", err.message); return jsonResponse({ error: err.message || "Internal error" }, 500); }
    }
    // Article import — extract places from a generic article URL
    // (Eater maps, Infatuation guides, NYT lists, food blogs, etc.).
    if (request.method === "POST" && path === "/extract-from-article") {
      try { return await handleExtractFromArticle(request, env); }
      catch (err) { console.log("[extract-from-article] error:", err.message); return jsonResponse({ error: err.message || "Internal error" }, 500); }
    }

    // Research routes
    if (request.method === "POST" && path === "/fetch-url") {
      return handleFetchUrl(request);
    }
    if (request.method === "POST" && path === "/crawl") {
      return handleCrawl(request);
    }

    // Neo4j proxy. Replaces the IPA-embedded Aura credentials path —
    // every iOS Cypher call now hits this route with a Clerk session JWT.
    if (request.method === "POST" && path === "/neo4j/query") {
      try { return await handleNeo4jQuery(request, env); }
      catch (err) { console.log("[neo4j/query] error:", err.message); return jsonResponse({ error: "Internal error" }, 500); }
    }

    // Server-side feed assembly (Build 64+). Collapses 30+ iOS network
    // round-trips per home load into ONE response. iOS sends a Clerk
    // JWT in Authorization; worker runs all 17 Neo4j rails + Supabase
    // queries + scoring + diversity caps server-side and returns the
    // ready feed. Falls back to ?userId=X for curl testing.
    if (request.method === "POST" && path === "/api/home-feed") {
      try { return await handleHomeFeed(request, env); }
      catch (err) { console.log("[home-feed] error:", err.message, err.stack); return jsonResponse({ error: "Internal error", detail: err.message }, 500); }
    }

    // One-time cleanup: delete files in Supabase Storage that aren't
    // referenced by any database row. ?dryRun=1 to preview without
    // deleting. Safe to re-run — idempotent.
    if (request.method === "POST" && path === "/admin/cleanup-orphan-photos") {
      try { return await handleCleanupOrphanPhotos(request, env); }
      catch (err) { console.log("[cleanup] error:", err.message); return jsonResponse({ error: err.message }, 500); }
    }

    // Migrate restaurant_photos from Supabase Storage to Cloudflare
    // Images. Process in batches. Run repeatedly until remaining=0.
    if (request.method === "POST" && path === "/admin/migrate-photos-to-cloudflare") {
      try { return await handleMigratePhotosToCloudflare(request, env); }
      catch (err) { console.log("[migrate] error:", err.message); return jsonResponse({ error: err.message }, 500); }
    }

    // Build 64 DEBUG — minimal Supabase test. ONE query, no parallel
    // fan-out, no Neo4j. If this works fast, the issue with /api/home-feed
    // is parallel concurrency. If this also times out, there's a general
    // Cloudflare → Supabase connectivity issue. Remove once root cause
    // is fixed.
    if (request.method === "GET" && path === "/admin/test-supabase") {
      const t0 = Date.now();
      const out = { hasUrl: !!env.SUPABASE_URL, hasKey: !!env.SUPABASE_SERVICE_ROLE_KEY };
      try {
        const userId = new URL(request.url).searchParams.get("userId") || "user_3B9bXI2JCTGmvdVl6lRtjQ276W3";
        const url = `${env.SUPABASE_URL}/rest/v1/user_data?clerk_user_id=eq.${encodeURIComponent(userId)}&select=clerk_user_id&limit=1`;
        const r = await fetch(url, { headers: supabaseHeaders(env) });
        out.status = r.status;
        out.bodyMs = Date.now() - t0;
        out.snippet = (await r.text()).slice(0, 200);
      } catch (err) {
        out.status = -1;
        out.error = String(err?.message || err);
      }
      out.totalMs = Date.now() - t0;
      return jsonResponse(out);
    }

    // One-shot backfill: import historical user_data.noped/.skipped
    // arrays into Neo4j as PASSED / SKIPPED edges. Run ONCE after
    // Phase 1B deploys. No auth here today — keep the URL secret.
    // POST /admin/backfill-card-events
    if (request.method === "POST" && path === "/admin/backfill-card-events") {
      try {
        const result = await backfillNopedSkippedToNeo4j(env);
        return jsonResponse(result);
      } catch (err) {
        console.log("[backfill] error:", err.message);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // Manual trigger for the event sync. Useful for debugging without
    // waiting for the 15-minute cron. POST /admin/sync-events-now
    if (request.method === "POST" && path === "/admin/sync-events-now") {
      try {
        ctx.waitUntil(syncCardEventsToNeo4j(env));
        return jsonResponse({ status: "queued" });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // One-shot reconcile: bring Neo4j LOVED / WATCHLISTED / FOLLOWS
    // into sync with Supabase by deleting orphan edges (places the
    // user has since unloved / unwatchlisted, friends they unfollowed).
    // Also converts legacy FOLLOWS-to-City edges to FOLLOWS_CITY.
    // POST /admin/reconcile-neo4j-state — run once after deploy.
    if (request.method === "POST" && path === "/admin/reconcile-neo4j-state") {
      try {
        const result = await reconcileNeo4jToSupabase(env);
        return jsonResponse(result);
      } catch (err) {
        console.log("[reconcile] error:", err.message);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // Push notification routes. Errors are logged but NOT returned verbatim —
    // `err.message` can contain PostgREST payloads (column names, hints) that
    // leak schema to unauthenticated callers.
    if (request.method === "POST" && path === "/push/send") {
      try { return await handlePushSend(request, env); }
      catch (err) { console.log("[push/send] error:", err.message); return jsonResponse({ error: "Internal error" }, 500); }
    }
    if (request.method === "POST" && path === "/push/broadcast") {
      try { return await handlePushBroadcast(request, env); }
      catch (err) { console.log("[push/broadcast] error:", err.message); return jsonResponse({ error: "Internal error" }, 500); }
    }
    if (request.method === "POST" && path === "/push/event") {
      try { return await handlePushEvent(request, env); }
      catch (err) { console.log("[push/event] error:", err.message); return jsonResponse({ error: "Internal error" }, 500); }
    }

    // Auto-research routes
    if (request.method === "POST" && path === "/auto-research/run") {
      // Don't await — the crawl can take 5-10 minutes (8 sources × 10
      // pages × 5-10s/Claude call) which is well past any reasonable
      // HTTP request budget. Background it with waitUntil() so the
      // worker stays alive long enough to finish without blocking the
      // client, and return immediately. Mirrors the scheduled() pattern.
      ctx.waitUntil(runAutoResearch(env));
      return jsonResponse({
        success: true,
        started: true,
        message: "Auto-research started in background. Refresh Sources tab in 5-10 min to see updated crawl timestamps."
      });
    }
    if (request.method === "GET" && path === "/auto-research/status") {
      try {
        const sources = await supabaseQuery(env, "GET", "research_sources", {
          query: { "select": "*", "order": "last_crawled.desc.nullsfirst" },
        });
        return jsonResponse({ sources });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // Claude API proxy (existing route)
    if (request.method === "POST" && (path === "/" || path === "")) {
      try {
        const body = await request.json();
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });
        const data = await anthropicRes.text();
        return new Response(data, {
          status: anthropicRes.status,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    return jsonResponse({ error: "Not found", routes: ["/", "/fetch-url", "/crawl", "/auto-research/run", "/auto-research/status", "/push/send", "/push/broadcast", "/push/event"] }, 404);
  },

  // ── Cron triggers ─────────────────────────────────────────
  // Multiple cron schedules dispatched by cron pattern. Add new
  // schedules in the Cloudflare dashboard → Workers → cooked-proxy
  // → Settings → Triggers.
  //
  // Today's triggers:
  //   `0 10 * * *`      — daily 3am PT, auto-research
  //   `*/15 * * * *`    — every 15 minutes, sync card_events → Neo4j
  async scheduled(event, env, ctx) {
    if (event.cron === "*/15 * * * *") {
      ctx.waitUntil(syncCardEventsToNeo4j(env));
    } else {
      // Default / daily research cron
      ctx.waitUntil(runAutoResearch(env));
    }
  },
};
