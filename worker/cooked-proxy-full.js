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

    return jsonResponse({ error: "Not found", routes: ["/", "/fetch-url", "/crawl", "/auto-research/run", "/auto-research/status"] }, 404);
  },

  // ── Cron trigger (twice a week) ─────────────────────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutoResearch(env));
  },
};
