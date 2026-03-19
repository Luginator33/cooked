import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { RESTAURANTS, CITIES, ALL_TAGS } from "../data/restaurants";
import ChatBot from "../components/ChatBot";
import Profile from "./Profile";

const DATA_VERSION = "v5-2919";

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
if (typeof window !== "undefined") {
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
  bg:        "#0f0c09",
  bg2:       "#1a1208",
  bg3:       "#2e1f0e",
  border:    "#2e1f0e",
  border2:   "#1e1208",
  text:      "#f0ebe2",
  muted:     "#5a3a20",
  dim:       "#3d2a18",
  terracotta:"#c4603a",
  cream:     "#faf6f0",
  card:      "#1a1208",
};

const FLAME_PATH = "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

const FlameIcon = ({ size = 18, color = C.terracotta, filled = true }) => (
  <svg
    width={size}
    height={size * 1.2}
    viewBox="0 0 167 200"
    fill={filled ? color : "none"}
    stroke={filled ? "none" : color}
    strokeWidth={filled ? 0 : 12}
    strokeLinecap="round"
  >
    <path d={FLAME_PATH} />
  </svg>
);

const FlameRating = ({ count, score, total = 5, size = 11 }) => {
  const value = typeof count === "number" ? count : (score || 0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: total }, (_, i) => (
        <FlameIcon
          key={i}
          size={size}
          color={i < value ? C.terracotta : C.bg3}
          filled
        />
      ))}
    </div>
  );
};

const Wordmark = ({ size = 22 }) => (
  <div
    style={{
      fontFamily: "Georgia,serif",
      fontSize: size,
      fontWeight: 700,
      fontStyle: "italic",
      lineHeight: 1,
      userSelect: "none",
    }}
  >
    <span style={{ color: C.text }}>cook</span>
    <span style={{ color: C.terracotta, marginLeft: -1 }}>ed</span>
  </div>
);

const PageHeader = ({ right }) => (
  <div
    style={{
      padding: "6px 18px 8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0,
    }}
  >
    <Wordmark size={22} />
    {right}
  </div>
);

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
    <div ref={cardRef} style={{ margin:"0 16px 16px", borderRadius:18, overflow:"hidden", background:C.bg2, border:`0.5px solid ${C.border}`, cursor:"pointer" }} onClick={() => onOpenDetail?.(r)}>
      <div style={{ position:"relative", height:150, overflow:"hidden" }}>
        <img src={imgSrc} alt={r.name} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform 0.4s" }} />
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 50%, rgba(30,18,8,0.7) 100%)" }} />
        {r.source && (
          <div style={{ position:"absolute", top:10, left:10, background:"rgba(15,12,9,0.75)", border:`0.5px solid ${C.border2}`, borderRadius:16, padding:"3px 9px", fontFamily:"'DM Mono',monospace", fontSize:9, color:C.cream }}>
            {r.source}
          </div>
        )}
        <div style={{ position:"absolute", top:10, right:10 }}>
          <FlameRating score={r.cooked_score || Math.round(r.rating || 0)} />
        </div>
        <div style={{ position:"absolute", bottom:10, right:12, fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.terracotta, lineHeight:1 }}>
          {r.rating}
        </div>
      </div>
      <div style={{ padding:"14px 16px", background:C.bg2 }}>
        <div style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:20, fontWeight:700, lineHeight:1.1, marginBottom:4, color:C.text }}>{r.name}</div>
        <div style={{ display:"flex", gap:7, alignItems:"center", marginBottom:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{r.cuisine}</span>
          <span style={{ color:C.dim }}>·</span>
          <span style={{ fontSize:11, color:C.muted }}>{r.neighborhood}</span>
          <span style={{ color:C.dim }}>·</span>
          <span style={{ fontSize:11, color:C.terracotta, fontFamily:"'DM Mono',monospace" }}>{r.price}</span>
        </div>
        <p style={{ fontSize:13, lineHeight:1.55, color:C.text, opacity:0.85, marginBottom:12 }}>{r.desc}</p>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 }}>
          {r.tags.map(t => (
            <span
              key={t}
              style={{
                padding:"4px 10px",
                borderRadius:20,
                border:`0.5px solid ${C.border}`,
                fontSize:10,
                color:C.muted,
                fontFamily:"'DM Mono',monospace",
                background:C.bg3,
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <div style={{ display:"flex", gap:7 }} onClick={e => e.stopPropagation()}>
          {[
            { label: loved ? "Loved It ♥" : "Love It ♡", active: loved, onClick: onLove, activeColor: C.terracotta },
            { label: watched ? "On Watchlist" : "Watchlist", active: watched, onClick: onWatch, activeColor: "#6b9fff" },
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
        <div style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:17, fontWeight:700, color:C.text }}>{item.restaurant.name}</div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {totalPages > 1 && (
            <div style={{ display:"flex", gap:4 }}>
              <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"3px 7px", background:C.bg2, color:C.muted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontFamily:"'DM Mono',monospace" }}>‹</button>
              <span style={{ fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace", lineHeight:"24px" }}>{page+1}/{totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"3px 7px", background:C.bg2, color:C.muted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontFamily:"'DM Mono',monospace" }}>›</button>
            </div>
          )}
          <button type="button" onClick={() => { setPage(0); onRefresh(pickerIndex); }} style={{ fontSize:11, borderRadius:14, border:`1px solid ${C.border}`, padding:"4px 8px", background:C.bg2, color:C.muted, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Refresh</button>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8 }}>
        {item.isRefreshing ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.bg3, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace" }}>…</div>
          ))
        ) : item.photoOptions.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.bg3, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted, fontFamily:"'DM Mono',monospace" }}>{i === 0 ? (firedRef.current ? "No photos" : "Waiting") : "·"}</div>
          ))
        ) : (
          visiblePhotos.map((opt, idx) => {
            const photoIndex = page * PHOTOS_PER_PAGE + idx;
            return (
              <button key={photoIndex} type="button" onClick={() => onSelect(pickerIndex, photoIndex)}
                style={{ aspectRatio:"1", borderRadius:12, overflow:"hidden", border:`3px solid ${item.selectedIndex === photoIndex ? C.terracotta : C.border}`, padding:0, cursor:"pointer", background:C.bg3, width:"100%" }}>
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
  const [tab, setTab] = useState(initialTab || "home");
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
  const [chatInput, setChatInput] = useState("");
  const [restoredMessages, setRestoredMessages] = useState(null);
  const [homeChatKey, setHomeChatKey] = useState(0);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(52);
  useLayoutEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    }
  }, []);
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

  useEffect(() => {
    if (tab === "home") setHomeChatKey((k) => k + 1);
  }, [tab]);
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
    if (!["home", "discover", "heat", "map", "profile"].includes(initialTab)) return;
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

  function HomePhotoCard({ r, style, children, onClick }) {
    const [imgSrc, setImgSrc] = useState(r.img || "");
    const cardRef = useRef(null);

    useEffect(() => {
      try {
        const vault = JSON.parse(localStorage.getItem("cooked_photos") || "{}");
        const preview = JSON.parse(localStorage.getItem("cooked_photos_preview") || "{}");
        const cached = vault[r.id] || preview[r.id];
        if (cached) {
          setImgSrc(cached);
          r.img = cached;
          return;
        }
      } catch (e) {}

      if (!imgSrc || imgSrc.includes("picsum")) {
        fetchAndCachePhoto(r, setImgSrc);
      }
    }, [r.id]);

    return (
      <div
        ref={cardRef}
        onClick={onClick}
        style={{ ...style, position: "relative", overflow: "hidden", cursor: "pointer" }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={r.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#1a1208" }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(15,12,9,0.1) 0%, rgba(15,12,9,0.8) 100%)",
          }}
        />
        {children}
      </div>
    );
  }

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
      const normalize = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const q = normalize(searchQuery);
      return (
        normalize(r.name).includes(q) ||
        normalize(r.city).includes(q) ||
        normalize(r.neighborhood).includes(q) ||
        normalize(r.cuisine).includes(q) ||
        normalize(r.desc).includes(q) ||
        (r.tags || []).some(t => normalize(t).includes(q))
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
      const cityRestaurants = filteredRef.current.filter(r => {
        if (!r.lat || !r.lng) return true;
        const dlat = Math.abs(r.lat - center.lat);
        const dlng = Math.abs(r.lng - center.lng);
        return dlat < 8 && dlng < 8;
      });

      const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
      for (const r of cityRestaurants) {
        const lat = r.lat || center.lat + (Math.random() - 0.5) * 0.04;
        const lng = r.lng || center.lng + (Math.random() - 0.5) * 0.04;

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
    <div style={{ width:"100%", minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
    <div style={{ maxWidth:480, margin:"0 auto", minHeight:"100vh", background:C.bg, paddingBottom:90, position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .city-row::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Main content (header + tabs): explicit low stacking so detail overlay always wins */}
      <div style={{ position:"relative", zIndex:10, marginTop:0, paddingTop:0 }}>
      {/* Header */}
      <div ref={headerRef} style={{ background:C.bg, position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, zIndex:50, borderBottom:`1px solid ${C.border2}`, paddingTop:6, marginBottom:0, paddingBottom:0, display: tab === "heat" ? "none" : "block" }}>
        <PageHeader
          right={
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {(tab === "home" || tab === "discover" || tab === "map") && (
                <div style={{ position:"relative" }}>
                  <button onClick={() => setCityPickerOpen(v => !v)} style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", padding:0, outline:"none" }}>
                    <span style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:15, fontWeight:700, color:C.terracotta, fontStyle:"italic" }}>{city === "All" ? "All Cities" : city}</span>
                    <span style={{ fontSize:11, color:C.muted, marginTop:1 }}>{cityPickerOpen ? "▴" : "▾"}</span>
                  </button>
                  {cityPickerOpen && (
                    <div style={{ position:"absolute", top:"calc(100% + 8px)", left:-12, zIndex:600, background:C.bg2, borderRadius:14, boxShadow:"0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)", border:`1px solid ${C.border}`, width:188, maxHeight:340, overflowY:"auto", scrollbarWidth:"none", padding:"6px 0 8px" }} onClick={e => e.stopPropagation()}>
                      {[
                        { label:"", cities:["All"] },
                        { label:"North America", cities:["Los Angeles","New York","Chicago","San Francisco","Miami","Austin","Nashville","Dallas","Malibu","San Diego","Las Vegas","Napa","Portland","Scottsdale","Maui","Mexico City","Toronto","Ventura County"] },
                        { label:"Europe", cities:["London","Paris","Barcelona","Amsterdam","Berlin","Rome","Copenhagen","Stockholm","Istanbul","Vienna","Prague","Munich","Mykonos","Cannes","Ibiza","UK","Lisbon","Malta"] },
                        { label:"Asia", cities:["Bangkok","Tokyo","Hong Kong","Singapore","Bali","Seoul"] },
                        { label:"Middle East", cities:["Dubai","Mumbai","Tel Aviv"] },
                        { label:"Caribbean", cities:["Canouan Island"] },
                        { label:"Costa Rica", cities:["Liberia"] },
                      ].map((group, gi) => (
                        <div key={gi}>
                          {group.label ? <div style={{ padding: gi===1 ? "8px 16px 4px" : "10px 16px 4px", fontFamily:"'DM Mono',monospace", fontSize:8, color:C.dim, letterSpacing:"1.8px", textTransform:"uppercase", borderTop: gi===1 ? `1px solid ${C.border2}` : "none" }}>{group.label}</div> : null}
                          {group.cities.map(c => (
                            <button key={c} onClick={() => { setCity(c); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                              style={{ width:"100%", padding:"8px 16px", textAlign:"left", background: city===c ? `${C.terracotta}18` : "transparent", border:"none", color: city===c ? C.terracotta : C.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", fontWeight: city===c ? 600 : 400, cursor:"pointer", letterSpacing:"-0.1px", lineHeight:1.3 }}>
                              {c === "All" ? "All Cities" : c}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={()=>{ setIgError(null); setIgAddedRestaurants([]); setIgDone(false); setIgImporting(false); setPickerMode("ig-import"); setIgModal(true); }}
                title="Add from Instagram"
                style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", border:"none", fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                📸
              </button>
            </div>
          }
        />
      </div>

      {/* Spacer for fixed header */}
      <div style={{ height: 0, margin: 0, padding: 0 }} />

      {/* Home Tab */}
      {tab === "home" && (() => {
        const getPhoto = (r) => r.img || "";
        const getCity = (r) => r.city || r.location || r.region || "";
        const cityName = (city || "Los Angeles").toLowerCase();
        const allSorted = [...RESTAURANTS].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        const cityFiltered = allSorted.filter(r =>
          (r.city || "").toLowerCase().includes(cityName.split(" ")[0].toLowerCase())
        ).slice(0, 8);
        const hotNow = cityFiltered.length >= 3 ? cityFiltered : allSorted.slice(0, 8);
        const featuredRestaurant = cityFiltered[0] || allSorted[0];
        return (
        <div style={{ paddingTop: headerHeight, paddingLeft: 16, paddingRight: 16, paddingBottom: 90, color: C.text }}>
          {/* Header already rendered above via PageHeader */}
          <div style={{ height:"0.5px", background:"linear-gradient(90deg,transparent,#2e1f0e 20%,#2e1f0e 80%,transparent)", margin:0, padding:0 }} />

          {/* Inline chat (replaces hero card); key remounts on each Home visit to re-randomize chips */}
          <div style={{ marginTop: 12 }}>
            <ChatBot key={homeChatKey} inline allRestaurants={allRestaurants} initialInput={chatInput} initialMessages={restoredMessages} />
          </div>

          {(() => {
            let recentChats = [];
            try {
              recentChats = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]").reverse();
            } catch (e) {}

            const getRelativeTime = (entry) => {
              const t = entry?.timestamp ?? entry?.time;
              if (t == null) return "Earlier";
              const date = typeof t === "number" ? new Date(t) : new Date(t);
              const diff = Date.now() - date.getTime();
              const min = Math.floor(diff / 60000);
              const h = Math.floor(diff / 3600000);
              const d = Math.floor(diff / 86400000);
              if (min < 60) return `${min}m ago`;
              if (h < 24) return `${h}h ago`;
              if (d === 1) return "Yesterday";
              if (d < 7) return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
              return "Earlier";
            };

            const deleteChat = (index) => {
              try {
                const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]");
                hist.splice(hist.length - 1 - index, 1);
                localStorage.setItem("cooked_chat_history", JSON.stringify(hist));
                setHomeChatKey((k) => k + 1);
              } catch (e) {}
            };

            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#3d2a18", textTransform: "uppercase", padding: "0 16px", marginBottom: 8 }}>
                  Recent Chats
                </div>
                <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "0 16px" }}>
                  {recentChats.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#3d2a18", fontStyle: "italic" }}>No chats yet</div>
                  ) : (
                    recentChats.slice(0, 10).map((entry, i) => (
                      <div key={i} style={{ background: "#120e0a", border: "1px solid #1e1208", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 }}>
                          <FlameIcon size={12} filled={false} color="#3d2a18" />
                          <span onClick={() => { setRestoredMessages(entry.messages || null); setChatInput(entry.query || entry); setHomeChatKey((k) => k + 1); }}
                            style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 13, color: "#7a5535", cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {entry.query || entry}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "#3d2a18" }}>{getRelativeTime(entry)}</span>
                          <span onClick={() => deleteChat(i)}
                            style={{ fontSize: 14, color: "#3d2a18", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: 20 }}>
            <div style={{ padding: "0 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 20, color: "#f0ebe2" }}>Cooked for you</span>
              <button type="button" onClick={() => setTab("discover")} style={{ background: "none", border: "none", color: "#c4603a", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>see all</button>
            </div>
            {featuredRestaurant ? (
              <HomePhotoCard
                r={featuredRestaurant}
                onClick={() => setDetailRestaurant(featuredRestaurant)}
                style={{ margin: "0 16px", borderRadius: 16, height: 200 }}
              >
                <div style={{ position: "absolute", inset: 0, padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#c4603a", textTransform: "uppercase", marginBottom: 6, fontFamily: "-apple-system,sans-serif" }}>Based on your taste</div>
                  <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 26, color: "#f0ebe2", lineHeight: 1.1, marginBottom: 5 }}>{featuredRestaurant.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(240,235,226,0.55)" }}>
                    {[featuredRestaurant.cuisine, featuredRestaurant.neighborhood, featuredRestaurant.price].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ position: "absolute", top: 16, right: 18, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 28, color: "#c4603a" }}>
                  {featuredRestaurant.rating}
                </div>
              </HomePhotoCard>
            ) : null}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ padding: "0 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 20, color: "#f0ebe2" }}>Hot right now</span>
              <button type="button" onClick={() => setTab("discover")} style={{ background: "none", border: "none", color: "#c4603a", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>see all</button>
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 8 }}>
              {hotNow.map(r => (
                <HomePhotoCard
                  key={r.id}
                  r={r}
                  onClick={() => setDetailRestaurant(r)}
                  style={{ minWidth: 150, maxWidth: 150, height: 200, borderRadius: 14, flexShrink: 0 }}
                >
                  <div style={{ position: "absolute", top: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 15, color: "#c4603a" }}>
                    {r.rating}
                  </div>
                  <div style={{ position: "absolute", bottom: 28, left: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 14, color: "#f0ebe2", lineHeight: 1.2 }}>
                    {r.name}
                  </div>
                  <div style={{ position: "absolute", bottom: 10, left: 10, fontSize: 11, color: "rgba(240,235,226,0.6)" }}>
                    {r.cuisine || ""}
                  </div>
                </HomePhotoCard>
              ))}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Discover Tab */}
      {tab === "discover" && (
        <div style={{ paddingTop: headerHeight }}>
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
                  flexShrink:0,
                  padding:"5px 12px",
                  borderRadius:20,
                  border:`1px solid ${venueType === id ? C.terracotta : C.border}`,
                  background: venueType === id ? C.terracotta : "transparent",
                  color: venueType === id ? "#fff" : C.dim,
                  fontSize:11,
                  fontFamily:"'DM Mono',monospace",
                  cursor:"pointer",
                  letterSpacing:"0.3px",
                  transition:"all 0.15s",
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
                  width:"100%",
                  boxSizing:"border-box",
                  padding:"8px 32px 8px 12px",
                  borderRadius:10,
                  border:`1px solid ${C.border}`,
                  background:C.bg2,
                  color:C.text,
                  fontFamily:"'DM Sans',sans-serif",
                  fontSize:12,
                  cursor:"pointer",
                  outline:"none",
                  appearance:"none",
                  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235a3a20' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
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
                width:"100%",
                boxSizing:"border-box",
                padding:"7px 28px 7px 26px",
                borderRadius:10,
                border:`1px solid ${searchQuery ? C.terracotta : C.border}`,
                background:C.bg2,
                fontSize:12,
                color:C.text,
                fontFamily:"Cormorant Garamond,Georgia,serif",
                fontStyle:"italic",
                outline:"none",
                transition:"border-color 0.2s",
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
                    Based on your taste profile, try <span style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:18, fontStyle:"italic", color:C.terracotta }}>{recommendation.name}</span>
                    {place ? ` in ${place}` : ""} tonight.
                  </div>
                </div>
              </button>
              </div>
            );
          })()}
          <div style={{ padding:"16px 20px 10px", display:"flex", alignItems:"baseline", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
            <div style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.text }}>
              {searchQuery ? `"${searchQuery}"` : secondaryCuisine ? `${secondaryCuisine} in ${city}` : venueType !== "all" ? (venueType === "restaurants" ? "Restaurants" : venueType === "bars" ? "Bars & Nightlife" : "Coffee & Cafes") + ` in ${city}` : `Hot in ${city}`}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.muted }}>{filteredSorted.length} spots</div>
              <button
                type="button"
                onClick={()=>setTab("map")}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:18, border:`1px solid ${C.border}`, background:C.bg2, color:C.text, fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer", letterSpacing:"0.5px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2C8 2 5 5.5 5 9c0 5 7 13 7 13s7-8 7-13c0-3.5-3-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                MAP
              </button>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, overflowX:"auto", padding:"0 16px 14px", scrollbarWidth:"none", marginBottom:4 }} className="city-row">
            {["date night","group friendly","outdoor seating","rooftop","late night","solo"].map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveFilter(prev => prev === tag ? null : tag)}
                style={{
                  flexShrink:0, padding:"6px 12px", borderRadius:16, border:`1px solid ${activeFilter === tag ? C.terracotta : C.border}`,
                  background: activeFilter === tag ? C.bg3 : C.bg2, color: activeFilter === tag ? C.terracotta : C.muted,
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
        </div>
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
          <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, bottom:70, display:"flex", flexDirection:"column", background:C.bg, zIndex:55, userSelect:"none" }}>
            {/* Header */}
            <div style={{ padding:"14px 20px 4px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontFamily:"Georgia,serif", fontSize:22, fontWeight:"bold", fontStyle:"italic", color:C.text }}>
                <span style={{ color:C.text }}>cook</span><span style={{ color:C.terracotta }}>ed</span>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <FlameIcon size={18} filled={true} />
                  <span style={{ fontFamily:"Georgia,serif", fontSize:18, fontWeight:"bold", fontStyle:"italic", color:C.text }}>Heat</span>
                  <span style={{ fontFamily:"-apple-system,sans-serif", fontSize:12, color:C.muted, marginLeft:2 }}>{heatDeck.length}</span>
                </div>
                {(heatResults.loved.length > 0 || heatResults.noped.length > 0 || heatResults.skipped.length > 0) && (
                  <button onClick={() => setHeatResults({ loved: [], noped: [], skipped: [], votes: {} })} style={{ fontFamily:"-apple-system,sans-serif", fontSize:10, color:C.muted, background:"none", border:`1px solid ${C.border}`, borderRadius:12, padding:"4px 10px", cursor:"pointer" }}>Reset</button>
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
                <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, color:C.text }}>
                  <div style={{ fontSize:48 }}>🎉</div>
                  <div style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:24, fontStyle:"italic", color:C.text }}>You've been through it all</div>
                  <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, color:C.muted }}>
                    {heatResults.loved.length} loved · {heatResults.noped.length} passed
                  </div>
                  <button onClick={() => setHeatResults({ loved: [], noped: [], skipped: [], votes: {} })} style={{ marginTop:8, padding:"12px 28px", borderRadius:12, background:C.terracotta, color:"#fff", border:"none", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Start over</button>
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
                  <div style={{ position:"absolute", top:32, left:24, padding:"8px 18px", borderRadius:8, border:`3px solid ${C.terracotta}`, color:C.terracotta, fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, letterSpacing:"3px", transform:"rotate(-18deg)", opacity: Math.min(1, Math.max(0, swipeDelta.x - 20) / 60), transition:"opacity 0.05s", pointerEvents:"none" }}>HEAT</div>

                  {/* NOPE stamp */}
                  <div style={{ position:"absolute", top:32, right:24, padding:"8px 18px", borderRadius:8, border:"3px solid #f87171", color:"#f87171", fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, letterSpacing:"3px", transform:"rotate(18deg)", opacity: Math.min(1, Math.max(0, -swipeDelta.x - 20) / 60), transition:"opacity 0.05s", pointerEvents:"none" }}>PASS</div>
                  {/* HAVEN'T BEEN stamp */}
                  <div style={{ position:"absolute", top:"40%", left:"50%", transform:"translateX(-50%) rotate(-5deg)", padding:"8px 18px", borderRadius:8, border:"3px solid #facc15", color:"#facc15", fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:700, letterSpacing:"3px", opacity: Math.min(1, Math.max(0, -swipeDelta.y - 40) / 60), transition:"opacity 0.05s", pointerEvents:"none" }}>HAVEN'T BEEN</div>

                  {/* Card info */}
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"20px 20px 28px", pointerEvents:"none", background:"linear-gradient(to bottom, transparent, rgba(15,12,9,0.85) 30%, rgba(15,12,9,0.98) 100%)" }}>
                    <div style={{ fontFamily:"Georgia,serif", fontSize:30, fontWeight:"bold", fontStyle:"italic", color:"#f0ebe2", marginBottom:3, lineHeight:1.1 }}>{card.name}</div>
                    <div style={{ fontFamily:"-apple-system,sans-serif", fontSize:10, color:"rgba(240,235,226,0.55)", marginBottom:10, letterSpacing:"0.12em", textTransform:"uppercase" }}>{[card.cuisine, card.neighborhood].filter(Boolean).join(" · ")}</div>
                    <div style={{ fontFamily:"Georgia,serif", fontSize:15, fontStyle:"italic", color:"rgba(240,235,226,0.85)", lineHeight:1.5, marginBottom:12 }}>{card.desc}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {(card.tags || []).slice(0,3).map(t => (
                        <span key={t} style={{ padding:"4px 11px", borderRadius:20, border:"1px solid rgba(240,235,226,0.2)", background:"rgba(15,12,9,0.5)", color:"rgba(240,235,226,0.8)", fontSize:11, fontFamily:"-apple-system,sans-serif", isolation:"isolate" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {card && (
              <div style={{ background:C.bg, paddingBottom:4 }}>
                <div style={{ textAlign:"center", padding:"10px 0 6px", fontFamily:"-apple-system,sans-serif", fontSize:10, color:C.dim, letterSpacing:"0.12em", textTransform:"uppercase" }}>↑ &nbsp; HAVEN'T BEEN</div>
                <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:20, padding:"0 20px 16px" }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                    <button onClick={() => doSwipe('left')} style={{ width:54, height:54, borderRadius:"50%", border:"1px solid #3d1a1a", background:"#160808", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                        <line x1="5" y1="5" x2="17" y2="17" stroke="#e05555" strokeWidth="2.5" strokeLinecap="round"/>
                        <line x1="17" y1="5" x2="5" y2="17" stroke="#e05555" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span style={{ fontSize:9, letterSpacing:"0.12em", color:"#3d2a18", fontFamily:"-apple-system,sans-serif", textTransform:"uppercase" }}>PASS</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                    <button
                      type="button"
                      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                      onPointerUp={e => { e.stopPropagation(); toggleWatch(card.id); doSwipe('up'); }}
                      style={{ width:42, height:42, borderRadius:"50%", border:`1px solid ${watchlist.includes(card.id) ? "#4a90d9" : "#1a2a3d"}`, background: watchlist.includes(card.id) ? "#0a1a2e" : "#080f16", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="7" stroke={watchlist.includes(card.id) ? "#4a90d9" : "#3a5a7a"} strokeWidth="1.5"/>
                        <circle cx="9" cy="9" r="3" stroke={watchlist.includes(card.id) ? "#4a90d9" : "#3a5a7a"} strokeWidth="1.5"/>
                        <line x1="9" y1="2" x2="9" y2="0" stroke={watchlist.includes(card.id) ? "#4a90d9" : "#3a5a7a"} strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="9" y1="18" x2="9" y2="16" stroke={watchlist.includes(card.id) ? "#4a90d9" : "#3a5a7a"} strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="2" y1="9" x2="0" y2="9" stroke={watchlist.includes(card.id) ? "#4a90d9" : "#3a5a7a"} strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="18" y1="9" x2="16" y2="9" stroke={watchlist.includes(card.id) ? "#4a90d9" : "#3a5a7a"} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span style={{ fontSize:9, letterSpacing:"0.12em", color: watchlist.includes(card.id) ? "#4a90d9" : "#3d2a18", fontFamily:"-apple-system,sans-serif", textTransform:"uppercase" }}>WATCH</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                    <button onClick={() => doSwipe('right')} style={{ width:54, height:54, borderRadius:"50%", border:"1px solid #2e1f0e", background:"#1a1208", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                      <FlameIcon size={28} filled={true} />
                    </button>
                    <span style={{ fontSize:9, letterSpacing:"0.12em", color:"#c4603a", fontFamily:"-apple-system,sans-serif", textTransform:"uppercase" }}>HEAT</span>
                  </div>
                </div>
              </div>
            )}

            {/* Swipe hint */}
            {heatDeck.length > 0 && heatResults.loved.length === 0 && heatResults.noped.length === 0 && (
              <div style={{ textAlign:"center", paddingBottom:8, fontFamily:"'DM Mono',monospace", fontSize:10, color:C.dim, letterSpacing:"1px" }}>↑ HAVEN'T BEEN · swipe up</div>
            )}
          </div>
        );
      })()}

      {/* Map Tab */}
      {tab === "map" && (
        <div style={{ position:"fixed", top:130, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, bottom:70, zIndex:1 }}>
          <div ref={mapRef} style={{ width:"100%", height:"100%" }} />
          {selectedRest && (
            <div style={{ position:"absolute", bottom:16, left:16, right:16, background:"#fff9f2", borderRadius:20, overflow:"hidden", boxShadow:"0 8px 40px rgba(30,18,8,0.25)", border:"1px solid #ddd0bc", cursor:"pointer" }} onClick={() => { setDetailRestaurant(selectedRest); setSelectedRest(null); }}>
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
                  <button type="button" onClick={() => toggleWatch(selectedRest.id)} style={{ flex:1, padding:"9px 4px", borderRadius:10, border:`1.5px solid ${watchlist.includes(selectedRest.id) ? "#6b9fff" : "#ddd0bc"}`, background: watchlist.includes(selectedRest.id) ? "#6b9fff18" : "transparent", color: watchlist.includes(selectedRest.id) ? "#6b9fff" : "#8a7060", cursor:"pointer", fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>{watchlist.includes(selectedRest.id) ? "On Watchlist" : "Watchlist"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div style={{ paddingTop: headerHeight }}>
          <Profile tasteProfile={tasteProfile} allRestaurants={allRestaurants} heatResults={heatResults} watchlist={watchlist} onOpenDetail={setDetailRestaurant} onFixPhotos={rePickPhotosForAll} />
        </div>
      )}

      {/* Bottom Nav */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: C.bg,
          borderTop: `0.5px solid ${C.border2}`,
          padding: "8px 0 22px",
          display: "flex",
          zIndex: 100,
        }}
      >
        {/* Home */}
        <div
          onClick={() => setTab("home")}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={tab === "home" ? C.terracotta : C.dim}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.8px",
              color: tab === "home" ? C.terracotta : C.dim,
            }}
          >
            HOME
          </span>
        </div>

        {/* Heat */}
        <div
          onClick={() => setTab("heat")}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          <FlameIcon
            size={16}
            color={tab === "heat" ? C.terracotta : C.dim}
            filled={false}
          />
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.8px",
              color: tab === "heat" ? C.terracotta : C.dim,
            }}
          >
            HEAT
          </span>
        </div>

        {/* Discover */}
        <div
          onClick={() => setTab("discover")}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={tab === "discover" ? C.terracotta : C.dim}
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.8px",
              color: tab === "discover" ? C.terracotta : C.dim,
            }}
          >
            DISCOVER
          </span>
        </div>

        {/* Map */}
        <div
          onClick={() => setTab("map")}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={tab === "map" ? C.terracotta : C.dim}
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M12 2C8 2 5 5.5 5 9c0 5 7 13 7 13s7-8 7-13c0-3.5-3-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.8px",
              color: tab === "map" ? C.terracotta : C.dim,
            }}
          >
            MAP
          </span>
        </div>

        {/* Profile */}
        <div
          onClick={() => setTab("profile")}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              overflow: "hidden",
              border:
                tab === "profile"
                  ? `1.5px solid ${C.terracotta}`
                  : `1.5px solid ${C.dim}`,
            }}
          >
            {localStorage.getItem("cooked_profile_photo") ? (
              <img
                src={localStorage.getItem("cooked_profile_photo") || ""}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: C.bg2 }} />
            )}
          </div>
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.8px",
              color: tab === "profile" ? C.terracotta : C.dim,
            }}
          >
            PROFILE
          </span>
        </div>
      </div>

      {/* IG Modal */}
      {igModal && createPortal(
        <div style={{ position:"fixed", inset:0, background:"rgba(30,18,8,0.7)", zIndex:999999, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={closeIgModal}>
          <div style={{ width:"100%", maxWidth:480, background:C.cream, borderRadius:"24px 24px 0 0", borderTop:`1px solid ${C.border}`, padding:"28px 24px 44px", maxHeight:"85vh", overflowY:"auto", zIndex:1000000 }} onClick={e=>e.stopPropagation()}>
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
        </div>,
        document.body
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
        const RESY_CITY_CODES = {
          "Los Angeles": "la", "New York": "nyc", "Chicago": "chi",
          "San Francisco": "sf", "Miami": "miami", "Austin": "austin",
          "Nashville": "nashville", "Dallas": "dallas", "San Diego": "sandiego",
          "Portland": "portland", "London": "london", "Paris": "paris",
          "Barcelona": "barcelona", "Tokyo": "tokyo", "Copenhagen": "copenhagen",
          "Seoul": "seoul", "Dubai": "dubai", "Lisbon": "lisbon",
          "Mexico City": "mexico-city",
        };
        const resyCityCode = RESY_CITY_CODES[detail.city];
        const openTableSlug = (detail.name || '')
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-');
        const openTableDirectUrl = `https://www.opentable.com/${openTableSlug}`;
        return createPortal(
        <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"min(100vw, 480px)", bottom:0, zIndex:99999, height:"100%", background:"#0e0804", overflow:"hidden" }}>
          <div style={{ height:"100%", overflowY:"auto", paddingBottom:60 }}>

            {/* SECTION 1 — HERO */}
            <div style={{ position:"relative", height:300, flexShrink:0 }}>
              <img src={detailPhoto || detail.img} alt={detail.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={(e) => { e.target.onerror = null; e.target.src = detail.img2 || detail.img; }} />
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(5,3,1,0.08) 0%, rgba(5,3,1,0.15) 25%, rgba(5,3,1,0.72) 60%, rgba(5,3,1,0.97) 100%)" }} />
              {/* top bar */}
              <div style={{ position:"absolute", top:16, left:16, right:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <button type="button" onClick={() => setDetailRestaurant(null)} style={{ width:30, height:30, minWidth:30, minHeight:30, maxWidth:30, maxHeight:30, borderRadius:"50%", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.22)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#ffffff", fontSize:16, lineHeight:1, padding:0, boxSizing:"border-box", flexShrink:0, textAlign:"center" }}>‹</button>
                {/* Cooked logo top right */}
                <div style={{ background:"rgba(5,3,1,0.65)", border:"1px solid rgba(240,235,226,0.15)", borderRadius:20, padding:"5px 12px", display:"flex", alignItems:"center" }}>
                  <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontWeight:"bold", fontSize:13, color:"#f0ebe2", letterSpacing:"-0.5px" }}>cook</span><span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontWeight:"bold", fontSize:13, color:"#c4603a", letterSpacing:"-0.5px" }}>ed</span>
                </div>
              </div>
              {/* bottom overlay */}
              <div style={{ position:"absolute", left:18, right:18, bottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                <div style={{ maxWidth:"72%", paddingRight:8 }}>
                  <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontWeight:"bold", fontSize:34, color:"#ffffff", lineHeight:1.05, marginBottom:5 }}>{detail.name}</div>
                  <div style={{ fontSize:13, color:"rgba(240,235,226,0.7)", letterSpacing:"0.01em" }}>{[detail.cuisine, detail.neighborhood, detail.price].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ fontFamily:"Georgia,serif", fontWeight:"bold", fontSize:40, color:"#c4603a", lineHeight:1 }}>{detail.rating}</div>
              </div>
            </div>
            {/* thin divider between hero and tags */}
            <div style={{ height:1, background:"rgba(46,31,14,0.8)" }} />

            {/* SECTION 2 — TAGS + FLAME */}
            <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {detailTags.map(tag => (
                  <span key={tag} style={{ background:"#c4603a", color:"#fff", borderRadius:20, padding:"5px 13px", fontSize:12, fontFamily:"-apple-system,sans-serif", border:"1px solid rgba(255,255,255,0.12)" }}>{tag}</span>
                ))}
              </div>
              <div style={{ flexShrink:0 }}><FlameRating score={detail.rating || 0} size={16} /></div>
            </div>

            {/* SECTION 3 — 4 ACTION BUTTONS */}
            <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"12px 14px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {/* LOVED */}
                <button type="button" onClick={() => toggleLove(detail.id)} style={{ background: heatResults.loved.includes(detail.id) ? "#1e0f06" : "#170d05", borderRadius:14, padding:"16px 6px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, border:`1px solid ${heatResults.loved.includes(detail.id) ? "rgba(196,96,58,0.5)" : "rgba(46,31,14,0.9)"}`, cursor:"pointer" }}>
                  <FlameIcon size={28} filled={heatResults.loved.includes(detail.id)} color={heatResults.loved.includes(detail.id) ? "#c4603a" : "#4a2e18"} />
                  <span style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:heatResults.loved.includes(detail.id) ? "#c4603a" : "#4a2e18", fontFamily:"-apple-system,sans-serif" }}>LOVED</span>
                </button>
                {/* WATCH */}
                <button type="button" onClick={() => toggleWatch(detail.id)} style={{ background: watchlist.includes(detail.id) ? "#060f1a" : "#170d05", borderRadius:14, padding:"16px 6px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, border:`1px solid ${watchlist.includes(detail.id) ? "rgba(74,144,217,0.5)" : "rgba(46,31,14,0.9)"}`, cursor:"pointer" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={watchlist.includes(detail.id) ? "#4a90d9" : "#4a2e18"} strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke={watchlist.includes(detail.id) ? "#4a90d9" : "#4a2e18"} strokeWidth="1.5"/>
                  </svg>
                  <span style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:watchlist.includes(detail.id) ? "#4a90d9" : "#4a2e18", fontFamily:"-apple-system,sans-serif" }}>WATCH</span>
                </button>
                {/* MAPS */}
                <button type="button" onClick={() => window.open(detail.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(detail.address||detail.name)}`, "_blank")} style={{ background:"#170d05", borderRadius:14, padding:"16px 6px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, border:"1px solid rgba(46,31,14,0.9)", cursor:"pointer" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a2e18" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  <span style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:"#4a2e18", fontFamily:"-apple-system,sans-serif" }}>MAPS</span>
                </button>
                {/* SHARE */}
                <button type="button" onClick={async () => { const shareText = `Check out ${detail.name} — ${detail.cuisine} in ${detail.city}. Found on Cooked.`; try { if (navigator.share) { await navigator.share({ title: detail.name, text: shareText, url: window.location.href }); } else { await navigator.clipboard.writeText(shareText); setDetailShareCopied(true); setTimeout(() => setDetailShareCopied(false), 2000); } } catch { try { await navigator.clipboard.writeText(shareText); setDetailShareCopied(true); setTimeout(() => setDetailShareCopied(false), 2000); } catch {} } }} style={{ background:"#170d05", borderRadius:14, padding:"16px 6px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, border:"1px solid rgba(46,31,14,0.9)", cursor:"pointer" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a2e18" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span style={{ fontSize:9, letterSpacing:"0.14em", textTransform:"uppercase", color:"#4a2e18", fontFamily:"-apple-system,sans-serif" }}>{detailShareCopied ? "COPIED!" : "SHARE"}</span>
                </button>
              </div>
            </div>

            {/* SECTION 4 — DESCRIPTION */}
            {detail.desc && (
              <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"16px 18px" }}>
                <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:16, color:"#e8e0d4", lineHeight:1.65 }}>{detail.desc}</div>
              </div>
            )}

            {/* SECTION 5 — INFO */}
            {(() => {
              const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
              const todayStr = days[new Date().getDay()];
              const todayHours = (detail.hours||[]).find(h => h.startsWith(todayStr));
              const hoursVal = todayHours ? todayHours.replace(todayStr+": ","") : null;
              const shortAddr = (detail.address||"").split(",").slice(0,2).join(",").trim();
              const infoRows = [
                hoursVal && { svgPath:<><circle cx="12" cy="12" r="9" stroke="#5a3a20" strokeWidth="1.5" fill="none"/><polyline points="12 7 12 12 15 15" stroke="#5a3a20" strokeWidth="1.5" strokeLinecap="round"/></>, label:"HOURS TODAY", value:hoursVal },
                shortAddr && { svgPath:<><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#5a3a20" strokeWidth="1.5" fill="none"/><circle cx="12" cy="9" r="2.5" stroke="#5a3a20" strokeWidth="1.5" fill="none"/></>, label:"ADDRESS", value:shortAddr },
                detail.phone && { svgPath:<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6.1 6.1l1.09-1.09a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="#5a3a20" strokeWidth="1.5" fill="none"/></>, label:"PHONE", value:detail.phone, href:`tel:${detail.phone}` },
              ].filter(Boolean);
              if (!infoRows.length) return null;
              return (
                <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px", display:"flex", flexDirection:"column", gap:12 }}>
                  {infoRows.map((row,i) => (
                    <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink:0, marginTop:3 }}>{row.svgPath}</svg>
                      <div>
                        <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:2, fontFamily:"-apple-system,sans-serif" }}>{row.label}</div>
                        {row.href
                          ? <a href={row.href} style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"#e8e0d4", textDecoration:"none" }}>{row.value}</a>
                          : <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"#e8e0d4" }}>{row.value}</div>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* SECTION 6 — RESERVATIONS */}
            {detail.website && (
              <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
                <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:10, fontFamily:"-apple-system,sans-serif" }}>RESERVATIONS</div>
                <button type="button" onClick={() => window.open(detail.website,"_blank")} style={{ width:"100%", background:"#1a0f07", border:"1px solid #3a2010", borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ background:"#e8333c", color:"#fff", borderRadius:8, padding:"5px 9px", fontWeight:"bold", fontSize:12, fontFamily:"-apple-system,sans-serif", letterSpacing:"0.05em" }}>OT</span>
                    <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"#e8e0d4" }}>Book on OpenTable</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a3a20" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}

            {/* SECTION 8 — YOUR RATING */}
            <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:12, fontFamily:"-apple-system,sans-serif" }}>YOUR RATING</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => { const next = {...(userRatings||{})}; next[detail.id] = n; setUserRatings(next); }} style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}>
                    <FlameIcon size={34} filled={(userRatings[detail.id]||0) >= n} color={(userRatings[detail.id]||0) >= n ? "#c4603a" : "#2a1a0a"} />
                  </button>
                ))}
              </div>
              {userRatings[detail.id] && <div style={{ marginTop:8, fontSize:12, color:"#5a3a20", fontFamily:"-apple-system,sans-serif" }}>{userRatings[detail.id]} / 5 · Cooked score {detail.rating}</div>}
            </div>

            {/* SECTION 9 — CUISINE / MEAL TYPE */}
            <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:12, fontFamily:"-apple-system,sans-serif" }}>CUISINE / MEAL TYPE</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {[["Breakfast","🍳"],["Brunch","🥐"],["Lunch","🥗"],["Dinner","🍷"],["Bar","🍸"],["Coffee","☕"]].map(([listName, emoji]) => {
                  const isIn = (userLists[listName]||[]).includes(detail.id) || (listName==="Breakfast" && (userLists["Breakfast/Brunch"]||[]).includes(detail.id));
                  return (
                    <button key={listName} type="button" onClick={() => toggleList(listName==="Breakfast" ? "Breakfast/Brunch" : listName, detail.id)} style={{ borderRadius:20, padding:"7px 14px", cursor:"pointer", fontSize:13, fontFamily:"-apple-system,sans-serif", background: isIn ? "#c4603a" : "#0f0804", color: isIn ? "#fff" : "#5a3a20", border: isIn ? "1px solid rgba(255,255,255,0.12)" : "1px solid #2a1608", display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize:13, lineHeight:1 }}>{emoji}</span>
                      <span>{listName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 10 — TAGS */}
            <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:12, fontFamily:"-apple-system,sans-serif" }}>TAGS</div>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                {detailTags.map(tag => (
                  <button key={tag} type="button" onClick={() => { setActiveFilter(tag); setDetailRestaurant(null); }} style={{ padding:"6px 12px", borderRadius:20, border:"1px solid rgba(196,96,58,0.5)", background:"#c4603a", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"-apple-system,sans-serif" }}>{tag}</button>
                ))}
                <button type="button" onClick={() => setShowTagPicker(p => !p)} style={{ padding:"6px 12px", borderRadius:20, border:"1.5px dashed #2e1f0e", background:"transparent", color:"#5a3a20", fontSize:12, cursor:"pointer", fontFamily:"-apple-system,sans-serif" }}>+ Add tag</button>
              </div>
              {showTagPicker && (
                <div style={{ marginTop:12, maxHeight:200, overflowY:"auto", display:"flex", flexWrap:"wrap", gap:6 }}>
                  {ALL_TAGS.map(tag => {
                    const selected = detailTags.includes(tag);
                    return <button key={tag} type="button" onClick={() => addOrRemoveTag(tag)} style={{ padding:"5px 10px", borderRadius:12, border:`1px solid ${selected ? "#c4603a" : "#2e1f0e"}`, background: selected ? "#c4603a" : "#0a0602", color: selected ? "#fff" : "#5a3a20", fontSize:11, cursor:"pointer", fontFamily:"-apple-system,sans-serif" }}>{tag}</button>;
                  })}
                </div>
              )}
            </div>

            {/* SECTION 11 — NOTES */}
            <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:12, fontFamily:"-apple-system,sans-serif" }}>NOTES</div>
              {(userNotes[detail.id]||[]).map((note, i) => (
                <div key={i} style={{ borderLeft:"2px solid #c4603a", padding:"9px 13px", background:"#080502", borderRadius:8, marginBottom:8 }}>
                  <div style={{ fontSize:13, color:"#e8e0d4", lineHeight:1.5, fontFamily:"-apple-system,sans-serif" }}>{typeof note === "object" && note.text != null ? note.text : note}</div>
                  <div style={{ fontSize:10, color:"#4a2e18", marginTop:5, fontFamily:"-apple-system,sans-serif" }}>{typeof note === "object" && note.time ? note.time : ""}</div>
                </div>
              ))}
              <div style={{ display:"flex", gap:8 }}>
                <input value={noteInput} onChange={e => setNoteInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (!noteInput.trim()) return; setUserNotes(prev => ({ ...prev, [detail.id]: [...(prev[detail.id]||[]), { text: noteInput.trim(), time: new Date().toLocaleString() }] })); setNoteInput(""); })()} placeholder="Add a note..." style={{ flex:1, background:"#080502", border:"1px solid #2a1608", borderRadius:10, padding:"11px 14px", color:"#e8e0d4", fontSize:13, outline:"none", fontFamily:"-apple-system,sans-serif" }} />
                <button type="button" onClick={() => { if (!noteInput.trim()) return; setUserNotes(prev => ({ ...prev, [detail.id]: [...(prev[detail.id]||[]), { text: noteInput.trim(), time: new Date().toLocaleString() }] })); setNoteInput(""); }} style={{ padding:"11px 20px", borderRadius:10, background:"#c4603a", color:"#fff", border:"none", fontSize:13, cursor:"pointer", fontFamily:"Georgia,serif", fontStyle:"italic" }}>Add</button>
              </div>
            </div>

            {/* SECTION 12 — NEARBY */}
            {(() => {
              const nearby = RESTAURANTS.filter(other =>
                other.id !== detail.id &&
                other.city === detail.city &&
                (
                  other.tags?.some(t => ["cocktails","craft cocktails","wine bar","bar","late night","speakeasy","tiki","champagne","happy hour"].includes(t)) ||
                  other.tags?.some(t => ["pastry","bakery","dessert","coffee","great coffee"].includes(t)) ||
                  (other.cuisine||"").toLowerCase().match(/bar|coffee|bakery|dessert/)
                )
              ).sort((a,b) => (b.rating||0)-(a.rating||0)).slice(0,8);
              if (!nearby.length) return null;
              return (
                <div style={{ paddingTop:18, paddingBottom:24 }}>
                  <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", padding:"0 18px", marginBottom:12, fontFamily:"-apple-system,sans-serif" }}>NEARBY</div>
                  <div style={{ display:"flex", gap:12, overflowX:"auto", padding:"0 18px 4px" }}>
                    {nearby.map(r => (
                      <HomePhotoCard key={r.id} r={r} onClick={() => setDetailRestaurant(r)} style={{ minWidth:150, maxWidth:150, height:160, borderRadius:14, flexShrink:0 }}>
                        <div style={{ position:"absolute", top:10, right:10, fontFamily:"Georgia,serif", fontWeight:"bold", fontSize:14, color:"#c4603a" }}>{r.rating}</div>
                        <div style={{ position:"absolute", bottom:24, left:10, right:10, fontFamily:"Georgia,serif", fontWeight:"bold", fontSize:13, color:"#f0ebe2", lineHeight:1.2 }}>{r.name}</div>
                        <div style={{ position:"absolute", bottom:8, left:10, fontSize:11, color:"rgba(240,235,226,0.6)" }}>{r.cuisine}</div>
                      </HomePhotoCard>
                    ))}
                  </div>
                </div>
              );
            })()}

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
