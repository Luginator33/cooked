/**
 * Cooked Research Worker — Cloudflare Worker
 *
 * Endpoints:
 *   POST /fetch-url    — Fetch a single URL, return extracted text
 *   POST /crawl        — Fetch a page, find article links, fetch those too
 *
 * Deploy: Add these routes to your existing cooked-proxy worker,
 *         or deploy as a separate worker.
 *
 * Usage from the app:
 *   fetch("https://your-worker.workers.dev/fetch-url", {
 *     method: "POST",
 *     body: JSON.stringify({ url: "https://eater.com/..." })
 *   })
 */

// ── CORS headers ──────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── HTML text extraction ──────────────────────────────────
function extractText(html) {
  // Remove script/style/nav/header/footer tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ── Extract links from HTML ───────────────────────────────
function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  // Match href attributes
  const regex = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let url = match[1];
    // Strip UTM params
    try {
      const u = new URL(url);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(p => u.searchParams.delete(p));
      url = u.toString();
    } catch { continue; }
    // Skip if already seen, or if it's a social/login/image link
    if (seen.has(url)) continue;
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|mp4|mp3)(\?|$)/i.test(url)) continue;
    if (/(facebook|twitter|tiktok|youtube|login|signup|privacy|terms|about\/)/i.test(url)) continue;
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

// ── Route: /fetch-url ─────────────────────────────────────
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

// ── Route: /crawl ─────────────────────────────────────────
async function handleCrawl(request) {
  try {
    const { url, max_pages = 10 } = await request.json();
    if (!url) return jsonResponse({ error: "url required" }, 400);

    // Fetch the main page
    const mainPage = await fetchUrl(url);
    const links = extractLinks(mainPage.html, url);

    // Filter to likely article/content links (skip homepages, categories)
    const articleLinks = links.filter(l => {
      // Keep links that look like articles (have slug-like paths)
      const path = new URL(l).pathname;
      return path.split("/").filter(Boolean).length >= 2 && path.length > 15;
    }).slice(0, max_pages);

    // Fetch each article link in parallel (with timeout)
    const pages = await Promise.allSettled(
      articleLinks.map(async (link) => {
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

// ── Main handler ──────────────────────────────────────────
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/fetch-url") {
      return handleFetchUrl(request);
    }
    if (request.method === "POST" && path === "/crawl") {
      return handleCrawl(request);
    }

    return jsonResponse({ error: "Not found", routes: ["/fetch-url", "/crawl"] }, 404);
  },
};
