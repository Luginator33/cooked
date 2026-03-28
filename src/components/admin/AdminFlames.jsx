import { useState, useEffect, useRef } from "react";
import { C } from "./adminHelpers";
import { supabase } from "../../lib/supabase";

const VENUE_TYPES = [
  { key: "all", label: "All" },
  { key: "restaurants", label: "Restaurants" },
  { key: "bars", label: "Bars" },
  { key: "coffee", label: "Coffee" },
  { key: "hotels", label: "Hotels" },
];

const CUISINE_OPTIONS = [
  "American", "Italian", "French", "Japanese", "Sushi", "Ramen", "Korean", "Chinese",
  "Mexican", "Seafood", "Steakhouse", "Mediterranean", "Spanish", "Thai", "Vietnamese",
  "Indian", "Pizza", "Peruvian", "Contemporary", "Vegan", "Bakery", "Sandwiches",
];

const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$"];

const BAR_KEYWORDS = ["bar", "cocktail", "wine bar", "lounge", "pub", "speakeasy", "nightclub", "brewery", "dive", "jazz", "karaoke", "hookah", "tiki", "rooftop"];
const COFFEE_KEYWORDS = ["coffee", "cafe", "café", "espresso", "tea house", "matcha", "bakery cafe"];
const HOTEL_KEYWORDS = ["hotel", "resort", "inn", "lodge"];

function matchesVenueType(r, type) {
  if (type === "all") return true;
  const c = (r.cuisine || "").toLowerCase();
  const isBar = r.isBar || BAR_KEYWORDS.some(k => c.includes(k));
  const isCoffee = COFFEE_KEYWORDS.some(k => c.includes(k));
  const isHotel = HOTEL_KEYWORDS.some(k => c.includes(k));
  if (type === "bars") return isBar;
  if (type === "coffee") return isCoffee;
  if (type === "hotels") return isHotel;
  if (type === "restaurants") return !isBar && !isCoffee && !isHotel;
  return true;
}

// Tiny flame SVG for the browse list
function MiniFlame({ size = 10, color = C.terracotta }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 23c-4.97 0-8-3.03-8-7 0-3.5 2.5-6.5 4-8 .5 2.5 2 4 2 4s1.5-3 1-6c3.5 2 5.5 5.5 5.5 8.5 0 1-.5 2-1 2.5 1-1 1.5-2.5 1.5-2.5s1 1.5 1 3c0 3.97-2.53 5.5-6 5.5z"/>
    </svg>
  );
}

function FlameDisplay({ score, size = 10 }) {
  if (!score || score <= 0) return <span style={{ fontSize: 10, color: C.muted }}>—</span>;
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.25;
  return (
    <div style={{ display: "flex", gap: 1, alignItems: "center" }}>
      {Array.from({ length: 5 }, (_, i) => {
        if (i < full) return <MiniFlame key={i} size={size} color={C.terracotta} />;
        if (i === full && hasHalf) return <MiniFlame key={i} size={size} color="#7a3a20" />;
        return <MiniFlame key={i} size={size} color={C.bg3} />;
      })}
      <span style={{ fontSize: 10, color: C.muted, marginLeft: 3 }}>{score}</span>
    </div>
  );
}

const PAGE_SIZE = 30;

export default function AdminFlames({ allRestaurants }) {
  // Mode: "search" or "browse"
  const [mode, setMode] = useState("browse");

  // Search mode state
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [manualScore, setManualScore] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentScores, setCurrentScores] = useState({});

  // Browse mode state
  const [browseCity, setBrowseCity] = useState("");
  const [browseVenue, setBrowseVenue] = useState("all");
  const [browseCuisine, setBrowseCuisine] = useState("");
  const [browsePrice, setBrowsePrice] = useState("");
  const [browseSearch, setBrowseSearch] = useState("");
  const [browsePage, setBrowsePage] = useState(0);
  const [selectedBrowse, setSelectedBrowse] = useState(null); // for inline editing in browse
  const [browseManualScore, setBrowseManualScore] = useState("");
  const [browseSaving, setBrowseSaving] = useState(false);

  // Bulk state
  const [bulkCity, setBulkCity] = useState("");
  const [bulkScore, setBulkScore] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [recomputeStatus, setRecomputeStatus] = useState(null);

  // Batch scores loading
  const [allFlameScores, setAllFlameScores] = useState({});
  const scoresLoadedRef = useRef(false);

  // Load all flame scores once for browse view
  useEffect(() => {
    if (scoresLoadedRef.current) return;
    scoresLoadedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("restaurant_flame_scores")
        .select("restaurant_id, flame_score, interaction_count, community_score, external_score");
      if (data) {
        const map = {};
        data.forEach(d => { map[d.restaurant_id] = d; });
        setAllFlameScores(map);
      }
    })();
  }, []);

  const cities = [...new Set(allRestaurants.map(r => r.city).filter(Boolean))].sort();
  const cuisinesInData = [...new Set(allRestaurants.map(r => r.cuisine).filter(Boolean))].sort();

  // --- Browse filtering ---
  const browseFiltered = allRestaurants.filter(r => {
    if (browseCity && r.city !== browseCity) return false;
    if (!matchesVenueType(r, browseVenue)) return false;
    if (browseCuisine && !(r.cuisine || "").toLowerCase().includes(browseCuisine.toLowerCase())) return false;
    if (browsePrice && r.price !== browsePrice) return false;
    if (browseSearch.trim().length >= 2) {
      const q = browseSearch.toLowerCase();
      if (!(r.name || "").toLowerCase().includes(q) && !String(r.id).includes(browseSearch.trim())) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(browseFiltered.length / PAGE_SIZE);
  const browsePaged = browseFiltered.slice(browsePage * PAGE_SIZE, (browsePage + 1) * PAGE_SIZE);

  const getFlameScore = (r) => {
    const cached = allFlameScores[String(r.id)];
    if (cached && cached.interaction_count >= 3) return cached.flame_score;
    const ext = r.googleRating || (r.rating ? r.rating / 2 : 3);
    return Math.min(3, Math.max(1, Math.round(ext * 2) / 2));
  };

  const getScoreData = (r) => allFlameScores[String(r.id)] || currentScores[String(r.id)] || null;

  // --- Shared actions ---
  const loadScore = async (id) => {
    const { data } = await supabase
      .from("restaurant_flame_scores")
      .select("*")
      .eq("restaurant_id", String(id))
      .single();
    if (data) {
      setCurrentScores(prev => ({ ...prev, [String(id)]: data }));
      setAllFlameScores(prev => ({ ...prev, [String(id)]: data }));
    }
  };

  const saveScore = async (restaurant, score, setLoadingFn) => {
    const s = Math.min(5, Math.max(0.5, parseFloat(score)));
    if (isNaN(s)) return;
    setLoadingFn(true);
    const { error } = await supabase
      .from("restaurant_flame_scores")
      .upsert({
        restaurant_id: String(restaurant.id),
        flame_score: s,
        interaction_count: 999,
        community_score: s,
        external_score: s,
        updated_at: new Date().toISOString(),
      }, { onConflict: "restaurant_id" });
    setLoadingFn(false);
    if (error) {
      setToast("Error: " + error.message);
    } else {
      setToast(`Set ${restaurant.name} to ${s} flames`);
      setAllFlameScores(prev => ({ ...prev, [String(restaurant.id)]: { flame_score: s, interaction_count: 999, community_score: s, external_score: s } }));
      loadScore(restaurant.id);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const selectRestaurant = (r) => {
    setSelected(r);
    setManualScore("");
    loadScore(r.id);
  };

  const selectBrowseRestaurant = (r) => {
    if (selectedBrowse?.id === r.id) {
      setSelectedBrowse(null);
      setBrowseManualScore("");
    } else {
      setSelectedBrowse(r);
      setBrowseManualScore("");
      loadScore(r.id);
    }
  };

  const recomputeAll = async () => {
    setRecomputeStatus("Computing...");
    const { data: interactions } = await supabase
      .from("restaurant_interactions")
      .select("restaurant_id")
      .limit(10000);
    if (!interactions) { setRecomputeStatus("No interactions found"); return; }
    const uniqueIds = [...new Set(interactions.map(i => i.restaurant_id))];
    setRecomputeStatus(`Recomputing ${uniqueIds.length} restaurants...`);
    let done = 0;
    for (const id of uniqueIds) {
      const r = allRestaurants.find(ar => String(ar.id) === id);
      const ext = r?.googleRating || (r?.rating ? r.rating / 2 : 3);
      await supabase.rpc("compute_flame_score", {
        p_restaurant_id: id,
        p_external_rating: ext,
      });
      done++;
      if (done % 50 === 0) setRecomputeStatus(`${done}/${uniqueIds.length}...`);
    }
    setRecomputeStatus(`Done! Recomputed ${uniqueIds.length} restaurants.`);
    scoresLoadedRef.current = false; // reload scores
    setTimeout(() => setRecomputeStatus(null), 5000);
  };

  const bulkSetCity = async () => {
    if (!bulkCity || !bulkScore) return;
    const score = Math.min(5, Math.max(0.5, parseFloat(bulkScore)));
    if (isNaN(score)) return;
    setBulkSaving(true);
    const cityRestaurants = allRestaurants.filter(r => r.city === bulkCity);
    let count = 0;
    for (const r of cityRestaurants) {
      await supabase
        .from("restaurant_flame_scores")
        .upsert({
          restaurant_id: String(r.id),
          flame_score: score,
          interaction_count: 999,
          community_score: score,
          external_score: score,
          updated_at: new Date().toISOString(),
        }, { onConflict: "restaurant_id" });
      count++;
    }
    setBulkSaving(false);
    setToast(`Set ${count} restaurants in ${bulkCity} to ${score} flames`);
    setTimeout(() => setToast(null), 3000);
  };

  const searchResults = search.trim().length >= 2
    ? allRestaurants.filter(r =>
        (r.name || "").toLowerCase().includes(search.toLowerCase()) ||
        String(r.id) === search.trim()
      ).slice(0, 15)
    : [];

  const scoreData = selected ? (getScoreData(selected)) : null;

  // Shared styles
  const pillStyle = (active) => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer",
    border: `1px solid ${active ? C.terracotta : C.border}`,
    background: active ? C.terracotta : "transparent",
    color: active ? "#fff" : C.muted,
    fontFamily: "-apple-system,sans-serif", whiteSpace: "nowrap",
  });

  const selectStyle = {
    padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.bg2, color: C.text, fontSize: 12, outline: "none",
    fontFamily: "-apple-system,sans-serif",
  };

  const sectionLabel = {
    fontSize: 11, color: C.terracotta, fontFamily: "'DM Mono',monospace",
    letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
  };

  return (
    <div>
      {toast && (
        <div style={{ background: C.terracotta, color: "#fff", padding: "10px 16px", borderRadius: 10, marginBottom: 14, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>
          {toast}
        </div>
      )}

      {/* Mode Toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {["browse", "search", "bulk"].map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{
              flex: 1, padding: "9px 0", background: mode === m ? C.terracotta : C.bg2,
              border: "none", color: mode === m ? "#fff" : C.muted, fontSize: 12,
              fontFamily: "-apple-system,sans-serif", cursor: "pointer", fontWeight: mode === m ? 600 : 400,
              textTransform: "capitalize",
            }}>
            {m === "bulk" ? "Bulk / Recompute" : m}
          </button>
        ))}
      </div>

      {/* ==================== BROWSE MODE ==================== */}
      {mode === "browse" && (
        <div>
          {/* Filters Row */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {/* Search within browse */}
            <input
              value={browseSearch}
              onChange={e => { setBrowseSearch(e.target.value); setBrowsePage(0); }}
              placeholder="Filter by name..."
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "-apple-system,sans-serif" }}
            />

            {/* City + Price row */}
            <div style={{ display: "flex", gap: 6 }}>
              <select value={browseCity} onChange={e => { setBrowseCity(e.target.value); setBrowsePage(0); }} style={{ ...selectStyle, flex: 2 }}>
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={browseCuisine} onChange={e => { setBrowseCuisine(e.target.value); setBrowsePage(0); }} style={{ ...selectStyle, flex: 2 }}>
                <option value="">All Cuisines</option>
                {CUISINE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={browsePrice} onChange={e => { setBrowsePrice(e.target.value); setBrowsePage(0); }} style={{ ...selectStyle, flex: 1 }}>
                <option value="">$</option>
                {PRICE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Venue type pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {VENUE_TYPES.map(v => (
                <button key={v.key} type="button"
                  onClick={() => { setBrowseVenue(v.key); setBrowsePage(0); }}
                  style={pillStyle(browseVenue === v.key)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results count + pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "-apple-system,sans-serif" }}>
              {browseFiltered.length} restaurants
            </span>
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button type="button" onClick={() => setBrowsePage(p => Math.max(0, p - 1))} disabled={browsePage === 0}
                  style={{ background: "none", border: "none", color: browsePage === 0 ? C.bg3 : C.muted, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>‹</button>
                <span style={{ fontSize: 11, color: C.muted }}>{browsePage + 1}/{totalPages}</span>
                <button type="button" onClick={() => setBrowsePage(p => Math.min(totalPages - 1, p + 1))} disabled={browsePage >= totalPages - 1}
                  style={{ background: "none", border: "none", color: browsePage >= totalPages - 1 ? C.bg3 : C.muted, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>›</button>
              </div>
            )}
          </div>

          {/* Restaurant Grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {browsePaged.map(r => {
              const fs = getFlameScore(r);
              const sd = getScoreData(r);
              const isSelected = selectedBrowse?.id === r.id;
              return (
                <div key={r.id}>
                  <button type="button" onClick={() => selectBrowseRestaurant(r)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", background: isSelected ? C.bg3 : C.bg2,
                      border: `1px solid ${isSelected ? C.terracotta : C.border}`,
                      borderRadius: isSelected ? "10px 10px 0 0" : 10,
                      cursor: "pointer", textAlign: "left",
                    }}>
                    {/* Photo */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                      background: C.bg3,
                    }}>
                      <img src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { e.target.style.display = "none"; }} />
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold",
                        fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: "-apple-system,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.city}{r.cuisine ? ` · ${r.cuisine}` : ""}{r.price ? ` · ${r.price}` : ""}
                      </div>
                    </div>

                    {/* Flame score */}
                    <div style={{ flexShrink: 0 }}>
                      <FlameDisplay score={fs} size={9} />
                    </div>
                  </button>

                  {/* Expanded edit panel */}
                  {isSelected && (
                    <div style={{
                      background: C.bg3, border: `1px solid ${C.terracotta}`, borderTop: "none",
                      borderRadius: "0 0 10px 10px", padding: 12,
                    }}>
                      {/* Score details */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        {[
                          { label: "Flame", val: sd ? sd.flame_score : "—", color: C.terracotta },
                          { label: "Interactions", val: sd ? sd.interaction_count : "—", color: C.text },
                          { label: "Community", val: sd ? Number(sd.community_score).toFixed(1) : "—", color: C.text },
                          { label: "External", val: sd ? Number(sd.external_score).toFixed(1) : "—", color: C.text },
                        ].map(item => (
                          <div key={item.label} style={{ background: C.bg, borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                            <div style={{ fontSize: 14, color: item.color, fontWeight: "bold" }}>{item.val}</div>
                          </div>
                        ))}
                      </div>
                      {/* Set score */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          value={browseManualScore}
                          onChange={e => setBrowseManualScore(e.target.value)}
                          placeholder="1-5"
                          type="number" min="0.5" max="5" step="0.5"
                          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none" }}
                        />
                        <button type="button"
                          onClick={() => saveScore(selectedBrowse, browseManualScore, setBrowseSaving)}
                          disabled={browseSaving || !browseManualScore}
                          style={{
                            padding: "8px 16px", borderRadius: 8, background: C.terracotta, border: "none",
                            color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            opacity: browseSaving || !browseManualScore ? 0.5 : 1,
                          }}>
                          {browseSaving ? "..." : "Set"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {browsePaged.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 12, fontFamily: "-apple-system,sans-serif" }}>
                No restaurants match filters
              </div>
            )}
          </div>

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 4, alignItems: "center", marginTop: 12 }}>
              <button type="button" onClick={() => setBrowsePage(p => Math.max(0, p - 1))} disabled={browsePage === 0}
                style={{ background: "none", border: "none", color: browsePage === 0 ? C.bg3 : C.muted, cursor: "pointer", fontSize: 14, padding: "4px 8px" }}>‹ Prev</button>
              <span style={{ fontSize: 11, color: C.muted }}>{browsePage + 1} / {totalPages}</span>
              <button type="button" onClick={() => setBrowsePage(p => Math.min(totalPages - 1, p + 1))} disabled={browsePage >= totalPages - 1}
                style={{ background: "none", border: "none", color: browsePage >= totalPages - 1 ? C.bg3 : C.muted, cursor: "pointer", fontSize: 14, padding: "4px 8px" }}>Next ›</button>
            </div>
          )}
        </div>
      )}

      {/* ==================== SEARCH MODE ==================== */}
      {mode === "search" && (
        <div>
          <div style={sectionLabel}>Search & Set Flame Score</div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null); }}
            placeholder="Search restaurant name or ID..."
            style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 14, fontFamily: "-apple-system,sans-serif", outline: "none", boxSizing: "border-box" }}
          />
          {searchResults.length > 0 && !selected && (
            <div style={{ marginTop: 6, maxHeight: 300, overflowY: "auto", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2 }}>
              {searchResults.map(r => (
                <button key={r.id} type="button" onClick={() => selectRestaurant(r)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: "-apple-system,sans-serif", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: C.bg3 }}>
                    <img src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { e.target.style.display = "none"; }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>{r.name}</strong>
                    <div style={{ fontSize: 10, color: C.muted }}>{r.city} · {r.cuisine} · ID: {r.id}</div>
                  </div>
                  <FlameDisplay score={getFlameScore(r)} size={9} />
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 12, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.bg3 }}>
                  <img src={selected.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={e => { e.target.style.display = "none"; }} />
                </div>
                <div>
                  <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 18, color: C.text, marginBottom: 2 }}>
                    {selected.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "-apple-system,sans-serif" }}>
                    {selected.city} · {selected.cuisine} · {selected.price || "—"} · ID: {selected.id}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <FlameDisplay score={getFlameScore(selected)} size={11} />
                  </div>
                </div>
              </div>

              {/* Current score info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div style={{ background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Current Flame</div>
                  <div style={{ fontSize: 20, color: C.terracotta, fontWeight: "bold" }}>{scoreData ? scoreData.flame_score : "—"}</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Interactions</div>
                  <div style={{ fontSize: 20, color: C.text, fontWeight: "bold" }}>{scoreData ? scoreData.interaction_count : "—"}</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Community</div>
                  <div style={{ fontSize: 14, color: C.text }}>{scoreData ? Number(scoreData.community_score).toFixed(1) : "—"}</div>
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>External</div>
                  <div style={{ fontSize: 14, color: C.text }}>{scoreData ? Number(scoreData.external_score).toFixed(1) : "—"}</div>
                </div>
              </div>

              {/* Set score */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={manualScore}
                  onChange={e => setManualScore(e.target.value)}
                  placeholder="1-5 (e.g. 4.5)"
                  type="number" min="0.5" max="5" step="0.5"
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 14, outline: "none" }}
                />
                <button type="button" onClick={() => saveScore(selected, manualScore, setSaving)} disabled={saving || !manualScore}
                  style={{ padding: "10px 20px", borderRadius: 10, background: C.terracotta, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving || !manualScore ? 0.5 : 1 }}>
                  {saving ? "..." : "Set"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== BULK MODE ==================== */}
      {mode === "bulk" && (
        <div>
          {/* Bulk Set by City */}
          <div style={{ marginBottom: 24 }}>
            <div style={sectionLabel}>Bulk Set by City</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={bulkCity} onChange={e => setBulkCity(e.target.value)}
                style={{ ...selectStyle, flex: 2 }}>
                <option value="">Select city...</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                value={bulkScore}
                onChange={e => setBulkScore(e.target.value)}
                placeholder="Score"
                type="number" min="0.5" max="5" step="0.5"
                style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 13, outline: "none" }}
              />
              <button type="button" onClick={bulkSetCity} disabled={bulkSaving}
                style={{ padding: "8px 16px", borderRadius: 8, background: C.terracotta, border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: bulkSaving ? 0.5 : 1 }}>
                {bulkSaving ? "..." : "Set All"}
              </button>
            </div>
            {bulkCity && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontFamily: "-apple-system,sans-serif" }}>
                {allRestaurants.filter(r => r.city === bulkCity).length} restaurants in {bulkCity}
              </div>
            )}
          </div>

          {/* Recompute All */}
          <div>
            <div style={sectionLabel}>Recompute Scores</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button type="button" onClick={recomputeAll}
                style={{ padding: "10px 20px", borderRadius: 10, background: C.bg2, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif" }}>
                Recompute All Flame Scores
              </button>
              {recomputeStatus && (
                <span style={{ fontSize: 12, color: C.muted, fontFamily: "-apple-system,sans-serif" }}>{recomputeStatus}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontFamily: "-apple-system,sans-serif" }}>
              Recalculates scores from all interactions using the formula. Manual overrides will be replaced.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
