import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSecondary, btnDanger, btnSmall, btnOutline, sectionHeader, SearchBar, ConfirmDialog, Toast } from "./adminHelpers";
import { upsertAdminOverride, deleteAdminOverride, addCommunityRestaurant, deleteCommunityRestaurant, updateCommunityRestaurant, saveSharedPhoto, logAdminAction, supabase } from "../../lib/supabase";
import { transferLoves, syncRestaurant } from "../../lib/neo4j";
import { normalizeCity } from "../../data/restaurants";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;
const ANTHROPIC_PROXY = "https://cooked-proxy.luga-podesta.workers.dev/";

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
const PAGE_SIZE = 30;

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

// Words to ignore when comparing restaurant names — too generic to indicate a match
const STOP_WORDS = new Set([
  "restaurant", "restaurants", "bar", "bars", "cafe", "coffee", "club", "lounge",
  "grill", "grille", "bistro", "brasserie", "tavern", "pub", "kitchen", "house",
  "dining", "eatery", "food", "foods", "pizzeria", "trattoria", "osteria",
  "steakhouse", "chophouse", "bakery", "deli", "cantina", "taqueria",
  "the", "and", "del", "las", "los", "des",
  "new", "old", "east", "west", "north", "south",
  "hotel", "resort", "inn", "residences", "four", "seasons",
  // City names
  "vail", "aspen", "miami", "chicago", "austin", "dallas", "denver", "detroit",
  "atlanta", "boise", "houston", "nashville", "seattle", "portland",
  "los angeles", "new york", "san francisco", "san diego", "santa barbara",
  "las vegas", "new orleans", "scottsdale", "sacramento", "savannah",
  "malibu", "maui", "napa", "ojai", "ventura",
  "london", "paris", "rome", "berlin", "barcelona", "madrid", "lisbon",
  "amsterdam", "copenhagen", "stockholm", "munich", "vienna", "prague",
  "istanbul", "dubai", "tokyo", "bangkok", "singapore", "hong kong",
  "seoul", "mumbai", "bali", "mexico city", "toronto", "montreal", "vancouver",
]);

function getSignificantWords(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

// Check if a restaurant already exists
// Rules: exact name match, OR nearby + at least one significant shared word
function findDuplicate(allRestaurants, name, lat, lng) {
  if (!name) return null;
  const threshold = 0.0005; // ~50 meters
  const incomingName = name.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
  const incomingSignificant = new Set(getSignificantWords(name));

  for (const r of allRestaurants) {
    if (!r.name) continue;
    const existingName = r.name.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");

    // 1. Exact name match → always duplicate
    if (incomingName === existingName) return r;

    // 2. All significant words from one name found in the other
    //    (e.g. "La Tour" vs "La Tour Restaurant" — ignoring "restaurant")
    const existingSignificant = new Set(getSignificantWords(r.name));
    if (existingSignificant.size > 0 && incomingSignificant.size > 0) {
      const allExistingInIncoming = [...existingSignificant].every(w => incomingSignificant.has(w));
      const allIncomingInExisting = [...incomingSignificant].every(w => existingSignificant.has(w));
      if (allExistingInIncoming || allIncomingInExisting) return r;
    }

    // 3. Nearby + at least one significant shared word
    if (lat && lng && r.lat && r.lng) {
      if (Math.abs(r.lat - lat) < threshold && Math.abs(r.lng - lng) < threshold) {
        const hasSharedWord = [...incomingSignificant].some(w => existingSignificant.has(w));
        if (hasSharedWord) return r;
      }
    }
  }
  return null;
}

export default function AdminRestaurants({ allRestaurants, userId, onRestaurantsChanged }) {
  const [section, setSection] = useState("search");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  // Browse / Search & Edit state
  const [browseMode, setBrowseMode] = useState("browse"); // "browse" | "search"
  const [search, setSearch] = useState("");
  const [browseCity, setBrowseCity] = useState("");
  const [browseVenue, setBrowseVenue] = useState("all");
  const [browseCuisine, setBrowseCuisine] = useState("");
  const [browsePrice, setBrowsePrice] = useState("");
  const [browseSearch, setBrowseSearch] = useState("");
  const [browsePage, setBrowsePage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  // Flame score state
  const [allFlameScores, setAllFlameScores] = useState({});
  const [flameInput, setFlameInput] = useState("");
  const [flameSaving, setFlameSaving] = useState(false);
  const [bulkFlameCity, setBulkFlameCity] = useState("");
  const [bulkFlameScore, setBulkFlameScore] = useState("");
  const [bulkFlameSaving, setBulkFlameSaving] = useState(false);
  const [recomputeStatus, setRecomputeStatus] = useState(null);
  const scoresLoadedRef = useRef(false);

  // Smart Import state
  const [importSearch, setImportSearch] = useState("");
  const [importCity, setImportCity] = useState("");
  const [placesResults, setPlacesResults] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importStage, setImportStage] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importPhotos, setImportPhotos] = useState([]);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);

  // Bulk import
  const [bulkLinks, setBulkLinks] = useState("");
  const [bulkQueue, setBulkQueue] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkCurrentIdx, setBulkCurrentIdx] = useState(-1);

  // Merge
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };
  const isCommunity = (id) => Number(id) >= 100000;

  // Load all flame scores
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

  const cities = useMemo(() => [...new Set(allRestaurants.map(r => r.city).filter(Boolean))].sort(), [allRestaurants]);

  const getFlameScore = (r) => {
    const cached = allFlameScores[String(r.id)];
    if (cached && cached.interaction_count >= 3) return cached.flame_score;
    const ext = r.googleRating || (r.rating ? r.rating / 2 : 3);
    return Math.min(3, Math.max(1, Math.round(ext * 2) / 2));
  };

  const getScoreData = (r) => allFlameScores[String(r.id)] || null;

  const loadScore = async (id) => {
    const { data } = await supabase
      .from("restaurant_flame_scores")
      .select("*")
      .eq("restaurant_id", String(id))
      .single();
    if (data) {
      setAllFlameScores(prev => ({ ...prev, [String(id)]: data }));
    }
  };

  const saveFlameScore = async (restaurant, score) => {
    const s = Math.min(5, Math.max(0.5, parseFloat(score)));
    if (isNaN(s)) return;
    setFlameSaving(true);
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
    setFlameSaving(false);
    if (error) {
      showToast("Error: " + error.message, "error");
    } else {
      showToast(`Set ${restaurant.name} to ${s} flames`);
      setAllFlameScores(prev => ({ ...prev, [String(restaurant.id)]: { flame_score: s, interaction_count: 999, community_score: s, external_score: s } }));
      setFlameInput("");
    }
  };

  // ── BROWSE FILTERING ──
  const browseFiltered = useMemo(() => {
    return allRestaurants.filter(r => {
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
  }, [allRestaurants, browseCity, browseVenue, browseCuisine, browsePrice, browseSearch]);

  const totalPages = Math.ceil(browseFiltered.length / PAGE_SIZE);
  const browsePaged = browseFiltered.slice(browsePage * PAGE_SIZE, (browsePage + 1) * PAGE_SIZE);

  // ── SEARCH (old mode) ──
  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allRestaurants.filter(r => r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || String(r.id) === q).slice(0, 20);
  }, [search, allRestaurants]);

  // ── ACTIONS ──
  const handleRemove = async (r) => {
    if (isCommunity(r.id)) await deleteCommunityRestaurant(r.id);
    else await upsertAdminOverride(r.id, "delete", null, userId);
    await logAdminAction("restaurant_remove", userId, "restaurant", String(r.id), { name: r.name });
    showToast(`Removed ${r.name}`);
    onRestaurantsChanged?.();
    setConfirm(null);
  };

  const startEdit = (r) => {
    setEditing(r);
    setEditForm({
      name: r.name || "", city: r.city || "", cuisine: r.cuisine || "", neighborhood: r.neighborhood || "",
      price: r.price || "", rating: String(r.rating || ""), desc: r.desc || r.description || "",
      tags: (r.tags || []).join(", "), website: r.website || "", lat: String(r.lat || ""), lng: String(r.lng || ""),
      phone: r.phone || "", address: r.address || "",
    });
    setSection("search");
  };

  const saveEdit = async () => {
    const data = { ...editForm, rating: Number(editForm.rating) || 0, lat: Number(editForm.lat) || 0, lng: Number(editForm.lng) || 0, tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean) };
    if (isCommunity(editing.id)) await updateCommunityRestaurant(editing.id, data);
    else await upsertAdminOverride(editing.id, "edit", data, userId);
    await logAdminAction("restaurant_edit", userId, "restaurant", String(editing.id), { name: data.name });
    showToast(`Updated ${data.name}`);
    setEditing(null);
    onRestaurantsChanged?.();
  };

  // ── BULK FLAME OPERATIONS ──
  const bulkSetFlameCity = async () => {
    if (!bulkFlameCity || !bulkFlameScore) return;
    const score = Math.min(5, Math.max(0.5, parseFloat(bulkFlameScore)));
    if (isNaN(score)) return;
    setBulkFlameSaving(true);
    const cityRestaurants = allRestaurants.filter(r => r.city === bulkFlameCity);
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
    setBulkFlameSaving(false);
    showToast(`Set ${count} restaurants in ${bulkFlameCity} to ${score} flames`);
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
    scoresLoadedRef.current = false;
    setTimeout(() => setRecomputeStatus(null), 5000);
  };

  // ── SMART IMPORT ──
  const searchGooglePlaces = async () => {
    if (!importSearch.trim()) return;
    setImportStage("searching");
    setPlacesResults([]);
    try {
      const query = importCity ? `${importSearch} ${importCity}` : importSearch;
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.photos" },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      });
      const data = await res.json();
      setPlacesResults(data.places || []);
      setImportStage("results");
    } catch (e) {
      showToast("Google Places search failed", "error");
      setImportStage(null);
    }
  };

  const selectPlace = async (place) => {
    setImportStage("enriching");
    try {
      const detailRes = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
        headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,websiteUri,location,photos,rating,userRatingCount,priceLevel,addressComponents" },
      });
      const d = await detailRes.json();
      let city = "", neighborhood = "";
      (d.addressComponents || []).forEach(c => {
        if (c.types?.includes("locality")) city = c.longText;
        if (c.types?.includes("neighborhood")) neighborhood = c.longText;
        if (!neighborhood && c.types?.includes("sublocality")) neighborhood = c.longText;
      });
      const priceMap = { PRICE_LEVEL_FREE: "$", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };
      const price = priceMap[d.priceLevel] || "$$";
      const photos = [];
      for (const p of (d.photos || []).slice(0, 8)) {
        try {
          const photoRes = await fetch(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": GOOGLE_KEY } });
          if (photoRes.ok) {
            const photoData = await photoRes.json();
            if (photoData.photoUri) { photos.push(photoData.photoUri); continue; }
          }
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
        } catch {
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
        }
      }
      setImportPhotos(photos);
      const baseName = d.displayName?.text || place.displayName?.text || importSearch;
      let aiData = {};
      try {
        const aiRes = await fetch(ANTHROPIC_PROXY, {
          method: "POST",
          headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1024,
            system: "You are a food critic and restaurant expert. Return ONLY valid JSON, no markdown.",
            messages: [{ role: "user", content: `Tell me about the restaurant "${baseName}" in ${city || "unknown city"}, ${neighborhood || ""}. Return JSON with these fields: cuisine (string), tags (array of 3 tags like "date night", "omakase", "craft cocktails"), about (2-3 sentence description of restaurant history & uniqueness), must_order (array of 3 dish recommendations), vibe (one sentence about atmosphere), best_for (array of 3 occasion types), known_for (one thing it's most famous for), insider_tip (specific actionable local knowledge), desc (one poetic sentence for the card)` }],
          }),
        });
        const aiJson = await aiRes.json();
        let text = aiJson.content?.[0]?.text?.trim() || "{}";
        if (text.includes("```")) text = text.split("```")[1].replace(/^json/, "").trim();
        aiData = JSON.parse(text);
      } catch (e) { console.error("AI enrichment failed:", e); }
      let reservationUrl = d.websiteUri || "";
      try {
        const otRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "places.websiteUri" },
          body: JSON.stringify({ textQuery: `${baseName} opentable ${city}`, maxResultCount: 1 }),
        });
        const otData = await otRes.json();
        const otUrl = otData.places?.[0]?.websiteUri || "";
        if (otUrl.includes("opentable") || otUrl.includes("resy.com") || otUrl.includes("tock.com")) {
          reservationUrl = otUrl;
        }
      } catch {}
      const preview = {
        name: baseName, city: normalizeCity(city || importCity || "") || city || importCity || "",
        neighborhood: neighborhood || "", address: d.formattedAddress || "",
        phone: d.nationalPhoneNumber || d.internationalPhoneNumber || "",
        website: reservationUrl || d.websiteUri || "",
        hours: d.regularOpeningHours?.weekdayDescriptions || [],
        lat: d.location?.latitude || 0, lng: d.location?.longitude || 0,
        rating: d.rating ? Math.min(10, Math.round(d.rating * 2 * 10) / 10) : 8.5,
        googleRating: d.rating || 0, googleReviews: d.userRatingCount || 0, price,
        placeId: place.id, cuisine: aiData.cuisine || "", tags: aiData.tags || [],
        desc: aiData.desc || "", about: aiData.about || "", must_order: aiData.must_order || [],
        vibe: aiData.vibe || "", best_for: aiData.best_for || [], known_for: aiData.known_for || "",
        insider_tip: aiData.insider_tip || "", source: "Admin Import", heat: "🔥🔥",
        img: photos[0] || "", img2: photos[1] || photos[0] || "",
      };
      setImportPreview(preview);
      setImportStage("preview");
    } catch (e) {
      showToast("Failed to fetch place details: " + e.message, "error");
      setImportStage("results");
    }
  };

  const confirmImport = async (skipDupCheck) => {
    if (!skipDupCheck) {
      const dup = findDuplicate(allRestaurants, importPreview?.name, importPreview?.lat, importPreview?.lng);
      if (dup) {
        const ok = window.confirm(`"${dup.name}" (ID ${dup.id}) already exists at this location. Import anyway?`);
        if (!ok) return;
      }
    }
    const photoUrl = importPhotos[selectedPhotoIdx] || importPreview.img;
    const r = {
      name: importPreview.name, city: importPreview.city, neighborhood: importPreview.neighborhood,
      cuisine: importPreview.cuisine, price: importPreview.price, rating: importPreview.rating,
      desc: importPreview.desc || importPreview.about || "", tags: importPreview.tags,
      lat: importPreview.lat, lng: importPreview.lng, address: importPreview.address,
      phone: importPreview.phone, website: importPreview.website,
      img: photoUrl, img2: photoUrl, source: "Admin Import", heat: importPreview.heat || "🔥🔥",
    };
    try {
      const { data, error } = await addCommunityRestaurant(r);
      if (error) { showToast("Save failed: " + (error.message || "unknown error"), "error"); return; }
      const savedId = data?.[0]?.id || r.id;
      if (photoUrl) await saveSharedPhoto(String(savedId), photoUrl);
      await syncRestaurant({ ...r, id: savedId });
      await logAdminAction("restaurant_smart_import", userId, "restaurant", String(savedId), { name: r.name, city: r.city });
      showToast(`Imported ${r.name} (ID: ${savedId})`);
      setImportPreview(null); setImportStage(null); setImportSearch(""); setImportCity("");
      setPlacesResults([]); setImportPhotos([]); setSelectedPhotoIdx(0);
      onRestaurantsChanged?.();
    } catch (e) { showToast("Import failed: " + e.message, "error"); }
  };

  // ── MERGE ──
  const handleMerge = async () => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    await transferLoves(mergeFrom, mergeTo);
    if (isCommunity(mergeFrom)) await deleteCommunityRestaurant(Number(mergeFrom));
    else await upsertAdminOverride(mergeFrom, "merge_into", null, userId);
    await logAdminAction("restaurant_merge", userId, "restaurant", mergeFrom, { merged_into: mergeTo });
    showToast("Restaurants merged");
    setMergeFrom(""); setMergeTo("");
    onRestaurantsChanged?.();
  };

  // ── MISSING DATA ──
  const missingData = useMemo(() => {
    if (section !== "missing") return [];
    return allRestaurants.filter(r => !r.website || !r.lat || !r.lng || !r.desc).slice(0, 50);
  }, [section, allRestaurants]);

  // ── SHARED STYLES ──
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

  // ── UI ──
  const sections = [
    { key: "search", label: "Search & Edit", icon: "🔍" },
    { key: "import", label: "Smart Import", icon: "✦" },
    { key: "bulk", label: "Bulk Import", icon: "📦" },
    { key: "flames", label: "Bulk Flames", icon: "🔥" },
    { key: "merge", label: "Merge", icon: "🔗" },
    { key: "missing", label: "Missing Data", icon: "⚠" },
  ];

  const renderEditForm = () => {
    const fields = [
      { key: "name", label: "Name" }, { key: "city", label: "City" }, { key: "cuisine", label: "Cuisine" },
      { key: "neighborhood", label: "Neighborhood" }, { key: "price", label: "Price ($-$$$$)" },
      { key: "rating", label: "Rating (0-10)", type: "number" }, { key: "website", label: "Website / Reservation URL" },
      { key: "phone", label: "Phone" }, { key: "address", label: "Address" },
      { key: "lat", label: "Latitude", type: "number" }, { key: "lng", label: "Longitude", type: "number" },
      { key: "tags", label: "Tags (comma-separated)" }, { key: "desc", label: "Description", type: "textarea" },
    ];
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>
            Editing: {editing.name}
          </div>
          <button type="button" onClick={() => setEditing(null)} style={{ ...btnSmall, fontSize: 18, border: "none", padding: "4px 8px" }}>×</button>
        </div>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{f.label}</div>
            {f.type === "textarea" ? (
              <textarea value={editForm[f.key] || ""} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
            ) : (
              <input type={f.type || "text"} value={editForm[f.key] || ""} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={() => setEditing(null)} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
          <button type="button" onClick={saveEdit} style={{ ...btnPrimary, flex: 1 }}>Save Changes</button>
        </div>
      </div>
    );
  };

  // Render a restaurant row for browse mode
  const renderBrowseRow = (r) => {
    const fs = getFlameScore(r);
    const sd = getScoreData(r);
    const isExpanded = expandedId === r.id;
    return (
      <div key={r.id}>
        <button type="button" onClick={() => { setExpandedId(isExpanded ? null : r.id); setFlameInput(""); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", background: isExpanded ? C.bg3 : C.bg2,
            border: `1px solid ${isExpanded ? C.terracotta : C.border}`,
            borderRadius: isExpanded ? "10px 10px 0 0" : 10,
            cursor: "pointer", textAlign: "left",
          }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: C.bg3 }}>
            <img src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.name}
            </div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "-apple-system,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.city}{r.cuisine ? ` · ${r.cuisine}` : ""}{r.price ? ` · ${r.price}` : ""}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <FlameDisplay score={fs} size={9} />
          </div>
        </button>

        {isExpanded && (
          <div style={{ background: C.bg3, border: `1px solid ${C.terracotta}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: 12 }}>
            {/* Flame score details */}
            <div style={sectionLabel}>Flame Score</div>
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
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
              <input
                value={flameInput}
                onChange={e => setFlameInput(e.target.value)}
                placeholder="1-5"
                type="number" min="0.5" max="5" step="0.5"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none" }}
              />
              <button type="button"
                onClick={() => saveFlameScore(r, flameInput)}
                disabled={flameSaving || !flameInput}
                style={{ padding: "8px 16px", borderRadius: 8, background: C.terracotta, border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: flameSaving || !flameInput ? 0.5 : 1 }}>
                {flameSaving ? "..." : "Set Flames"}
              </button>
            </div>

            {/* Restaurant info */}
            <div style={sectionLabel}>Restaurant Details</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: "-apple-system,sans-serif", lineHeight: 1.6 }}>
              <div><span style={{ color: C.dim }}>ID:</span> {r.id}</div>
              <div><span style={{ color: C.dim }}>Neighborhood:</span> {r.neighborhood || "—"}</div>
              <div><span style={{ color: C.dim }}>Rating:</span> {r.rating || "—"} · Google: {r.googleRating || "—"}</div>
              <div><span style={{ color: C.dim }}>Website:</span> {r.website ? <span style={{ color: C.terracotta }}>{r.website.slice(0, 40)}...</span> : "—"}</div>
              {r.tags?.length > 0 && <div><span style={{ color: C.dim }}>Tags:</span> {r.tags.join(", ")}</div>}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button type="button" onClick={() => startEdit(r)} style={{ ...btnSmall, flex: 1 }}>Edit Details</button>
              <button type="button" onClick={() => setConfirm({ message: `Remove "${r.name}" from the app?`, onConfirm: () => handleRemove(r), onCancel: () => setConfirm(null) })}
                style={{ ...btnSmall, flex: 1, color: C.red, borderColor: C.red }}>Remove</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {toast && <Toast {...toast} />}
      {confirm && <ConfirmDialog {...confirm} />}

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {sections.map(s => (
          <button key={s.key} type="button" onClick={() => { setSection(s.key); setEditing(null); }} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* ── SEARCH & EDIT ── */}
      {section === "search" && !editing && (
        <div>
          {/* Browse / Search toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
            {[{ key: "browse", label: "Browse" }, { key: "search", label: "Search" }].map(m => (
              <button key={m.key} type="button" onClick={() => setBrowseMode(m.key)}
                style={{
                  flex: 1, padding: "8px 0", background: browseMode === m.key ? C.terracotta : C.bg2,
                  border: "none", color: browseMode === m.key ? "#fff" : C.muted, fontSize: 12,
                  fontFamily: "-apple-system,sans-serif", cursor: "pointer", fontWeight: browseMode === m.key ? 600 : 400,
                }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* BROWSE MODE */}
          {browseMode === "browse" && (
            <>
              {/* Filters */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                <input
                  value={browseSearch}
                  onChange={e => { setBrowseSearch(e.target.value); setBrowsePage(0); }}
                  placeholder="Filter by name..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "-apple-system,sans-serif" }}
                />
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

              {/* Restaurant list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {browsePaged.map(r => renderBrowseRow(r))}
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
            </>
          )}

          {/* SEARCH MODE */}
          {browseMode === "search" && (
            <>
              <SearchBar value={search} onChange={setSearch} placeholder="Search restaurants by name, city, or ID..." />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
                {filtered.map(r => renderBrowseRow(r))}
              </div>
              {search && filtered.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No restaurants found.</div>}
            </>
          )}
        </div>
      )}
      {section === "search" && editing && renderEditForm()}

      {/* ── SMART IMPORT ── */}
      {section === "import" && (
        <>
          {!importStage && (
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 12 }}>
                Add a restaurant
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
                Search Google Places — we'll auto-fill everything.
              </div>
              <input type="text" value={importSearch} onChange={e => setImportSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchGooglePlaces()} placeholder="Restaurant name..." style={{ ...inputStyle, marginBottom: 8 }} />
              <input type="text" value={importCity} onChange={e => setImportCity(e.target.value)} onKeyDown={e => e.key === "Enter" && searchGooglePlaces()} placeholder="City (optional, helps accuracy)..." style={{ ...inputStyle, marginBottom: 12 }} />
              <button type="button" onClick={searchGooglePlaces} style={{ ...btnPrimary, width: "100%" }} disabled={!importSearch.trim()}>
                Search Google Places
              </button>
            </div>
          )}

          {importStage === "searching" && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 14 }}>Searching Google Places...</div>
            </div>
          )}

          {importStage === "results" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>Pick the right one:</div>
                <button type="button" onClick={() => { setImportStage(null); setPlacesResults([]); }} style={{ ...btnSmall, border: "none" }}>← Back</button>
              </div>
              {placesResults.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No results found. Try a different search.</div>}
              {placesResults.map(p => (
                <button
                  key={p.id} type="button" onClick={() => selectPlace(p)}
                  style={{ ...cardStyle, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.border}` }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: C.bg, flexShrink: 0, overflow: "hidden" }}>
                    {p.photos?.[0]?.name && <img src={`https://places.googleapis.com/v1/${p.photos[0].name}/media?maxWidthPx=200&key=${GOOGLE_KEY}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{p.displayName?.text}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.formattedAddress}</div>
                    {p.rating && <div style={{ fontSize: 10, color: C.terracotta, marginTop: 2 }}>★ {p.rating}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {importStage === "enriching" && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
              <div style={{ fontSize: 14 }}>Fetching details, photos & AI enrichment...</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>This takes a few seconds</div>
            </div>
          )}

          {importStage === "preview" && importPreview && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>
                  Preview
                </div>
                <button type="button" onClick={() => { setImportStage("results"); setImportPreview(null); }} style={{ ...btnSmall, border: "none" }}>← Back</button>
              </div>
              {importPhotos.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", height: 180, marginBottom: 8 }}>
                    <img src={importPhotos[selectedPhotoIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                    {importPhotos.map((url, i) => (
                      <img key={i} src={url} alt="" onClick={() => setSelectedPhotoIdx(i)} style={{
                        width: 52, height: 52, borderRadius: 8, objectFit: "cover", cursor: "pointer", flexShrink: 0,
                        border: i === selectedPhotoIdx ? `2px solid ${C.terracotta}` : `2px solid transparent`, opacity: i === selectedPhotoIdx ? 1 : 0.5,
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div style={cardStyle}>
                <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 22, color: C.text }}>{importPreview.name}</div>
                <div style={{ fontSize: 11, color: C.terracotta, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {importPreview.cuisine} · {importPreview.city} · {importPreview.price}
                </div>
                {importPreview.desc && <div style={{ fontSize: 13, color: C.muted, marginTop: 8, fontStyle: "italic", lineHeight: 1.5 }}>{importPreview.desc}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Rating", value: importPreview.rating },
                  { label: "Google", value: `★ ${importPreview.googleRating} (${importPreview.googleReviews})` },
                  { label: "Neighborhood", value: importPreview.neighborhood },
                  { label: "Price", value: importPreview.price },
                ].map(d => (
                  <div key={d.label} style={{ background: C.bg2, borderRadius: 10, padding: "8px 10px", border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{d.label}</div>
                    <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>{d.value || "—"}</div>
                  </div>
                ))}
              </div>
              {importPreview.about && (
                <div style={{ ...cardStyle, borderLeft: `3px solid ${C.terracotta}` }}>
                  <div style={{ fontSize: 9, color: C.terracotta, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", marginBottom: 4 }}>AI INSIGHTS</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{importPreview.about}</div>
                  {importPreview.known_for && <div style={{ fontSize: 11, color: C.muted }}>Known for: {importPreview.known_for}</div>}
                  {importPreview.must_order?.length > 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Must order: {importPreview.must_order.join(", ")}</div>}
                  {importPreview.insider_tip && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tip: {importPreview.insider_tip}</div>}
                </div>
              )}
              {importPreview.tags?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {importPreview.tags.map(t => (
                    <span key={t} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, border: `1px solid ${C.border}`, color: C.muted }}>{t}</span>
                  ))}
                </div>
              )}
              <button type="button" onClick={confirmImport} style={{ ...btnPrimary, width: "100%", padding: "14px", fontSize: 15 }}>
                Import {importPreview.name}
              </button>
              <button type="button" onClick={() => { setImportPreview(null); setImportPhotos([]); }} style={{ ...btnSecondary, width: "100%", padding: "12px", fontSize: 14, marginTop: 8, color: "#999" }}>
                Don't Import
              </button>
            </div>
          )}
        </>
      )}

      {/* ── BULK IMPORT ── */}
      {section === "bulk" && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>Bulk Import</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Paste Google Maps links (one per line). We'll fetch details, photos, and AI enrichment for each.</div>

          {bulkQueue.length === 0 && (
            <>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: "-apple-system,sans-serif" }}>
                Tip: For best results, open each Google Maps link in your browser first, then copy the full URL from the address bar (it should contain "/place/Restaurant+Name/").
                Short links (goo.gl) may not resolve correctly.
              </div>
              <textarea value={bulkLinks} onChange={e => setBulkLinks(e.target.value)} placeholder={"https://www.google.com/maps/place/Restaurant+Name/...\nhttps://maps.google.com/?cid=...\n\nOr just paste restaurant names:\nBestia Los Angeles\nCarbone New York"} style={{ ...inputStyle, minHeight: 150, fontFamily: "'DM Mono', monospace", fontSize: 11, resize: "vertical" }} />
              <button type="button" onClick={async () => {
                const lines = bulkLinks.split("\n").map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) return;
                setBulkProcessing(true);
                const queue = [];
                for (const link of lines) {
                  const isUrl = link.startsWith("http");
                  const nameMatch = link.match(/place\/([^/]+)/);
                  const cidMatch = link.match(/[?&]cid=(\d+)/);
                  let displayName = !isUrl ? link : (nameMatch ? decodeURIComponent(nameMatch[1]).replace(/\+/g, " ") : link.slice(0, 50));
                  const isShortUrl = isUrl && !nameMatch && !cidMatch;
                  queue.push({ link, displayName, status: "pending", data: null, photos: [], selectedPhoto: 0, isShortUrl, isPlainText: !isUrl });
                }
                setBulkQueue(queue);
                for (let i = 0; i < queue.length; i++) {
                  setBulkCurrentIdx(i);
                  queue[i].status = "processing";
                  setBulkQueue([...queue]);
                  try {
                    let searchQuery = queue[i].displayName;
                    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.photos" },
                      body: JSON.stringify({ textQuery: searchQuery, maxResultCount: 1 }),
                    });
                    const searchData = await searchRes.json();
                    const place = searchData.places?.[0];
                    if (!place) { queue[i].status = "error"; queue[i].error = "Not found"; setBulkQueue([...queue]); continue; }
                    const detailRes = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
                      headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,websiteUri,location,photos,rating,userRatingCount,priceLevel,addressComponents" },
                    });
                    const d = await detailRes.json();
                    let city = "", neighborhood = "";
                    (d.addressComponents || []).forEach(c => {
                      if (c.types?.includes("locality")) city = c.longText;
                      if (c.types?.includes("neighborhood")) neighborhood = c.longText;
                      if (!neighborhood && c.types?.includes("sublocality")) neighborhood = c.longText;
                    });
                    const priceMap = { PRICE_LEVEL_FREE: "$", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };
                    const photos = [];
                    for (const p of (d.photos || []).slice(0, 8)) {
                      try {
                        const pr = await fetch(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": GOOGLE_KEY } });
                        if (pr.ok) { const pd = await pr.json(); if (pd.photoUri) { photos.push(pd.photoUri); continue; } }
                        photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
                      } catch { photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`); }
                    }
                    let aiData = {};
                    try {
                      const baseName = d.displayName?.text || searchQuery;
                      const aiRes = await fetch(ANTHROPIC_PROXY, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
                        body: JSON.stringify({
                          model: "claude-sonnet-4-20250514", max_tokens: 1024,
                          system: "You are a food critic and restaurant expert. Return ONLY valid JSON, no markdown.",
                          messages: [{ role: "user", content: `Tell me about "${baseName}" in ${city}. Return JSON: cuisine, tags (array of 3), desc (one poetic sentence), about (2-3 sentences)` }],
                        }),
                      });
                      const aj = await aiRes.json();
                      let text = aj.content?.[0]?.text?.trim() || "{}";
                      if (text.includes("```")) text = text.split("```")[1].replace(/^json/, "").trim();
                      aiData = JSON.parse(text);
                    } catch {}
                    city = normalizeCity(city) || city;
                    queue[i].data = {
                      name: d.displayName?.text || searchQuery, city, neighborhood,
                      address: d.formattedAddress || "", phone: d.nationalPhoneNumber || "",
                      website: d.websiteUri || "", lat: d.location?.latitude || 0, lng: d.location?.longitude || 0,
                      rating: d.rating ? Math.min(10, Math.round(d.rating * 2 * 10) / 10) : 8.5,
                      price: priceMap[d.priceLevel] || "$$", placeId: place.id,
                      cuisine: aiData.cuisine || "", tags: aiData.tags || [], desc: aiData.desc || "",
                      source: "Admin Import", heat: "🔥🔥",
                    };
                    queue[i].photos = photos;
                    const dup = findDuplicate(allRestaurants, queue[i].data.name, queue[i].data.lat, queue[i].data.lng);
                    if (dup) { queue[i].status = "duplicate"; queue[i].error = `Already exists: "${dup.name}" (ID ${dup.id})`; }
                    else { queue[i].status = "ready"; }
                  } catch (e) { queue[i].status = "error"; queue[i].error = e.message; }
                  setBulkQueue([...queue]);
                }
                setBulkProcessing(false);
                setBulkCurrentIdx(-1);
              }} style={{ ...btnPrimary, width: "100%", marginTop: 10 }} disabled={!bulkLinks.trim()}>
                Process All Links
              </button>
            </>
          )}

          {bulkQueue.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {bulkQueue.filter(q => q.status === "ready").length} ready · {bulkQueue.filter(q => q.status === "imported").length} imported · {bulkQueue.filter(q => q.status === "error").length} errors
                </div>
                {!bulkProcessing && <button type="button" onClick={() => { setBulkQueue([]); setBulkLinks(""); }} style={btnSmall}>Start Over</button>}
              </div>

              {bulkQueue.map((item, idx) => (
                <div key={idx} style={{ ...cardStyle, opacity: item.status === "imported" ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: item.status === "ready" ? 8 : 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>
                        {item.data?.name || item.displayName}
                      </div>
                      {item.data && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{item.data.cuisine} · {item.data.city} · {item.data.price}</div>}
                    </div>
                    <div style={{
                      fontSize: 10, fontFamily: "'DM Mono', monospace", padding: "2px 8px", borderRadius: 6,
                      background: item.status === "ready" ? C.terracotta : item.status === "imported" ? C.green : item.status === "error" ? C.red : item.status === "processing" ? C.blue : C.dim,
                      color: "#fff",
                    }}>
                      {item.status === "processing" ? "processing..." : item.status}
                    </div>
                  </div>

                  {item.status === "ready" && item.photos.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 8 }}>
                        {item.photos.map((url, pi) => (
                          <img key={pi} src={url} alt="" onClick={() => {
                            const q = [...bulkQueue]; q[idx].selectedPhoto = pi; setBulkQueue(q);
                          }} style={{
                            width: 56, height: 56, borderRadius: 8, objectFit: "cover", cursor: "pointer", flexShrink: 0,
                            border: pi === (item.selectedPhoto || 0) ? `2px solid ${C.terracotta}` : "2px solid transparent",
                            opacity: pi === (item.selectedPhoto || 0) ? 1 : 0.5,
                          }} onError={e => { e.target.style.display = "none"; }} />
                        ))}
                      </div>
                      <button type="button" onClick={async () => {
                        const photoUrl = item.photos[item.selectedPhoto || 0] || "";
                        const r = { ...item.data, img: photoUrl, img2: photoUrl };
                        const { data, error } = await addCommunityRestaurant(r);
                        if (error) { showToast(`Failed: ${error.message}`, "error"); return; }
                        const savedId = data?.[0]?.id || r.id;
                        if (photoUrl) await saveSharedPhoto(String(savedId), photoUrl);
                        await syncRestaurant({ ...r, id: savedId });
                        const q = [...bulkQueue]; q[idx].status = "imported"; setBulkQueue(q);
                        showToast(`Imported ${r.name}`);
                      }} style={{ ...btnPrimary, width: "100%", fontSize: 12 }}>
                        Import {item.data?.name}
                      </button>
                      <button type="button" onClick={() => {
                        const q = [...bulkQueue]; q[idx].status = "skipped"; setBulkQueue(q);
                      }} style={{ ...btnSecondary, width: "100%", fontSize: 12, marginTop: 6, color: "#999" }}>
                        Don't Import
                      </button>
                    </div>
                  )}

                  {item.status === "skipped" && (
                    <div style={{ marginTop: 8, textAlign: "center" }}>
                      <span style={{ fontSize: 12, color: "#999", fontFamily: "-apple-system,sans-serif" }}>Skipped</span>
                      <button type="button" onClick={() => {
                        const q = [...bulkQueue]; q[idx].status = "ready"; setBulkQueue(q);
                      }} style={{ background: "none", border: "none", color: C.terracotta, fontSize: 11, cursor: "pointer", marginLeft: 8, fontFamily: "-apple-system,sans-serif" }}>Undo</button>
                    </div>
                  )}

                  {item.status === "duplicate" && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: "#e6a832", marginBottom: 6, fontFamily: "-apple-system,sans-serif" }}>⚠ {item.error}</div>
                      <button type="button" onClick={() => {
                        const q = [...bulkQueue]; q[idx].status = "ready"; setBulkQueue(q);
                      }} style={{ ...btnSmall, border: `1px solid #e6a832`, color: "#e6a832", fontSize: 11 }}>Import Anyway</button>
                    </div>
                  )}
                  {item.status === "error" && <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>{item.error}</div>}
                </div>
              ))}

              {!bulkProcessing && bulkQueue.some(q => q.status === "ready") && (
                <button type="button" onClick={async () => {
                  for (let i = 0; i < bulkQueue.length; i++) {
                    if (bulkQueue[i].status !== "ready") continue;
                    const item = bulkQueue[i];
                    const photoUrl = item.photos[item.selectedPhoto || 0] || "";
                    const r = { ...item.data, img: photoUrl, img2: photoUrl };
                    const { data, error } = await addCommunityRestaurant(r);
                    if (!error) {
                      const savedId = data?.[0]?.id || r.id;
                      if (photoUrl) await saveSharedPhoto(String(savedId), photoUrl);
                      await syncRestaurant({ ...r, id: savedId });
                      bulkQueue[i].status = "imported";
                      setBulkQueue([...bulkQueue]);
                    }
                  }
                  await logAdminAction("bulk_import", userId, "restaurant", null, { count: bulkQueue.filter(q => q.status === "imported").length });
                  showToast(`Imported ${bulkQueue.filter(q => q.status === "imported").length} restaurants`);
                  onRestaurantsChanged?.();
                }} style={{ ...btnPrimary, width: "100%", marginTop: 10, padding: "14px", fontSize: 15 }}>
                  Import All Ready ({bulkQueue.filter(q => q.status === "ready").length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BULK FLAMES ── */}
      {section === "flames" && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <div style={sectionLabel}>Bulk Set Flames by City</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={bulkFlameCity} onChange={e => setBulkFlameCity(e.target.value)} style={{ ...selectStyle, flex: 2 }}>
                <option value="">Select city...</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                value={bulkFlameScore}
                onChange={e => setBulkFlameScore(e.target.value)}
                placeholder="Score"
                type="number" min="0.5" max="5" step="0.5"
                style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 13, outline: "none" }}
              />
              <button type="button" onClick={bulkSetFlameCity} disabled={bulkFlameSaving}
                style={{ padding: "8px 16px", borderRadius: 8, background: C.terracotta, border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: bulkFlameSaving ? 0.5 : 1 }}>
                {bulkFlameSaving ? "..." : "Set All"}
              </button>
            </div>
            {bulkFlameCity && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontFamily: "-apple-system,sans-serif" }}>
                {allRestaurants.filter(r => r.city === bulkFlameCity).length} restaurants in {bulkFlameCity}
              </div>
            )}
          </div>

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

      {/* ── MERGE ── */}
      {section === "merge" && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>Merge Duplicates</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Transfer all loves and photos from one restaurant to another, then remove the source.</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Source restaurant ID (will be removed)</div>
            <input type="text" value={mergeFrom} onChange={e => setMergeFrom(e.target.value)} style={inputStyle} placeholder="e.g. 1234" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Target restaurant ID (will keep)</div>
            <input type="text" value={mergeTo} onChange={e => setMergeTo(e.target.value)} style={inputStyle} placeholder="e.g. 5678" />
          </div>
          <button type="button" onClick={() => setConfirm({ message: `Merge ${mergeFrom} into ${mergeTo}? This transfers all loves and removes the source.`, onConfirm: () => { handleMerge(); setConfirm(null); }, onCancel: () => setConfirm(null) })} style={{ ...btnPrimary, width: "100%" }} disabled={!mergeFrom || !mergeTo}>
            Merge
          </button>
        </div>
      )}

      {/* ── MISSING DATA ── */}
      {section === "missing" && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>Missing Data</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{missingData.length} restaurants missing website, coordinates, or description.</div>
          {missingData.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {!r.website && <span style={{ color: C.red, marginRight: 6 }}>no website</span>}
                  {!r.lat && <span style={{ color: C.red, marginRight: 6 }}>no coords</span>}
                  {!r.desc && <span style={{ color: C.red }}>no description</span>}
                </div>
              </div>
              <button type="button" onClick={() => startEdit(r)} style={btnSmall}>Fix</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
