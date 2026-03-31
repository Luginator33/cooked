import { useState, useRef, useEffect } from "react"
import { getYoudLoveThis, getRisingRestaurants, getHiddenGems, getTrendingInFollowedCities } from "../lib/neo4j"
import { saveResearch, getResearchEntries, deleteResearch } from "../lib/supabase"

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.code === 22) {
      localStorage.removeItem("cooked_photos");
      localStorage.removeItem("cooked_photos_preview");
      localStorage.removeItem("cooked_photos_lru");
      try { localStorage.setItem(key, value); } catch {}
    }
  }
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────

function buildSystemPrompt(dynamicKB, userContext, neo4jContext) {
  return `You are the Cooked concierge — a deeply knowledgeable, opinionated friend who has eaten everywhere AND knows where to stay. You know chefs, restaurant groups, the stories behind places, who trained where, which spots share a kitchen lineage. You also know hotels — the best boutique spots, the iconic grande dames, which neighborhoods to stay in, what's overrated and what's worth it. You're the friend people text when they land in a new city.

PERSONALITY:
- Warm but not performative. "You're going to love this" not "AMAZING!!!!"
- Opinionated. You have favorites. Steer people toward gems, away from tourist traps.
- Specific. Name the dish. Describe the light. "Get the black cod miso, ask for the patio" not "the food is good."
- Conversational. Short messages, like texting a friend. Never walls of text.
- If someone is vague, ask ONE follow-up — not a list.
- If you're genuinely unsure about a restaurant, say so honestly rather than making something up.

CRITICAL — ORGANIC, VARIED RESPONSES:
Never be formulaic. Never use the same framing twice in a conversation. The user data below is context you FEEL, not text you READ ALOUD.

DO NOT say things like:
- "Based on your taste profile..."
- "Since your friend liked..."
- "According to our data..."
- "Users who share your taste..."
- "I see you've loved..."

INSTEAD, let the knowledge come through naturally. Vary your approach every time:
- Lead with the restaurant: "Bavel. Same chef as Bestia — but Middle Eastern. The lamb neck is unreal."
- Lead with the vibe: "Moody, candlelit, incredible pasta? That's Rezdôra."
- Lead with the connection: "Ori Menashe opened this after Bestia took off — totally different menu, same genius."
- Lead with a dish: "The cacio e pepe at Lilia is the reason people wait 3 hours for a table."
- Lead with social proof: "Three people you follow hit Lucali last month. There's a reason."
- Lead with discovery: "Almost nobody knows about Shunji. 9.4 rating, maybe 2 people on the app have been. It's special."
- Lead with a story: "This place started as a pop-up in a garage. Now it's got a Michelin star."
- Lead with a neighborhood: "Silver Lake tonight? Start at Sqirl, dinner at Kismet, drinks at Bar Flores."

DEEP CONNECTIONS — THE "SAME CHEF" INTELLIGENCE:
When recommending, proactively draw connections between restaurants. Use your food knowledge:
- Same chef/team: "Bavel is Ori Menashe's follow-up to Bestia"
- Same restaurant group: "Carbone, Dirty French, Sadelle's — all Major Food Group"
- Style connections: "If you love the omakase vibe at n/naka, Shunji is the quieter, more personal version"
- Neighborhood progressions: "Doing Silver Lake? Sqirl for brunch, Kismet for dinner, Bar Flores after"
- Lineage: "The chef at Smyth trained under Grant Achatz at Alinea"

HOW TO RECOMMEND:
- When you have enough context, give 2-3 specific picks, each with a one-liner why.
- Talk like a friend: "honestly I think you'd love ___" or "for that vibe it's gotta be ___"
- Always mention ONE specific dish to order when recommending a restaurant.
- For RESTAURANTS: only recommend restaurants from the database below. If a restaurant isn't in the database, don't recommend it.
- When you mention a restaurant, include its reservation/website link if available (from the database). Put the URL on its own line. If the restaurant has an OpenTable, Resy, Tock, or SevenRooms link, use that. Do NOT guess or construct URLs — only use URLs from the database.
- When asked to book: "I can't actually make reservations for you (yet 👀)" then provide the link.
- For HOTELS: you can recommend hotels from your own knowledge — they're not in the database and that's fine. Be just as specific and opinionated as with restaurants. Don't make up URLs for hotels.

DEEP HOTEL KNOWLEDGE:
You know hotels the way a luxury travel editor does. Use all of this when relevant:

Hotel groups & what they mean:
- Aman = ultra-private, serene, architectural, nature-focused. If someone wants peace, this is it.
- Four Seasons = consistent luxury, great pools, reliable service everywhere.
- Edition = Ian Schrager + Marriott. Design-forward, great lobbies, nightlife-adjacent.
- Rosewood = quiet luxury, residential feel. Hong Kong flagship is iconic.
- Firmdale = London/NYC boutique, colorful interiors, Kit Kemp design.
- Nobu Hotels = food-first hotel, built around the restaurant. Malibu, Ibiza, London.
- 1 Hotels = sustainability-forward, earthy, Brooklyn Bridge one is solid.
- Ace Hotel = creative crowd, great coffee shops, Portland/DTLA/Brooklyn.
- Soho House = members club hotels, social scene, rooftop pools.
- Standard = nightlife energy, rooftop scenes, great bars.
- Proper = design-led, Kelly Wearstler interiors, Santa Monica/Austin/DTLA.
- Chateau Marmont = if you know, you know. Old Hollywood, private, no photos.

Hotels with great restaurants:
- The Carlyle (NYC) → Bemelmans Bar, one of the best bars in the world
- Chiltern Firehouse (London) → Nuno Mendes restaurant, impossible to get into
- The Ned (London) → multiple restaurants, rooftop pool, members floors
- Sunset Tower (LA) → Tower Bar, old Hollywood power lunch
- NoMad (NYC/LA/London) → NoMad restaurant, the roast chicken is legendary
- Claridge's (London) → Davies and Brook by Daniel Humm
- The Greenwich Hotel (NYC) → Locanda Verde, Andrew Carmellini
- Baccarat Hotel (NYC) → Bar, incredible for champagne
- Park Hyatt Tokyo → New York Grill (Lost in Translation bar)
- Aman Tokyo → signature restaurant, kaiseki
- The Beaumont (London) → Le Magritte, Colony Grill Room

When someone tells you their hotel, you should:
1. Know the neighborhood it's in and what's walking distance
2. Recommend restaurants and bars within 5-10 min walk from that hotel, pulling from the restaurant database when possible
3. Tell them about the hotel's own restaurant/bar if it's worth going to
4. Suggest a full evening: "You're at The Greenwich? Walk to _Locanda Verde_ downstairs for dinner, then _Altro Paradiso_ is 8 minutes south, and _Attaboy_ for a nightcap is around the corner."
5. If they're in a dead zone for food, be honest: "That part of Midtown is rough for dining. Cab to the West Village."

Neighborhood-hotel mapping (know what's around each area):
- Use your knowledge of major hotel locations in NYC, LA, London, Paris, Tokyo, Miami, Mexico City, etc.
- Cross-reference with the restaurant database — if the user's hotel is near restaurants in the DB, recommend those specifically
- For restaurants NOT in the database, you can mention them casually as part of the neighborhood context but always prioritize DB restaurants

RESPONSE FORMAT:
- Keep messages SHORT (2-5 sentences max per bubble)
- Break multiple recommendations into separate thoughts
- Use natural language: "and also—" or "oh wait, one more—"
- Never use bullet points or numbered lists — conversational prose only
- For restaurant names use _underscores for italics_: _République_ not **République**
- Never use **asterisks** for bold
- Never say "Great question!", "Absolutely!", "Of course!" — just respond
- Never say "Additionally", "Furthermore", "Moreover"
- Never hedge — "go here" not "you might want to consider"
- If you can say it in 3 words, don't use 8

LA NEIGHBORHOOD GEOGRAPHY:
- "Westside" = Venice, Santa Monica, Brentwood, Pacific Palisades, Playa Vista, Marina del Rey, Mar Vista, Culver City
- "Eastside" = Silver Lake, Los Feliz, Echo Park, Highland Park, Atwater Village, Eagle Rock
- "Valley" = Studio City, Sherman Oaks, Encino, Calabasas, Burbank
- "WeHo" = West Hollywood
- "DTLA" = Downtown Los Angeles
- "Mid-City" = Fairfax, La Brea, Mid-Wilshire
- "SGV" = San Gabriel Valley — best Chinese food in LA
- "K-Town" = Koreatown
- "Arts District" = warehouse neighborhood east of DTLA
When someone says "Westside" in LA, only recommend Venice, Santa Monica, Brentwood, Pacific Palisades area — NOT the Valley, NOT Hollywood.

${userContext}

${neo4jContext}

${dynamicKB}`;
}

// ── DYNAMIC KB BUILDER ─────────────────────────────────────────

function buildDynamicKB(restaurants, detectedCity) {
  const cityRestaurants = detectedCity
    ? restaurants.filter(r => r.city?.toLowerCase() === detectedCity.toLowerCase())
    : restaurants.slice(0, 250);

  if (cityRestaurants.length === 0) return "";

  const header = `\n## RESTAURANT DATABASE${detectedCity ? ` — ${detectedCity}` : ""} (${cityRestaurants.length} spots)\n`;
  const entries = cityRestaurants.map(r => {
    const parts = [r.name, r.neighborhood, r.cuisine, r.price, r.rating ? `★${r.rating}` : "", (r.tags || []).slice(0, 4).join(", ")].filter(Boolean).join(" | ");
    const extras = [];
    if (r.website) extras.push(`link: ${r.website}`);
    if (r.phone) extras.push(`phone: ${r.phone}`);
    if (r.hours?.length) extras.push(`hours: ${r.hours[0]}`);
    const desc = r.desc || r.description || "";
    return parts + (extras.length ? `\n  ${extras.join(" | ")}` : "") + (desc ? `\n  ${desc}` : "");
  }).join("\n");

  return header + entries;
}

// ── USER CONTEXT BUILDER ───────────────────────────────────────

function buildUserContext(lovedRestaurants, watchlistIds, followedCities, tasteProfile, allRestaurants) {
  if (!lovedRestaurants?.length && !followedCities?.length) return "";

  let ctx = "\n## ABOUT THIS USER (use naturally, don't read aloud)\n";

  if (lovedRestaurants?.length) {
    const lovedSummary = lovedRestaurants.slice(0, 15).map(r => `${r.name} (${r.cuisine}, ${r.city})`).join(", ");
    ctx += `Places they love: ${lovedSummary}\n`;
  }

  if (tasteProfile?.topCuisines?.length) {
    ctx += `Top cuisines: ${tasteProfile.topCuisines.slice(0, 5).map(c => `${c.name} (${c.count})`).join(", ")}\n`;
  }

  if (tasteProfile?.topCities?.length) {
    ctx += `Most active cities: ${tasteProfile.topCities.slice(0, 4).map(c => c.name).join(", ")}\n`;
  }

  if (watchlistIds?.length && allRestaurants?.length) {
    const watchlistNames = watchlistIds.slice(0, 8).map(id => {
      const r = allRestaurants.find(ar => String(ar.id) === String(id));
      return r?.name;
    }).filter(Boolean);
    if (watchlistNames.length) ctx += `On their watchlist (want to try): ${watchlistNames.join(", ")}\n`;
  }

  if (followedCities?.length) {
    ctx += `Following these cities: ${followedCities.join(", ")}\n`;
  }

  ctx += `\nUse this to personalize — recommend things they haven't loved yet, acknowledge places they know, suggest based on their taste patterns. But do it naturally, like a friend who knows them well.\n`;
  return ctx;
}

// ── NEO4J CONTEXT BUILDER ──────────────────────────────────────

function buildNeo4jContext(recommendations, trending, rising, hiddenGems) {
  const sections = [];

  if (recommendations?.length) {
    sections.push("Restaurants matched to their taste (they haven't tried yet):\n" +
      recommendations.map(r => `- ${r.name} (${r.cuisine}, ${r.city}) — ${r._weight || r.weight} taste matches`).join("\n"));
  }

  if (trending?.length) {
    sections.push("Trending in cities they follow:\n" +
      trending.map(r => `- ${r.name} (${r.city}) — ${r.loveCount || r._recentLoves} recent loves`).join("\n"));
  }

  if (rising?.length) {
    sections.push("Rising right now (most loved in last 30 days):\n" +
      rising.map(r => `- ${r.name} (${r.city}) — ${r.recentLoves || r._recentLoves} loves recently`).join("\n"));
  }

  if (hiddenGems?.length) {
    sections.push("Hidden gems (high rated, few discoveries):\n" +
      hiddenGems.map(r => `- ${r.name} (${r.city}) — rated ${r.rating}, only ${r.loveCount || r._loveCount} people found it`).join("\n"));
  }

  if (sections.length === 0) return "";
  return "\n## PERSONALIZED INTELLIGENCE (weave in naturally, don't list)\n" + sections.join("\n\n") + "\n";
}

// ── CITY DETECTION ─────────────────────────────────────────────

function detectCity(text, allRestaurants, followedCities) {
  const lower = text.toLowerCase();
  const allCities = [...new Set((allRestaurants || []).map(r => r.city).filter(Boolean))];

  // Check followed cities first (highest intent signal)
  if (followedCities?.length) {
    const followedMatch = followedCities.find(c => {
      const re = new RegExp("\\b" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase() + "\\b");
      return re.test(lower);
    });
    if (followedMatch) return followedMatch;
  }

  // Then check all cities with word boundary matching
  const cityMatch = allCities.find(c => {
    if (c.length < 3) return false; // skip very short city names
    const re = new RegExp("\\b" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLowerCase() + "\\b");
    return re.test(lower);
  });

  return cityMatch || null;
}

// ── UI COMPONENTS ──────────────────────────────────────────────

const C = {
  bg:        "#0a0a0f",
  bg2:       "#12121a",
  bg3:       "#1a1a24",
  border:    "rgba(255,255,255,0.04)",
  border2:   "rgba(255,255,255,0.06)",
  text:      "#f5f0eb",
  muted:     "rgba(245,240,235,0.3)",
  dim:       "rgba(245,240,235,0.18)",
  terracotta:"#ff9632",
  terra2:    "#e07850",
  rose:      "#c44060",
  cream:     "#f5f0eb",
  card:      "rgba(255,220,180,0.02)",
}

const SUGGESTIONS = [
  "Date night in LA tonight 🌹",
  "Best ramen in Tokyo?",
  "Rooftop drinks in NYC",
  "I'm in Mexico City for a week",
  "Somewhere special in London",
  "Best tacos in any city",
  "A hidden gem in Paris",
  "Where do locals eat in Seoul?",
]

const SAMPLE_QUESTIONS = [
  "I have a date tonight — impress me",
  "Where would a chef eat on their night off?",
  "I want the best ramen of my life",
  "Something with an incredible wine list",
  "I'm celebrating — where do I feel it?",
  "A hidden gem locals love but tourists don't know",
  "Outside, warm night, great food and drinks",
  "The laziest, best Sunday brunch in the city",
  "I'm in Tokyo for 3 days — don't let me miss anything",
  "Most underrated restaurant right now?",
  "Surprise me with something I've never tasted",
  "Best tasting menu, money is no object",
  "A counter seat where I can watch the chef cook",
  "Great cocktails and food that's actually worth eating",
  "Vegetarian that doesn't feel like a compromise",
  "Best steakhouse — I want the full experience",
  "Birthday dinner for a group of 10",
  "Somewhere with a great story behind it",
  "Best late-night spot after a show",
  "The best tacos I've ever eaten — where?",
  "Feels like a neighborhood secret",
  "One dinner in New York — where do I go?",
  "Moody, candlelit, really intimate",
  "Best sushi right now, no compromises",
  "The most beautiful room with genuinely great food",
  "Somewhere to take someone I'm trying to impress",
  "A cuisine I've never tried — what and where?",
  "Lunch that turns into the whole afternoon",
  "Actually spicy, not pretend spicy",
  "Best rooftop for sunset drinks",
  "Fun Friday night energy but not chaotic",
  "The kind of meal I'll talk about for years",
  "Korean BBQ where the meat quality actually matters",
  "Best omakase that's worth the price",
  "A meal that changes how I think about that cuisine",
  "Perfect burger and a cold beer tonight",
  "Great food, even better people-watching",
]

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 8, paddingLeft: 4 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🍽</div>
      <div style={{ background: "#e5e5ea", borderRadius: "18px 18px 18px 4px", padding: "10px 16px", display: "flex", alignItems: "center", gap: 5, maxWidth: 80 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "bounce 1.2s ease-in-out infinite", animationDelay: `${i*0.15}s` }} />
        ))}
      </div>
    </div>
  )
}

function renderText(text) {
  if (!text) return "";
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/#{1,6}\s/g, "").replace(/`(.*?)`/g, "$1");
}

function normalizeOpenTableUrl(urlOrSlug, restaurantName, city) {
  const raw = (urlOrSlug || "").trim();
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("http://")) return "https://" + raw.slice(7);
  if (raw.startsWith("opentable.com") || raw.startsWith("www.opentable.com")) return "https://" + raw;
  if (raw.startsWith("/")) return "https://www.opentable.com" + raw;
  if (!raw) return "https://www.opentable.com/s/?term=" + encodeURIComponent((restaurantName || "") + (city ? " " + city : "")) + "&covers=2";
  return "https://www.opentable.com/" + raw.replace(/^\/+/, "");
}

function renderMessageContent(content, onRestaurantClick) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      const isOpenTable = part.includes("opentable.com");
      const isResy = part.includes("resy.com");
      const isTock = part.includes("exploretock.com") || part.includes("tock.com");
      const isSevenRooms = part.includes("sevenrooms.com");
      if (isOpenTable || isResy || isTock || isSevenRooms) {
        const href = isOpenTable ? normalizeOpenTableUrl(part) : part;
        const label = isOpenTable ? "Book on OpenTable" : isResy ? "Book on Resy" : isTock ? "Book on Tock" : "Reserve";
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 14px", borderRadius: 20, background: isOpenTable ? "#DA3743" : C.terracotta, color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600, fontFamily: "'Inter', -apple-system, sans-serif" }}>
            🗓 {label}
          </a>
        );
      }
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#007aff", wordBreak: "break-all" }}>{part}</a>;
    }
    const italicRegex = /_([^_]*)_/g;
    const segments = part.split(italicRegex);
    return (
      <span key={i}>
        {segments.map((seg, j) => j % 2 === 1 ? (
          <em
            key={j}
            onClick={() => onRestaurantClick?.(seg)}
            style={{ fontStyle: "italic", fontWeight: 700, color: C.terracotta, cursor: onRestaurantClick ? "pointer" : "default", textDecoration: "none", borderBottom: "1px solid rgba(196,96,58,0.3)" }}
          >{seg}</em>
        ) : seg)}
      </span>
    );
  });
}

function MessageBubble({ message, onRestaurantClick }) {
  const isUser = message.role === "user"
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 4, paddingLeft: isUser ? 60 : 0, paddingRight: isUser ? 0 : 60 }}>
      {!isUser && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 2 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🍽</div>
          <div style={{ background: "#e5e5ea", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", maxWidth: "100%" }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: "#000", fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{renderMessageContent(renderText(message.content), onRestaurantClick)}</span>
            </p>
          </div>
        </div>
      )}
      {isUser && (
        <div style={{ background: "#007aff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", maxWidth: "100%" }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: "#fff", fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content}</p>
        </div>
      )}
    </div>
  )
}

const INITIAL_ASSISTANT_MESSAGE = {
  role: "assistant",
  content: "Hey! I'm your Cooked guide — think of me as a friend who's eaten everywhere.\n\nWhere are you headed, or what are you craving?"
}

// ── MAIN COMPONENT ─────────────────────────────────────────────

export default function ChatBot({
  onClose, allRestaurants = [], initialInput = "", initialMessages, inline = false,
  userId, lovedRestaurants, watchlist, followedCities, tasteProfile, selectedCity,
  onOpenDetail, isAdmin = false,
}) {
  const [messages, setMessages] = useState(initialMessages?.length > 0 ? initialMessages : [INITIAL_ASSISTANT_MESSAGE])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const conversationIdRef = useRef(null)
  const neo4jCacheRef = useRef(null) // cache Neo4j data for session
  const researchCacheRef = useRef(null) // cached research entries
  const [showResearch, setShowResearch] = useState(false)
  const [researchUrl, setResearchUrl] = useState("")
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchStatus, setResearchStatus] = useState(null) // { type: 'success'|'error', msg }
  const [researchEntries, setResearchEntries] = useState([])
  const [chipQuestions] = useState(() => {
    const arr = [...SAMPLE_QUESTIONS]
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr.slice(0, 4)
  })
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const textareaRef = useRef(null)

  const hasUserSentMessage = messages.some(m => m.role === "user")
  const showIdleState = !initialMessages && messages.length === 1 && messages[0].role === "assistant"

  useEffect(() => {
    if (inline && messagesContainerRef.current) messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    else messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, inline])

  useEffect(() => { if (initialInput) setInput(initialInput); }, [initialInput])

  // Prefetch Neo4j data once per session
  useEffect(() => {
    if (!userId || neo4jCacheRef.current) return;
    Promise.all([
      getYoudLoveThis(userId, 6).catch(() => []),
      userId ? getTrendingInFollowedCities(userId, 5).catch(() => []) : Promise.resolve([]),
      getRisingRestaurants(5).catch(() => []),
      getHiddenGems(5).catch(() => []),
    ]).then(([recs, trending, rising, gems]) => {
      // Match back to full restaurant objects
      const matchToFull = (items) => items.map(item => {
        const full = allRestaurants.find(r => String(r.id) === String(item.id));
        return full ? { ...full, ...item } : item;
      });
      neo4jCacheRef.current = {
        recommendations: matchToFull(recs),
        trending: matchToFull(trending),
        rising: matchToFull(rising),
        hiddenGems: matchToFull(gems),
      };
    });
  }, [userId]);

  // Prefetch research entries for system prompt
  useEffect(() => {
    if (researchCacheRef.current) return;
    getResearchEntries(50).then(({ data }) => {
      researchCacheRef.current = data || [];
      setResearchEntries(data || []);
    });
  }, []);

  // Submit research URL/text
  const handleResearchSubmit = async () => {
    const raw = researchUrl.trim();
    if (!raw || researchLoading) return;
    setResearchLoading(true);
    setResearchStatus(null);

    try {
      // Determine if it's a URL or raw text
      const isUrl = /^https?:\/\//i.test(raw);
      let contentToSummarize = raw;

      // If it's a URL, try to fetch the page content through our proxy
      if (isUrl) {
        try {
          const fetchRes = await fetch("https://cooked-proxy.luga-podesta.workers.dev/fetch-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: raw }),
          });
          if (fetchRes.ok) {
            const fetchData = await fetchRes.json();
            contentToSummarize = fetchData.text || fetchData.content || raw;
          }
        } catch {
          // If proxy fetch fails, we'll just send the URL to Claude
        }
      }

      // Send to Claude to extract restaurant/food knowledge
      const res = await fetch("https://cooked-proxy.luga-podesta.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          system: `You are a restaurant knowledge extractor. Given content from a blog, article, Instagram post, or website, extract the key restaurant and food insights into a concise knowledge snippet (3-6 sentences max). Focus on: restaurant names, specific dishes, chef names, vibes, neighborhoods, what makes places special, insider tips. Write in a natural, informative tone — like notes a knowledgeable friend would jot down. If the content isn't about food/restaurants/hotels, say "NOT_RELEVANT" and nothing else.`,
          messages: [{ role: "user", content: contentToSummarize.slice(0, 8000) }],
        }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const summary = data.content?.[0]?.text || "";

      if (summary.includes("NOT_RELEVANT")) {
        setResearchStatus({ type: "error", msg: "Content doesn't seem food-related" });
        setResearchLoading(false);
        return;
      }

      // Save to Supabase
      const { error } = await saveResearch({
        url: isUrl ? raw : null,
        summary,
        source_type: isUrl ? "link" : "text",
        created_by: userId,
      });

      if (error) throw error;

      // Refresh cache
      const { data: updated } = await getResearchEntries(50);
      researchCacheRef.current = updated || [];
      setResearchEntries(updated || []);
      setResearchUrl("");
      setResearchStatus({ type: "success", msg: "Learned!" });
      setTimeout(() => setResearchStatus(null), 2000);
    } catch (err) {
      console.error("Research error:", err);
      setResearchStatus({ type: "error", msg: "Failed to process — try pasting the text directly" });
    } finally {
      setResearchLoading(false);
    }
  };

  const handleDeleteResearch = async (id) => {
    await deleteResearch(id);
    const { data } = await getResearchEntries(50);
    researchCacheRef.current = data || [];
    setResearchEntries(data || []);
  };

  const handleRestaurantClick = (name) => {
    const normalized = name.toLowerCase().trim();
    // Try exact match first
    let match = allRestaurants.find(r => r.name?.toLowerCase().trim() === normalized);
    // Try removing common suffixes/prefixes the chatbot might add
    if (!match) {
      const cleaned = normalized.replace(/^the\s+/i, '').replace(/\s+restaurant$/i, '').replace(/\s+bar$/i, '');
      match = allRestaurants.find(r => {
        const rName = r.name?.toLowerCase().trim();
        return rName === cleaned || rName?.replace(/^the\s+/i, '') === cleaned || rName?.replace(/^the\s+/i, '') === normalized;
      });
    }
    // Try contains match as last resort (for partial names)
    if (!match) {
      match = allRestaurants.find(r => r.name?.toLowerCase().trim().includes(normalized) || normalized.includes(r.name?.toLowerCase().trim()));
    }
    if (match && onOpenDetail) onOpenDetail(match);
  };

  const clearConversation = () => { setMessages([INITIAL_ASSISTANT_MESSAGE]); setInput(""); setShowSuggestions(true); }

  const sendMessage = async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return

    const newMessages = [...messages, { role: "user", content: userText }]
    try {
      const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]")
      const entry = { id: Date.now(), query: userText, timestamp: Date.now(), messages: newMessages }
      hist.push(entry)
      if (hist.length > 20) hist.splice(0, hist.length - 20)
      safeSetItem("cooked_chat_history", JSON.stringify(hist))
      conversationIdRef.current = entry.id
    } catch {}

    setInput("")
    setShowSuggestions(false)
    setMessages(newMessages)
    setLoading(true)
    if (textareaRef.current) textareaRef.current.style.height = "36px"

    try {
      // Detect city from conversation, fall back to selected city in header
      const allText = newMessages.map(m => m.content).join(" ");
      const detectedCity = detectCity(allText, allRestaurants, followedCities) || selectedCity || null;

      // Build dynamic KB from live restaurant data
      const dynamicKB = buildDynamicKB(allRestaurants, detectedCity);

      // Build user context — include selected city
      let userContext = buildUserContext(lovedRestaurants, watchlist, followedCities, tasteProfile, allRestaurants);
      if (selectedCity) {
        userContext += `\nTheir app is currently set to ${selectedCity}. If they don't specify a city, assume they mean ${selectedCity} — but mention it naturally, like "since you're looking at ${selectedCity}..." so they know you're assuming.\n`;
      }

      // Build Neo4j context
      const neo4j = neo4jCacheRef.current || {};
      const neo4jContext = buildNeo4jContext(neo4j.recommendations, neo4j.trending, neo4j.rising, neo4j.hiddenGems);

      // Build research context from stored knowledge
      const research = researchCacheRef.current || [];
      const researchContext = research.length > 0
        ? "\n## CURATED KNOWLEDGE (from articles, blogs, and insider sources — weave in naturally)\n" +
          research.map(r => r.summary).join("\n\n") + "\n"
        : "";

      // Build full system prompt
      const systemPrompt = buildSystemPrompt(dynamicKB, userContext, neo4jContext + researchContext);

      const response = await fetch("https://cooked-proxy.luga-podesta.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json()
      const reply = data.content?.[0]?.text || "Hmm, let me think on that — what city are you in?"

      const updatedMessages = [...newMessages, { role: "assistant", content: reply }]
      setMessages(updatedMessages)
      try {
        const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]")
        const idx = hist.findIndex(e => e.id === conversationIdRef.current)
        if (idx !== -1) { hist[idx].messages = updatedMessages; safeSetItem("cooked_chat_history", JSON.stringify(hist)); }
      } catch {}
    } catch (err) {
      console.error("Chat error:", err);
      const fallbackMessages = [...newMessages, { role: "assistant", content: "One sec — what city are we looking at? I want to make sure I point you somewhere great." }]
      setMessages(fallbackMessages)
      try {
        const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]")
        const idx = hist.findIndex(e => e.id === conversationIdRef.current)
        if (idx !== -1) { hist[idx].messages = fallbackMessages; safeSetItem("cooked_chat_history", JSON.stringify(hist)); }
      } catch {}
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
  const handleTextareaInput = (e) => { setInput(e.target.value); const ta = e.target; ta.style.height = "36px"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; }

  // ── INLINE (Home tab) ────────────────────────────────────────
  if (inline) {
    return (
      <div id="home-chat-card" className="home-chatbot glass-heavy" style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 160px)", overflow: "hidden" }}>
        {!showIdleState && messages.length >= 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 8 }}>
            {isAdmin && (
              <button type="button" onClick={() => setShowResearch(v => !v)} style={{ background: showResearch ? "rgba(255,150,50,0.15)" : "none", border: showResearch ? "1px solid rgba(255,150,50,0.3)" : "none", color: showResearch ? C.terracotta : C.muted, fontSize: 12, fontFamily: "'Inter', -apple-system, sans-serif", cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}>🔬 Research</button>
            )}
            <button type="button" onClick={() => { clearConversation(); conversationIdRef.current = null; }} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, fontFamily: "'Inter', -apple-system, sans-serif", cursor: "pointer", padding: "4px 8px" }}>× Clear</button>
          </div>
        )}

        {/* Admin Research Panel */}
        {isAdmin && showResearch && (
          <div style={{ background: "rgba(255,150,50,0.06)", border: "1px solid rgba(255,150,50,0.15)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.terracotta, marginBottom: 8, fontFamily: "'Inter', -apple-system, sans-serif" }}>Feed the bot</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={researchUrl}
                onChange={e => setResearchUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleResearchSubmit()}
                placeholder="Paste a link or text..."
                style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", outline: "none" }}
              />
              <button
                type="button"
                onClick={handleResearchSubmit}
                disabled={!researchUrl.trim() || researchLoading}
                style={{ background: C.terracotta, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: researchUrl.trim() && !researchLoading ? "pointer" : "default", opacity: !researchUrl.trim() || researchLoading ? 0.5 : 1, fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap" }}
              >
                {researchLoading ? "Learning..." : "Learn"}
              </button>
            </div>
            {researchStatus && (
              <div style={{ marginTop: 6, fontSize: 11, color: researchStatus.type === "success" ? "#4ade80" : "#f87171", fontFamily: "'Inter', -apple-system, sans-serif" }}>
                {researchStatus.msg}
              </div>
            )}
            {researchEntries.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontFamily: "'Inter', -apple-system, sans-serif" }}>{researchEntries.length} sources learned</div>
                {researchEntries.slice(0, 8).map(entry => (
                  <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ flex: 1, fontSize: 11, color: C.text, opacity: 0.7, fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.url ? new URL(entry.url).hostname.replace("www.", "") : "Text"} — {entry.summary?.slice(0, 60)}...
                    </div>
                    <button type="button" onClick={() => handleDeleteResearch(entry.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 10, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {showIdleState && (
          <>
            {isAdmin && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -4 }}>
                <button type="button" onClick={() => setShowResearch(v => !v)} style={{ background: showResearch ? "rgba(255,150,50,0.15)" : "none", border: showResearch ? "1px solid rgba(255,150,50,0.3)" : "none", color: showResearch ? C.terracotta : C.muted, fontSize: 12, fontFamily: "'Inter', -apple-system, sans-serif", cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}>🔬 Research</button>
              </div>
            )}
            {isAdmin && showResearch && (
              <div style={{ background: "rgba(255,150,50,0.06)", border: "1px solid rgba(255,150,50,0.15)", borderRadius: 12, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.terracotta, marginBottom: 8, fontFamily: "'Inter', -apple-system, sans-serif" }}>Feed the bot</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={researchUrl} onChange={e => setResearchUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleResearchSubmit()} placeholder="Paste a link or text..." style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", outline: "none" }} />
                  <button type="button" onClick={handleResearchSubmit} disabled={!researchUrl.trim() || researchLoading} style={{ background: C.terracotta, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: researchUrl.trim() && !researchLoading ? "pointer" : "default", opacity: !researchUrl.trim() || researchLoading ? 0.5 : 1, fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap" }}>{researchLoading ? "Learning..." : "Learn"}</button>
                </div>
                {researchStatus && <div style={{ marginTop: 6, fontSize: 11, color: researchStatus.type === "success" ? "#4ade80" : "#f87171", fontFamily: "'Inter', -apple-system, sans-serif" }}>{researchStatus.msg}</div>}
                {researchEntries.length > 0 && (
                  <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto" }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontFamily: "'Inter', -apple-system, sans-serif" }}>{researchEntries.length} sources learned</div>
                    {researchEntries.slice(0, 8).map(entry => (
                      <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ flex: 1, fontSize: 11, color: C.text, opacity: 0.7, fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.url ? new URL(entry.url).hostname.replace("www.", "") : "Text"} — {entry.summary?.slice(0, 60)}...</div>
                        <button type="button" onClick={() => handleDeleteResearch(entry.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 10, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <h2>Where are you eating tonight?</h2>
            <div className="chat-sub">A vibe, a craving, a neighborhood.</div>
            <div className="home-chips">
              {chipQuestions.map(text => (
                <button key={text} type="button" className="home-chip glass-pill" onClick={() => sendMessage(text)}>{text}</button>
              ))}
            </div>
          </>
        )}
        {!showIdleState && messages.length >= 1 && (
          <div ref={messagesContainerRef} style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div className={msg.role === "user" ? "home-chat-user" : "home-chat-bot"}>
                  {msg.role === "user" ? msg.content : <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{renderMessageContent(renderText(msg.content), handleRestaurantClick)}</span>}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 4 }}>
                <div className="home-chat-bot" style={{ display: "flex", alignItems: "center", gap: 5, maxWidth: 80 }}>
                  {[0,1,2].map(i => (<div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.terracotta, opacity: 0.7, animation: "chatDot 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        <div className="home-chat-input">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder="Ask anything..." />
          <button type="button" className="home-send-btn" onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ opacity: loading ? 0.5 : 1 }}>
            <svg style={{ width:18, height:18, minWidth:18 }} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>
    )
  }

  // ── OVERLAY (full screen) ────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{ width: "100%", maxWidth: 480, height: "92vh", background: C.cream, borderRadius: "24px 24px 0 0", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -8px 40px rgba(0,0,0,0.25)" }}>
        {/* Header */}
        <div style={{ background: C.cream, borderBottom: `1px solid ${C.border}`, padding: "16px 16px 12px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 2px 8px rgba(196,96,58,0.3)" }}>🍽</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", fontWeight: 600, fontSize: 16, color: C.espresso }}>Cooked</div>
            <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12, color: C.sage, fontWeight: 500 }}>● Active now</div>
          </div>
          {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1, padding: 4, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px 8px", display: "flex", flexDirection: "column" }}>
          <div style={{ textAlign: "center", marginBottom: 16, fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12, color: C.muted, fontWeight: 500 }}>Today</div>
          {messages.map((msg, i) => <MessageBubble key={i} message={msg} onRestaurantClick={handleRestaurantClick} />)}
          {loading && <TypingIndicator />}
          {showSuggestions && messages.length <= 1 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 10, fontWeight: 500 }}>Try asking...</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{ background: C.warm, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, color: C.espresso, cursor: "pointer", fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap" }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "8px 12px calc(16px + env(safe-area-inset-bottom, 0px))", background: C.cream, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#fff", borderRadius: 22, border: `1.5px solid ${C.border}`, padding: "4px 4px 4px 14px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <textarea ref={textareaRef} value={input} onChange={handleTextareaInput} onKeyDown={handleKeyDown} placeholder="Ask anything..." rows={1} style={{ flex: 1, border: "none", outline: "none", resize: "none", fontSize: 15, lineHeight: "1.45", color: C.espresso, background: "transparent", fontFamily: "'Inter', -apple-system, sans-serif", height: 36, maxHeight: 120, paddingTop: 8, paddingBottom: 8, overflowY: "auto" }} />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: input.trim() && !loading ? "#007aff" : "#c7c7cc", color: "#fff", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 2 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 12V3M7 3L3 7M7 3L11 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: C.muted, margin: "8px 0 0", fontFamily: "'Inter', -apple-system, sans-serif" }}>
            Cooked knows {allRestaurants.length || 0} restaurants across {[...new Set(allRestaurants.map(r => r.city))].length || 0} cities
          </p>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
        @keyframes chatDot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  )
}
