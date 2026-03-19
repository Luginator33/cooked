import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RESTAURANTS, CITIES, ALL_TAGS } from "../data/restaurants";
import ChatBot from "../components/ChatBot";
import Profile from "./Profile";

const DATA_VERSION = "v4-2924";

const BACKUP_KEYS = [
  "cooked_photos",
  "cooked_photo_resolved",
  "cooked_photos_preview",
  "cooked_heat",
  "cooked_watchlist",
  "cooked_finds",
  "cooked_hidden",
  "cooked_profile_name",
  "cooked_profile_username",
];

// Bust stale localStorage if version mismatch
if (typeof window !== 'undefined') {
  const storedVersion = localStorage.getItem("cooked_data_version");
  if (storedVersion !== DATA_VERSION) {
    localStorage.removeItem("cooked_restaurants");
    localStorage.setItem("cooked_data_version", DATA_VERSION);
  }
}

const CITY_COORDS = {
  "Los Angeles": { lat: 34.0522, lng: -118.2437 },
  "New York": { lat: 40.7128, lng: -74.006 },
  "Chicago": { lat: 41.8781, lng: -87.6298 },
  "San Francisco": { lat: 37.7749, lng: -122.4194 },
  "Miami": { lat: 25.7617, lng: -80.1918 },
  "London": { lat: 51.5074, lng: -0.1278 },
  "Tokyo": { lat: 35.6762, lng: 139.6503 },
  "Paris": { lat: 48.8566, lng: 2.3522 },
  "Copenhagen": { lat: 55.6761, lng: 12.5683 },
  "San Diego": { lat: 32.7157, lng: -117.1611 },
  "Austin": { lat: 30.2672, lng: -97.7431 },
  "Nashville": { lat: 36.1627, lng: -86.7816 },
  "Barcelona": { lat: 41.3851, lng: 2.1734 },
  "Mexico City": { lat: 19.4326, lng: -99.1332 },
  "Lisbon": { lat: 38.7223, lng: -9.1393 },
  "Seoul": { lat: 37.5665, lng: 126.9780 },
};

const C = {
  cream:"#faf6f0", warm:"#f5ede0", parchment:"#ede4d3",
  terracotta:"#c4603a", terra2:"#e07a52", text:"#1e1208",
  muted:"#8a7060", border:"#ddd0bc", card:"#fff9f2",
  sage:"#6b8f71", caramel:"#8b5e3c", bark:"#2e1f0e",
};

// Restaurant cuisine → display category (Tier 2 dropdown when Restaurants selected)
const RESTAURANT_CUISINE_CATEGORIES = [
  { label: "American", values: ["American", "American / Burgers", "American Diner", "American Southern", "New American", "California", "Californian", "BBQ", "Hawaiian", "British", "European"] },
  { label: "Italian", values: ["Italian", "Italian Deli", "Italian Seafood", "Italian-American"] },
  { label: "French", values: ["French", "French Bistro", "French Diner", "French / Wine Bar", "French-American", "French-Californian", "French-Korean", "Contemporary French", "Moroccan-French"] },
  { label: "Japanese", values: ["Japanese", "Japanese Izakaya", "Japanese-American", "Japanese-Korean", "Japanese-Peruvian", "Japanese Cocktail Bar"] },
  { label: "Sushi", values: ["Sushi"] },
  { label: "Ramen", values: ["Ramen", "Japanese / Ramen"] },
  { label: "Korean", values: ["Korean", "Korean BBQ", "Korean-American", "Korean Bar"] },
  { label: "Chinese", values: ["Chinese", "Chinese / Dumplings", "Chinese / Noodles", "Chinese / Taiwanese", "Sichuan", "Taiwanese", "Taiwanese-American"] },
  { label: "Mexican", values: ["Mexican", "Mexican Seafood", "Mexican Vegan", "Mexican-American", "Oaxacan", "Tex-Mex"] },
  { label: "Seafood", values: ["Seafood", "Italian Seafood", "Mexican Seafood"] },
  { label: "Steakhouse", values: ["Steakhouse", "BBQ"] },
  { label: "Mediterranean", values: ["Mediterranean", "Greek-Mediterranean", "Israeli", "Middle Eastern"] },
  { label: "Spanish", values: ["Spanish", "Spanish Tapas"] },
  { label: "Southeast Asian", values: ["Thai", "Vietnamese", "Filipino", "Southeast Asian"] },
  { label: "South Asian", values: ["Indian", "Indian-American"] },
  { label: "Pizza", values: ["Pizza", "Neapolitan Pizza"] },
  { label: "Latin American", values: ["Peruvian", "Mexican-American", "Tex-Mex", "Oaxacan"] },
  { label: "Contemporary / Fine Dining", values: ["Contemporary", "Avant-garde", "New American", "Asian-French"] },
  { label: "Fusion", values: ["Asian-French", "French-Korean", "Japanese-Korean", "Japanese-Peruvian", "Korean-American", "French-Californian", "Taiwanese-American", "Indian-American"] },
  { label: "Sandwiches & Casual", values: ["Sandwiches", "Deli", "Jewish Deli", "Bakery", "Bakery-Deli", "American / Burgers"] },
  { label: "Vegetarian / Vegan", values: ["Vegan", "Mexican Vegan"] },
  { label: "Brunch & Bakery", values: ["Bakery", "Bakery-Deli"] },
  { label: "African", values: ["Armenian"] },
  { label: "British / European", values: ["British", "European", "Irish Pub"] },
  { label: "Food Hall / Market", values: ["Food Hall"] },
  { label: "Other", values: [] },
];

// Bar cuisine → display category (Tier 2 dropdown when Bars & Nightlife selected)
const BAR_CUISINE_CATEGORIES = [
  { label: "Cocktail Bar", values: ["Cocktail Bar", "Cocktail Lounge", "Classic Bar", "Craft Cocktail Bar", "Speakeasy", "Amaro Bar", "Agave Bar", "Aperitivo Bar", "Japanese Cocktail Bar", "Korean Bar", "Mexican Bar", "Champagne Bar", "Bar & Lounge", "Cocktail Bar / Speakeasy", "Speakeasy / Cocktail Bar"] },
  { label: "Wine Bar", values: ["Wine Bar", "Natural Wine", "Rooftop Wine Bar", "Wine Bar / Cocktail Bar"] },
  { label: "Rooftop", values: ["Rooftop Bar", "Hotel Bar", "Hotel Rooftop", "Rooftop Bar / Lounge", "Sky-High Cocktail Bar"] },
  { label: "Dive & Neighborhood", values: ["Dive Bar", "Bar", "Neighborhood Bar", "Pub", "British Bar", "Irish Pub", "Gastropub", "Historic Bar", "Restaurant & Bar"] },
  { label: "Live Music & Jazz", values: ["Jazz Bar", "Jazz Club", "Live Music Bar", "Blues Bar", "Cocktail Bar / Live Music", "Bar / Live Music", "Bar / Hi-Fi", "Hi-Fi Cocktail Bar", "Listening Bar", "Piano Bar"] },
  { label: "Nightclub & Dance", values: ["Nightclub", "Dance Club", "Nightclub / Dance Club", "Club", "Dance Bar"] },
  { label: "Specialty", values: ["Tiki Bar", "Whiskey Bar", "Craft Beer Bar", "Beer Bar", "Tapas Bar", "Arcade Bar", "Board-Game Bar", "Sake Bar", "Rum Bar", "Mezcal Bar", "Gin Bar"] },
  { label: "Karaoke Bar", values: ["Karaoke Bar", "Karaoke", "80s / Karaoke / Nightlife"] },
  { label: "Hookah Bar", values: ["Hookah Lounge", "Hookah Bar"] },
  { label: "Brewery", values: ["Brewery Bar", "Craft Beer Bar", "Beer Garden", "Beer Hall"] },
];

function RestCard({ r, loved, watched, onLove, onWatch, onShare, onOpenDetail, onPhotoFetched }) {
  const cardRef = useRef(null);
  const [imgSrc, setImgSrc] = useState(r.img);

  useEffect(() => { setImgSrc(r.img); }, [r.img]);

  useEffect(() => {
    if (!r.img || !r.img.includes('picsum')) return; // already has a real photo
    try {
      const vault = JSON.parse(localStorage.getItem('cooked_photos') || '{}');
      if (vault[r.id]) return;
      const preview = JSON.parse(localStorage.getItem('cooked_photos_preview') || '{}');
      if (preview[r.id]) return;
    } catch {}
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      onPhotoFetched?.(r, setImgSrc);
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [r.id, r.img]);

  return (
    <div ref={cardRef} style={{ margin:"0 16px 16px", borderRadius:20, overflow:"hidden", background:C.card, border:`1px solid ${C.border}`, boxShadow:"0 2px 16px rgba(30,18,8,0.07)", cursor:"pointer" }} onClick={() => onOpenDetail?.(r)}>
      <div style={{ position:"relative", height:220, overflow:"hidden" }}>
        <img src={imgSrc} alt={r.name} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform 0.4s" }} />
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 50%, rgba(30,18,8,0.7) 100%)" }} />
        <div style={{ position:"absolute", top:12, left:12, background:"rgba(250,246,240,0.9)", backdropFilter:"blur(8px)", border:`1px solid ${C.border}`, borderRadius:20, padding:"4px 10px", fontFamily:"'DM Mono',monospace", fontSize:10, color:C.caramel, isolation:"isolate" }}>{r.source}</div>
        <div style={{ position:"absolute", top:12, right:12, fontSize:14 }}>{r.heat}</div>
        <div style={{ position:"absolute", bottom:12, right:14, fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:700, fontStyle:"italic", color:"#fff", lineHeight:1, textShadow:"0 2px 10px rgba(0,0,0,0.4)" }}>{r.rating}</div>
      </div>
      <div style={{ padding:"14px 16px", background:"#fff9f2" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, lineHeight:1.1, marginBottom:4, color:"#1e1208", background:"transparent" }}>{r.name}</div>
        <div style={{ display:"flex", gap:7, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{r.cuisine}</span>
          <span style={{ color:C.border }}>·</span>
          <span style={{ fontSize:11, color:C.muted }}>{r.neighborhood}</span>
          <span style={{ color:C.border }}>·</span>
          <span style={{ fontSize:11, color:C.terracotta, fontFamily:"'DM Mono',monospace" }}>{r.price}</span>
        </div>
        <p style={{ fontSize:13, lineHeight:1.55, color:C.caramel, marginBottom:12 }}>{r.desc}</p>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
          {r.tags.map(t => <span key={t} style={{ padding:"3px 9px", borderRadius:6, border:`1px solid ${C.border}`, fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{t}</span>)}
        </div>
        <div style={{ display:"flex", gap:7 }} onClick={e => e.stopPropagation()}>
          {[
            { label: loved ? "Loved It ♥" : "Love It ♡", active: loved, onClick: onLove, activeColor: C.terracotta },
            { label: watched ? "On Target 🎯" : "Target List", active: watched, onClick: onWatch, activeColor: "#6b9fff" },
            { label: "Share ↗", active: false, onClick: () => onShare(r.name), activeColor: C.terracotta },
          ].map((btn, i) => (
            <button key={i} onClick={btn.onClick} style={{ flex:1, padding:"9px 4px", borderRadius:10, border:`1.5px solid ${btn.active ? btn.activeColor : C.border}`, background: btn.active ? `${btn.activeColor}15` : "transparent", color: btn.active ? btn.activeColor : C.muted, cursor:"pointer", fontSize:12, fontFamily:"'DM Sans',sans-serif", transition:"all 0.18s" }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Lazy-loading row: fires onLoad(index) once when scrolled into view
function LazyPhotoRow({ item, pickerIndex, onLoad, onSelect, onRefresh, C }) {
  const ref = useRef(null);
  const firedRef = useRef(false);
  const [page, setPage] = useState(0);
  const PHOTOS_PER_PAGE = 4;

  useEffect(() => {
    if (item.photoOptions.length > 0 || item.isRefreshing) return;
    const timeoutId = setTimeout(() => {
      onLoad(pickerIndex, item.restaurant);
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [pickerIndex, item.photoOptions.length, item.isRefreshing, item.restaurant, onLoad]);

  const totalPages = Math.ceil(item.photoOptions.length / PHOTOS_PER_PAGE);
  const visiblePhotos = item.photoOptions.slice(page * PHOTOS_PER_PAGE, (page + 1) * PHOTOS_PER_PAGE);

  return (
    <div ref={ref}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, fontWeight:700, color:C.text }}>{item.restaurant.name}</div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {totalPages > 1 && (
            <div style={{ display:"flex", gap:4 }}>
              <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"3px 7px", background:C.card, color:C.muted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontFamily:"'DM Mono',monospace" }}>‹</button>
              <span style={{ fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace", lineHeight:"24px" }}>{page+1}/{totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"3px 7px", background:C.card, color:C.muted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontFamily:"'DM Mono',monospace" }}>›</button>
            </div>
          )}
          <button type="button" onClick={() => { setPage(0); onRefresh(pickerIndex); }} style={{ fontSize:11, borderRadius:14, border:`1px solid ${C.border}`, padding:"4px 8px", background:C.card, color:C.muted, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Refresh</button>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8 }}>
        {item.isRefreshing ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.warm, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace" }}>…</div>
          ))
        ) : item.photoOptions.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.warm, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{i === 0 ? (firedRef.current ? "No photos" : "Waiting") : "·"}</div>
          ))
        ) : (
          visiblePhotos.map((opt, idx) => {
            const photoIndex = page * PHOTOS_PER_PAGE + idx;
            return (
              <button key={photoIndex} type="button" onClick={() => onSelect(pickerIndex, photoIndex)}
                style={{ aspectRatio:"1", borderRadius:12, overflow:"hidden", border:`3px solid ${item.selectedIndex === photoIndex ? C.terracotta : C.border}`, padding:0, cursor:"pointer", background:C.warm, width:"100%" }}>
                <img src={opt.photoUri} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} onError={e => { e.target.onerror=null; e.target.style.display="none"; }} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function Discover({ tasteProfile, initialTab }) {
  const [tab, setTab] = useState(initialTab || "discover");
  const [city, setCity] = useState("Los Angeles");
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_watchlist") || "[]"); } catch { return []; }
  });
  const [toast, setToast] = useState(null);
  const [detailShareCopied, setDetailShareCopied] = useState(false);
  const [igModal, setIgModal] = useState(false);
  const [igUrl, setIgUrl] = useState("");
  const [igDone, setIgDone] = useState(false);
  const [igImporting, setIgImporting] = useState(false);
  const [igAddedRestaurants, setIgAddedRestaurants] = useState([]);
  const [igError, setIgError] = useState(null);
  const [igDragOver, setIgDragOver] = useState(false);
  const [igPhotoPicker, setIgPhotoPicker] = useState([]);
  const [pickerMode, setPickerMode] = useState("ig-import");
  const [pickerTab, setPickerTab] = useState("unresolved");
  const photoQueue = useRef([]);
  const photoQueueRunning = useRef(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const filteredRef = useRef([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [selectedRest, setSelectedRest] = useState(null);
  const [allRestaurants, setAllRestaurants] = useState(() => {
    try {
      const stored = localStorage.getItem("cooked_restaurants");
      if (!stored) return RESTAURANTS;
      const parsed = JSON.parse(stored);
      const seen = new Set();
      const deduped = parsed.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
      // Also dedup by name+city (keeps first occurrence, preserving photos on the kept entry)
      const seenNameCity = new Set();
      const dedupedFull = deduped.filter(r => {
        const key = (r.name || '').toLowerCase() + '|' + (r.city || '').toLowerCase();
        if (seenNameCity.has(key)) return false;
        seenNameCity.add(key);
        return true;
      });
      const dedupedForMerge = dedupedFull;
      const baseIds = new Set(RESTAURANTS.map(r => r.id));
      const storedById = {};
      dedupedForMerge.forEach(r => { storedById[r.id] = r; });
      const igImports = dedupedForMerge.filter(r => !baseIds.has(r.id));
      // Photo priority on init: vault (user-confirmed only) > preview (auto-fetched) > source
      // vault = cooked_photos, but only IDs in cooked_photo_resolved are truly confirmed
      let allVaultPhotos = {};
      try { allVaultPhotos = JSON.parse(localStorage.getItem("cooked_photos") || "{}"); } catch {}
      let resolvedIds = new Set();
      try { resolvedIds = new Set(JSON.parse(localStorage.getItem("cooked_photo_resolved") || "[]")); } catch {}
      // savedPhotos = only confirmed entries
      const savedPhotos = {};
      Object.keys(allVaultPhotos).forEach(id => {
        if (resolvedIds.has(Number(id)) || resolvedIds.has(id)) savedPhotos[id] = allVaultPhotos[id];
      });
      let previewPhotos = {};
      try { previewPhotos = JSON.parse(localStorage.getItem("cooked_photos_preview") || "{}"); } catch {}
      const baseMerged = RESTAURANTS.map(r => {
        const s = storedById[r.id];
        const freshHeat = r.heat; // always from source file
        const vaultImg = savedPhotos[r.id];
        const previewImg = previewPhotos[r.id];
        if (vaultImg) return { ...r, img: vaultImg, img2: vaultImg, heat: freshHeat };
        if (previewImg) return { ...r, img: previewImg, img2: previewImg, heat: freshHeat };
        if (s && s.img && !s.img.includes('picsum')) return { ...r, img: s.img, img2: s.img2 || s.img, heat: freshHeat };
        return r;
      });
      // Apply vault + preview to igImports too
      const igMerged = igImports.map(r => {
        const vaultImg = savedPhotos[r.id];
        const previewImg = previewPhotos[r.id];
        if (vaultImg) return { ...r, img: vaultImg, img2: vaultImg };
        if (previewImg) return { ...r, img: previewImg, img2: previewImg };
        return r;
      });
      // Safety: filter out any malformed entries
      const valid = [...baseMerged, ...igMerged].filter(r => 
        r && typeof r.id === 'number' && typeof r.name === 'string' && r.name
      );
      return valid.length > 0 ? valid : RESTAURANTS;
    } catch { return RESTAURANTS; }
  });
  const [photoResolved, setPhotoResolved] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_photo_resolved") || "[]"); } catch { return []; }
  });
  const [detailRestaurant, setDetailRestaurant] = useState(null);
  const [placeDetails, setPlaceDetails] = useState({});
  const [userRatings, setUserRatings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_ratings") || "{}"); } catch { return {}; }
  });
  const [userNotes, setUserNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_notes") || "{}"); } catch { return {}; }
  });
  const [noteInput, setNoteInput] = useState("");
  const [activeFilter, setActiveFilter] = useState(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [venueType, setVenueType] = useState("all"); // "all" | "restaurants" | "bars" | "coffee"
  const [secondaryCuisine, setSecondaryCuisine] = useState(null); // dropdown selection when restaurants or bars
  const [showChat, setShowChat] = useState(false);
  const [heatIndex, setHeatIndex] = useState(0);
  const [heatResults, setHeatResults] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_heat") || '{"loved":[],"noped":[],"skipped":[],"votes":{}}'); } catch { return { loved: [], noped: [], skipped: [], votes: {} }; }
  });
  const [heatCity, setHeatCity] = useState("All");
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    if (!cityPickerOpen) return;
    const close = () => setCityPickerOpen(false);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", close); };
  }, [cityPickerOpen]);
  const [swipeDelta, setSwipeDelta] = useState({ x: 0, y: 0 });
  const [swipeDir, setSwipeDir] = useState(null); // 'left' | 'right' | 'up' | null
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);
  const swipeDeltaRef = useRef({ x: 0, y: 0 });
  const heatSwipeHandledRef = useRef(false);
  const backupInputRef = useRef(null);

  const [userLists, setUserLists] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_lists") || "{\"Breakfast/Brunch\":[],\"Lunch\":[],\"Dinner\":[],\"Bar\":[],\"Coffee\":[]}"); } catch { return { "Breakfast/Brunch": [], "Lunch": [], "Dinner": [], "Bar": [], "Coffee": [] }; }
  });
  useEffect(() => {
    localStorage.setItem("cooked_restaurants", JSON.stringify(allRestaurants));
  }, [allRestaurants]);
  useEffect(() => { localStorage.setItem("cooked_ratings", JSON.stringify(userRatings)); }, [userRatings]);
  useEffect(() => { localStorage.setItem("cooked_notes", JSON.stringify(userNotes)); }, [userNotes]);
  useEffect(() => { localStorage.setItem("cooked_lists", JSON.stringify(userLists)); }, [userLists]);
  useEffect(() => { localStorage.setItem("cooked_photo_resolved", JSON.stringify(photoResolved)); }, [photoResolved]);
  useEffect(() => { localStorage.setItem("cooked_watchlist", JSON.stringify(watchlist)); }, [watchlist]);

  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (!initialTab) return;
    if (!["discover", "heat", "lists", "map", "ask"].includes(initialTab)) return;
    if (initialTab === prevInitialTabRef.current) return;
    prevInitialTabRef.current = initialTab;
    setTab(initialTab);
  }, [initialTab]);
  useEffect(() => { localStorage.setItem("cooked_heat", JSON.stringify(heatResults)); }, [heatResults]);

  const exportBackup = () => {
    const data = {};
    BACKUP_KEYS.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cooked_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        BACKUP_KEYS.forEach((key) => {
          if (data[key] !== undefined) {
            const value = typeof data[key] === "string" ? data[key] : JSON.stringify(data[key]);
            localStorage.setItem(key, value);
          }
        });
        window.location.reload();
      } catch {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Vault is only written when user explicitly confirms a photo (see confirmFromPicker)

  // Compute flames from vote counts — defined here so detail page + heat tab can use it
  const getFlames = (r) => {
    const v = (heatResults.votes || {})[r.id];
    if (!v || (v.up + v.down) < 3) {
      // fall back to original heat if not enough votes
      return r.heat || "";
    }
    const ratio = v.up / (v.up + v.down);
    return "🔥".repeat(Math.max(0, Math.min(5, Math.round(ratio * 5))));
  };

  // Simple function: fetch Google photo for a restaurant and cache it
  const fetchAndCachePhoto = async (restaurant, setImgSrc) => {
    const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
    if (!googleKey) return;
    // Check vault + preview first
    try {
      const vault = JSON.parse(localStorage.getItem('cooked_photos') || '{}');
      if (vault[restaurant.id]) { setImgSrc(vault[restaurant.id]); return; }
      const preview = JSON.parse(localStorage.getItem('cooked_photos_preview') || '{}');
      if (preview[restaurant.id]) { setImgSrc(preview[restaurant.id]); return; }
    } catch {}

    const normName = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
    const rn = normName(restaurant.name);
    const nameScore = pn => {
      const p = normName(pn);
      if (p === rn) return 5;
      if (p.includes(rn) || rn.includes(p)) return 4;
      const words = rn.match(/[a-z0-9]{3,}/g) || [];
      const matched = words.filter(w => p.includes(w));
      if (words.length && matched.length === words.length) return 3;
      if (words.length > 1 && matched.length >= words.length - 1) return 2;
      return 0;
    };
    const cityCoords = CITY_COORDS[restaurant.city];
    let photoUri = null;

    try {
      // Step 1: geocode → 200m nearby search
      const geoQ = encodeURIComponent(`${restaurant.name} ${restaurant.neighborhood || ''} ${restaurant.city}`);
      const geoData = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${geoQ}&key=${googleKey}`).then(r=>r.json());
      const loc = geoData.results?.[0]?.geometry?.location;
      if (loc) {
        const nd = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method:'POST', headers:{'Content-Type':'application/json','X-Goog-Api-Key':googleKey,'X-Goog-FieldMask':'places.displayName,places.photos,places.types'},
          body: JSON.stringify({ textQuery: restaurant.name, locationBias:{ circle:{ center:{ latitude:loc.lat, longitude:loc.lng }, radius:200.0 } } })
        }).then(r=>r.json());
        const best = (nd.places||[]).map(p=>({p,s:nameScore(p.displayName?.text||'')})).sort((a,b)=>b.s-a.s)[0];
        const foodTypesNearby = ['restaurant','bar','cafe','food','bakery','meal_takeaway','meal_delivery','night_club','lodging','hotel','hookah_bar','bar_and_grill'];
        const bestIsFoodVenue = (best?.p?.types || []).some(t => foodTypesNearby.includes(t));
        if (best?.s >= 2 && bestIsFoodVenue && best.p.photos?.[0]?.name) {
          const md = await fetch(`https://places.googleapis.com/v1/${best.p.photos[0].name}/media?maxWidthPx=800&skipHttpRedirect=true`,{headers:{'X-Goog-Api-Key':googleKey}}).then(r=>r.json());
          if (md.photoUri) photoUri = md.photoUri;
        }
      }
    } catch {}

    // Step 2: fallback city-biased search
    if (!photoUri && cityCoords) {
      for (const [q, minS] of [
        [`${restaurant.name} ${restaurant.neighborhood||''} ${restaurant.city}`.replace(/\s+/g,' ').trim(), 3],
        [`${restaurant.name} ${restaurant.city}`, 2],
      ]) {
        try {
          const sd = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method:'POST', headers:{'Content-Type':'application/json','X-Goog-Api-Key':googleKey,'X-Goog-FieldMask':'places.displayName,places.photos,places.types'},
            body: JSON.stringify({ textQuery:q, locationBias:{ circle:{ center:{ latitude:cityCoords.lat, longitude:cityCoords.lng }, radius:30000.0 } } })
          }).then(r=>r.json());
          const foodTypesFallback = ['restaurant','bar','cafe','food','bakery','meal_takeaway','meal_delivery','night_club','lodging','hotel','hookah_bar','bar_and_grill'];
          const scoredFallback = (sd.places||[])
            .filter(p => (p.types||[]).some(t => foodTypesFallback.includes(t))) // MUST be food venue
            .map(p=>({p,s:nameScore(p.displayName?.text||'')}))
            .sort((a,b)=>b.s-a.s);
          const best = scoredFallback[0];
          if (!best || best.s < minS) continue;
          if (best.p.photos?.[0]?.name) {
            const md = await fetch(`https://places.googleapis.com/v1/${best.p.photos[0].name}/media?maxWidthPx=800&skipHttpRedirect=true`,{headers:{'X-Goog-Api-Key':googleKey}}).then(r=>r.json());
            if (md.photoUri) { photoUri = md.photoUri; break; }
          }
        } catch {}
      }
    }

    if (photoUri) {
      // Save to preview cache (not vault — stays unresolved for user to confirm)
      try {
        const preview = JSON.parse(localStorage.getItem('cooked_photos_preview') || '{}');
        preview[restaurant.id] = photoUri;
        localStorage.setItem('cooked_photos_preview', JSON.stringify(preview));
      } catch {}
      setImgSrc(photoUri);
      setAllRestaurants(prev => prev.map(r => r.id === restaurant.id ? {...r, img: photoUri} : r));
    }
  };

  const fetchPlaceDetails = async (restaurant) => {
    if (placeDetails[restaurant.id]) return;
    const key = import.meta.env.VITE_GOOGLE_PLACES_KEY;
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.regularOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.photos" },
        body: JSON.stringify({ textQuery: `${restaurant.name} ${restaurant.neighborhood} ${restaurant.city}` })
      });
      const data = await res.json();
      const place = data.places?.[0];
      if (place) setPlaceDetails(prev => ({ ...prev, [restaurant.id]: place }));
    } catch (e) {}
  };

  useEffect(() => {
    if (!detailRestaurant?.id) return;
    if (placeDetails[detailRestaurant.id]) return;
    fetchPlaceDetails(detailRestaurant);
  }, [detailRestaurant?.id]);
  useEffect(() => {
    setShowTagPicker(false);
  }, [detailRestaurant]);

  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return; }
    if (document.getElementById("gmaps-script")) return;
    const script = document.createElement("script");
    script.id = "gmaps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_PLACES_KEY}&libraries=marker`;
    script.async = true;
    script.onload = () => { console.log("Maps script loaded!"); setMapsReady(true); };
    document.head.appendChild(script);
  }, []);

  const CITY_GROUPS = {
    "Los Angeles": ["Los Angeles", "Malibu", "Beverly Hills", "West Hollywood", "Brentwood", "Santa Monica", "Culver City", "Arts District", "Chinatown", "Palms", "Mid-City"],
    "New York": ["New York", "Manhattan", "Brooklyn", "Queens", "Williamsburg", "West Village", "East Village", "Greenwich Village", "Koreatown", "Midtown", "Flatiron", "SoHo"],
    "Chicago": ["Chicago", "West Loop", "Lincoln Park", "Wicker Park", "River North"],
    "San Francisco": ["San Francisco", "Berkeley", "Oakland", "Mission", "Hayes Valley", "SoMa", "Nob Hill"],
    "Miami": ["Miami", "South Beach", "Design District", "Wynwood", "Coconut Grove", "Brickell"],
    "London": ["London", "Shoreditch", "Soho", "Mayfair", "Notting Hill", "Chelsea", "Farringdon", "St. James's"],
    "Tokyo": ["Tokyo", "Shibuya", "Shinjuku", "Ginza", "Roppongi", "Aoyama", "Minami-Aoyama", "Jimbocho"],
    "Paris": ["Paris", "1st Arrondissement", "2nd Arrondissement", "7th Arrondissement", "11th Arrondissement", "Marais", "Saint-Germain"],
    "Copenhagen": ["Copenhagen", "Christianshavn", "Nørrebro", "Vesterbro"],
    "San Diego": ["San Diego", "Chula Vista", "Gaslamp", "Little Italy", "North Park"],
    "Austin": ["Austin", "East Austin", "South Lamar", "North Austin", "Downtown Austin"],
    "Nashville": ["Nashville", "East Nashville", "Midtown", "Germantown", "Rutledge Hill"],
    "Barcelona": ["Barcelona", "El Born", "Eixample", "Barceloneta", "Sant Antoni", "Girona"],
    "Mexico City": ["Mexico City", "Polanco", "Colonia Roma", "Centro Histórico"],
    "Lisbon": ["Lisbon", "Chiado", "Príncipe Real", "Madragoa", "Cais do Sodré", "Intendente", "Avenida da Liberdade"],
    "Seoul": ["Seoul", "Gangnam", "Jongno", "Itaewon", "Mapo"],
  };
  const filteredByCity = city === "All" ? allRestaurants : allRestaurants.filter(r => {
    const group = CITY_GROUPS[city] || [city];
    return group.includes(r.city) || group.includes(r.neighborhood);
  });

  // Tier 1: filter by venue type (All / Restaurants / Bars & Nightlife / Coffee & Cafes)
  // Restaurants: include only when isBar is not true (ignore cuisine text; e.g. "Sushi" or "Sushi Bar" both pass).
  const passesVenueType = (r) => {
    if (venueType === "all") return true;
    const cu = (r.cuisine || "").toLowerCase();
    if (venueType === "restaurants") {
      if (r.isBar === true) return false;
      if (cu.includes("coffee")) return false;
      return true;
    }
    if (venueType === "bars") {
      if (r.isBar === true) return true;
      if (cu.includes("bar")) return true;
      if (cu.includes("nightclub")) return true;
      if (cu.includes("lounge")) return true;
      return false;
    }
    if (venueType === "coffee") {
      return cu.includes("coffee") || cu.includes("cafe");
    }
    return true;
  };
  const filteredByVenue = filteredByCity.filter(passesVenueType);

  // Tier 2: hardcoded category labels for dropdown (restaurants = 27, bars = 10)
  const cuisineDropdownCategories = venueType === "restaurants" ? RESTAURANT_CUISINE_CATEGORIES : venueType === "bars" ? BAR_CUISINE_CATEGORIES : [];

  // Helper: does r match the selected category? (secondaryCuisine is a category label)
  // Uses case-insensitive substring match: entry cuisine must CONTAIN any of the category's raw values.
  const passesCuisineCategory = (r) => {
    if (!secondaryCuisine) return true;
    const cat = cuisineDropdownCategories.find(c => c.label === secondaryCuisine);
    if (!cat) return true;
    const rawLower = (r.cuisine || "").toLowerCase();
    if (cat.label === "Other") {
      // Other = cuisine does not contain any raw value from the other restaurant categories
      const allOtherValues = RESTAURANT_CUISINE_CATEGORIES.filter(c => c.label !== "Other").flatMap(c => c.values);
      return rawLower.trim() !== "" && !allOtherValues.some(v => rawLower.includes(v.toLowerCase()));
    }
    return cat.values.some(v => rawLower.includes(v.toLowerCase()));
  };

  const filteredForDiscover = filteredByVenue.filter(r => {
    if (activeFilter && !(r.tags && r.tags.includes(activeFilter))) return false;
    if (!passesCuisineCategory(r)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.name?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.neighborhood?.toLowerCase().includes(q) ||
        r.cuisine?.toLowerCase().includes(q) ||
        r.desc?.toLowerCase().includes(q) ||
        (r.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });
  const filteredSorted = [...filteredForDiscover].sort((a, b) => {
    const score = (r) => (userRatings[r.id] || 0) * 0.3 + r.rating * 0.7;
    return score(b) - score(a);
  });
  const heatCityRestaurants = heatCity === "All" ? allRestaurants : allRestaurants.filter(r => {
    const group = CITY_GROUPS[heatCity] || [heatCity];
    return group.includes(r.city) || group.includes(r.neighborhood);
  });
  const heatActive = heatCityRestaurants.filter(r => !heatResults.loved.includes(r.id) && !heatResults.noped.includes(r.id) && !heatResults.skipped.includes(r.id));
  const heatSkippedRecycled = heatCityRestaurants.filter(r => heatResults.skipped.includes(r.id));
  const heatDeck = [...heatActive, ...heatSkippedRecycled];
  const filtered = filteredByCity;
  const listNames = Object.keys(userLists);
  const toggleList = (listName, restaurantId) => {
    setUserLists(prev => ({
      ...prev,
      [listName]: prev[listName].includes(restaurantId)
        ? prev[listName].filter(id => id !== restaurantId)
        : [...prev[listName], restaurantId],
    }));
  };

  useEffect(() => {
    if (tab !== "map" || !mapsReady) return;
    const el = mapRef.current;
    if (!el) return;
    const center = city === "All" ? { lat: 30, lng: 10 } : (CITY_COORDS[city] || CITY_COORDS["Los Angeles"]);
    const zoom = city === "All" ? 2 : 13;
    filteredRef.current = filtered;

    const initMap = async () => {
      const { Map } = await google.maps.importLibrary("maps");
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new Map(el, {
          center,
          zoom: 13,
          mapId: "4504f8b37365c3d0",
          disableDefaultUI: true,
          zoomControl: true,
          styles: [],
        });
      } else {
        mapInstanceRef.current.setCenter(center);
        mapInstanceRef.current.setZoom(zoom);
      }

      markersRef.current.forEach(m => { m.map = null; });
      markersRef.current = [];

      const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
      for (const r of filteredRef.current) {
        let lat = center.lat + (Math.random() - 0.5) * 0.04;
        let lng = center.lng + (Math.random() - 0.5) * 0.04;

        try {
          const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(r.name + " " + (r.neighborhood || r.city))}&key=${googleKey}`);
          const geoData = await geoRes.json();
          if (geoData.results?.[0]?.geometry?.location) {
            lat = geoData.results[0].geometry.location.lat;
            lng = geoData.results[0].geometry.location.lng;
          }
        } catch (e) {}

        const pin = document.createElement("div");
        pin.style.cssText = `
          width: 52px; height: 52px; border-radius: 50%;
          overflow: hidden; border: 3px solid #fff;
          box-shadow: 0 3px 12px rgba(0,0,0,0.35);
          cursor: pointer; background: #eee;
          transition: transform 0.2s;
        `;
        pin.onmouseenter = () => { pin.style.transform = "scale(1.15)"; };
        pin.onmouseleave = () => { pin.style.transform = "scale(1)"; };
        const img = document.createElement("img");
        img.src = r.img || "";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;";
        pin.appendChild(img);

        const marker = new AdvancedMarkerElement({
          map: mapInstanceRef.current,
          position: { lat, lng },
          content: pin,
          title: r.name,
        });
        marker.addListener("click", () => setSelectedRest(r));
        markersRef.current.push(marker);
      }
    };

    initMap();
  }, [tab, city, mapsReady]);

  const findsIds = (() => { try { return JSON.parse(localStorage.getItem("cooked_finds") || "[]"); } catch { return []; } })();
  const findsList = findsIds.map((id) => allRestaurants.find((r) => r.id === id || r.id === Number(id))).filter(Boolean);
  const explicitLovedIds = (() => { try { return JSON.parse(localStorage.getItem("cooked_loved") || "[]"); } catch { return []; } })();
  const lovedList = allRestaurants.filter(r => explicitLovedIds.includes(r.id) || explicitLovedIds.includes(Number(r.id)));
  const watchList = allRestaurants.filter(r => watchlist.includes(r.id));
  const lovedFromSwipe = lovedList;

  const toggleLove = (id) => {
    setHeatResults(prev => {
      const isLoved = prev.loved.includes(id);
      const nextLoved = isLoved ? prev.loved.filter(x => x !== id) : [...prev.loved, id];
      try {
        const raw = localStorage.getItem("cooked_loved");
        const arr = raw ? JSON.parse(raw) : [];
        const set = new Set(arr);
        if (isLoved) {
          set.delete(id);
          set.delete(Number(id));
        } else {
          set.add(id);
        }
        localStorage.setItem("cooked_loved", JSON.stringify([...set]));
      } catch {}
      return {
        ...prev,
        loved: nextLoved,
      };
    });
  };
  const toggleWatch = (id) => setWatchlist(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id]);
  const share = (name) => { setToast(name); setTimeout(()=>setToast(null),2500); };

  const addToCookedFinds = (ids) => {
    try {
      const raw = localStorage.getItem("cooked_finds");
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set(arr);
      ids.forEach((id) => set.add(id));
      localStorage.setItem("cooked_finds", JSON.stringify([...set]));
    } catch {}
  };

  const ANTHROPIC_PROMPT = "Look at this Instagram post screenshot. Extract every restaurant mentioned. For each one return a JSON array with objects containing: name, city, neighborhood, cuisine, price ($ to $$$$), description (one evocative sentence), tags (array of 3 strings). Return only valid JSON, no other text.";

  const unresolvedRestaurants = allRestaurants.filter(r => !photoResolved.includes(r.id));
  const resolvedRestaurants = allRestaurants.filter(r => photoResolved.includes(r.id));

  const rePickPhotosForAll = () => {
    setPickerMode("fix-photos");
    setPickerTab("unresolved");
    if (igImporting) return;
    const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
    if (!googleKey) { setIgError("Missing VITE_GOOGLE_PLACES_KEY."); setIgModal(true); return; }
    if (!allRestaurants.length) return;
    setIgError(null);
    setIgDone(false);
    setIgModal(true);
    const toFetch = allRestaurants.filter(r => !photoResolved.includes(r.id));
    // Open immediately with empty slots — LazyPhotoRow will trigger loads as user scrolls
    const emptyItems = toFetch.map(restaurant => ({
      restaurant, photoOptions: [], selectedIndex: -1, isRefreshing: false, refreshOffset: 0, userSelected: false
    }));
    setIgPhotoPicker(emptyItems);
    photoQueue.current = [];
    photoQueueRunning.current = false;
  };

  const processScreenshot = async (base64Data, mediaType) => {
    if (igImporting) return;
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      setIgError("Missing VITE_ANTHROPIC_API_KEY. Add it to your .env file.");
      return;
    }
    setIgError(null);
    setIgImporting(true);
    try {
      console.log("Starting Claude API call with image size:", base64Data?.length);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64Data } },
              { type: "text", text: ANTHROPIC_PROMPT },
            ],
          }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || res.statusText || "API request failed");
      }
      const data = await res.json();
      console.log("Claude API full response:", data);
      const text = data.content?.[0]?.text ?? "";
      let jsonStr = text.trim();
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      const parsed = JSON.parse(jsonStr);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
      const baseRestaurants = list.map((item, i) => {
        const name = item.name || "Unknown";
        const seed = encodeURIComponent(name) + "-" + i;
        return {
          id: Math.round(Date.now() + Math.random() * 10000 + i),
          name: name,
          city: item.city || "",
          neighborhood: item.neighborhood || "",
          cuisine: item.cuisine || "",
          price: item.price || "$$",
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 3) : ["Instagram Find"],
          img: `https://picsum.photos/seed/${seed}/800/600`,
          img2: `https://picsum.photos/seed/${seed}-2/400/400`,
          rating: 8.5,
          source: "Instagram",
          desc: item.description || item.desc || "",
          heat: "🔥🔥",
        };
      });

      if (googleKey) {
        const pickerItems = await Promise.all(baseRestaurants.map(async (restaurant) => {
          const photoOptions = [];
          try {
            const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": googleKey,
                "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
              },
              body: JSON.stringify({ textQuery: `${restaurant.name} ${restaurant.city}` }),
            });
            console.log("[Places API] searchText response status:", searchRes.status, searchRes.statusText, "for", restaurant.name);
            if (!searchRes.ok) {
              const errBody = await searchRes.text();
              console.error("[Places API] searchText error:", searchRes.status, errBody);
              return { restaurant, photoOptions: [], selectedIndex: 0, userSelected: false };
            }
            const searchData = await searchRes.json();
            const place = searchData.places?.[0];
            const photos = place?.photos?.slice(0, 12) || [];
            for (const photo of photos) {
              const photoName = photo.name;
              if (!photoName) continue;
              try {
                const mediaRes = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`, {
                  headers: { "X-Goog-Api-Key": googleKey },
                });
                if (!mediaRes.ok) continue;
                const mediaData = await mediaRes.json();
                if (mediaData.photoUri) photoOptions.push({ photoUri: mediaData.photoUri });
              } catch (mediaErr) {
                console.error("[Places API] getMedia error for", restaurant.name, photoName, mediaErr);
              }
            }
          } catch (placesErr) {
            console.error("[Places API] error for", restaurant.name, placesErr);
          }
          return { restaurant, photoOptions, selectedIndex: 0, isRefreshing: false, refreshOffset: 0, userSelected: false };
        }));
        console.log("[processScreenshot] Setting igPhotoPicker with", pickerItems.length, "items");
        setPickerMode("ig-import");
        setIgPhotoPicker(pickerItems);
      } else {
        console.log("[processScreenshot] No VITE_GOOGLE_PLACES_KEY — not setting igPhotoPicker, adding restaurants directly");
        let current = [];
        try { current = JSON.parse(localStorage.getItem("cooked_restaurants") || "[]"); } catch {}
        const existingIds = new Set(current.map((r) => r.id));
        const toAdd = baseRestaurants.filter((x) => !existingIds.has(x.id));
        setAllRestaurants((prev) => (toAdd.length ? [...toAdd, ...prev] : prev));
        if (toAdd.length) {
          addToCookedFinds(toAdd.map((x) => x.id));
          try { localStorage.setItem("cooked_restaurants", JSON.stringify([...toAdd, ...current])); } catch {}
        }
        setIgAddedRestaurants(baseRestaurants);
        setIgDone(true);
      }
    } catch (err) {
      setIgError(err.message || "Failed to process image.");
    } finally {
      setIgImporting(false);
    }
  };

  const MAX_BASE64_BYTES = 4 * 1024 * 1024;

  const compressImageToUnder4MB = (dataUrl) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        let scale = 1;
        let base64 = "";
        let w = origW;
        let h = origH;
        for (;;) {
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          base64 = canvas.toDataURL("image/jpeg", 0.85).replace(/^data:image\/\w+;base64,/, "");
          if (base64.length < MAX_BASE64_BYTES) break;
          scale *= 0.7;
          w = Math.max(1, Math.round(origW * scale));
          h = Math.max(1, Math.round(origH * scale));
          if (w <= 1 && h <= 1) break;
        }
        resolve({ base64, mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });

  const handleIgFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setIgError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result;
        const { base64, mediaType } = await compressImageToUnder4MB(dataUrl);
        processScreenshot(base64, mediaType);
      } catch (err) {
        setIgError(err?.message || "Failed to compress image.");
      }
    };
    reader.readAsDataURL(file);
  };

  const closeIgModal = () => {
    setIgModal(false);
    setIgUrl("");
    setIgDone(false);
    setIgImporting(false);
    setIgAddedRestaurants([]);
    setIgPhotoPicker([]);
    setIgError(null);
    setIgDragOver(false);
  };

  const enrichAllCurated = async () => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return;
    const toEnrich = allRestaurants.filter(r => r.source === 'Curated' && !r.cuisine);
    if (toEnrich.length === 0) { alert('All restaurants already enriched!'); return; }
    setEnriching(true);
    setEnrichProgress({ done: 0, total: toEnrich.length });

    const BATCH = 25;
    const TAGS = ["date night","group friendly","outdoor seating","rooftop","waterfront","late night","Michelin star","celebrity chef","brunch","happy hour","natural wine","craft cocktails","wine bar","great coffee","wood fire","vegan friendly","farm-to-table","comfort food","sharing plates","omakase","pasta","scene","cocktails","oceanfront","pizza","ramen","tacos","bakery","seafood","BBQ","sushi","hidden gem","innovative","special occasion","intimate","views","live music","speakeasy","tiki","dim sum","oysters","steakhouse","brewery","hotel bar"];

    for (let i = 0; i < toEnrich.length; i += BATCH) {
      const batch = toEnrich.slice(i, i + BATCH);
      const lines = batch.map(r => `${r.name} | ${r.city}${r.neighborhood ? ' | ' + r.neighborhood : ''}`).join('\n');
      const prompt = `Enrich these restaurants with accurate data. For each, return JSON with: cuisine (short type), tags (2-4 from this list only: ${TAGS.slice(0,20).join(', ')}...), desc (one punchy sentence max 12 words), price ($/$$/$$$/$$$$).\n\nRestaurants:\n${lines}\n\nRespond ONLY with a JSON array in same order. No markdown.`;
      
      try {
        const res = await fetch('/api/anthropic/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
        });
        const data = await res.json();
        let text = data.content?.[0]?.text?.trim() || '[]';
        if (text.includes('\`\`\`')) text = text.split('\`\`\`')[1].replace(/^json/, '').trim();
        const results = JSON.parse(text);
        setAllRestaurants(prev => prev.map(r => {
          const idx = batch.findIndex(b => b.id === r.id);
          if (idx === -1 || !results[idx]) return r;
          const en = results[idx];
          return { ...r,
            cuisine: en.cuisine || r.cuisine,
            tags: Array.isArray(en.tags) ? en.tags : r.tags,
            desc: en.desc || r.desc,
            price: en.price || r.price,
          };
        }));
        setEnrichProgress({ done: Math.min(i + BATCH, toEnrich.length), total: toEnrich.length });
      } catch(e) { console.warn('Enrich batch failed:', e); }
      await new Promise(r => setTimeout(r, 400));
    }
    setEnriching(false);
    setEnrichProgress({ done: 0, total: 0 });
  };

  const setPickerPhoto = (pickerIndex, photoIndex) => {
    setIgPhotoPicker(prev => prev.map((item, i) => i === pickerIndex ? { ...item, selectedIndex: photoIndex, userSelected: true } : item));
  };

  const confirmAddFromPicker = () => {
    const confirmedIds = igPhotoPicker
      .filter((item) => item.userSelected === true && item.photoOptions[item.selectedIndex]?.photoUri)
      .map((item) => item.restaurant.id);

    setAllRestaurants((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const toAdd = igPhotoPicker
        .filter((item) => !existingIds.has(item.restaurant.id))
        .map((item) => item.restaurant);
      const merged = [...toAdd, ...prev];
      const updated = merged.map((r) => {
        const match = igPhotoPicker.find((item) => item.restaurant.id === r.id);
        if (!match || !match.userSelected) return r;
        const chosen = match.photoOptions[match.selectedIndex]?.photoUri;
        if (!chosen) return r;
        return { ...r, img: chosen, img2: chosen };
      });
      return updated;
    });

    addToCookedFinds(confirmedIds);
    try {
      let current = [];
      try { current = JSON.parse(localStorage.getItem("cooked_restaurants") || "[]"); } catch {}
      const existingIds = new Set(current.map((r) => r.id));
      const toAdd = igPhotoPicker
        .filter((item) => !existingIds.has(item.restaurant.id))
        .map((item) => {
          const chosen = item.photoOptions[item.selectedIndex]?.photoUri;
          return { ...item.restaurant, img: chosen || item.restaurant.img, img2: chosen || item.restaurant.img2 };
        });
      const updatedCurrent = current.map((r) => {
        const match = igPhotoPicker.find((item) => item.restaurant.id === r.id);
        if (!match || !match.userSelected) return r;
        const chosen = match.photoOptions[match.selectedIndex]?.photoUri;
        if (!chosen) return r;
        return { ...r, img: chosen, img2: chosen };
      });
      localStorage.setItem("cooked_restaurants", JSON.stringify([...toAdd, ...updatedCurrent]));
    } catch {}
    setPhotoResolved((prev) => [...new Set([...prev, ...confirmedIds])]);
    // Write to permanent photo vault — this key is NEVER overwritten by merges or updates
    try {
      const vault = JSON.parse(localStorage.getItem("cooked_photos") || "{}");
      igPhotoPicker.forEach(item => {
        if (item.userSelected && item.photoOptions[item.selectedIndex]?.photoUri) {
          vault[item.restaurant.id] = item.photoOptions[item.selectedIndex].photoUri;
        }
      });
      localStorage.setItem("cooked_photos", JSON.stringify(vault));
    } catch {}
    const updated = igPhotoPicker
      .map(({ restaurant, photoOptions, selectedIndex }) => {
        const chosen = photoOptions[selectedIndex]?.photoUri;
        if (!chosen) return null;
        return { ...restaurant, img: chosen, img2: chosen };
      })
      .filter(Boolean);
    setIgAddedRestaurants(updated);
    setIgDone(true);
    setIgPhotoPicker([]);

    // Reload remaining unresolved as empty slots — lazy queue will fill them as user scrolls
    const newResolved = [...photoResolved, ...confirmedIds];
    const remaining = allRestaurants.filter(r => !newResolved.includes(r.id));
    if (remaining.length > 0 && pickerMode === "fix-photos") {
      const emptyItems = remaining.map(restaurant => ({
        restaurant, photoOptions: [], selectedIndex: -1, isRefreshing: false, refreshOffset: 0, userSelected: false
      }));
      setIgPhotoPicker(emptyItems);
      photoQueue.current = [];
      photoQueueRunning.current = false;
    }
  };

  const igPhotoPickerRef = useRef([]);
  // Keep ref in sync with state so queue can read it without stale closures
  useEffect(() => { igPhotoPickerRef.current = igPhotoPicker; }, [igPhotoPicker]);

  useEffect(() => {
    if (pickerMode !== "fix-photos" || !igModal) return;
    const timeoutId = setTimeout(() => {
      processPhotoQueue();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [igModal, pickerMode]);

  const processPhotoQueue = async () => {
    if (photoQueueRunning.current) return;
    photoQueueRunning.current = true;
    const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
    while (photoQueue.current.length > 0) {
      const { pickerIndex, restaurant } = photoQueue.current.shift();
      if (!restaurant) continue;
      // Mark as loading
      setIgPhotoPicker(prev => prev.map((item, i) => i === pickerIndex ? { ...item, isRefreshing: true } : item));
      const photoOptions = [];
      try {
        const normName = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
        const restNorm = normName(restaurant.name);
        const nameScore = (placeName) => {
          const pn = normName(placeName);
          if (pn === restNorm) return 5;
          if (pn.includes(restNorm) || restNorm.includes(pn)) return 4;
          const prefixLen = Math.min(restNorm.length, 7);
          if (prefixLen >= 4 && pn.startsWith(restNorm.slice(0, prefixLen))) return 3;
          const words = restNorm.match(/[a-z0-9]{3,}/g) || [];
          const matchedWords = words.filter(w => pn.includes(w));
          if (words.length > 0 && matchedWords.length === words.length) return 3;
          if (words.length > 1 && matchedWords.length >= words.length - 1) return 2;
          return 0;
        };
        const foodTypes = ['restaurant','bar','cafe','food','bakery','meal_takeaway','meal_delivery','night_club','lodging','hotel','hookah_bar','bar_and_grill'];

        let photos = [];

        // STEP 1: Geocode the restaurant by name + neighborhood + city to get precise coords
        try {
          const geoQuery = encodeURIComponent(`${restaurant.name} ${restaurant.neighborhood || ''} ${restaurant.city}`);
          const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${geoQuery}&key=${googleKey}`);
          const geoData = await geoRes.json();
          const loc = geoData.results?.[0]?.geometry?.location;
          if (loc) {
            // STEP 2: Nearby search at exact geocoded coordinates (200m radius)
            const nearbyBody = {
              textQuery: restaurant.name,
              locationBias: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 200.0 } }
            };
            const nearbyRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.types" },
              body: JSON.stringify(nearbyBody),
            });
            if (nearbyRes.ok) {
              const nearbyData = await nearbyRes.json();
              const nearbyPlaces = nearbyData.places || [];
              const scored = nearbyPlaces.map(p => {
                const ns = nameScore(p.displayName?.text || '');
                const isFoodVenue = (p.types || []).some(t => foodTypes.includes(t)) ? 1 : 0;
                return { place: p, score: ns * 2 + isFoodVenue };
              }).sort((a,b) => b.score - a.score);
              const best = scored[0];
              const pickerFoodTypes = ['restaurant','bar','cafe','food','bakery','meal_takeaway','meal_delivery','night_club','lodging','hotel','hookah_bar','bar_and_grill'];
              const pickerBestIsFood = (best?.place?.types || []).some(t => pickerFoodTypes.includes(t));
              if (best && nameScore(best.place?.displayName?.text || '') >= 2 && pickerBestIsFood) {
                photos = best.place?.photos?.slice(0, 16) || [];
              }
            }
          }
        } catch(geoErr) {}

        // STEP 3: Fallback — city-biased text search with strict name matching
        if (photos.length === 0) {
          const cityCoords = CITY_COORDS[restaurant.city];
          const fallbackAttempts = [
            { q: `${restaurant.name} ${restaurant.neighborhood || ''} ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 3 },
            { q: `${restaurant.name} ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 2 },
            { q: `${restaurant.name} restaurant ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 1 },
            { q: `${restaurant.name} ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 0 }, // last resort: take best food venue match
          ];
          for (const attempt of fallbackAttempts) {
            const body = { textQuery: attempt.q };
            if (cityCoords) body.locationBias = { circle: { center: { latitude: cityCoords.lat, longitude: cityCoords.lng }, radius: 30000.0 } };
            const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.types" },
              body: JSON.stringify(body),
            });
            if (!searchRes.ok) continue;
            const data = await searchRes.json();
            const scored = (data.places || []).map(p => {
              const ns = nameScore(p.displayName?.text || '');
              const isFoodVenue = (p.types || []).some(t => foodTypes.includes(t)) ? 1 : 0;
              return { place: p, score: ns * 2 + isFoodVenue };
            }).sort((a,b) => b.score - a.score);
            const pickerFoodTypesF = ['restaurant','bar','cafe','food','bakery','meal_takeaway','meal_delivery','night_club','lodging','hotel','hookah_bar','bar_and_grill'];
            const filteredScored = scored.filter(x => (x.place?.types||[]).some(t => pickerFoodTypesF.includes(t)));
            const best = filteredScored[0] || scored[0]; // prefer food venue, fallback to any
            const bestScore = nameScore(best?.place?.displayName?.text || '');
            const bestIsFood = (best?.place?.types||[]).some(t => pickerFoodTypesF.includes(t));
            if (!best) continue;
            if (bestScore < attempt.minScore) continue;
            if (!bestIsFood && bestScore < 3) continue; // non-food venues need strong name match
            photos = best.place?.photos?.slice(0, 16) || [];
            if (photos.length > 0) break;
          }
        }
        for (const photo of photos) {
          if (!photo.name) continue;
          try {
            const mediaRes = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=800&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": googleKey } });
            if (!mediaRes.ok) continue;
            const mediaData = await mediaRes.json();
            if (mediaData.photoUri) photoOptions.push({ photoUri: mediaData.photoUri });
          } catch {}
        }
      } catch {}
      setIgPhotoPicker(prev => prev.map((item, i) =>
        i === pickerIndex ? { ...item, isRefreshing: false, photoOptions, selectedIndex: photoOptions.length > 0 ? 0 : -1 } : item
      ));
      if (photoQueue.current.length > 0) await new Promise(r => setTimeout(r, 200));
    }
    photoQueueRunning.current = false;
  };

  const enqueuePhotoLoad = (pickerIndex, restaurant) => {
    if (photoQueue.current.some(e => e.pickerIndex === pickerIndex)) return;
    photoQueue.current.push({ pickerIndex, restaurant });
    processPhotoQueue();
  };

  const refreshPickerPhotosForOne = async (pickerIndex) => {
    const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
    if (!googleKey) {
      setIgError("Missing VITE_GOOGLE_PLACES_KEY. Add it to your .env file.");
      return;
    }
    const target = igPhotoPicker[pickerIndex];
    if (!target) return;
    const restaurant = target.restaurant;
    const currentOffset = target.refreshOffset || 0;
    try {
      // mark this picker item as refreshing
      setIgPhotoPicker(prev =>
        prev.map((item, i) =>
          i === pickerIndex ? { ...item, isRefreshing: true } : item
        )
      );
      const photoOptions = [];
      const normNameR = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
      const restNormR = normNameR(restaurant.name);
      const nameScoreR = (placeName) => {
        const pn = normNameR(placeName);
        if (pn === restNormR) return 5;
        if (pn.includes(restNormR) || restNormR.includes(pn)) return 4;
        const prefixLen = Math.min(restNormR.length, 7);
        if (prefixLen >= 4 && pn.startsWith(restNormR.slice(0, prefixLen))) return 3;
        const words = restNormR.match(/[a-z0-9]{3,}/g) || [];
        const matchedWords = words.filter(w => pn.includes(w));
        if (words.length > 0 && matchedWords.length === words.length) return 3;
        if (words.length > 1 && matchedWords.length >= words.length - 1) return 2;
        return 0;
      };
      const foodTypesR = ['restaurant','bar','cafe','food','bakery','meal_takeaway','meal_delivery','night_club','lodging','hotel','hookah_bar','bar_and_grill'];
      let allPhotos = [];
      // Step 1: geocode for precise location
      try {
        const geoQuery = encodeURIComponent(`${restaurant.name} ${restaurant.neighborhood || ''} ${restaurant.city}`);
        const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${geoQuery}&key=${googleKey}`);
        const geoData = await geoRes.json();
        const loc = geoData.results?.[0]?.geometry?.location;
        if (loc) {
          const nearbyRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.types" },
            body: JSON.stringify({ textQuery: restaurant.name, locationBias: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 200.0 } } }),
          });
          if (nearbyRes.ok) {
            const nearbyData = await nearbyRes.json();
            const scored = (nearbyData.places || []).map(p => ({ place: p, score: nameScoreR(p.displayName?.text || '') })).sort((a,b) => b.score - a.score);
            if (scored[0] && scored[0].score >= 2) allPhotos = scored[0].place?.photos || [];
          }
        }
      } catch {}
      // Step 2: fallback city-biased search
      if (!allPhotos.length) {
        const cityCoords = CITY_COORDS[restaurant.city];
        for (const attempt of [
          { q: `${restaurant.name} ${restaurant.neighborhood || ''} ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 4 },
          { q: `${restaurant.name} ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 3 },
          { q: `${restaurant.name} restaurant ${restaurant.city}`.replace(/\s+/g,' ').trim(), minScore: 2 },
        ]) {
          const body = { textQuery: attempt.q };
          if (cityCoords) body.locationBias = { circle: { center: { latitude: cityCoords.lat, longitude: cityCoords.lng }, radius: 30000.0 } };
          const sr = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.types" },
            body: JSON.stringify(body),
          });
          if (!sr.ok) continue;
          const sd = await sr.json();
          const scored = (sd.places || []).map(p => ({ place: p, score: nameScoreR(p.displayName?.text || '') * 2 + ((p.types||[]).some(t=>foodTypesR.includes(t))?1:0) })).sort((a,b)=>b.score-a.score);
          if (!scored[0] || nameScoreR(scored[0].place?.displayName?.text||'') < attempt.minScore) continue;
          allPhotos = scored[0].place?.photos || [];
          if (allPhotos.length) break;
        }
      }
      const photos = allPhotos.slice(currentOffset, currentOffset + 12);
      for (const photo of photos) {
        const photoName = photo.name;
        if (!photoName) continue;
        try {
          const mediaRes = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`, {
            headers: { "X-Goog-Api-Key": googleKey },
          });
          if (!mediaRes.ok) continue;
          const mediaData = await mediaRes.json();
          console.log("[RePick] mediaRes status:", mediaRes.status, "photoUri:", mediaData.photoUri);
          if (mediaData.photoUri) photoOptions.push({ photoUri: mediaData.photoUri });
        } catch (mediaErr) {
          console.error("[RePick Refresh] getMedia error for", restaurant.name, photoName, mediaErr);
        }
      }
      console.log("[RePick] photoOptions built:", photoOptions.length);
      if (!photoOptions.length) return;
      setIgPhotoPicker(prev => {
        const total = allPhotos.length || 0;
        const step = 12;
        const nextOffset = total > 0 ? (currentOffset + step) % Math.max(total, step) : 0;
        const updated = prev.map((item, i) =>
          i === pickerIndex ? { ...item, photoOptions, selectedIndex: 0, userSelected: false, isRefreshing: false, refreshOffset: nextOffset } : item
        );
        console.log("[RePick] updated picker item", pickerIndex, "photoOptions:", updated[pickerIndex]?.photoOptions?.length);
        return updated;
      });
    } catch (err) {
      console.error("[RePick Refresh] error for", restaurant.name, err);
      setIgPhotoPicker(prev =>
        prev.map((item, i) =>
          i === pickerIndex ? { ...item, isRefreshing: false } : item
        )
      );
    }
  };

  return (
    <div style={{ width:"100%", minHeight:"100vh", background:"#1e1208", fontFamily:"'DM Sans',sans-serif" }}>
    <div style={{ maxWidth:480, margin:"0 auto", minHeight:"100vh", background:C.cream, paddingBottom:90, position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .city-row::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Main content (header + tabs): explicit low stacking so detail overlay always wins */}
      <div style={{ position:"relative", zIndex:10 }}>
      {/* Header */}
      <div style={{ background:C.cream, position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, zIndex:50, borderBottom:`1px solid ${C.border}`, padding:"16px 20px 0" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:700, fontStyle:"italic", color:C.text }}>cook<span style={{color:C.terracotta}}>ed</span></div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>

            <button onClick={rePickPhotosForAll} title={`Fix photos${unresolvedRestaurants.length > 0 ? ` (${unresolvedRestaurants.length} unresolved)` : ""}`}
              style={{ width:32, height:32, borderRadius:"50%", border:`1px solid ${C.border}`, background:C.card, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              🖼
            </button>
            <button onClick={()=>{ setIgError(null); setIgAddedRestaurants([]); setIgDone(false); setIgImporting(false); setPickerMode("ig-import"); setIgModal(true); }}
              title="Add from Instagram"
              style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", border:"none", fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              📸
            </button>
          </div>
        </div>
        {(tab === "discover" || tab === "map") && (
          <div style={{ position:"relative", marginBottom:12 }}>
            <button onClick={() => setCityPickerOpen(v => !v)} style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", padding:0, outline:"none" }}>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, fontWeight:700, color:C.espresso, fontStyle:"italic" }}>{city === "All" ? "All Cities" : city}</span>
              <span style={{ fontSize:11, color:C.muted, marginTop:1 }}>{cityPickerOpen ? "▴" : "▾"}</span>
            </button>
            {cityPickerOpen && (
              <div style={{ position:"absolute", top:"calc(100% + 8px)", left:-12, zIndex:600, background:"#fffdf9", borderRadius:14, boxShadow:"0 12px 40px rgba(30,18,8,0.14), 0 2px 8px rgba(30,18,8,0.06)", border:`1px solid rgba(196,96,58,0.12)`, width:188, maxHeight:340, overflowY:"auto", scrollbarWidth:"none", padding:"6px 0 8px" }} onClick={e => e.stopPropagation()}>
                {[
                  { label:"", cities:["All"] },
                  { label:"North America", cities:["Los Angeles","New York","Chicago","San Francisco","Miami","Austin","Nashville","Dallas","San Diego","Portland","Mexico City"] },
                  { label:"Europe", cities:["London","Paris","Barcelona","Copenhagen","Lisbon","Malta"] },
                  { label:"Asia", cities:["Tokyo","Seoul","Dubai"] },
                ].map((group, gi) => (
                  <div key={gi}>
                    {group.label ? <div style={{ padding: gi===1 ? "8px 16px 4px" : "10px 16px 4px", fontFamily:"'DM Mono',monospace", fontSize:8, color:"rgba(30,18,8,0.35)", letterSpacing:"1.8px", textTransform:"uppercase", borderTop: gi===1 ? `1px solid rgba(30,18,8,0.07)` : "none" }}>{group.label}</div> : null}
                    {group.cities.map(c => (
                      <button key={c} onClick={() => { setCity(c); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                        style={{ width:"100%", padding:"8px 16px", textAlign:"left", background: city===c ? `rgba(196,96,58,0.08)` : "transparent", border:"none", color: city===c ? C.terracotta : "#1e1208", fontSize:14, fontFamily:"'DM Sans',sans-serif", fontWeight: city===c ? 600 : 400, cursor:"pointer", letterSpacing:"-0.1px", lineHeight:1.3 }}>
                        {c === "All" ? "All Cities" : c}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spacer for fixed header */}
      <div style={{ height: 110 }} />

      {/* Discover Tab */}
          {tab === "discover" && (
        <>
          {/* Tier 1: venue type pills */}
          <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"10px 16px 4px", scrollbarWidth:"none" }} className="city-row">
            {[
              { id: "all", label: "All" },
              { id: "restaurants", label: "Restaurants" },
              { id: "bars", label: "Bars & Nightlife" },
              { id: "coffee", label: "Coffee & Cafes" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setVenueType(id);
                  setSecondaryCuisine(null);
                }}
                style={{
                  flexShrink:0, padding:"5px 12px", borderRadius:16,
                  border:`1.5px solid ${venueType === id ? C.terracotta : C.border}`,
                  background: venueType === id ? C.terracotta : "transparent",
                  color: venueType === id ? "#fff" : C.muted,
                  fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.3px",
                  transition:"all 0.15s"
                }}
              >{label}</button>
            ))}
          </div>

          {/* Tier 2: cuisine/bar-type dropdown (only when Restaurants or Bars selected) */}
          {(venueType === "restaurants" || venueType === "bars") && (
            <div style={{ padding:"0 16px 8px", width:"100%", boxSizing:"border-box" }}>
              <select
                value={secondaryCuisine || ""}
                onChange={(e) => setSecondaryCuisine(e.target.value || null)}
                onFocus={(e) => e.target.style.borderColor = C.terracotta}
                onBlur={(e) => e.target.style.borderColor = C.border}
                style={{
                  width:"100%", boxSizing:"border-box",
                  padding:"8px 32px 8px 12px",
                  borderRadius:10,
                  border:`1px solid ${C.border}`,
                  background:C.cream,
                  color:C.text,
                  fontFamily:"'DM Sans',sans-serif",
                  fontSize:12,
                  cursor:"pointer",
                  outline:"none",
                  appearance:"none",
                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238a7060' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat:"no-repeat",
                  backgroundPosition:"right 12px center",
                  transition:"border-color 0.2s",
                }}
              >
                <option value="">{venueType === "restaurants" ? "All Cuisines ▾" : "All Bar Types ▾"}</option>
                {cuisineDropdownCategories.map(cat => (
                  <option key={cat.label} value={cat.label}>{cat.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Search bar — small, under cuisine */}
          <div style={{ margin:"6px 16px 8px", position:"relative" }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:C.muted, pointerEvents:"none" }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, neighborhood, vibe..."
              style={{
                width:"100%", boxSizing:"border-box",
                padding:"7px 28px 7px 26px",
                borderRadius:10, border:`1px solid ${searchQuery ? C.terracotta : C.border}`,
                background:C.warm, fontSize:12, color:C.text,
                fontFamily:"'DM Sans',sans-serif",
                outline:"none", transition:"border-color 0.2s",
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{
                position:"absolute", right:9, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:15, lineHeight:1, padding:2
              }}>×</button>
            )}
          </div>

          {(() => {
            const lovedIds = heatResults.loved || [];
            const nopedIds = heatResults.noped || [];
            const findsSet = new Set([...findsIds.map((id) => Number(id)), ...findsIds]);
            const inCity = (r) => city === "All" || r.city === city;
            const heatScore = (r) => (r.heat || "").match(/🔥/g)?.length ?? 0;
            const ratingNum = (r) => parseFloat(r.rating) || 0;
            const sortByHeatThenRating = (a, b) => {
              const ha = heatScore(a);
              const hb = heatScore(b);
              if (ha !== hb) return hb - ha;
              return ratingNum(b) - ratingNum(a);
            };
            let pool = [];
            if (lovedIds.length === 0) {
              pool = allRestaurants.filter(inCity).filter((r) => r?.name).sort((a, b) => ratingNum(b) - ratingNum(a));
            } else {
              pool = allRestaurants
                .filter(inCity)
                .filter((r) => !lovedIds.includes(r.id) && !nopedIds.includes(r.id) && !findsSet.has(r.id) && !findsSet.has(Number(r.id)) && r?.name)
                .sort(sortByHeatThenRating);
            }
            const top20 = pool.slice(0, 20);
            const daySeed = Math.floor(Date.now() / 86400000);
            const recommendation = top20.length ? top20[daySeed % top20.length] : null;
            if (!recommendation) return null;
            const place = recommendation.neighborhood || recommendation.city || "";
            const bannerImg = recommendation.img && !String(recommendation.img).includes("picsum") ? recommendation.img : `https://picsum.photos/seed/${encodeURIComponent(recommendation.name)}/800/600`;
            return (
              <div>
              <button
                type="button"
                onClick={() => setDetailRestaurant(recommendation)}
                style={{ margin:"12px 16px 0", borderRadius:18, overflow:"hidden", position:"relative", minHeight:90, display:"block", width:"calc(100% - 32px)", border:"none", padding:0, background:"none", textAlign:"left", cursor:"pointer" }}
              >
                <img src={bannerImg} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", filter:"brightness(0.3)" }} alt="" />
                <div style={{ position:"relative", zIndex:1, padding:"18px" }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:"2px", marginBottom:7 }}>⚡ COOKED FOR YOU</div>
                  <div style={{ fontSize:14, color:"#fff", lineHeight:1.55 }}>
                    Based on your taste profile, try <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontStyle:"italic", color:C.terra2 }}>{recommendation.name}</span>
                    {place ? ` in ${place}` : ""} tonight.
                  </div>
                </div>
              </button>
              </div>
            );
          })()}
          <div style={{ padding:"16px 20px 10px", display:"flex", alignItems:"baseline", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:700, fontStyle:"italic" }}>
              {searchQuery ? `"${searchQuery}"` : secondaryCuisine ? `${secondaryCuisine} in ${city}` : venueType !== "all" ? (venueType === "restaurants" ? "Restaurants" : venueType === "bars" ? "Bars & Nightlife" : "Coffee & Cafes") + ` in ${city}` : `Hot in ${city}`}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.muted }}>{filteredSorted.length} spots</div>
              <button type="button" onClick={()=>setTab("map")} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 10px", borderRadius:18, border:`1px solid ${C.border}`, background:C.card, color:C.text, fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.5px" }}>🗺 Map</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"0 16px 14px", scrollbarWidth:"none", marginBottom:4 }} className="city-row">
            {ALL_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveFilter(prev => prev === tag ? null : tag)}
                style={{
                  flexShrink:0, padding:"6px 12px", borderRadius:16, border:`1.5px solid ${activeFilter === tag ? C.terracotta : C.border}`,
                  background: activeFilter === tag ? `${C.terracotta}18` : C.card, color: activeFilter === tag ? C.terracotta : C.muted,
                  fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.3px"
                }}
              >
                {tag}
              </button>
            ))}
          </div>
          {filteredSorted.map((r, index) => (
            <RestCard
              key={`rest-${r.id}-${index}`}
              r={r}
              loved={heatResults.loved.includes(r.id)}
              watched={watchlist.includes(r.id)}
              onLove={() => toggleLove(r.id)}
              onWatch={()=>toggleWatch(r.id)}
              onShare={share}
              onOpenDetail={setDetailRestaurant}
              onPhotoFetched={fetchAndCachePhoto}
            />
          ))}
          {filteredSorted.length === 0 && <div style={{ textAlign:"center", padding:"48px 20px", color:C.muted }}><div style={{ fontSize:40, marginBottom:10 }}>🍽️</div><div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontStyle:"italic" }}>No spots yet for this city.</div></div>}
        </>
      )}

      {/* Heat Tab */}
      {tab === "heat" && (() => {
        const card = heatDeck[0];
        const nextCard = heatDeck[1];
        const rotation = swipeDelta.x / 12;
        const opacity = Math.max(0, 1 - Math.abs(swipeDelta.x) / 300);
        const isLove = swipeDelta.x > 40;
        const isNope = swipeDelta.x < -40;

        const doSwipe = (dir) => {
          const r = heatDeck[0];
          if (!r) return;
          heatSwipeHandledRef.current = true;
          setSwipeDir(dir);
          setTimeout(() => {
            try {
              if (dir === 'up') {
                setHeatResults(prev => ({
                  ...prev,
                  skipped: [...prev.skipped.filter(id => id !== r.id), r.id],
                }));
              } else {
                setHeatResults(prev => {
                  const next = {
                    ...prev,
                    loved: dir === 'right' ? [...prev.loved, r.id] : prev.loved.filter(id => id !== r.id),
                    noped: dir === 'left' ? [...prev.noped, r.id] : prev.noped.filter(id => id !== r.id),
                    skipped: prev.skipped.filter(id => id !== r.id),
                  };
                  const prevVotes = next.votes || {};
                  const cur = prevVotes[r.id] || { up: 0, down: 0 };
                  return {
                    ...next,
                    votes: {
                      ...prevVotes,
                      [r.id]: {
                        up: cur.up + (dir === 'right' ? 1 : 0),
                        down: cur.down + (dir === 'left' ? 1 : 0),
                      },
                    },
                  };
                });
                if (dir === 'right') setSaved(prev => prev.includes(r.id) ? prev : [...prev, r.id]);
              }
            } finally {
              setSwipeDelta({ x: 0, y: 0 });
              setSwipeDir(null);
              setIsDragging(false);
              heatSwipeHandledRef.current = false;
            }
          }, 260);
        };

        const endGesture = () => {
          if (!dragStart.current) return;
          const { x, y } = swipeDeltaRef.current;
          dragStart.current = null;
          if (y < -60 && Math.abs(x) < 80) doSwipe('up');
          else if (x > 80) doSwipe('right');
          else if (x < -80) doSwipe('left');
          else {
            setSwipeDelta({ x: 0, y: 0 });
            setSwipeDir(null);
            setIsDragging(false);
          }
        };

        const handlePointerDown = (e) => {
          const x = e.clientX ?? e.touches?.[0]?.clientX;
          const y = e.clientY ?? e.touches?.[0]?.clientY;
          dragStart.current = { x, y };
          swipeDeltaRef.current = { x: 0, y: 0 };
          setIsDragging(true);
          if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
          const onEnd = () => {
            document.removeEventListener("mouseup", onEnd);
            document.removeEventListener("touchend", onEnd, { capture: true });
            document.removeEventListener("pointerup", onEnd);
            document.removeEventListener("pointercancel", onEnd);
            endGesture();
          };
          document.addEventListener("mouseup", onEnd, { once: true });
          document.addEventListener("touchend", onEnd, { once: true, capture: true });
          document.addEventListener("pointerup", onEnd, { once: true });
          document.addEventListener("pointercancel", onEnd, { once: true });
        };
        const handlePointerMove = (e) => {
          if (!dragStart.current) return;
          if (e.cancelable) e.preventDefault();
          const cx = e.clientX ?? e.touches?.[0]?.clientX;
          const cy = e.clientY ?? e.touches?.[0]?.clientY;
          const delta = { x: cx - dragStart.current.x, y: cy - dragStart.current.y };
          swipeDeltaRef.current = delta;
          setSwipeDelta({ ...delta });
        };
        const handlePointerUp = endGesture;
        const handlePointerCancel = endGesture;

        const exitX = swipeDir === 'right' ? 600 : swipeDir === 'left' ? -600 : swipeDelta.x;
        const exitY = swipeDir === 'up' ? -700 : 0;
        const cardTransform = swipeDir
          ? `translateX(${exitX}px) translateY(${exitY}px) rotate(${exitX / 12}deg)`
          : `translateX(${swipeDelta.x}px) translateY(${swipeDelta.y * 0.3}px) rotate(${rotation}deg)`;

        return (
          <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, bottom:70, display:"flex", flexDirection:"column", background:C.cream, zIndex:2, userSelect:"none" }}>
            {/* Header */}
            <div style={{ padding:"16px 20px 4px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:700, fontStyle:"italic" }}>🔥 Heat</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.muted }}>{heatDeck.length} left</div>
                {(heatResults.loved.length > 0 || heatResults.noped.length > 0 || heatResults.skipped.length > 0) && (
                  <button onClick={() => setHeatResults({ loved: [], noped: [], skipped: [], votes: {} })} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.muted, background:"none", border:`1px solid ${C.border}`, borderRadius:12, padding:"4px 10px", cursor:"pointer" }}>Reset</button>
                )}
              </div>
            </div>
            {/* City filter */}
            <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"6px 16px 8px", scrollbarWidth:"none" }}>
              {["All", ...CITIES].map(c => (
                <button key={c} type="button" onClick={() => setHeatCity(c)} style={{ flexShrink:0, padding:"5px 12px", borderRadius:16, border:`1.5px solid ${heatCity===c ? C.terracotta : C.border}`, background: heatCity===c ? C.terracotta : "transparent", color: heatCity===c ? "#fff" : C.muted, fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.3px", transition:"all 0.15s" }}>{c}</button>
              ))}
            </div>


            {/* Card stack area */}
            <div style={{ flex:1, position:"relative", margin:"0 16px", overflow:"hidden" }}>
              {/* Empty state */}
              {heatDeck.length === 0 && (
                <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
                  <div style={{ fontSize:48 }}>🎉</div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontStyle:"italic", color:C.text }}>You've been through it all</div>
                  <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:C.muted }}>
                    {heatResults.loved.length} 🔥 loved · {heatResults.noped.length} passed
                  </div>
                  <button onClick={() => setHeatResults({ loved: [], noped: [], skipped: [], votes: {} })} style={{ marginTop:8, padding:"12px 28px", borderRadius:12, background:C.terracotta, color:"#fff", border:"none", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Start over</button>
                  {heatResults.loved.length > 0 && (
                    <button onClick={() => { setTab("lists"); }} style={{ padding:"10px 24px", borderRadius:12, background:"transparent", color:C.terracotta, border:`1.5px solid ${C.terracotta}`, fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>See your loved spots →</button>
                  )}
                </div>
              )}

              {/* Next card (behind) */}
              {nextCard && (
                <div style={{ position:"absolute", inset:0, borderRadius:20, overflow:"hidden", transform:"scale(0.95) translateY(8px)", transition:"transform 0.2s", boxShadow:"0 4px 20px rgba(30,18,8,0.12)" }}>
                  <img src={nextCard.img} alt={nextCard.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 35%, rgba(30,18,8,0.85) 100%)" }} />
                </div>
              )}

              {/* Current card */}
              {card && (
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  style={{
                    position:"absolute", inset:0, borderRadius:20, overflow:"hidden", cursor:isDragging ? "grabbing" : "grab",
                    transform: cardTransform,
                    transition: swipeDir ? "transform 0.26s ease-out" : isDragging ? "none" : "transform 0.3s ease",
                    boxShadow:"0 8px 40px rgba(30,18,8,0.2)",
                    touchAction:"none",
                  }}
                  onClick={() => {
                    if (heatSwipeHandledRef.current) {
                      heatSwipeHandledRef.current = false;
                      return;
                    }
                    if (Math.abs(swipeDelta.x) < 5 && Math.abs(swipeDelta.y) < 5) setDetailRestaurant(card);
                  }}
                >
                  <img src={card.img} alt={card.name} style={{ width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }} />
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 35%, rgba(30,18,8,0.88) 100%)", pointerEvents:"none" }} />

                  {/* LOVE stamp */}
                  <div style={{ position:"absolute", top:32, left:24, padding:"8px 18px", borderRadius:8, border:"3px solid #4ade80", color:"#4ade80", fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, letterSpacing:"3px", transform:"rotate(-18deg)", opacity: Math.min(1, Math.max(0, swipeDelta.x - 20) / 60), transition:"opacity 0.05s", pointerEvents:"none" }}>🔥 HEAT</div>

                  {/* NOPE stamp */}
                  <div style={{ position:"absolute", top:32, right:24, padding:"8px 18px", borderRadius:8, border:"3px solid #f87171", color:"#f87171", fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, letterSpacing:"3px", transform:"rotate(18deg)", opacity: Math.min(1, Math.max(0, -swipeDelta.x - 20) / 60), transition:"opacity 0.05s", pointerEvents:"none" }}>PASS</div>
                  {/* HAVEN'T BEEN stamp */}
                  <div style={{ position:"absolute", top:"40%", left:"50%", transform:"translateX(-50%) rotate(-5deg)", padding:"8px 18px", borderRadius:8, border:"3px solid #facc15", color:"#facc15", fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, letterSpacing:"3px", opacity: Math.min(1, Math.max(0, -swipeDelta.y - 40) / 60), transition:"opacity 0.05s", pointerEvents:"none" }}>HAVEN'T BEEN 👀</div>

                  {/* Card info */}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"20px 20px 24px", pointerEvents:"none" }}>
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:700, color:"#fff", marginBottom:4 }}>{card.name}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"rgba(255,255,255,0.7)", marginBottom:10 }}>{card.cuisine} · {card.neighborhood} · {card.price}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:"rgba(255,255,255,0.85)", lineHeight:1.5, marginBottom:12 }}>{card.desc}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {(card.tags || []).slice(0,3).map(t => (
                        <span key={t} style={{ padding:"4px 10px", borderRadius:12, background:"rgba(255,255,255,0.15)", backdropFilter:"blur(4px)", color:"rgba(255,255,255,0.9)", fontSize:10, fontFamily:"'DM Mono',monospace", isolation:"isolate" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {card && (
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:24, padding:"16px 20px 12px" }}>
                <button onClick={() => doSwipe('left')} style={{ width:60, height:60, borderRadius:"50%", border:`2px solid #f87171`, background:"#fff", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(248,113,113,0.2)", transition:"transform 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.transform="scale(1.1)"} onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}>✕</button>
                <button onClick={() => setDetailRestaurant(card)} style={{ width:48, height:48, borderRadius:"50%", border:`2px solid ${C.border}`, background:"#fff", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>ℹ</button>
                <button onClick={() => doSwipe('right')} style={{ width:60, height:60, borderRadius:"50%", border:`2px solid #4ade80`, background:"#fff", fontSize:24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(74,222,128,0.2)", transition:"transform 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.transform="scale(1.1)"} onMouseLeave={e => e.currentTarget.style.transform="scale(1)"}> 🔥</button>
              </div>
            )}

            {/* Swipe hint */}
            {heatDeck.length > 0 && heatResults.loved.length === 0 && heatResults.noped.length === 0 && (
              <div style={{ textAlign:"center", paddingBottom:8, fontFamily:"'DM Mono',monospace", fontSize:10, color:C.muted, letterSpacing:"1px" }}>← PASS · SWIPE UP = HAVEN'T BEEN · HEAT 🔥 →</div>
            )}
          </div>
        );
      })()}

      {/* Map Tab */}
      {tab === "map" && (
        <div style={{ position:"fixed", top:130, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, bottom:70, zIndex:1 }}>
          <div ref={mapRef} style={{ width:"100%", height:"100%" }} />
          {selectedRest && (
            <div style={{ position:"absolute", bottom:16, left:16, right:16, background:"#fff9f2", borderRadius:20, overflow:"hidden", boxShadow:"0 8px 40px rgba(30,18,8,0.25)", border:"1px solid #ddd0bc" }} onClick={() => setSelectedRest(null)}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRest(null); }} style={{ position:"absolute", top:10, right:10, zIndex:10, width:32, height:32, borderRadius:"50%", border:"none", background:"rgba(30,18,8,0.5)", backdropFilter:"blur(4px)", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, isolation:"isolate" }}>✕</button>
              <div style={{ position:"relative", height:140, overflow:"hidden" }}>
                <img src={selectedRest.img} alt={selectedRest.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 40%, rgba(30,18,8,0.7) 100%)" }} />
                <div style={{ position:"absolute", bottom:10, left:14, right:14, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, color:"#fff" }}>{selectedRest.name}</div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:700, fontStyle:"italic", color:"#fff" }}>{selectedRest.rating}</div>
                </div>
              </div>
              <div style={{ padding:"12px 16px" }}>
                <div style={{ fontSize:11, color:"#8a7060", fontFamily:"'DM Mono',monospace", marginBottom:10 }}>{selectedRest.cuisine} · {selectedRest.neighborhood} · {selectedRest.price}</div>
                <p style={{ fontSize:12, color:"#4a3320", lineHeight:1.5, marginBottom:12 }}>{selectedRest.desc}</p>
                <div style={{ display:"flex", gap:8 }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => toggleLove(selectedRest.id)} style={{ flex:1, padding:"9px 4px", borderRadius:10, border:`1.5px solid ${heatResults.loved.includes(selectedRest.id) ? "#c4603a" : "#ddd0bc"}`, background: heatResults.loved.includes(selectedRest.id) ? "#c4603a18" : "transparent", color: heatResults.loved.includes(selectedRest.id) ? "#c4603a" : "#8a7060", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>{heatResults.loved.includes(selectedRest.id) ? "Loved It ♥" : "Love It ♡"}</button>
                  <button type="button" onClick={() => toggleWatch(selectedRest.id)} style={{ flex:1, padding:"9px 4px", borderRadius:10, border:`1.5px solid ${watchlist.includes(selectedRest.id) ? "#6b9fff" : "#ddd0bc"}`, background: watchlist.includes(selectedRest.id) ? "#6b9fff18" : "transparent", color: watchlist.includes(selectedRest.id) ? "#6b9fff" : "#8a7060", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>{watchlist.includes(selectedRest.id) ? "On Target 🎯" : "Target List"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lists Tab */}
      {tab === "lists" && (
        <div style={{ padding:"0 0 20px" }}>
          {[{title:"Finds", list:findsList, emoji:"🔍"},{title:"Loved It", list:lovedList, emoji:"♥"},{title:"Target List", list:watchList, emoji:"🎯"}].map(({title,list,emoji}) => (
            <div key={title}>
              <div style={{ padding:"22px 20px 10px", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, fontStyle:"italic", color:"#1e1208" }}>{emoji} {title}</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.muted }}>{list.length}</div>
              </div>
              {list.length === 0 && <div style={{ padding:"0 20px 16px", fontSize:13, color:C.muted, fontStyle:"italic" }}>Nothing here yet.</div>}
              {list.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDetailRestaurant(r)}
                  style={{
                    margin:"0 16px 10px",
                    borderRadius:14,
                    overflow:"hidden",
                    background:C.card,
                    border:`1px solid ${C.border}`,
                    display:"flex",
                    alignItems:"center",
                    width:"calc(100% - 32px)",
                    padding:0,
                    cursor:"pointer"
                  }}
                >
                  <img src={r.img} style={{ width:84, height:84, objectFit:"cover", flexShrink:0 }} alt={r.name} />
                  <div style={{ padding:"10px 14px", flex:1, textAlign:"left" }}>
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, fontWeight:700, color:"#1e1208" }}>{r.name}</div>
                    <div style={{ fontSize:11, color:C.muted, fontFamily:"'DM Mono',monospace", marginTop:2 }}>{r.cuisine} · {r.city}</div>
                  </div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:700, color:C.terracotta, paddingRight:14 }}>{r.rating}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Ask Tab */}
      {tab === "ask" && <ChatBot onClose={() => setTab("discover")} />}

      {/* Profile Tab */}
      {tab === "profile" && (
        <Profile tasteProfile={tasteProfile} allRestaurants={allRestaurants} heatResults={heatResults} watchlist={watchlist} />
      )}

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"rgba(250,246,240,0.95)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.border}`, display:"flex", padding:"10px 0 20px", zIndex:100, isolation:"isolate" }}>
        {[
          {id:"discover", icon:"🔍", label:"DISCOVER"},
          {id:"heat",     icon:"🔥", label:"HEAT"},
          {id:"lists",    icon:"♥",  label:"LISTS"},
          {id:"map",      icon:"🗺", label:"MAP"},
        ].map(t => (
          <div key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", padding:4 }}>
            <span style={{ fontSize:20, transform: tab===t.id ? "scale(1.15)" : "scale(1)", transition:"transform 0.2s" }}>{t.icon}</span>
            <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:"1px", color: tab===t.id ? C.terracotta : C.muted }}>{t.label}</span>
          </div>
        ))}
        <div onClick={() => setShowChat(true)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", padding:4 }}>
          <span style={{ fontSize:20 }}>🍽</span>
          <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:"1px", color: C.muted }}>ASK</span>
        </div>
        <div onClick={() => setTab("profile")} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", padding:4 }}>
          <span style={{ fontSize:20, transform: tab==="profile" ? "scale(1.15)" : "scale(1)", transition:"transform 0.2s" }}>◈</span>
          <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:"1px", color: tab==="profile" ? C.terracotta : C.muted }}>PROFILE</span>
        </div>
      </div>

      {/* ChatBot */}
      {showChat && <ChatBot onClose={() => setShowChat(false)} />}

      {/* IG Modal */}
      {igModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(30,18,8,0.7)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={closeIgModal}>
          <div style={{ width:"100%", maxWidth:480, background:C.cream, borderRadius:"24px 24px 0 0", borderTop:`1px solid ${C.border}`, padding:"28px 24px 44px", maxHeight:"85vh", overflowY:"auto", zIndex:301 }} onClick={e=>e.stopPropagation()}>
            {pickerMode === "fix-photos" ? (
              <div style={{ padding:"8px 0" }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, marginBottom:16, color:C.text }}>Fix photos</div>
                <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
                  <button type="button" onClick={() => setPickerTab("unresolved")} style={{ flex:1, padding:"10px 12px", fontSize:12, fontFamily:"'DM Mono',monospace", border:"none", borderBottom:`2px solid ${pickerTab === "unresolved" ? C.terracotta : "transparent"}`, background:"transparent", color: pickerTab === "unresolved" ? C.terracotta : C.muted, cursor:"pointer" }}>Unresolved ({unresolvedRestaurants.length})</button>
                  <button type="button" onClick={() => setPickerTab("resolved")} style={{ flex:1, padding:"10px 12px", fontSize:12, fontFamily:"'DM Mono',monospace", border:"none", borderBottom:`2px solid ${pickerTab === "resolved" ? C.terracotta : "transparent"}`, background:"transparent", color: pickerTab === "resolved" ? C.terracotta : C.muted, cursor:"pointer" }}>Resolved ({resolvedRestaurants.length})</button>
                </div>
                {pickerTab === "unresolved" ? (
                  unresolvedRestaurants.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"40px 20px" }}>
                      <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
                      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:700, color:C.terracotta }}>All photos resolved!</div>
                      <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>Every restaurant has a photo selected.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>Tap a photo to select it, then confirm. Photos load as you scroll.</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:20, marginBottom:24, maxHeight:"45vh", overflowY:"auto" }}>
                        {unresolvedRestaurants.map((r, index) => {
                          const pickerItem = igPhotoPicker.find(p => p.restaurant.id === r.id) || { restaurant: r, photoOptions: [], selectedIndex: -1, isRefreshing: false, refreshOffset: 0, userSelected: false };
                          const pickerIndex = igPhotoPicker.findIndex(p => p.restaurant.id === r.id);
                          const effectiveIndex = pickerIndex >= 0 ? pickerIndex : index;
                          return (
                            <LazyPhotoRow
                              key={r.id}
                              item={pickerItem}
                              pickerIndex={effectiveIndex}
                              onLoad={enqueuePhotoLoad}
                              onSelect={setPickerPhoto}
                              onRefresh={refreshPickerPhotosForOne}
                              C={C}
                            />
                          );
                        })}
                      </div>
                      <button type="button" onClick={confirmAddFromPicker} disabled={igPhotoPicker.filter(item => item.userSelected).length === 0} style={{ width:"100%", padding:14, border:"none", borderRadius:12, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, fontFamily:"'DM Sans',sans-serif", opacity: igPhotoPicker.filter(item => item.userSelected).length === 0 ? 0.4 : 1, cursor: igPhotoPicker.filter(item => item.userSelected).length === 0 ? "not-allowed" : "pointer" }}>Confirm {igPhotoPicker.filter(item => item.userSelected).length} photo{igPhotoPicker.filter(item => item.userSelected).length !== 1 ? "s" : ""}</button>
                    </>
                  )
                ) : (
                  <div style={{ maxHeight:"50vh", overflowY:"auto" }}>
                    {resolvedRestaurants.length === 0 ? (
                      <div style={{ padding:20, color:C.muted, fontSize:13 }}>No resolved photos yet.</div>
                    ) : (
                      resolvedRestaurants.map(r => (
                        <div key={r.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
                          <div style={{ position:"relative", flexShrink:0 }}>
                            <img src={r.img} alt="" style={{ width:56, height:56, borderRadius:10, objectFit:"cover" }} />
                            <span style={{ position:"absolute", bottom:-4, right:-4, width:20, height:20, borderRadius:50, background:C.sage, color:"#fff", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>✓</span>
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, fontWeight:700, color:C.text }}>{r.name}</div>
                            <div style={{ fontSize:11, color:C.muted }}>{r.cuisine} · {r.city}</div>
                          </div>
                          <button type="button" onClick={() => setPhotoResolved(prev => prev.filter(id => id !== r.id))} style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"6px 12px", background:C.card, color:C.muted, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Re-pick</button>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <button onClick={closeIgModal} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, color:C.muted, marginTop:16, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>Close</button>
              </div>
            ) : igPhotoPicker.length > 0 ? (
              <div style={{ padding:"8px 0" }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, marginBottom:6, color:C.text }}>Choose a photo for each</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.5 }}>Tap a photo to select it, then add all.</div>
                <div style={{ display:"flex", flexDirection:"column", gap:20, marginBottom:24, maxHeight:"50vh", overflowY:"auto" }}>
                  {igPhotoPicker.map((item, pickerIndex) => (
                    <div key={`picker-${pickerIndex}`}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, fontWeight:700, color:C.text }}>{item.restaurant.name}</div>
                        <button
                          type="button"
                          onClick={() => refreshPickerPhotosForOne(pickerIndex)}
                          style={{ fontSize:11, borderRadius:14, border:`1px solid ${C.border}`, padding:"4px 8px", background:C.card, color:C.muted, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}
                        >
                          Refresh
                        </button>
                      </div>
                      <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:6, scrollbarWidth:"none" }}>
                        {item.isRefreshing ? (
                          <div style={{ padding:20, background:C.warm, borderRadius:12, fontSize:12, color:C.muted }}>Loading photos…</div>
                        ) : item.photoOptions.length === 0 ? (
                          <div style={{ padding:20, background:C.warm, borderRadius:12, fontSize:12, color:C.muted }}>No photos found — will use default</div>
                        ) : (
                          item.photoOptions.map((opt, photoIndex) => (
                            <button
                              key={photoIndex}
                              type="button"
                              onClick={()=>setPickerPhoto(pickerIndex, photoIndex)}
                              style={{ flexShrink:0, width:100, height:100, borderRadius:12, overflow:"hidden", border:`3px solid ${item.selectedIndex === photoIndex ? C.terracotta : C.border}`, padding:0, cursor:"pointer", background:C.warm }}
                            >
                              <img
                                src={opt.photoUri}
                                alt=""
                                style={{ width:"100%", height:"100%", objectFit:"cover" }}
                                onError={() => {}}
                              />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={confirmAddFromPicker} style={{ width:"100%", padding:14, border:"none", borderRadius:12, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  Add {igPhotoPicker.length} restaurant{igPhotoPicker.length !== 1 ? "s" : ""}
                </button>
                <button onClick={closeIgModal} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, color:C.muted, marginTop:10, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>Cancel</button>
              </div>
            ) : igDone ? (
              <div style={{ padding:"12px 0" }}>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ fontSize:52, marginBottom:10 }}>🍝</div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.terracotta }}>Added to your list!</div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>{igAddedRestaurants.length} restaurant{igAddedRestaurants.length !== 1 ? "s" : ""} added</div>
                </div>
                <div style={{ marginBottom:20, maxHeight:240, overflowY:"auto" }}>
                  {igAddedRestaurants.map(r => (
                    <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                      <img src={r.img} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:"cover" }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, fontWeight:700, color:C.text }}>{r.name}</div>
                        <div style={{ fontSize:11, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{r.cuisine} · {r.city}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={closeIgModal} style={{ width:"100%", padding:14, border:"none", borderRadius:12, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:700, marginBottom:6 }}>Add from Instagram</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>Paste a post URL or upload a screenshot. We'll extract the restaurants.</div>
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  <input value={igUrl} onChange={e=>setIgUrl(e.target.value)} placeholder="https://instagram.com/p/..." style={{ flex:1, background:C.warm, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 14px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:12, outline:"none" }} />
                  <button onClick={()=>{ if (igUrl.trim()) window.open(igUrl.trim(), "_blank", "noopener"); }} disabled={!igUrl.trim()} style={{ flexShrink:0, padding:"12px 16px", border:"none", borderRadius:12, background:"linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", color:"#fff", fontSize:13, fontWeight:600, cursor: igUrl.trim() ? "pointer" : "not-allowed", fontFamily:"'DM Sans',sans-serif", opacity: igUrl.trim() ? 1 : 0.6 }}>Open in Instagram</button>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onDragOver={e=>{ e.preventDefault(); setIgDragOver(true); }}
                  onDragLeave={()=>setIgDragOver(false)}
                  onDrop={e=>{ e.preventDefault(); setIgDragOver(false); const f = e.dataTransfer.files?.[0]; handleIgFile(f); }}
                  onClick={()=>{ if (!igImporting) document.getElementById("ig-file-input")?.click(); }}
                  onKeyDown={e=>{ if (!igImporting && (e.key==="Enter"||e.key===" ")) { e.preventDefault(); document.getElementById("ig-file-input")?.click(); } }}
                  style={{ border:`2px dashed ${igDragOver ? C.terracotta : C.border}`, borderRadius:16, padding:"28px 20px", textAlign:"center", background: igDragOver ? `${C.terracotta}08` : C.warm, marginBottom:16, cursor: igImporting ? "wait" : "pointer", transition:"all 0.2s" }}
                >
                  <input type="file" accept="image/*" style={{ display:"none" }} id="ig-file-input" onChange={e=>{ const f = e.target.files?.[0]; handleIgFile(f); e.target.value = ""; }} />
                  <label htmlFor="ig-file-input" style={{ cursor: igImporting ? "wait" : "pointer", display:"block", pointerEvents:"none" }}>
                    {igImporting ? (
                      <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
                    ) : (
                      <div style={{ fontSize:32, marginBottom:8 }}>📷</div>
                    )}
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{igImporting ? "Processing screenshot…" : "Drop screenshot or tap to upload"}</div>
                    <div style={{ fontSize:12, color:C.muted }}>PNG, JPG, or WebP</div>
                  </label>
                </div>
                {igError && <div style={{ padding:"10px 14px", background:"rgba(196,96,58,0.12)", borderRadius:10, border:`1px solid ${C.terracotta}`, fontSize:12, color:C.terracotta, marginBottom:16 }}>{igError}</div>}
                <button onClick={closeIgModal} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, color:C.muted, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      </div>
      {/* End main content (zIndex:10) */}

      {/* Restaurant detail overlay — above main content */}
      {detailRestaurant && (() => {
        const detail = detailRestaurant;
        const place = placeDetails[detail.id];
        // Priority: 1) vault (user-confirmed), 2) preview (auto-fetched, unresolved), 3) non-picsum img, 4) Places API, 5) picsum
        const vaultPhoto = (() => { try { return JSON.parse(localStorage.getItem("cooked_photos") || "{}")[detail.id]; } catch { return null; } })();
        const previewPhoto = (() => { try { return JSON.parse(localStorage.getItem("cooked_photos_preview") || "{}")[detail.id]; } catch { return null; } })();
        const liveImg = (allRestaurants.find(r => r.id === detail.id) || detail).img;
        const isPicsum = !vaultPhoto && !previewPhoto && liveImg && String(liveImg).includes("picsum.photos");
        const detailPhoto = vaultPhoto
          || previewPhoto
          || (liveImg && !String(liveImg).includes("picsum.photos") ? liveImg : null)
          || (isPicsum && place?.photos?.[0]?.name ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=800&skipHttpRedirect=true&key=${import.meta.env.VITE_GOOGLE_PLACES_KEY}` : null)
          || liveImg || detail.img2;
        const detailTags = (allRestaurants.find(r => r.id === detail.id) || detail).tags || [];
        const addOrRemoveTag = (tag) => {
          setAllRestaurants(prev => prev.map(r => r.id !== detail.id ? r : { ...r, tags: detailTags.includes(tag) ? (r.tags || []).filter(t => t !== tag) : [...(r.tags || []), tag].filter((v, i, a) => a.indexOf(v) === i) }));
        };
        const listEmoji = { "Breakfast/Brunch": "🍳", "Lunch": "🥗", "Dinner": "🍷", "Bar": "🍸", "Coffee": "☕" };
        return createPortal(
        <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"min(100vw, 480px)", bottom:0, zIndex:99999, height:"100%", background:C.cream, overflow:"hidden", isolation:"isolate" }}>
          <button type="button" onClick={() => setDetailRestaurant(null)} style={{ position:"absolute", top:16, left:16, zIndex:210, width:36, height:36, borderRadius:50, background:"rgba(30,18,8,0.5)", backdropFilter:"blur(8px)", color:"#fff", border:"none", fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", isolation:"isolate" }}>←</button>
          <button type="button" onClick={() => {
            // Open picker with just this one restaurant so user can repick
            const item = { restaurant: allRestaurants.find(r => r.id === detail.id) || detail, photoOptions: [], selectedIndex: -1, isRefreshing: false, refreshOffset: 0, userSelected: false };
            setIgPhotoPicker([item]);
            // Remove from resolved so it shows as unresolved
            setPhotoResolved(prev => prev.filter(id => id !== detail.id));
            setPickerMode("fix-photos");
            setPickerTab("unresolved");
            setIgModal(true);
          }} style={{ position:"absolute", top:16, right:16, zIndex:210, padding:"8px 14px", borderRadius:20, background:"rgba(30,18,8,0.5)", backdropFilter:"blur(8px)", color:"#fff", border:"1px solid rgba(255,255,255,0.4)", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", letterSpacing:"0.5px", isolation:"isolate" }}>✎ Edit photo</button>
          <div style={{ height:"100%", overflowY:"auto", paddingBottom:40 }}>
            {/* Header: 320px, stronger gradient, name 32px, rating 24px terracotta */}
            <div style={{ position:"relative", height:320, flexShrink:0 }}>
              <img src={detailPhoto} alt={detail.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={(e) => { e.target.onerror = null; e.target.src = detail.img2 || detail.img; }} />
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)" }} />
              <div style={{ position:"absolute", bottom:16, left:16, right:16, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                <div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:700, color:"#fff", textShadow:"0 2px 8px rgba(0,0,0,0.4)" }}>{detail.name}</div>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontStyle:"italic", color:C.terracotta, marginTop:4 }}>{detail.rating}</div>
                </div>
                <div style={{ display:"flex", gap:8 }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => toggleLove(detail.id)} style={{ padding:"10px 16px", borderRadius:12, border:`1.5px solid ${heatResults.loved.includes(detail.id) ? C.terracotta : "rgba(255,255,255,0.8)"}`, background: heatResults.loved.includes(detail.id) ? `${C.terracotta}40` : "rgba(255,255,255,0.2)", color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>{heatResults.loved.includes(detail.id) ? "Loved It ♥" : "Love It ♡"}</button>
                  <button type="button" onClick={() => toggleWatch(detail.id)} style={{ padding:"10px 16px", borderRadius:12, border:"1.5px solid rgba(255,255,255,0.8)", background:"rgba(255,255,255,0.2)", color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>{watchlist.includes(detail.id) ? "On Target 🎯" : "Target List"}</button>
                </div>
              </div>
            </div>
            <div>
              {/* INFO BAR: clean text on cream, no card */}
              <div style={{ padding:"16px 20px", fontFamily:"'DM Mono',monospace", fontSize:12, color:C.muted }}>
                {[detail.cuisine, detail.neighborhood, detail.price].filter(Boolean).join(' · ')} · {getFlames(detail)}
              </div>

              {/* SECTION INFO - address, hours, contact */}
              {place && (place.formattedAddress || place.regularOpeningHours || place.internationalPhoneNumber || place.websiteUri) && (
                <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>INFO</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {place.formattedAddress && (
                      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                        <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>📍</span>
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(place.formattedAddress)}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.terracotta, lineHeight:1.4, textDecoration:"none" }}>{place.formattedAddress}</a>
                      </div>
                    )}
                    {place.regularOpeningHours?.weekdayDescriptions && (
                      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                        <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>🕐</span>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.muted, lineHeight:1.7 }}>
                          {place.regularOpeningHours.weekdayDescriptions.map((d, i) => (
                            <div key={i}>{d}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {place.internationalPhoneNumber && (
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>📞</span>
                        <a href={`tel:${place.internationalPhoneNumber}`} style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.terracotta, textDecoration:"none" }}>{place.internationalPhoneNumber}</a>
                      </div>
                    )}
                    {place.websiteUri && (
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>🌐</span>
                        <a href={place.websiteUri} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"'DM Sans',sans-serif", fontSize:13, color:C.terracotta, textDecoration:"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:280 }}>{place.websiteUri.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION A - RATING */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>RATING</div>
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setUserRatings(prev => ({ ...prev, [detail.id]: n }))} style={{ background:"none", border:"none", padding:4, cursor:"pointer", fontSize:28, lineHeight:1 }}>{((userRatings[detail.id] || 0) >= n) ? <span style={{ color:"#f4a724" }}>★</span> : <span style={{ color:C.border }}>☆</span>}</button>
                  ))}
                  {userRatings[detail.id] != null && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, color:C.terracotta, marginLeft:6 }}>{userRatings[detail.id]} / 5</span>}
                </div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.muted, marginTop:6 }}>Cooked score: {detail.rating}</div>
              </div>

              {/* SECTION B - LISTS */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>LISTS</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {["Breakfast/Brunch", "Lunch", "Dinner", "Bar", "Coffee"].map(listName => {
                    const isIn = (userLists[listName] || []).includes(detail.id);
                    const emoji = listEmoji[listName] || "";
                    return (
                      <button key={listName} type="button" onClick={() => toggleList(listName, detail.id)} style={{ height:36, paddingLeft:14, paddingRight:14, borderRadius:18, border:`1.5px solid ${isIn ? C.terracotta : C.border}`, background: isIn ? C.terracotta : "transparent", color: isIn ? "#fff" : C.muted, fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>{emoji} {listName}</button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION C - TAGS */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>TAGS</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  {detailTags.map(tag => (
                    <button key={tag} type="button" onClick={() => { setActiveFilter(tag); setDetailRestaurant(null); }} style={{ padding:"6px 10px", borderRadius:20, border:`1px solid ${C.terracotta}`, background:C.terracotta, color:"#fff", fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>{tag}</button>
                  ))}
                  <button type="button" onClick={() => setShowTagPicker(p => !p)} style={{ padding:"6px 10px", borderRadius:20, border:`1.5px dashed ${C.border}`, background:"transparent", color:C.muted, fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>＋ Add tag</button>
                </div>
                {showTagPicker && (
                  <div style={{ marginTop:12, maxHeight:200, overflowY:"auto", display:"flex", flexWrap:"wrap", gap:6 }}>
                    {ALL_TAGS.map(tag => {
                      const selected = detailTags.includes(tag);
                      return (
                        <button key={tag} type="button" onClick={() => addOrRemoveTag(tag)} style={{ padding:"5px 10px", borderRadius:12, border:`1px solid ${selected ? C.terracotta : C.border}`, background: selected ? C.terracotta : C.card, color: selected ? "#fff" : C.muted, fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>{tag}</button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION D - NOTES */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>NOTES</div>
                {(userNotes[detail.id] || []).map((note, i) => (
                  <div key={i} style={{ borderLeft:`3px solid ${C.terracotta}`, padding:"10px 14px", background:C.card, borderRadius:8, marginBottom:8 }}>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{typeof note === "object" && note.text != null ? note.text : note}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.muted, marginTop:6 }}>{typeof note === "object" && note.time ? note.time : ""}</div>
                  </div>
                ))}
                <div style={{ display:"flex", gap:8 }}>
                  <input value={noteInput} onChange={e => setNoteInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (!noteInput.trim()) return; setUserNotes(prev => ({ ...prev, [detail.id]: [...(prev[detail.id] || []), { text: noteInput.trim(), time: new Date().toLocaleString() }] })); setNoteInput(""); })()} placeholder="Add a note..." style={{ flex:1, background:C.card, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:13, outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  <button type="button" onClick={() => { if (!noteInput.trim()) return; setUserNotes(prev => ({ ...prev, [detail.id]: [...(prev[detail.id] || []), { text: noteInput.trim(), time: new Date().toLocaleString() }] })); setNoteInput(""); }} style={{ padding:"10px 18px", borderRadius:10, background:C.terracotta, color:"#fff", border:"none", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Add</button>
                </div>
              </div>

              {/* SECTION E - SIMILAR */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>SIMILAR</div>
                <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:6 }}>
                  {filteredSorted.filter(r => r.id !== detail.id && (r.tags || []).some(t => detailTags.includes(t))).slice(0, 3).map(s => {
                    const sVault = (() => { try { return JSON.parse(localStorage.getItem('cooked_photos') || '{}')[s.id]; } catch { return null; } })();
                    const sPreview = (() => { try { return JSON.parse(localStorage.getItem('cooked_photos_preview') || '{}')[s.id]; } catch { return null; } })();
                    const sImg = sVault || sPreview || (s.img && !s.img.includes('picsum') ? s.img : null) || s.img;
                    // Trigger background fetch if still picsum
                    if (!sVault && !sPreview && (!s.img || s.img.includes('picsum'))) {
                      fetchAndCachePhoto(s, () => {});
                    }
                    return (
                    <div key={s.id} role="button" tabIndex={0} onClick={() => setDetailRestaurant(s)} onKeyDown={e => e.key === "Enter" && setDetailRestaurant(s)} style={{ flexShrink:0, width:130, borderRadius:14, overflow:"hidden", background:C.card, border:`1px solid ${C.border}`, cursor:"pointer", boxShadow:"0 2px 8px rgba(30,18,8,0.06)" }}>
                      <img src={sImg} alt={s.name} style={{ width:"100%", height:90, objectFit:"cover" }} />
                      <div style={{ padding:10 }}>
                        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, fontWeight:700, color:C.text }}>{s.name}</div>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.muted, marginTop:2 }}>{s.cuisine}</div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION F - SHARE */}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:20, paddingBottom:20, paddingLeft:20, paddingRight:20 }}>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"2px", color:C.muted, marginBottom:12 }}>SHARE</div>
                <div style={{ display:"flex", justifyContent:"center" }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const shareText = `Check out ${detail.name} — ${detail.cuisine} in ${detail.city}. Found on Cooked.`;
                      const shareData = {
                        title: detail.name,
                        text: shareText,
                        url: window.location.href,
                      };
                      try {
                        if (navigator.share) {
                          await navigator.share(shareData);
                        } else if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(shareText);
                          setDetailShareCopied(true);
                          setTimeout(() => setDetailShareCopied(false), 2000);
                        }
                      } catch {
                        if (navigator.clipboard?.writeText) {
                          try {
                            await navigator.clipboard.writeText(shareText);
                            setDetailShareCopied(true);
                            setTimeout(() => setDetailShareCopied(false), 2000);
                          } catch {
                            // ignore
                          }
                        }
                      }
                    }}
                    style={{ padding:"12px 24px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.card, color:C.text, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  >
                    {detailShareCopied ? "Copied!" : "Share this spot 🍴"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.getElementById('root') || document.body
        );
      })()}



      {/* Toast */}
      {toast && <div style={{ position:"fixed", top:76, left:"50%", transform:"translateX(-50%)", background:C.terracotta, color:"#fff", borderRadius:20, padding:"10px 20px", fontSize:13, fontWeight:600, zIndex:300, fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(196,96,58,0.4)" }}>Link copied — {toast} 📋</div>}
    </div>
    </div>
  );
}
