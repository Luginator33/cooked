import { useState, useRef, useEffect } from "react"
import { getYoudLoveThis, getRisingRestaurants, getHiddenGems, getTrendingInFollowedCities } from "../lib/neo4j"

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
  return `You are the Cooked restaurant concierge — a deeply knowledgeable, opinionated friend who has eaten everywhere. You know chefs, restaurant groups, the stories behind places, who trained where, which spots share a kitchen lineage. You're the friend people text when they land in a new city.

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
- Always mention ONE specific dish to order.
- Only recommend restaurants from the database below. If a restaurant isn't in the database, don't recommend it.
- When you mention a restaurant, include its reservation/website link if available (from the database). Put the URL on its own line. If the restaurant has an OpenTable, Resy, Tock, or SevenRooms link, use that. Do NOT guess or construct URLs — only use URLs from the database.
- When asked to book: "I can't actually make reservations for you (yet 👀)" then provide the link.

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
  cream: "#faf6f0", warm: "#f5ede0", parchment: "#ede4d3",
  espresso: "#1e1208", bark: "#2e1f0e", mocha: "#4a3320",
  caramel: "#8b5e3c", terracotta: "#c4603a", terra2: "#e07a52",
  gold: "#c9973f", sage: "#6b8f71", muted: "#8a7060",
  border: "#ddd0bc", card: "#fff9f2",
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

function normalizeOpenTableUrl(urlOrSlug, restaurantName) {
  const raw = (urlOrSlug || "").trim();
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("http://")) return "https://" + raw.slice(7);
  if (raw.startsWith("opentable.com") || raw.startsWith("www.opentable.com")) return "https://" + raw;
  if (raw.startsWith("/")) return "https://www.opentable.com" + raw;
  if (!raw) return "https://www.opentable.com/s/?term=" + encodeURIComponent(restaurantName || "");
  return "https://www.opentable.com/" + raw.replace(/^\/+/, "");
}

function renderMessageContent(content) {
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
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 14px", borderRadius: 20, background: isOpenTable ? "#DA3743" : "#c4603a", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600, fontFamily: "-apple-system, sans-serif" }}>
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
        {segments.map((seg, j) => j % 2 === 1 ? <em key={j} style={{ fontStyle: "italic", fontWeight: 600, color: "#1e1208" }}>{seg}</em> : seg)}
      </span>
    );
  });
}

function MessageBubble({ message }) {
  const isUser = message.role === "user"
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 4, paddingLeft: isUser ? 60 : 0, paddingRight: isUser ? 0 : 60 }}>
      {!isUser && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 2 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🍽</div>
          <div style={{ background: "#e5e5ea", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", maxWidth: "100%" }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: "#000", fontFamily: "-apple-system, sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{renderMessageContent(renderText(message.content))}</span>
            </p>
          </div>
        </div>
      )}
      {isUser && (
        <div style={{ background: "#007aff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", maxWidth: "100%" }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: "#fff", fontFamily: "-apple-system, sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content}</p>
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
  userId, lovedRestaurants, watchlist, followedCities, tasteProfile,
}) {
  const [messages, setMessages] = useState(initialMessages?.length > 0 ? initialMessages : [INITIAL_ASSISTANT_MESSAGE])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const conversationIdRef = useRef(null)
  const neo4jCacheRef = useRef(null) // cache Neo4j data for session
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
      // Detect city from conversation
      const allText = newMessages.map(m => m.content).join(" ");
      const detectedCity = detectCity(allText, allRestaurants, followedCities);

      // Build dynamic KB from live restaurant data
      const dynamicKB = buildDynamicKB(allRestaurants, detectedCity);

      // Build user context
      const userContext = buildUserContext(lovedRestaurants, watchlist, followedCities, tasteProfile, allRestaurants);

      // Build Neo4j context
      const neo4j = neo4jCacheRef.current || {};
      const neo4jContext = buildNeo4jContext(neo4j.recommendations, neo4j.trending, neo4j.rising, neo4j.hiddenGems);

      // Build full system prompt
      const systemPrompt = buildSystemPrompt(dynamicKB, userContext, neo4jContext);

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
      <div id="home-chat-card" style={{ background: "#1a1208", border: "1px solid #2e1f0e", borderRadius: 16, padding: 16, margin: "0 16px", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 160px)", overflow: "hidden" }}>
        {!showIdleState && messages.length >= 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button type="button" onClick={() => { clearConversation(); conversationIdRef.current = null; }} style={{ background: "none", border: "none", color: "#5a3a20", fontSize: 12, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", padding: "4px 8px" }}>× Clear</button>
          </div>
        )}
        {showIdleState && (
          <>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 700, fontStyle: "italic", color: "#f0ebe2", marginBottom: 4 }}>Where are you eating tonight?</div>
            <div style={{ fontSize: 12, color: "#5a3a20", marginBottom: 10 }}>A vibe, a craving, a neighborhood.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {chipQuestions.map(text => (
                <button key={text} type="button" onClick={() => sendMessage(text)} style={{ background: "#2e1f0e", color: "#f0ebe2", borderRadius: 20, padding: "6px 14px", fontSize: 13, border: "none", cursor: "pointer", fontFamily: "-apple-system,sans-serif", whiteSpace: "nowrap" }}>{text}</button>
              ))}
            </div>
          </>
        )}
        {!showIdleState && messages.length >= 1 && (
          <div ref={messagesContainerRef} style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", borderRadius: 12, padding: "8px 12px", background: msg.role === "user" ? "#c4603a" : "#2e1f0e", color: msg.role === "user" ? "#fff" : "#f0ebe2", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "-apple-system, sans-serif" }}>
                  {msg.role === "user" ? msg.content : <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{renderMessageContent(renderText(msg.content))}</span>}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 4 }}>
                <div style={{ background: "#2e1f0e", borderRadius: "12px 12px 12px 2px", padding: "10px 16px", display: "flex", alignItems: "center", gap: 5, maxWidth: 80 }}>
                  {[0,1,2].map(i => (<div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4603a", opacity: 0.7, animation: "chatDot 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder="Ask anything..." style={{ flex: 1, borderRadius: 999, border: "1px solid #2e1f0e", background: "#0f0c09", padding: "8px 14px", fontSize: 14, color: "#f0ebe2", outline: "none", fontFamily: "'DM Sans',sans-serif" }} />
          <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: input.trim() && !loading ? "#c4603a" : "#2e1f0e", color: "#fff", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>→</button>
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
            <div style={{ fontFamily: "-apple-system, sans-serif", fontWeight: 600, fontSize: 16, color: C.espresso }}>Cooked</div>
            <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: 12, color: C.sage, fontWeight: 500 }}>● Active now</div>
          </div>
          {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 24, lineHeight: 1, padding: 4, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px 8px", display: "flex", flexDirection: "column" }}>
          <div style={{ textAlign: "center", marginBottom: 16, fontFamily: "-apple-system, sans-serif", fontSize: 12, color: C.muted, fontWeight: 500 }}>Today</div>
          {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
          {loading && <TypingIndicator />}
          {showSuggestions && messages.length <= 1 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontFamily: "-apple-system, sans-serif", fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 10, fontWeight: 500 }}>Try asking...</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{ background: C.warm, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "7px 14px", fontSize: 13, color: C.espresso, cursor: "pointer", fontFamily: "-apple-system, sans-serif", whiteSpace: "nowrap" }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "8px 12px 16px", background: C.cream, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#fff", borderRadius: 22, border: `1.5px solid ${C.border}`, padding: "4px 4px 4px 14px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <textarea ref={textareaRef} value={input} onChange={handleTextareaInput} onKeyDown={handleKeyDown} placeholder="Ask anything..." rows={1} style={{ flex: 1, border: "none", outline: "none", resize: "none", fontSize: 15, lineHeight: "1.45", color: C.espresso, background: "transparent", fontFamily: "-apple-system, sans-serif", height: 36, maxHeight: 120, paddingTop: 8, paddingBottom: 8, overflowY: "auto" }} />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: input.trim() && !loading ? "#007aff" : "#c7c7cc", color: "#fff", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 2 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 12V3M7 3L3 7M7 3L11 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: C.muted, margin: "8px 0 0", fontFamily: "-apple-system, sans-serif" }}>
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
