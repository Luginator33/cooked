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
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  const headers = {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
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
async function runAutoResearch(env) {
  const log = [];
  try {
    // 1. Get active sources from Supabase
    const sources = await supabaseQuery(env, "GET", "research_sources", {
      query: { "active": "eq.true", "select": "*" },
    });

    if (!sources.length) {
      log.push("No active sources configured");
      return { success: true, log };
    }

    log.push(`Found ${sources.length} sources to crawl`);

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

        // Update last_crawled timestamp
        await supabaseQuery(env, "PATCH", `research_sources?id=eq.${source.id}`, {
          body: { last_crawled: new Date().toISOString() },
        });

        log.push(`  Saved ${sourceKnowledge.length} knowledge entries, ${sourcePlaces.length} new places`);

      } catch (err) {
        log.push(`  Error crawling ${source.url}: ${err.message}`);
      }
    }

    log.push(`Done! ${totalKnowledge} knowledge entries, ${totalPlaces} new places total`);
    return { success: true, totalKnowledge, totalPlaces, log };

  } catch (err) {
    log.push(`Fatal error: ${err.message}`);
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
// Endpoints:
//   POST /push/send       — admin → one user
//   POST /push/broadcast  — admin → every user with a token
//
// Auth: body.admin_clerk_user_id must match a user_data row with is_admin=true.

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
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res;
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
  const res = await sbFetch(env,
    `user_push_tokens?select=clerk_user_id,device_token,platform`
  );
  return res.json();
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
  const apsPayload = {
    aps: { alert: { title, body }, sound: "default", badge: 1 },
    ...(payload || {}),
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
  return { status: res.status, response: responseText };
}

async function handlePushSend(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const { admin_clerk_user_id, recipient_clerk_user_id, title, body: msgBody, payload } = body;
  if (!title || !msgBody || !recipient_clerk_user_id) {
    return jsonResponse({ error: "Missing title, body, or recipient_clerk_user_id" }, 400);
  }
  if (!(await verifyAdmin(env, admin_clerk_user_id))) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  const tokens = await tokensForUser(env, recipient_clerk_user_id);
  if (tokens.length === 0) {
    await logSend(env, {
      recipient_id: recipient_clerk_user_id, sender_id: admin_clerk_user_id,
      category: "admin_broadcast", title, body: msgBody, payload: payload || null,
      apns_status: null, apns_response: "No tokens on file",
    });
    return jsonResponse({ sent: 0, note: "recipient has no registered devices" });
  }
  const jwt = await getApnsJwt(env);
  const results = [];
  for (const t of tokens) {
    const r = await sendOne(env, jwt, t.device_token, t.platform, title, msgBody, payload);
    results.push({ token: t.device_token.slice(0, 8) + "…", platform: t.platform, ...r });
    await logSend(env, {
      recipient_id: recipient_clerk_user_id, sender_id: admin_clerk_user_id,
      category: "admin_broadcast", title, body: msgBody, payload: payload || null,
      apns_status: r.status, apns_response: r.response,
    });
  }
  const sent = results.filter(r => r.status === 200).length;
  return jsonResponse({ sent, tried: results.length, results });
}

async function handlePushBroadcast(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const { admin_clerk_user_id, title, body: msgBody, payload } = body;
  if (!title || !msgBody) return jsonResponse({ error: "Missing title or body" }, 400);
  if (!(await verifyAdmin(env, admin_clerk_user_id))) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  const tokens = await allTokens(env);
  if (tokens.length === 0) return jsonResponse({ sent: 0, note: "no registered devices" });
  const jwt = await getApnsJwt(env);
  let sent = 0, failed = 0;
  for (const t of tokens) {
    const r = await sendOne(env, jwt, t.device_token, t.platform, title, msgBody, payload);
    if (r.status === 200) sent++; else failed++;
    await logSend(env, {
      recipient_id: t.clerk_user_id, sender_id: admin_clerk_user_id,
      category: "admin_broadcast", title, body: msgBody, payload: payload || null,
      apns_status: r.status, apns_response: r.response,
    });
  }
  return jsonResponse({ sent, failed, tried: tokens.length });
}

// ── Main handler ──────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Research routes
    if (request.method === "POST" && path === "/fetch-url") {
      return handleFetchUrl(request);
    }
    if (request.method === "POST" && path === "/crawl") {
      return handleCrawl(request);
    }

    // Push notification routes
    if (request.method === "POST" && path === "/push/send") {
      try { return await handlePushSend(request, env); }
      catch (err) { return jsonResponse({ error: err.message }, 500); }
    }
    if (request.method === "POST" && path === "/push/broadcast") {
      try { return await handlePushBroadcast(request, env); }
      catch (err) { return jsonResponse({ error: err.message }, 500); }
    }

    // Auto-research routes
    if (request.method === "POST" && path === "/auto-research/run") {
      const result = await runAutoResearch(env);
      return jsonResponse(result);
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

    return jsonResponse({ error: "Not found", routes: ["/", "/fetch-url", "/crawl", "/auto-research/run", "/auto-research/status", "/push/send", "/push/broadcast"] }, 404);
  },

  // ── Cron trigger (twice a week) ─────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutoResearch(env));
  },
};
