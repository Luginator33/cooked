/**
 * Cooked Proxy Worker — Cloudflare Worker
 *
 * Routes:
 *   POST /           — Claude API proxy (existing)
 *   POST /fetch-url  — Fetch a single URL, return extracted text
 *   POST /crawl      — Fetch a page, follow all links, fetch those too
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
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
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
  try {
    identifiedPlaces = await identifyPlacesFromSignals(env, {
      ...signals,
      transcript,
      frames,
      imageUrls,
    });
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
      max_tokens: 1500,  // bigger ceiling — a "Top 10" list could need it
      system: "Return ONLY valid JSON. No markdown fences, no preamble.",
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  let text = data.content?.[0]?.text || "[]";
  // Strip any accidental markdown fences
  text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  return res.json();
}

// ── Claude API helper ────────────────────────────────────
async function askClaude(env, text) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
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
/// Persist a one-row summary of an auto-research run to the scrape_log
/// table so the admin can see when the cron last ran AND what it did
/// (or didn't do). Best-effort — if the write fails we swallow the
/// error so it doesn't mask the actual run result.
async function writeScrapeLog(env, { startedAt, success, log, knowledge, places, error }) {
  try {
    await supabaseQuery(env, "POST", "scrape_log", {
      body: {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        success,
        knowledge_count: knowledge ?? 0,
        places_count: places ?? 0,
        error: error || null,
        log: (log || []).join("\n"),
      },
    });
  } catch (e) {
    console.log(`[scrape_log] write failed (non-fatal): ${e.message}`);
  }
}

async function runAutoResearch(env) {
  const log = [];
  const startedAt = new Date().toISOString();
  // 2026-05-15 rewrite: process at most this many sources per cron
  // run, and always pick the ones with the OLDEST (or null) last_crawled
  // so we cycle fairly across all 37 sources. Previously the cron
  // iterated every active source in arbitrary order and hit Cloudflare's
  // CPU limit partway through, leaving most sources never crawled and
  // every run looking like it succeeded.
  const MAX_SOURCES_PER_RUN = 3;
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
      await writeScrapeLog(env, { startedAt, success: true, log, knowledge: 0, places: 0 });
      return { success: true, log };
    }

    log.push(`Picked ${sources.length} sources (oldest last_crawled first)`);

    let totalKnowledge = 0;
    let totalPlaces = 0;

    for (const source of sources) {
      try {
        log.push(`Crawling: ${source.url}`);

        // Crawl the source
        const mainPage = await fetchUrl(source.url);
        const links = extractLinks(mainPage.html);

        const maxPages = source.max_pages || 10;
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

        // Only bump last_crawled when something was actually written.
        // Otherwise a zero-result run would silently "succeed" and the
        // source would get pushed to the back of the queue, even though
        // it really should be retried on the next cron tick. (2026-05-15.)
        if (sourceKnowledge.length > 0 || sourcePlaces.length > 0) {
          await supabaseQuery(env, "PATCH", `research_sources?id=eq.${source.id}`, {
            body: { last_crawled: new Date().toISOString() },
          });
          log.push(`  Saved ${sourceKnowledge.length} knowledge entries, ${sourcePlaces.length} new places (last_crawled updated)`);
        } else {
          log.push(`  Zero results — leaving last_crawled untouched so this source retries next run`);
        }

      } catch (err) {
        log.push(`  Error crawling ${source.url}: ${err.message}`);
      }
    }

    log.push(`Done! ${totalKnowledge} knowledge entries, ${totalPlaces} new places total`);
    await writeScrapeLog(env, {
      startedAt,
      success: true,
      log,
      knowledge: totalKnowledge,
      places: totalPlaces,
    });
    return { success: true, totalKnowledge, totalPlaces, log };

  } catch (err) {
    log.push(`Fatal error: ${err.message}`);
    await writeScrapeLog(env, { startedAt, success: false, log, knowledge: 0, places: 0, error: err.message });
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

    // Research routes
    if (request.method === "POST" && path === "/fetch-url") {
      return handleFetchUrl(request);
    }
    if (request.method === "POST" && path === "/crawl") {
      return handleCrawl(request);
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

  // ── Cron trigger (twice a week) ─────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutoResearch(env));
  },
};
