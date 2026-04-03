import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { SignInButton, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { RESTAURANTS, ALL_TAGS, normalizeCity, CITY_REGIONS as CANONICAL_CITY_REGIONS, sortCityRegions, getFullCityRegions } from "../data/restaurants";
import { ProfilePhoto, getDefaultAvatar, AvatarIcon } from "../components/AvatarIcon";
import BugReportButton from "../components/BugReportButton";

/** All cities — base + any admin-approved custom cities */
const BASE_CITY_REGIONS = getFullCityRegions();

// Auto-classify a city into a region based on keywords/known patterns
const REGION_HINTS = {
  "United States": ["California","Florida","Texas","Hawaii","Oregon","Arizona","Georgia","Tennessee","Nevada","Colorado","New York","Illinois","Massachusetts","Washington","Virginia","Pennsylvania","New Jersey","Connecticut","Maryland","North Carolina","South Carolina","Louisiana","Montana","Idaho","Wyoming","Utah","New Mexico","Minnesota","Wisconsin","Michigan","Ohio","Indiana","Missouri","Kansas","Nebraska","Iowa","Oklahoma","Arkansas","Alabama","Mississippi","Kentucky","West Virginia","Delaware","Rhode Island","New Hampshire","Vermont","Maine","Alaska","DC","Seattle","Denver","Vail","Aspen","Ventura County","Napa Valley","Malibu","Ojai","Santa Barbara","Sacramento","Atlanta","St. Louis","Detroit","Boise","Maui","Pacific Northwest","Mountain West"],
  "Mexico & Caribbean": ["Mexico","Cancún","Tulum","Oaxaca","Guadalajara","Monterrey","Puerto Vallarta","San Miguel","Cabo","Caribbean","Jamaica","Bahamas","Barbados","Trinidad","Puerto Rico","San Juan","Cuba","Dominican Republic","Aruba","St. Barts","Turks","Punta Cana","Havana","Nassau","Montego Bay"],
  "Europe": ["France","Italy","Spain","Germany","Netherlands","Denmark","Portugal","Sweden","Norway","Finland","Greece","Croatia","Switzerland","Austria","Belgium","Ireland","Scotland","Wales","England","Poland","Czech","Hungary","Romania","Bulgaria","Serbia","Montenegro","Albania","Slovenia","Slovakia","Estonia","Latvia","Lithuania","Turkey","Cyprus","Sardinia","Sicily","Corsica","Mallorca","Santorini","Crete","Amalfi","Provence","Tuscany","Riviera","Monaco","Luxembourg"],
  "Middle East": ["UAE","Saudi","Qatar","Bahrain","Oman","Kuwait","Jordan","Lebanon","Israel","Egypt","Morocco","Tunisia"],
  "Asia": ["Japan","Korea","China","Taiwan","Thailand","Vietnam","Indonesia","Philippines","Malaysia","India","Sri Lanka","Nepal","Cambodia","Laos","Myanmar"],
  "Canada": ["Canada","Vancouver","Montreal","Calgary","Ottawa","Quebec","Winnipeg","Edmonton","Halifax"],
  "Africa": ["South Africa","Kenya","Nigeria","Ghana","Tanzania","Ethiopia","Cape Town","Johannesburg","Nairobi","Lagos","Accra","Marrakech","Kalahari","Liberia"],
  "South America": ["Brazil","Argentina","Colombia","Peru","Chile","Ecuador","Uruguay","Bolivia","São Paulo","Rio","Buenos Aires","Bogotá","Lima","Santiago","Medellín","Cartagena"],
  "Oceania": ["Australia","New Zealand","Sydney","Melbourne","Auckland","Brisbane","Perth","Fiji"],
};

function classifyCity(cityName) {
  const lower = cityName.toLowerCase();
  for (const [region, hints] of Object.entries(REGION_HINTS)) {
    if (hints.some(h => lower.includes(h.toLowerCase()) || h.toLowerCase().includes(lower))) return region;
  }
  return null; // couldn't classify
}

// Build dynamic city regions from all restaurants
function buildCityRegions(allRestaurants) {
  const knownCities = new Set(BASE_CITY_REGIONS.flatMap(r => r.cities));
  const newCities = {};
  for (const r of allRestaurants) {
    if (r.city && !knownCities.has(r.city)) {
      const region = classifyCity(r.city);
      if (region) {
        if (!newCities[region]) newCities[region] = new Set();
        newCities[region].add(r.city);
      } else {
        // Default to "Other" or try by lat/lng
        if (!newCities["Other"]) newCities["Other"] = new Set();
        newCities["Other"].add(r.city);
      }
    }
  }
  const regions = BASE_CITY_REGIONS.map(r => ({
    ...r,
    cities: [...r.cities, ...(newCities[r.region] ? [...newCities[r.region]] : [])],
  }));
  // Add "Other" region if there are unclassified cities
  if (newCities["Other"]?.size) {
    regions.push({ region: "Other", cities: [...newCities["Other"]] });
  }
  // Remove empty regions
  return regions.filter(r => r.cities.length > 0);
}

// These will be overwritten once allRestaurants loads, but need defaults for initial render
let CITY_REGIONS = BASE_CITY_REGIONS.filter(r => r.cities.length > 0);
let ALL_CITIES = [...new Set(CITY_REGIONS.flatMap(r => r.cities))];

function getPersonalizedCityRegions(lovedRestaurants, followedCities, heatResults, cityRegions) {
  // Sort: followed cities first within each region, then alphabetical
  return sortCityRegions(cityRegions || CITY_REGIONS, followedCities || []);
}
import ChatBot from "../components/ChatBot";
import Profile from "./Profile";
import TasteProfile from "./TasteProfile";
import UserProfile from "./UserProfile";
import Onboarding from "./Onboarding";
import { addCommunityRestaurant, followCity, followUser, getCommunityRestaurants, getFollowedCities, getFollowing, isFollowing as checkUserIsFollowing, loadSharedPhotos, loadUserData, saveSharedPhoto, saveUserData, supabase, unfollowCity, unfollowUser, getAdminOverrides, sendMessage, getInbox, getConversation, markMessagesRead, getUnreadMessageCount, logInteraction, fetchFlameScores, computeFlameScore, getAllRestaurants as getAllRestaurantsFromSupabase, upsertRestaurant, softDeleteRestaurant } from "../lib/supabase";
import { syncLove, removeLove, syncFollow, removeFollow, syncCityFollow, removeCityFollow, getFriendsWhoLovedRestaurant, getTrendingInFollowedCities, syncRestaurant, seedAllRestaurants, getYoudLoveThis, getRisingRestaurants, getHiddenGems, getSixDegrees, getTasteFingerprint, getPeopleLikeYou, getWhoToFollow, getSmartSwipeScores, getPersonalizationScores, getCrossCuisineRecs } from "../lib/neo4j";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const DATA_VERSION = "v5-2920";

function lovedIdsFromUserRow(row) {
  if (Array.isArray(row?.loved)) return row.loved;
  if (Array.isArray(row?.heat?.loved)) return row.heat.loved;
  return [];
}

function restaurantIdInLovedList(restId, loved) {
  if (!Array.isArray(loved)) return false;
  return loved.includes(restId) || loved.includes(Number(restId));
}

function flameRatingFromUserData(ratings, restId) {
  if (!ratings || typeof ratings !== "object") return null;
  const raw = ratings[restId] ?? ratings[String(restId)] ?? ratings[Number(restId)];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

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

const COOKED_PHOTOS_KEY = "cooked_photos";
const COOKED_PHOTOS_PREVIEW_KEY = "cooked_photos_preview";
const COOKED_PHOTOS_LRU_KEY = "cooked_photos_lru";
const PHOTO_CACHE_MAX_BYTES = 3 * 1024 * 1024;
const PHOTO_CACHE_KEEP_COUNT = 50;

function isQuotaExceededError(e) {
  return (
    (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) ||
    (e && e.name === "QuotaExceededError")
  );
}

/** Safe localStorage read — catches quota / access errors */
function safeLocalStorageGetItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    if (isQuotaExceededError(e)) console.warn("[cooked] localStorage.getItem QuotaExceededError:", key);
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.code === 22) {
      // Clear the photo vault (largest offender) and retry once
      console.warn("localStorage quota exceeded, clearing photo cache");
      localStorage.removeItem("cooked_photos");
      localStorage.removeItem("cooked_photos_preview");
      localStorage.removeItem("cooked_photos_lru");
      try {
        localStorage.setItem(key, value);
      } catch (e2) {
        console.error("localStorage still full after clearing photos:", e2);
      }
    }
  }
}

/** Track photo cache access for LRU trimming (call when a cached photo is used). */
function touchPhotoCacheAccess(restaurantId) {
  if (typeof window === "undefined" || restaurantId == null) return;
  const id = String(restaurantId);
  try {
    let lru = [];
    try {
      lru = JSON.parse(safeLocalStorageGetItem(COOKED_PHOTOS_LRU_KEY) || "[]");
    } catch {
      lru = [];
    }
    if (!Array.isArray(lru)) lru = [];
    const next = lru.filter((x) => String(x) !== id);
    next.push(id);
    safeSetItem(COOKED_PHOTOS_LRU_KEY, JSON.stringify(next));
  } catch (e) {
    if (isQuotaExceededError(e)) console.warn("[cooked] touchPhotoCacheAccess QuotaExceededError");
  }
}

/**
 * If cooked_photos + cooked_photos_preview exceed 3MB, keep only the 50 most recently
 * accessed entries (via cooked_photos_lru). Call once on startup before other reads.
 */
function clearOldPhotoCache() {
  if (typeof window === "undefined") return;
  try {
    const photosRaw = safeLocalStorageGetItem(COOKED_PHOTOS_KEY) || "{}";
    const previewRaw = safeLocalStorageGetItem(COOKED_PHOTOS_PREVIEW_KEY) || "{}";
    let sizeBytes = 0;
    try {
      sizeBytes = new Blob([photosRaw, previewRaw]).size;
    } catch {
      sizeBytes = photosRaw.length + previewRaw.length;
    }
    if (sizeBytes <= PHOTO_CACHE_MAX_BYTES) return;

    let photos = {};
    let preview = {};
    try {
      photos = JSON.parse(photosRaw) || {};
    } catch {
      photos = {};
    }
    try {
      preview = JSON.parse(previewRaw) || {};
    } catch {
      preview = {};
    }

    const idStr = (k) => String(k);
    const allIdSet = new Set([
      ...Object.keys(photos).map(idStr),
      ...Object.keys(preview).map(idStr),
    ]);

    let lru = [];
    try {
      lru = JSON.parse(safeLocalStorageGetItem(COOKED_PHOTOS_LRU_KEY) || "[]");
    } catch {
      lru = [];
    }
    if (!Array.isArray(lru)) lru = [];
    const lruStr = lru.map(idStr).filter((id) => allIdSet.has(id));

    const inLru = new Set(lruStr);
    const notInLru = [...allIdSet].filter((id) => !inLru.has(id));
    const ordered = [...notInLru, ...lruStr];
    const keepList = ordered.slice(-PHOTO_CACHE_KEEP_COUNT);
    const keep = new Set(keepList);

    const nextPhotos = {};
    const nextPreview = {};
    for (const id of keep) {
      if (Object.prototype.hasOwnProperty.call(photos, id)) nextPhotos[id] = photos[id];
      if (Object.prototype.hasOwnProperty.call(preview, id)) nextPreview[id] = preview[id];
    }

    const lruOrdered = keepList.filter((id) => keep.has(id));

    try {
      safeSetItem(COOKED_PHOTOS_KEY, JSON.stringify(nextPhotos));
      safeSetItem(COOKED_PHOTOS_PREVIEW_KEY, JSON.stringify(nextPreview));
      safeSetItem(COOKED_PHOTOS_LRU_KEY, JSON.stringify(lruOrdered));
    } catch (e) {
      if (isQuotaExceededError(e)) {
        console.warn("[cooked] clearOldPhotoCache write QuotaExceededError");
      } else {
        console.warn("[cooked] clearOldPhotoCache write failed", e);
      }
    }
  } catch (e) {
    if (isQuotaExceededError(e)) console.warn("[cooked] clearOldPhotoCache QuotaExceededError");
    else console.warn("[cooked] clearOldPhotoCache", e);
  }
}

// Bust stale localStorage if version mismatch
if (typeof window !== "undefined") {
  clearOldPhotoCache();
  try {
    const storedVersion = safeLocalStorageGetItem("cooked_data_version");
    if (storedVersion !== DATA_VERSION) {
      try {
        safeSetItem("cooked_data_version", DATA_VERSION);
      } catch (e) {
        if (isQuotaExceededError(e)) console.warn("[cooked] version migration QuotaExceededError");
      }
    }
  } catch (e) {
    if (isQuotaExceededError(e)) console.warn("[cooked] startup version read QuotaExceededError");
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
};

const FLAME_PATH = "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

let _flameIdCounter = 0;
const FlameIcon = ({ size = 18, color = C.terracotta, filled = true }) => {
  const id = useMemo(() => `fg${_flameIdCounter++}`, []);
  if (!filled) {
    return (
      <svg width={size} height={size * 1.2} viewBox="0 0 167 200" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round">
        <path d={FLAME_PATH} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 167 200" style={{ filter: "drop-shadow(0 2px 6px rgba(255,120,40,0.35)) drop-shadow(0 0 10px rgba(255,150,50,0.15))" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffcc44" />
          <stop offset="30%" stopColor="#ffaa30" />
          <stop offset="60%" stopColor="#f07830" />
          <stop offset="100%" stopColor="#c44828" />
        </linearGradient>
      </defs>
      <path d={FLAME_PATH} fill={`url(#${id})`} />
    </svg>
  );
};

const HalfFlameIcon = ({ size = 18, color = C.terracotta }) => {
  const id = useMemo(() => `hfg${_flameIdCounter++}`, []);
  const clipId = useMemo(() => `hfc${_flameIdCounter++}`, []);
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 167 200" style={{ filter: "drop-shadow(0 1px 4px rgba(255,120,40,0.2))" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffcc44" />
          <stop offset="30%" stopColor="#ffaa30" />
          <stop offset="60%" stopColor="#f07830" />
          <stop offset="100%" stopColor="#c44828" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="84" height="200" />
        </clipPath>
      </defs>
      <path d={FLAME_PATH} fill="none" stroke="rgba(245,240,235,0.15)" strokeWidth={8} />
      <path d={FLAME_PATH} fill={`url(#${id})`} clipPath={`url(#${clipId})`} />
    </svg>
  );
};

const FlameRating = ({ count, score, total = 5, size = 11 }) => {
  const value = typeof count === "number" ? count : (score || 0);
  const fullFlames = Math.floor(value);
  const hasHalf = value - fullFlames >= 0.5;
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: total }, (_, i) => {
        if (i < fullFlames) return <FlameIcon key={i} size={size} color={C.terracotta} filled />;
        if (i === fullFlames && hasHalf) return <HalfFlameIcon key={i} size={size} color={C.terracotta} />;
        return <FlameIcon key={i} size={size} color="rgba(245,240,235,0.15)" filled={false} />;
      })}
    </div>
  );
};

const Wordmark = ({ size = 22 }) => (
  <div
    style={{
      fontFamily: "'Playfair Display', Georgia, serif",
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

const PageHeader = ({ right, onLogoClick }) => (
  <div
    style={{
      padding: "6px 18px 8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0,
    }}
  >
    <div onClick={onLogoClick} style={{ cursor: onLogoClick ? "pointer" : "default" }}>
      <Wordmark size={22} />
    </div>
    {right}
  </div>
);

function NotificationBellIcon({ color = C.text }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MapPinTabIcon({ size = 18, color = C.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 2C8 2 5 5.5 5 9c0 5 7 13 7 13s7-8 7-13c0-3.5-3-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/** City picker follow toggle — filled terracotta when following, outlined when not */
function CityFollowPinIcon({ followed }) {
  if (followed) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={C.terracotta} stroke={C.terracotta} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8 2 5 5.5 5 9c0 5 7 13 7 13s7-8 7-13c0-3.5-3-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" fill={C.bg2} />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8 2 5 5.5 5 9c0 5 7 13 7 13s7-8 7-13c0-3.5-3-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function NotificationTypeIcon({ type, size = 18 }) {
  const stroke = C.muted;
  switch (type) {
    case "followed_you":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case "restaurant_trending":
    case "friend_loved_your_watchlist":
      return <FlameIcon size={size} color={stroke} filled={false} />;
    case "friend_new_find":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case "friend_visited_your_city":
      return <MapPinTabIcon size={size} color={stroke} />;
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

/** Unique cities from loved restaurant IDs (user_data.heat.loved or loved). */
function countCitiesVisitedFromUserRow(userRow, restaurants) {
  const loved = userRow?.heat?.loved ?? userRow?.loved;
  if (!Array.isArray(loved) || loved.length === 0) return 0;
  const byId = new Map(restaurants.map((r) => [r.id, r]));
  const cities = new Set();
  loved.forEach((id) => {
    const r = byId.get(id) ?? byId.get(Number(id));
    if (r?.city) cities.add(r.city);
  });
  return cities.size;
}

function formatUsernameForDisplay(raw) {
  const s = (raw || "").trim();
  if (!s) return "@";
  return s.startsWith("@") ? s : `@${s}`;
}

function formatNotificationTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

function notificationMessage(row) {
  if (row?.type === "announcement" && row?.restaurant_name) return row.restaurant_name;
  if (row?.message != null && String(row.message).trim()) return String(row.message);
  if (row?.body != null && String(row.body).trim()) return String(row.body);
  if (row?.content != null && String(row.content).trim()) return String(row.content);
  const userName = row?._fromUser?.profile_name || "Someone";
  const restName = row?.restaurant_name || "a restaurant";
  switch (row?.type) {
    case "followed_you": return `${userName} started following you`;
    case "friend_loved_your_watchlist": return `${userName} loved ${restName} — it's on your watchlist!`;
    case "friend_new_find": return `${userName} added a new Find`;
    case "friend_visited_city": return `${userName} loved ${restName} in a city you follow`;
    case "restaurant_trending": return `${restName} is trending right now`;
    default:
      if (row?.restaurant_name && row?._fromUser?.profile_name) return `${userName} · ${restName}`;
      if (row?.restaurant_name) return restName;
      if (row?._fromUser?.profile_name) return `Activity from ${userName}`;
      return "New activity";
  }
}

/** Group notifications by time period like Instagram */
function getNotifTimeGroup(iso) {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  if (d >= todayStart) return "Today";
  if (d >= yesterdayStart) return "Yesterday";
  if (d >= weekStart) return "This Week";
  return "Earlier";
}

/** Group same restaurant+type notifications within the same time group */
function groupNotifList(notifications) {
  const TIME_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];
  const grouped = {};
  for (const n of notifications) {
    const tg = getNotifTimeGroup(n.created_at);
    if (!grouped[tg]) grouped[tg] = [];
    // Group restaurant-related notifs by restaurant+type
    const canGroup = n.restaurant_id && (n.type === "friend_loved_your_watchlist" || n.type === "friend_new_find" || n.type === "friend_visited_city");
    if (canGroup) {
      const key = `${n.type}:${n.restaurant_id}`;
      const existing = grouped[tg].find(g => g._groupKey === key);
      if (existing) {
        existing._users.push(n._fromUser);
        existing._allNotifs.push(n);
        if (!n.read) existing.read = false;
        continue;
      }
    }
    grouped[tg].push({
      ...n,
      _groupKey: canGroup ? `${n.type}:${n.restaurant_id}` : null,
      _users: n._fromUser ? [n._fromUser] : [],
      _allNotifs: [n],
    });
  }
  const result = [];
  for (const tg of TIME_ORDER) {
    if (grouped[tg]?.length > 0) {
      result.push({ _sectionHeader: tg });
      result.push(...grouped[tg]);
    }
  }
  return result;
}

/** Build grouped message text with bold name */
function buildNotifMessage(row) {
  const users = (row._users || []).filter(Boolean);
  const restName = row.restaurant_name || "a restaurant";
  if (users.length === 0) {
    if (row.type === "restaurant_trending") return { bold: restName, text: `${restName} is trending right now` };
    return { bold: "", text: notificationMessage(row) };
  }
  const firstName = users[0]?.profile_name || "Someone";
  const othersCount = users.length - 1;
  switch (row.type) {
    case "followed_you":
      return { bold: firstName, text: `${firstName} started following you.` };
    case "friend_loved_your_watchlist": {
      if (othersCount === 0) return { bold: firstName, text: `${firstName} loved ${restName} — it's on your watchlist!` };
      if (othersCount === 1) return { bold: firstName, text: `${firstName} and ${users[1]?.profile_name || "someone"} loved ${restName}` };
      return { bold: firstName, text: `${firstName} and ${othersCount} others loved ${restName}` };
    }
    case "friend_new_find": {
      if (othersCount === 0) return { bold: firstName, text: `${firstName} added a new Find: ${restName}` };
      return { bold: firstName, text: `${firstName} and ${othersCount} other${othersCount > 1 ? "s" : ""} added ${restName}` };
    }
    case "friend_visited_city": {
      if (othersCount === 0) return { bold: firstName, text: `${firstName} loved ${restName} in a city you follow` };
      return { bold: firstName, text: `${firstName} and ${othersCount} other${othersCount > 1 ? "s" : ""} loved ${restName} in a city you follow` };
    }
    default:
      return { bold: firstName, text: notificationMessage(row) };
  }
}

/** Render text with first bold name highlighted */
function renderNotifBoldText({ text, bold }) {
  if (!bold || !text.includes(bold)) return <span>{text}</span>;
  const idx = text.indexOf(bold);
  return <span>{text.slice(0, idx)}<span style={{ fontWeight: 700, color: "#f5f0eb" }}>{bold}</span>{text.slice(idx + bold.length)}</span>;
}

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

function RestCard({ r, loved, watched, onLove, onWatch, onShare, onOpenDetail, onPhotoFetched, getCachedPhotoForId, photoCacheVersion = 0, usingSupabasePhotoCache, flameScore }) {
  const cardRef = useRef(null);
  const cachedSrc = getCachedPhotoForId ? getCachedPhotoForId(r.id) || r.img : r.img;
  const [imgSrc, setImgSrc] = useState(cachedSrc);

  useEffect(() => {
    setImgSrc(getCachedPhotoForId ? getCachedPhotoForId(r.id) || r.img : r.img);
  }, [r.img, r.id, photoCacheVersion, getCachedPhotoForId]);

  useEffect(() => {
    if (!r.img || !r.img.includes('picsum')) return; // already has a real photo
    try {
      const cached = getCachedPhotoForId?.(r.id);
      if (cached) {
        if (!usingSupabasePhotoCache) touchPhotoCacheAccess(r.id);
        setImgSrc(cached);
        return;
      }
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
  }, [r.id, r.img, photoCacheVersion, getCachedPhotoForId, usingSupabasePhotoCache, onPhotoFetched]);

  const score = flameScore != null ? flameScore : Math.min(5, r.googleRating || (r.rating ? r.rating / 2 : 3));
  const litCount = Math.round(score);
  const dimCount = 5 - litCount;

  return (
    <div ref={cardRef} className="disc-card" onClick={() => onOpenDetail?.(r)}>
      <div className="disc-card-img">
        <img src={imgSrc} alt={r.name} />
        {r.source && (
          <div className="disc-card-source">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            {r.source}
          </div>
        )}
        <div className="disc-card-flames">
          <span className="lit">{"🔥".repeat(litCount)}</span>
          {dimCount > 0 && <span className="dim">{"🔥".repeat(dimCount)}</span>}
        </div>
      </div>
      <div className="disc-card-body">
        <div className="disc-card-name">{r.name}</div>
        <div className="disc-card-cuisine">
          <span className="type">{r.cuisine}</span>
          <span className="sep">·</span>
          <span className="loc">{r.neighborhood}</span>
          <span className="sep">·</span>
          <span className="price">{r.price}</span>
        </div>
        {r.desc && <div className="disc-card-desc">{r.desc}</div>}
        <div className="disc-card-tags">
          {(r.tags || []).map(t => (
            <span key={t} className="disc-tag">{t}</span>
          ))}
        </div>
        <div className="disc-card-actions" onClick={e => e.stopPropagation()}>
          <button className={`disc-action ${loved ? "loved" : "watch"}`} onClick={onLove}>
            {loved ? "Loved It ♥" : "Love It ♡"}
          </button>
          <button className={`disc-action ${watched ? "loved" : "watch"}`} onClick={onWatch} style={watched ? { background:"linear-gradient(135deg, rgba(100,160,255,0.1), rgba(60,100,180,0.06))", color:"#6b9fff", borderColor:"rgba(100,160,255,0.12)" } : undefined}>
            {watched ? "On Watchlist" : "Watchlist"}
          </button>
          <button className="disc-action share" onClick={() => onShare(r.name)}>Share ↗</button>
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
        <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:17, fontWeight:700, color:C.text }}>{item.restaurant.name}</div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {totalPages > 1 && (
            <div style={{ display:"flex", gap:4 }}>
              <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"3px 7px", background:C.bg2, color:C.muted, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.4 : 1, fontFamily:"'Inter', -apple-system, sans-serif" }}>‹</button>
              <span style={{ fontSize:10, color:C.muted, fontFamily:"'Inter', -apple-system, sans-serif", lineHeight:"24px" }}>{page+1}/{totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"3px 7px", background:C.bg2, color:C.muted, cursor: page === totalPages - 1 ? "default" : "pointer", opacity: page === totalPages - 1 ? 0.4 : 1, fontFamily:"'Inter', -apple-system, sans-serif" }}>›</button>
            </div>
          )}
          <button type="button" onClick={() => { setPage(0); onRefresh(pickerIndex); }} style={{ fontSize:11, borderRadius:14, border:`1px solid ${C.border}`, padding:"4px 8px", background:C.bg2, color:C.muted, cursor:"pointer", fontFamily:"'Inter', -apple-system, sans-serif" }}>Refresh</button>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8 }}>
        {item.isRefreshing ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.bg3, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted, fontFamily:"'Inter', -apple-system, sans-serif" }}>…</div>
          ))
        ) : item.photoOptions.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.bg3, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.muted, fontFamily:"'Inter', -apple-system, sans-serif" }}>{i === 0 ? (firedRef.current ? "No photos" : "Waiting") : "·"}</div>
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
  const { user } = useUser();
  const skipNextTabPersistRef = useRef(false);
  const [tab, setTab] = useState(() => {
    try {
      const last = localStorage.getItem("cooked_last_tab");
      if (last && ["home", "heat", "discover", "map", "profile"].includes(last)) return last;
    } catch {}
    return "home";
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem("cooked_onboarding_done");
    } catch {
      return false;
    }
  });

  // PWA tab navigation history — back-swipe goes to previous tab, not Google sign-in
  const prevTabRef = useRef(null);
  useEffect(() => {
    if (prevTabRef.current === null) { prevTabRef.current = tab; return; } // skip initial
    if (prevTabRef.current !== tab) {
      window.history.pushState({ tab }, "");
      prevTabRef.current = tab;
    }
  }, [tab]);
  useEffect(() => {
    const handlePop = (e) => {
      if (e.state?.tab) setTab(e.state.tab);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const [showHeatTip, setShowHeatTip] = useState(false);
  const [heatTipFading, setHeatTipFading] = useState(false);
  const [setupGateOpen, setSetupGateOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupSaving, setSetupSaving] = useState(false);
  const [city, setCity] = useState(() => {
    try { return localStorage.getItem("cooked_default_city") || "Los Angeles"; } catch { return "Los Angeles"; }
  });
  const [homeCity, setHomeCity] = useState(() => {
    try { return localStorage.getItem("cooked_default_city") || "Los Angeles"; } catch { return "Los Angeles"; }
  });
  const [followedCities, setFollowedCities] = useState([]);
  const [trendingInCities, setTrendingInCities] = useState([]);
  const [youdLoveThis, setYoudLoveThis] = useState([]);
  const [risingRestaurants, setRisingRestaurants] = useState([]);
  const [hiddenGems, setHiddenGems] = useState([]);
  const [sixDegreesResult, setSixDegreesResult] = useState(null);
  const [chatTasteProfile, setChatTasteProfile] = useState(null);
  const [suggestedFriends, setSuggestedFriends] = useState([]);
  const [peopleLikeYou, setPeopleLikeYou] = useState([]);
  const [sixDegreesTarget, setSixDegreesTarget] = useState(null);
  const [sixDegreesLoading, setSixDegreesLoading] = useState(false);
  const [showTasteProfile, setShowTasteProfile] = useState(false);
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_watchlist") || "[]"); } catch { return []; }
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
  // DM state
  const [dmOpen, setDmOpen] = useState(false);
  const [dmInbox, setDmInbox] = useState([]);
  const [dmConvo, setDmConvo] = useState(null); // { partnerId, partnerName, partnerPhoto }
  const [dmMessages, setDmMessages] = useState([]);
  const [dmInput, setDmInput] = useState("");
  const [dmSending, setDmSending] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
  const [dmSharePicker, setDmSharePicker] = useState(null); // restaurant to share via DM
  const [dmShareSearch, setDmShareSearch] = useState("");
  const [dmShareResults, setDmShareResults] = useState([]);
  const dmMessagesEndRef = useRef(null);
  const photoQueue = useRef([]);
  const photoQueueRunning = useRef(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const filteredRef = useRef([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [selectedRest, setSelectedRest] = useState(null);
  const [viewingUserId, setViewingUserId] = useState(null);
  /** Friends (following) who loved this spot — from Neo4j when detail opens. */
  const [friendsBeenHere, setFriendsBeenHere] = useState({ loading: false, list: [] });
  const [friendsBeenHereSheetOpen, setFriendsBeenHereSheetOpen] = useState(false);
  // Restaurants: static RESTAURANTS + community (Supabase) merged in useEffect below — never persisted in localStorage (Safari quota).
  const [allRestaurants, setAllRestaurants] = useState(() => {
    try {
      let allVaultPhotos = {};
      // When signed in, Supabase is the source of truth for photos (no localStorage reads for vault).
      if (!user?.id) {
        try {
          allVaultPhotos = JSON.parse(safeLocalStorageGetItem("cooked_photos") || "{}");
        } catch {}
      }
      let resolvedIds = new Set();
      if (!user?.id) {
        try {
          resolvedIds = new Set(JSON.parse(safeLocalStorageGetItem("cooked_photo_resolved") || "[]"));
        } catch {}
      }
      const savedPhotos = {};
      Object.keys(allVaultPhotos).forEach((id) => {
        if (resolvedIds.has(Number(id)) || resolvedIds.has(id)) savedPhotos[id] = allVaultPhotos[id];
      });
      let previewPhotos = {};
      if (!user?.id) {
        try { previewPhotos = JSON.parse(safeLocalStorageGetItem("cooked_photos_preview") || "{}"); } catch {}
      }
      const baseMerged = RESTAURANTS.map((r) => {
        const freshHeat = r.heat;
        const vaultImg = savedPhotos[r.id];
        const previewImg = previewPhotos[r.id];
        if (vaultImg) return { ...r, img: vaultImg, img2: vaultImg, heat: freshHeat };
        if (previewImg) return { ...r, img: previewImg, img2: previewImg, heat: freshHeat };
        return r;
      });
      const valid = baseMerged.filter(
        (r) => r && typeof r.id === "number" && typeof r.name === "string" && r.name
      );
      return valid.length > 0 ? valid : RESTAURANTS;
    } catch {
      return RESTAURANTS;
    }
  });
  const allRestaurantsRef = useRef(RESTAURANTS);
  allRestaurantsRef.current = allRestaurants;
  const [photoResolved, setPhotoResolved] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_photo_resolved") || "[]"); } catch { return []; }
  });

  // Photo cache source-of-truth (shared library first).
  // - Global Supabase `restaurant_photos` loaded into `photoCacheRef`.
  // - Fallback to localStorage (`cooked_photos` + `cooked_photos_preview`) for offline/unauthenticated mode.
  const photoCacheRef = useRef({});
  const [usingSupabasePhotoCache, setUsingSupabasePhotoCache] = useState(false);
  const [photoCacheVersion, setPhotoCacheVersion] = useState(0);

  const resolvedIdSet = useMemo(() => {
    const s = new Set();
    for (const id of photoResolved || []) {
      s.add(id);
      s.add(Number(id));
      s.add(String(id));
    }
    return s;
  }, [photoResolved]);

  // Dynamic city regions — auto-discovers cities from imported restaurants
  const dynamicCityRegions = useMemo(() => { try { return buildCityRegions(allRestaurants || []); } catch { return BASE_CITY_REGIONS.filter(r => r.cities.length > 0); } }, [allRestaurants]);
  const dynamicAllCities = useMemo(() => { try { return [...new Set(dynamicCityRegions.flatMap(r => r.cities))]; } catch { return []; } }, [dynamicCityRegions]);

  const getVaultPhotoForId = (id) => {
    if (usingSupabasePhotoCache) {
      const cache = photoCacheRef.current || {};
      return cache[id] || cache[String(id)] || cache[Number(id)] || null;
    }
    try {
      const vault = JSON.parse(safeLocalStorageGetItem("cooked_photos") || "{}");
      return vault?.[id] || vault?.[Number(id)] || vault?.[String(id)] || null;
    } catch {
      return null;
    }
  };

  const getPreviewPhotoForId = (id) => {
    if (usingSupabasePhotoCache) {
      if (resolvedIdSet.has(id) || resolvedIdSet.has(Number(id)) || resolvedIdSet.has(String(id))) return null;
      return photoCacheRef.current?.[id] || photoCacheRef.current?.[Number(id)] || photoCacheRef.current?.[String(id)] || null;
    }
    try {
      const preview = JSON.parse(safeLocalStorageGetItem("cooked_photos_preview") || "{}");
      return preview?.[id] || preview?.[Number(id)] || preview?.[String(id)] || null;
    } catch {
      return null;
    }
  };

  const getAnyCachedPhotoForId = (id) => {
    const direct = photoCacheRef.current || {};
    const shared = direct[id] || direct[String(id)] || direct[Number(id)] || null;
    return shared || getVaultPhotoForId(id) || getPreviewPhotoForId(id);
  };

  /** True when `restaurant_photos` / shared cache has an entry for this restaurant id (string or numeric key). */
  const restaurantPhotoInSharedCache = (r) => {
    const c = photoCacheRef.current || {};
    return !!(c[String(r.id)] || c[Number(r.id)]);
  };

  // When the photo cache source switches (initial sign-in load), re-apply cached photo URIs to restaurant cards.
  useEffect(() => {
    if (usingSupabasePhotoCache) {
      const photos = photoCacheRef.current || {};
      setAllRestaurants((prev) =>
        prev.map((r) => {
          const uri = photos?.[r.id] || photos?.[Number(r.id)] || photos?.[String(r.id)];
          return uri ? { ...r, img: uri, img2: uri, heat: r.heat } : r;
        })
      );
    } else {
      let vault = {};
      let preview = {};
      try {
        vault = JSON.parse(safeLocalStorageGetItem(COOKED_PHOTOS_KEY) || "{}") || {};
      } catch {}
      try {
        preview = JSON.parse(safeLocalStorageGetItem(COOKED_PHOTOS_PREVIEW_KEY) || "{}") || {};
      } catch {}
      setAllRestaurants((prev) =>
        prev.map((r) => {
          const vaultImg = vault?.[r.id] || vault?.[Number(r.id)] || vault?.[String(r.id)];
          if (vaultImg) return { ...r, img: vaultImg, img2: vaultImg, heat: r.heat };
          const previewImg = preview?.[r.id] || preview?.[Number(r.id)] || preview?.[String(r.id)];
          if (previewImg) return { ...r, img: previewImg, img2: previewImg, heat: r.heat };
          return r;
        })
      );
    }
  }, [usingSupabasePhotoCache, photoCacheVersion]);

  const [detailRestaurant, setDetailRestaurant] = useState(null);
  const [placeDetails, setPlaceDetails] = useState({});
  const [userRatings, setUserRatings] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_ratings") || "{}"); } catch { return {}; }
  });
  const [flameScores, setFlameScores] = useState({}); // { restaurantId: { flameScore, interactions } }
  const [userNotes, setUserNotes] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_notes") || "{}"); } catch { return {}; }
  });
  const [noteInput, setNoteInput] = useState("");
  const [activeFilter, setActiveFilter] = useState(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [discoverSearchMode, setDiscoverSearchMode] = useState("restaurants"); // "restaurants" | "people"
  const [peopleSearchInput, setPeopleSearchInput] = useState("");
  const [peopleDebouncedQuery, setPeopleDebouncedQuery] = useState("");
  const [peopleSearchResults, setPeopleSearchResults] = useState([]);
  const [peopleSearchLoading, setPeopleSearchLoading] = useState(false);
  const [peopleFollowingMap, setPeopleFollowingMap] = useState({});
  const [yourFriends, setYourFriends] = useState([]); // profiles of people you follow
  const [followingPicksLoading, setFollowingPicksLoading] = useState(false);
  const [followingPicksRestaurants, setFollowingPicksRestaurants] = useState([]);
  const [followingPicksNoFollows, setFollowingPicksNoFollows] = useState(false);
  const [swipeScores, setSwipeScores] = useState({}); // { restaurantId: score } from Neo4j smart swipe
  const swipeScoresRef = useRef({});
  const [personalizationScores, setPersonalizationScores] = useState({}); // { restaurantId: boost } for discover sort
  const [crossCuisineRecs, setCrossCuisineRecs] = useState([]); // cross-cuisine discovery
  const [venueType, setVenueType] = useState("all"); // "all" | "restaurants" | "bars" | "coffee"
  const [secondaryCuisine, setSecondaryCuisine] = useState(null); // dropdown selection when restaurants or bars
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterMood, setFilterMood] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [restoredMessages, setRestoredMessages] = useState(null);
  const [homeChatKey, setHomeChatKey] = useState(0);
  const [recentChatsOpen, setRecentChatsOpen] = useState(false);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(90);
  useLayoutEffect(() => {
    if (tab !== "discover" && tab !== "home" && tab !== "map") {
      if (discoverSearchMode !== "restaurants") setDiscoverSearchMode("restaurants");
      return;
    }
    if (headerRef.current) {
      const h = headerRef.current.getBoundingClientRect().height;
      if (h > 0) setHeaderHeight(h);
    }
  }, [tab, discoverSearchMode]);
  const [heatIndex, setHeatIndex] = useState(0);
  const [heatResults, setHeatResults] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_heat") || '{"loved":[],"noped":[],"skipped":[],"votes":{}}'); } catch { return { loved: [], noped: [], skipped: [], votes: {} }; }
  });
  const [heatCity, setHeatCity] = useState("All");
  const [heatCityPickerOpen, setHeatCityPickerOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [notifList, setNotifList] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifFollowedBack, setNotifFollowedBack] = useState(new Set());
  const [headerProfilePhoto, setHeaderProfilePhoto] = useState(() =>
    typeof window !== "undefined" ? safeLocalStorageGetItem("cooked_profile_photo") : null
  );
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    if (!cityPickerOpen) return;
    const close = () => setCityPickerOpen(false);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", close); };
  }, [cityPickerOpen]);

  useEffect(() => {
    if (!user?.id) {
      setFollowedCities([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await getFollowedCities(user.id);
      if (cancelled) return;
      const names = (data || []).map((row) => row?.city).filter(Boolean);
      setFollowedCities(names);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || followedCities.length === 0) return;
    getTrendingInFollowedCities(user.id, 10).then((results) => {
      if (results.length > 0) {
        const matched = results
          .map((r) => allRestaurants.find((ar) => String(ar.id) === String(r.id)))
          .filter(Boolean);
        setTrendingInCities(matched);
      }
    });
  }, [user?.id, followedCities.length]);

  // One-time seed: enrich all restaurants in Neo4j graph
  // Wait until community restaurants have merged (allRestaurants.length > static count)
  const seedTriggeredRef = useRef(false);
  useEffect(() => {
    if (seedTriggeredRef.current) return;
    if (safeLocalStorageGetItem("cooked_graph_seeded_v4")) return;
    if (!import.meta.env.VITE_NEO4J_URI) return;
    // Wait for community restaurants to merge (static data is ~2900, with community it's higher)
    if (allRestaurants.length < 100) return;
    // Small delay to ensure community merge has happened
    const timer = setTimeout(() => {
      if (seedTriggeredRef.current) return;
      seedTriggeredRef.current = true;
      seedAllRestaurants(allRestaurants).then(async () => {
        // Re-sync all loved restaurants so LOVED relationships point to correct city nodes
        const loved = heatResults?.loved || [];
        if (loved.length > 0 && user?.id) {
          for (const id of loved) {
            const r = allRestaurants.find(ar => ar.id === id || ar.id === Number(id) || String(ar.id) === String(id));
            if (r) {
              await syncRestaurant(r);
              await syncLove(user.id, id);
            }
          }
          console.log("[Neo4j] Re-synced", loved.length, "loved restaurants");
        }
        try { window.localStorage.setItem("cooked_graph_seeded_v4", "1"); } catch {}
        console.log("[Neo4j] Graph seeded with", allRestaurants.length, "restaurants (v4 — love sync fix)");
      }).catch(e => console.error("[Neo4j] Seed error:", e));
    }, 3000);
    return () => clearTimeout(timer);
  }, [allRestaurants.length]);

  // Fetch Neo4j-powered discovery feeds (global, then filter by city client-side)
  // feedRefreshKey increments when feeds should be refreshed (love action, tab switch, timer)
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const refreshFeeds = useCallback(() => setFeedRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!user?.id) return;
    console.log("[Neo4j] Refreshing discovery feeds...");
    getYoudLoveThis(user.id, 30).then(results => {
      const matched = results
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _weight: r.weight, _recommenders: r.recommenders } : null;
        })
        .filter(Boolean);
      setYoudLoveThis(matched);
    }).catch(e => console.error("[Neo4j] youdLoveThis error:", e));
    getRisingRestaurants(30).then(results => {
      const matched = results
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _recentLoves: r.recentLoves } : null;
        })
        .filter(Boolean);
      setRisingRestaurants(matched);
    }).catch(e => console.error("[Neo4j] rising error:", e));
    getTasteFingerprint(user.id).then(fp => setChatTasteProfile(fp)).catch(() => {});
    getWhoToFollow(user.id, 8).then(setSuggestedFriends).catch(() => {});
    getPeopleLikeYou(user.id, 8).then(setPeopleLikeYou).catch(() => {});
    getHiddenGems(30).then(results => {
      const matched = results
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _loveCount: r.loveCount } : null;
        })
        .filter(Boolean);
      setHiddenGems(matched);
    }).catch(e => console.error("[Neo4j] hiddenGems error:", e));
    // Personalization intelligence
    getSmartSwipeScores(user.id).then(s => { swipeScoresRef.current = s; setSwipeScores(s); }).catch(() => {});
    getPersonalizationScores(user.id).then(setPersonalizationScores).catch(() => {});
    getCrossCuisineRecs(user.id, 8).then(results => {
      const matched = results
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _sharedTags: r.sharedTags, _fromCuisine: r.fromCuisine, _overlap: r.overlap } : null;
        })
        .filter(Boolean);
      setCrossCuisineRecs(matched);
    }).catch(e => console.error("[Neo4j] crossCuisine error:", e));
  }, [user?.id, feedRefreshKey, allRestaurants.length]);

  // Auto-refresh feeds every 30 minutes while the app is open
  useEffect(() => {
    const interval = setInterval(refreshFeeds, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshFeeds]);

  // Refresh feeds when switching to home tab (so it feels alive)
  useEffect(() => {
    if (tab === "home" && user?.id) refreshFeeds();
  }, [tab]);

  // Filter Neo4j sections by selected city — show nothing if no city matches (don't fall back to global)
  const cityMatchesFilter = (rCity) => {
    if (!city || city === "All") return true;
    if (city === "Followed") return followedCities.includes(rCity);
    return rCity === city;
  };

  const youdLoveFiltered = useMemo(() => {
    if (!city || city === "All") return youdLoveThis.slice(0, 8);
    if (city === "Followed") return youdLoveThis.filter(r => followedCities.includes(r.city)).slice(0, 8);
    return youdLoveThis.filter(r => r.city === city).slice(0, 8);
  }, [youdLoveThis, city, followedCities]);

  const risingFiltered = useMemo(() => {
    if (!city || city === "All") return risingRestaurants.slice(0, 8);
    if (city === "Followed") return risingRestaurants.filter(r => followedCities.includes(r.city)).slice(0, 8);
    return risingRestaurants.filter(r => r.city === city).slice(0, 8);
  }, [risingRestaurants, city, followedCities]);

  const hiddenGemsFiltered = useMemo(() => {
    if (!city || city === "All") return hiddenGems.slice(0, 8);
    if (city === "Followed") return hiddenGems.filter(r => followedCities.includes(r.city)).slice(0, 8);
    return hiddenGems.filter(r => r.city === city).slice(0, 8);
  }, [hiddenGems, city, followedCities]);

  const trendingFiltered = useMemo(() => {
    if (!city || city === "All") return trendingInCities;
    if (city === "Followed") return trendingInCities.filter(r => followedCities.includes(r.city));
    return trendingInCities.filter(r => r.city === city);
  }, [trendingInCities, city, followedCities]);

  const toggleCityFollow = async (cityName, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id || !cityName || cityName === "All") return;
    const isFollowingCity = followedCities.includes(cityName);
    if (isFollowingCity) {
      const { error } = await unfollowCity(user.id, cityName);
      if (!error) {
        setFollowedCities((prev) => prev.filter((c) => c !== cityName));
        removeCityFollow(user?.id, cityName);
      }
    } else {
      const { error } = await followCity(user.id, cityName);
      if (!error) {
        setFollowedCities((prev) => (prev.includes(cityName) ? prev : [...prev, cityName]));
        syncCityFollow(user?.id, cityName);
      }
    }
  };

  useEffect(() => {
    if (!detailRestaurant?.id) return;
    try {
      const id = detailRestaurant.id;
      const cached = getAnyCachedPhotoForId(id);
      if (cached && !usingSupabasePhotoCache) touchPhotoCacheAccess(id);
    } catch {}
  }, [detailRestaurant?.id]);

  useEffect(() => {
    const t = setTimeout(() => setPeopleDebouncedQuery(peopleSearchInput), 300);
    return () => clearTimeout(t);
  }, [peopleSearchInput]);

  useEffect(() => {
    if (discoverSearchMode !== "people") return;
    const q = peopleDebouncedQuery.trim();
    if (!q) {
      setPeopleSearchResults([]);
      setPeopleSearchLoading(false);
      return;
    }
    let cancelled = false;
    setPeopleSearchLoading(true);
    (async () => {
      const esc = q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/,/g, "").replace(/"/g, '\\"');
      const pattern = `%${esc}%`;
      let req = supabase
        .from("user_data")
        .select("*")
        .or(`profile_username.ilike."${pattern}",profile_name.ilike."${pattern}"`)
        .limit(20);
      if (user?.id) req = req.neq("clerk_user_id", user.id);
      const { data, error } = await req;
      if (cancelled) return;
      if (error) {
        console.error("people search:", error);
        setPeopleSearchResults([]);
      } else {
        setPeopleSearchResults(data || []);
      }
      setPeopleSearchLoading(false);
    })();
    return () => { cancelled = true; };
  }, [peopleDebouncedQuery, discoverSearchMode, user?.id]);

  useEffect(() => {
    if (discoverSearchMode !== "people" || !user?.id || peopleSearchResults.length === 0) {
      setPeopleFollowingMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        peopleSearchResults.map(async (row) => {
          const id = row.clerk_user_id;
          if (!id || id === user.id) return [id, false];
          const res = await checkUserIsFollowing(user.id, id);
          return [id, !!res?.isFollowing];
        })
      );
      if (cancelled) return;
      setPeopleFollowingMap(Object.fromEntries(entries.filter(([id]) => id)));
    })();
    return () => { cancelled = true; };
  }, [discoverSearchMode, peopleSearchResults, user?.id]);

  useEffect(() => {
    if (discoverSearchMode !== "people") return;
    let cancelled = false;
    (async () => {
      setFollowingPicksLoading(true);
      if (!user?.id) {
        if (!cancelled) {
          setFollowingPicksNoFollows(true);
          setFollowingPicksRestaurants([]);
          setFollowingPicksLoading(false);
        }
        return;
      }
      const { data: followRows } = await getFollowing(user.id);
      const followingIds = (followRows || []).map((r) => r.following_id).filter(Boolean);
      if (cancelled) return;
      if (followingIds.length === 0) {
        setFollowingPicksNoFollows(true);
        setFollowingPicksRestaurants([]);
        setFollowingPicksLoading(false);
        return;
      }
      setFollowingPicksNoFollows(false);
      // Fetch friend profiles for "Your Friends" section
      const { data: friendProfiles } = await supabase
        .from("user_data")
        .select("clerk_user_id, profile_name, profile_username, profile_photo")
        .in("clerk_user_id", followingIds);
      if (!cancelled) setYourFriends((friendProfiles || []).filter(p => p.clerk_user_id !== user.id));
      const { data: userRows, error } = await supabase
        .from("user_data")
        .select("loved,watchlist,heat,clerk_user_id")
        .in("clerk_user_id", followingIds);
      if (cancelled) return;
      if (error) {
        console.error("following picks:", error);
        setFollowingPicksRestaurants([]);
        setFollowingPicksLoading(false);
        return;
      }
      const byRestaurantId = new Map();
      allRestaurants.forEach((r) => {
        byRestaurantId.set(r.id, r);
        byRestaurantId.set(Number(r.id), r);
        byRestaurantId.set(String(r.id), r);
      });
      const ordered = [];
      const seen = new Set();
      for (const row of userRows || []) {
        const loved = row?.heat?.loved ?? row?.loved;
        const lovedArr = Array.isArray(loved) ? loved : [];
        const wl = row?.watchlist;
        const wlArr = Array.isArray(wl) ? wl : [];
        for (const rawId of [...lovedArr, ...wlArr]) {
          const nid = Number(rawId);
          if (Number.isNaN(nid) || seen.has(nid) || ordered.length >= 20) continue;
          const r = byRestaurantId.get(nid) ?? byRestaurantId.get(rawId) ?? byRestaurantId.get(String(rawId));
          if (r) {
            seen.add(nid);
            ordered.push(r);
          }
        }
      }
      setFollowingPicksRestaurants(ordered);
      setFollowingPicksLoading(false);
    })();
    return () => { cancelled = true; };
  }, [discoverSearchMode, user?.id, allRestaurants]);

  useEffect(() => {
    setHeaderProfilePhoto(typeof window !== "undefined" ? safeLocalStorageGetItem("cooked_profile_photo") : null);
  }, [tab]);

  // Load shared photo library for ALL users (signed-in or not).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sharedPhotos = await loadSharedPhotos();
        if (cancelled) return;
        if (sharedPhotos && Object.keys(sharedPhotos).length > 0) {
          photoCacheRef.current = sharedPhotos;
          try { localStorage.setItem("cooked_shared_photos", JSON.stringify(sharedPhotos)); } catch {}
          setUsingSupabasePhotoCache(true);
          setPhotoCacheVersion((v) => v + 1);
          const resolvedIds = Object.keys(sharedPhotos);
          setPhotoResolved(resolvedIds);
          safeSetItem("cooked_photo_resolved", JSON.stringify(resolvedIds));
        } else {
          photoCacheRef.current = {};
          setUsingSupabasePhotoCache(false);
        }
      } catch {
        if (!cancelled) setUsingSupabasePhotoCache(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load cached flame scores for all restaurants
  useEffect(() => {
    if (!allRestaurants.length) return;
    const ids = allRestaurants.map(r => String(r.id));
    fetchFlameScores(ids).then(scores => {
      if (scores && Object.keys(scores).length > 0) setFlameScores(scores);
    }).catch(() => {});
  }, [allRestaurants.length]);

  useEffect(() => {
    if (!showHeatTip) {
      setHeatTipFading(false);
      return;
    }
    const fadeTimer = setTimeout(() => setHeatTipFading(true), 5400);
    const closeTimer = setTimeout(() => setShowHeatTip(false), 6000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [showHeatTip]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setSetupGateOpen(false);
      return;
    }
    (async () => {
      const profile = await loadUserData(user.id);
      if (cancelled) return;
      const profileName = String(profile?.profile_name || "").trim();
      const profileUsername = String(profile?.profile_username || "").trim();
      const needsSetup = !profileName || profileName.toLowerCase() === "user";
      if (needsSetup) {
        // Pre-populate from Clerk user data (including onboarding sign-up)
        const clerkName = user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "";
        const clerkUsername = user.unsafeMetadata?.username || user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "";
        setSetupName(profileName && profileName.toLowerCase() !== "user" ? profileName : clerkName);
        setSetupUsername(profileUsername || clerkUsername);
        setSetupGateOpen(true);
      } else {
        setSetupGateOpen(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setNotifUnreadCount(0);
      return;
    }
    const fetchUnreadCount = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      setNotifUnreadCount(typeof count === "number" ? count : 0);
    };
    fetchUnreadCount();
    const intervalId = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(intervalId);
  }, [user?.id]);

  // ── DM FUNCTIONS ────────────────────────────────
  const loadDmInbox = async () => {
    if (!user?.id) return;
    const inbox = await getInbox(user.id);
    // Enrich with user profile data
    const partnerIds = inbox.map(c => c.partnerId);
    if (partnerIds.length) {
      const { data: profiles } = await supabase.from('user_data').select('clerk_user_id, profile_name, profile_username, profile_photo').in('clerk_user_id', partnerIds);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.clerk_user_id] = p; });
      inbox.forEach(c => {
        const p = profileMap[c.partnerId];
        if (p) { c.partnerName = p.profile_name || p.profile_username || "User"; c.partnerPhoto = p.profile_photo; c.partnerUsername = p.profile_username; c._exists = true; }
        else { c.partnerName = "User"; c.partnerPhoto = null; c._exists = false; }
      });
    }
    // Filter out deleted users from inbox
    setDmInbox(inbox.filter(c => c._exists !== false));
  };

  const openDmInbox = async () => {
    setDmOpen(true);
    setDmConvo(null);
    await loadDmInbox();
  };

  const openDmConvo = async (partnerId, partnerName, partnerPhoto) => {
    setDmConvo({ partnerId, partnerName, partnerPhoto });
    const msgs = await getConversation(user.id, partnerId);
    setDmMessages(msgs);
    await markMessagesRead(user.id, partnerId);
    setDmUnread(prev => Math.max(0, prev - (dmInbox.find(c => c.partnerId === partnerId)?.unread || 0)));
    setTimeout(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSendDm = async () => {
    if (!dmInput.trim() || !dmConvo || dmSending) return;
    setDmSending(true);
    const text = dmInput.trim();
    setDmInput("");
    // Optimistic add
    const tempMsg = { id: Date.now(), sender_id: user.id, recipient_id: dmConvo.partnerId, content: text, created_at: new Date().toISOString() };
    setDmMessages(prev => [...prev, tempMsg]);
    setTimeout(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    await sendMessage(user.id, dmConvo.partnerId, text);
    setDmSending(false);
  };

  const handleShareViaDm = async (recipientId, recipientName) => {
    if (!dmSharePicker) return;
    const r = dmSharePicker;
    await sendMessage(user.id, recipientId, null, String(r.id), r.name);
    // Log DM share for flame score (+3.5 points)
    if (user?.id) logInteraction(user.id, r.id, 'dm');
    setDmSharePicker(null);
    setToast(`Sent ${r.name} to ${recipientName}`);
    setTimeout(() => setToast(null), 2500);
  };

  // Poll DM unread count
  useEffect(() => {
    if (!user?.id) return;
    const fetchDmUnread = async () => { const count = await getUnreadMessageCount(user.id); setDmUnread(count); };
    fetchDmUnread();
    const iv = setInterval(fetchDmUnread, 30000);
    return () => clearInterval(iv);
  }, [user?.id]);

  // DM share picker search
  useEffect(() => {
    if (!dmSharePicker) { setDmShareResults([]); return; }
    if (!user?.id) return;
    const q = dmShareSearch.trim();
    if (!q) {
      // Show following list by default
      (async () => {
        const { data } = await getFollowing(user?.id);
        if (!data?.length) return setDmShareResults([]);
        const ids = data.map(f => f.following_id);
        const { data: profiles } = await supabase.from('user_data').select('clerk_user_id, profile_name, profile_username, profile_photo').in('clerk_user_id', ids);
        setDmShareResults(profiles || []);
      })();
      return;
    }
    const timer = setTimeout(async () => {
      const esc = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${esc}%`;
      const { data } = await supabase.from('user_data').select('clerk_user_id, profile_name, profile_username, profile_photo')
        .or(`profile_username.ilike."${pattern}",profile_name.ilike."${pattern}"`).neq('clerk_user_id', user?.id).limit(10);
      setDmShareResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [dmShareSearch, dmSharePicker, user?.id]);

  const openNotificationsSheet = async () => {
    setNotifSheetOpen(true);
    if (!user?.id) {
      setNotifList([]);
      setNotifLoading(false);
      return;
    }
    setNotifLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = data || [];
    // Enrich notifications with user profile data
    const userIds = [...new Set(rows.map(r => r.from_user_id).filter(Boolean))];
    const userProfiles = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("user_data").select("clerk_user_id, profile_name, profile_username, profile_photo").in("clerk_user_id", userIds);
      (profiles || []).forEach(p => { userProfiles[p.clerk_user_id] = p; });
    }
    const enriched = rows.map(r => ({
      ...r,
      _fromUser: r.from_user_id ? userProfiles[r.from_user_id] || null : null,
    }));
    setNotifList(enriched);
    setNotifLoading(false);
    // Check which follow-notification senders we already follow
    const followNotifIds = [...new Set(rows.filter(r => r.type === "followed_you" && r.from_user_id).map(r => r.from_user_id))];
    if (followNotifIds.length > 0) {
      const { data: fData } = await supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", followNotifIds);
      if (fData) setNotifFollowedBack(new Set(fData.map(d => d.following_id)));
    }
    // Let one paint so unread rows briefly show the terracotta accent before we mark read
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifUnreadCount(0);
    setNotifList((prev) => (prev || []).map((r) => ({ ...r, read: true })));
  };

  useEffect(() => {
    if (tab === "home") setHomeChatKey((k) => k + 1);
  }, [tab]);
  const [swipeDelta, setSwipeDelta] = useState({ x: 0, y: 0 });
  const [swipeDir, setSwipeDir] = useState(null); // 'left' | 'right' | 'up' | null
  const [isDragging, setIsDragging] = useState(false);
  const [heatFlyDir, setHeatFlyDir] = useState(null); // 'left' | 'right' | 'up' — current card flying out
  const dragStart = useRef(null);
  const swipeDeltaRef = useRef({ x: 0, y: 0 });
  const heatSwipeHandledRef = useRef(false);
  const heatTransitionSkipRef = useRef(false);
  const backupInputRef = useRef(null);

  const [userLists, setUserLists] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_lists") || "{\"Breakfast/Brunch\":[],\"Lunch\":[],\"Dinner\":[],\"Bar\":[],\"Coffee\":[]}"); } catch { return { "Breakfast/Brunch": [], "Lunch": [], "Dinner": [], "Bar": [], "Coffee": [] }; }
  });
  const supabaseLoadedRef = useRef(false);

  // Merge in community restaurants from Supabase so all users can see them.
  // City names are normalized so Google Places variants (e.g. "Ciudad de Mexico")
  // and neighborhood names (e.g. "Silver Lake") map to canonical cities.
  // Unified restaurant load from Supabase (replaces old 3-step merge)
  const refreshRestaurants = useCallback(async () => {
    const restaurants = await getAllRestaurantsFromSupabase();
    if (restaurants.length > 0) {
      // Normalize cities and ensure each restaurant has an id
      const normalized = restaurants.filter(r => r && r.id && r.name).map(r => ({
        ...r,
        city: r.city ? normalizeCity(r.city) : r.city,
      }));
      setAllRestaurants(normalized);
      console.log(`[Supabase] Loaded ${normalized.length} restaurants from unified table`);
    }
  }, []);

  useEffect(() => {
    refreshRestaurants();
  }, [refreshRestaurants]);

  useEffect(() => { safeSetItem("cooked_ratings", JSON.stringify(userRatings)); }, [userRatings]);
  useEffect(() => { safeSetItem("cooked_notes", JSON.stringify(userNotes)); }, [userNotes]);
  useEffect(() => { safeSetItem("cooked_lists", JSON.stringify(userLists)); }, [userLists]);
  useEffect(() => { safeSetItem("cooked_photo_resolved", JSON.stringify(photoResolved)); }, [photoResolved]);
  useEffect(() => { safeSetItem("cooked_watchlist", JSON.stringify(watchlist)); }, [watchlist]);

  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (!initialTab) return;
    if (!["home", "discover", "heat", "map", "profile"].includes(initialTab)) return;
    setTab(initialTab);
    prevInitialTabRef.current = initialTab;
  }, [initialTab]);

  useEffect(() => {
    if (showOnboarding) return;
    if (skipNextTabPersistRef.current) {
      skipNextTabPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem("cooked_last_tab", tab);
    } catch {}
  }, [tab, showOnboarding]);
  useEffect(() => { safeSetItem("cooked_heat", JSON.stringify(heatResults)); }, [heatResults]);

  useEffect(() => {
    if (!detailRestaurant || !user?.id) {
      setFriendsBeenHere({ loading: false, list: [] });
      return;
    }
    let cancelled = false;
    setFriendsBeenHere({ loading: true, list: [] });
    getFriendsWhoLovedRestaurant(user.id, detailRestaurant.id)
      .then((friends) => {
        if (cancelled) return;
        const list = (friends || []).map((f) => ({
          clerkUserId: f.id,
          profileName: f.name || f.username || "Friend",
          profilePhoto: null,
          flameRating: null,
        }));
        list.sort((a, b) => a.profileName.localeCompare(b.profileName, undefined, { sensitivity: "base" }));
        setFriendsBeenHere({ loading: false, list });
      })
      .catch(() => {
        if (!cancelled) setFriendsBeenHere({ loading: false, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [detailRestaurant?.id, user?.id]);

  useEffect(() => {
    if (!detailRestaurant) setFriendsBeenHereSheetOpen(false);
  }, [detailRestaurant]);

  // Load user data from Supabase on sign-in; migrate local data if no remote row yet.
  useEffect(() => {
    if (!user?.id) {
      supabaseLoadedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const remote = await loadUserData(user.id);
      if (cancelled) return;

      if (remote) {
        setIsAdmin(remote.is_admin === true);
        const clerkProfileName = user.fullName || user.firstName || "User";
        const clerkProfileUsername = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "";
        // Normalize all IDs to numbers for consistent comparison
        const normalizeIds = (arr) => (Array.isArray(arr) ? arr : []).map(id => isNaN(id) ? id : Number(id));
        const remoteHeat = remote.heat ? {
          loved: normalizeIds(remote.heat.loved),
          noped: normalizeIds(remote.heat.noped),
          skipped: normalizeIds(remote.heat.skipped),
          votes: remote.heat.votes && typeof remote.heat.votes === "object" ? remote.heat.votes : {},
        } : {
          loved: normalizeIds(remote.loved),
          noped: normalizeIds(remote.noped),
          skipped: normalizeIds(remote.skipped),
          votes: remote.votes && typeof remote.votes === "object" ? remote.votes : {},
        };
        const remoteWatchlist = Array.isArray(remote.watchlist) ? [...new Set(remote.watchlist.map(id => isNaN(id) ? id : Number(id)))] : [];
        const remoteRatings = remote.ratings && typeof remote.ratings === "object" ? remote.ratings : {};
        const remotePhotoResolved = Array.isArray(remote.photo_resolved) ? remote.photo_resolved : [];

        setHeatResults(remoteHeat);
        setWatchlist(remoteWatchlist);
        setUserRatings(remoteRatings);
        setPhotoResolved(remotePhotoResolved);
        // Load home city from Supabase
        if (remote.home_city) {
          setHomeCity(remote.home_city);
          setCity(remote.home_city);
          try { localStorage.setItem("cooked_default_city", remote.home_city); } catch {}
        }

        safeSetItem("cooked_heat", JSON.stringify(remoteHeat));
        safeSetItem("cooked_watchlist", JSON.stringify(remoteWatchlist));
        safeSetItem("cooked_ratings", JSON.stringify(remoteRatings));
        safeSetItem("cooked_photo_resolved", JSON.stringify(remotePhotoResolved));
        if (remote.profile_photo) {
          safeSetItem("cooked_profile_photo", remote.profile_photo);
        }
        if (remote.banner_photo) {
          safeSetItem("cooked_banner_photo", remote.banner_photo);
        }
        if (!remote.profile_name || !String(remote.profile_name).trim()) {
          await saveUserData(user.id, {
            profile_name: clerkProfileName,
            profile_username: clerkProfileUsername,
          });
        }
      } else {
        await followUser(user.id, 'user_3B9bXI2JCTGmvdVl6lRtjQ276W3');
        syncFollow(user.id, 'user_3B9bXI2JCTGmvdVl6lRtjQ276W3');
        await supabase.from("notification_prefs").insert([
          { clerk_user_id: user.id, type: "followed_you", enabled: true },
          { clerk_user_id: user.id, type: "friend_loved_your_watchlist", enabled: true },
          { clerk_user_id: user.id, type: "restaurant_trending", enabled: true },
          { clerk_user_id: user.id, type: "friend_new_find", enabled: true },
          { clerk_user_id: user.id, type: "friend_visited_your_city", enabled: true },
        ]);

        let localPhotos = {};
        try { localPhotos = JSON.parse(safeLocalStorageGetItem("cooked_photos") || "{}"); } catch {}
        const profilePhoto = safeLocalStorageGetItem("cooked_profile_photo") || null;
        const bannerPhoto = safeLocalStorageGetItem("cooked_banner_photo") || null;
        const clerkProfileName = user.fullName || user.firstName || "User";
        const clerkProfileUsername = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "";
        const hasLocalData =
          (heatResults?.loved?.length || 0) > 0 ||
          (heatResults?.noped?.length || 0) > 0 ||
          (heatResults?.skipped?.length || 0) > 0 ||
          Object.keys(heatResults?.votes || {}).length > 0 ||
          (watchlist?.length || 0) > 0 ||
          Object.keys(userRatings || {}).length > 0 ||
          (photoResolved?.length || 0) > 0 ||
          !!profilePhoto ||
          !!bannerPhoto;

        if (hasLocalData) {
          await saveUserData(user.id, {
            loved: heatResults?.loved || [],
            noped: heatResults?.noped || [],
            skipped: heatResults?.skipped || [],
            votes: heatResults?.votes || {},
            heat: heatResults || { loved: [], noped: [], skipped: [], votes: {} },
            watchlist: watchlist || [],
            ratings: userRatings || {},
            photo_resolved: photoResolved || [],
            profile_photo: profilePhoto,
            banner_photo: bannerPhoto,
            profile_name: clerkProfileName,
            profile_username: clerkProfileUsername,
          });
        }
      }

      // Apply local photo caches now that we know Supabase initialization is done.
      setPhotoCacheVersion((v) => v + 1);
      supabaseLoadedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Debounced Supabase sync so swipes/toggles don't trigger a write per action.
  useEffect(() => {
    if (!user?.id || !supabaseLoadedRef.current) return;
    const timeoutId = setTimeout(() => {
      const profilePhoto = safeLocalStorageGetItem("cooked_profile_photo") || null;
      const bannerPhoto = safeLocalStorageGetItem("cooked_banner_photo") || null;
      saveUserData(user.id, {
        loved: heatResults?.loved || [],
        noped: heatResults?.noped || [],
        skipped: heatResults?.skipped || [],
        votes: heatResults?.votes || {},
        heat: heatResults || { loved: [], noped: [], skipped: [], votes: {} },
        watchlist: watchlist || [],
        ratings: userRatings || {},
        photo_resolved: photoResolved || [],
        profile_photo: profilePhoto,
        banner_photo: bannerPhoto,
      });
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [user?.id, heatResults, watchlist, userRatings, photoResolved]);

  // Log search queries (debounced 1.5s after typing stops)
  useEffect(() => {
    if (!user?.id || !searchQuery.trim()) return;
    const t = setTimeout(() => {
      logInteraction(user.id, "0", 'search', null);
      // Store search in Supabase for analytics via a lightweight insert
      supabase.from('restaurant_interactions').insert({ clerk_user_id: user.id, restaurant_id: "search", action: 'search', value: searchQuery.trim().slice(0, 100) }).then(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [searchQuery, user?.id]);

  // Log city filter changes
  useEffect(() => {
    if (!user?.id || !city || city === "All") return;
    supabase.from('restaurant_interactions').insert({ clerk_user_id: user.id, restaurant_id: "filter", action: 'city_filter', value: city }).then(() => {});
  }, [city, user?.id]);

  // Log mood filter changes
  useEffect(() => {
    if (!user?.id || !filterMood) return;
    supabase.from('restaurant_interactions').insert({ clerk_user_id: user.id, restaurant_id: "filter", action: 'mood_filter', value: filterMood }).then(() => {});
  }, [filterMood, user?.id]);

  const exportBackup = () => {
    const data = {};
    BACKUP_KEYS.forEach((key) => {
      const raw = safeLocalStorageGetItem(key);
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
            safeSetItem(key, value);
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
      const cached = getAnyCachedPhotoForId(restaurant.id);
      if (cached) {
        if (!usingSupabasePhotoCache) touchPhotoCacheAccess(restaurant.id);
        setImgSrc(cached);
        return;
      }
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
      setImgSrc(photoUri);
      setAllRestaurants(prev => prev.map(r => r.id === restaurant.id ? { ...r, img: photoUri, img2: photoUri } : r));

      // Save to global shared library (fire-and-forget).
      void saveSharedPhoto(String(restaurant.id), photoUri);

      // Persist to the primary photo cache.
      if (usingSupabasePhotoCache) {
        const updatedPhotos = { ...(photoCacheRef.current || {}), [restaurant.id]: photoUri };
        photoCacheRef.current = updatedPhotos;
      } else {
        // Save to preview cache (not vault — stays unresolved for user to confirm)
        try {
          const preview = JSON.parse(safeLocalStorageGetItem("cooked_photos_preview") || "{}");
          preview[restaurant.id] = photoUri;
          safeSetItem("cooked_photos_preview", JSON.stringify(preview));
          touchPhotoCacheAccess(restaurant.id);

          // Fire-and-forget: also push the updated photo cache to Supabase (when signed in).
          if (user?.id) {
            let vault = {};
            try { vault = JSON.parse(safeLocalStorageGetItem("cooked_photos") || "{}"); } catch {}
            const updatedPhotos = { ...(vault || {}), ...(preview || {}), [restaurant.id]: photoUri };
          }
        } catch {}
      }
    }
  };

  function HomePhotoCard({ r, style, className, children, onClick }) {
    const photoSrc = getAnyCachedPhotoForId(r.id) || r.img || "";
    const [imgSrc, setImgSrc] = useState(photoSrc);
    const cardRef = useRef(null);

    useEffect(() => {
      setImgSrc(photoSrc);
    }, [photoSrc, r.id, r.img, photoCacheVersion]);

    useEffect(() => {
      try {
        const cached = getAnyCachedPhotoForId(r.id);
        if (cached) {
          if (!usingSupabasePhotoCache) touchPhotoCacheAccess(r.id);
          setImgSrc(cached);
          r.img = cached;
          return;
        }
      } catch (e) {}

      if (!imgSrc || imgSrc.includes("picsum")) {
        fetchAndCachePhoto(r, setImgSrc);
      }
    }, [r.id, r.img, imgSrc, usingSupabasePhotoCache, photoCacheVersion]);

    return (
      <div
        ref={cardRef}
        className={className || ""}
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
          <div style={{ position: "absolute", inset: 0, background: "#12121a" }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(10,10,15,0.1) 0%, rgba(10,10,15,0.8) 100%)",
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

  // Log restaurant detail view + push history state for back navigation
  useEffect(() => {
    if (!detailRestaurant) return;
    if (user?.id) logInteraction(user.id, detailRestaurant.id, 'view');
    window.history.pushState({ restaurantDetail: true }, "");
    const handlePop = () => {
      setDetailRestaurant(null);
      setSixDegreesResult(null);
      setSixDegreesTarget(null);
      setSixDegreesLoading(false);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [detailRestaurant?.id]);

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
    "Los Angeles": ["Los Angeles", "Beverly Hills", "West Hollywood", "Brentwood", "Santa Monica", "Culver City", "Arts District", "Chinatown", "Palms", "Mid-City"],
    "New York": ["New York", "Manhattan", "Brooklyn", "Queens", "Williamsburg", "West Village", "East Village", "Greenwich Village", "Midtown", "Flatiron", "SoHo"],
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
  const filteredByCity = city === "All" ? allRestaurants : city === "Followed" ? allRestaurants.filter(r => {
    return followedCities.some(fc => {
      const group = CITY_GROUPS[fc] || [fc];
      return group.includes(r.city) || group.includes(r.neighborhood);
    });
  }) : allRestaurants.filter(r => {
    const group = CITY_GROUPS[city] || [city];
    return group.includes(r.city) || group.includes(r.neighborhood);
  });

  // Tier 1: filter by venue type (All / Restaurants / Bars & Nightlife / Coffee & Cafes / Hotels)
  // Hotels: cuisine/tags/isHotel are strong signals. Name/brand matching only applies
  // when the cuisine is NOT clearly a bar or restaurant (to avoid false positives like
  // "Rosewood Tavern", "The Standard Grill", "Lafayette Hotel Lobby Bar").
  const HOTEL_KW = ["hotel", "resort", "lodge", "hostel", "guesthouse", "bed and breakfast", "b&b", "motel"];
  const HOTEL_NAME_KW = ["hotel", "resort"];
  const HOTEL_BRANDS = ["four seasons", "ritz-carlton", "ritz carlton", "mandarin oriental", "rosewood ",
    "park hyatt", "hyatt regency", "hyatt ziva", "hyatt zilara", "hyatt centric", "waldorf astoria",
    "st. regis", "st regis", "w hotel", "edition hotel", "aman ", "amangiri", "amanpuri", "amankora",
    "amanoi", "amanzoe", "shangri-la", "fairmont", "sofitel", "belmond", "six senses", "one&only",
    "como hotels", "nobu hotel", "1 hotel", "ace hotel", "canopy by hilton", "curio collection",
    "lxr hotels", "auberge resorts", "pendry ", "proper hotel", "virgin hotels",
    "nomad hotel", "citizenm", "moxy hotel"];
  // Cuisine values that mean "this is a bar/restaurant, not a hotel" even if the name suggests hotel
  const NOT_HOTEL_CU = ["bar", "cocktail", "pub", "lounge", "speakeasy", "nightclub", "dive",
    "tavern", "grill", "steakhouse", "pizza", "sushi", "ramen", "bakery", "cafe", "café", "coffee",
    "taco", "burger", "deli", "diner", "bbq", "brewery", "wine bar", "tapas"];
  const checkIsHotel = (r) => {
    if (r.isHotel === true) return true;
    const cu = (r.cuisine || "").toLowerCase();
    if (HOTEL_KW.some(k => cu.includes(k))) return true;
    const tags = Array.isArray(r.tags) ? r.tags : [];
    if (tags.some(t => HOTEL_KW.some(k => t.toLowerCase().includes(k)))) return true;
    const cuisineIsBarOrFood = r.isBar || NOT_HOTEL_CU.some(k => cu.includes(k));
    if (!cuisineIsBarOrFood) {
      const n = (r.name || "").toLowerCase();
      if (HOTEL_NAME_KW.some(k => n.includes(k))) return true;
      if (HOTEL_BRANDS.some(b => n.includes(b))) return true;
    }
    return false;
  };

  // ── MULTI-TYPE VENUE DETECTION ──
  // A venue can appear in multiple categories (e.g. a hotel bar shows in Hotels AND Bars)
  const FOOD_CU = ["restaurant", "italian", "japanese", "mexican", "french", "chinese", "thai",
    "indian", "korean", "mediterranean", "american", "seafood", "steakhouse", "sushi", "pizza",
    "ramen", "bbq", "burger", "deli", "diner", "bakery", "brunch", "fine dining", "contemporary",
    "new american", "tapas", "greek", "turkish", "vietnamese", "peruvian", "brazilian", "spanish",
    "middle eastern", "gastropub", "bistro", "grill", "southern", "cajun", "hawaiian", "caribbean",
    "vegan", "vegetarian", "dim sum", "omakase", "noodle", "taco", "farm", "brasserie",
    "trattoria", "osteria", "izakaya", "taqueria", "cantina", "argentinian", "african",
    "ethiopian", "lebanese", "moroccan", "filipino", "malaysian", "indonesian", "cuban",
    "salvadoran", "colombian", "peruvian", "dumplings", "poke", "acai", "bowl"];
  const BAR_CU = ["bar", "cocktail", "pub", "lounge", "speakeasy", "nightclub", "dive", "brewery", "taproom"];

  const getVenueTypes = (r) => {
    const types = new Set();
    const cu = (r.cuisine || "").toLowerCase();
    const tags = Array.isArray(r.tags) ? r.tags.map(t => t.toLowerCase()) : [];

    // Hotel?
    if (checkIsHotel(r)) types.add("hotel");

    // Bar?
    if (r.isBar === true || BAR_CU.some(k => cu.includes(k))) types.add("bar");

    // Coffee?
    if (cu.includes("coffee") || (cu.includes("cafe") && !cu.includes("american cafe"))) types.add("coffee");

    // Restaurant? — positive detection via food-related cuisine, tags, or explicit "restaurant" in cuisine
    const hasFood = FOOD_CU.some(k => cu.includes(k)) ||
      cu.includes("& restaurant") || cu.includes("/ restaurant") ||
      tags.some(t => ["dining", "restaurant", "fine dining", "brunch", "dinner"].some(k => t.includes(k)));
    if (hasFood) types.add("restaurant");

    // Default: if nothing matched at all, it's a restaurant
    if (types.size === 0) types.add("restaurant");

    return types;
  };

  const passesVenueType = (r) => {
    if (venueType === "all") return true;
    const types = getVenueTypes(r);
    if (venueType === "restaurants") return types.has("restaurant");
    if (venueType === "bars") return types.has("bar");
    if (venueType === "hotels") return types.has("hotel");
    if (venueType === "coffee") return types.has("coffee");
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
    if (!cat) {
      // Free text match from filter sheet
      const rawLower = (r.cuisine || "").toLowerCase();
      return rawLower.includes(secondaryCuisine.toLowerCase());
    }
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
  }).filter(r => !filterMood || (r.tags && r.tags.some(t => t.toLowerCase().includes(filterMood.toLowerCase()))) || (r.vibe && r.vibe.toLowerCase().includes(filterMood.toLowerCase())) || (r.best_for && (typeof r.best_for === 'string' ? r.best_for : Array.isArray(r.best_for) ? r.best_for.join(' ') : '').toLowerCase().includes(filterMood.toLowerCase())));
  const isInWatchlist = (id) => watchlist.includes(id) || watchlist.includes(Number(id)) || watchlist.includes(String(id));
  const isLovedCheck = (id) => heatResults.loved.includes(id) || heatResults.loved.includes(Number(id)) || heatResults.loved.includes(String(id));
  // Get the flame score for a restaurant — cached from Supabase, fallback to external rating
  const getFlameScore = (r) => {
    const cached = flameScores[String(r.id)];
    if (cached && cached.interactions >= 3) return cached.flameScore;
    // Cold start fallback: convert external rating to 1-5 scale, max 3 flames without community data
    const ext = r.googleRating || (r.rating ? r.rating / 2 : 3);
    return Math.min(3, Math.max(1, Math.round(ext * 2) / 2));
  };
  const filteredSorted = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const hasPersonalization = Object.keys(personalizationScores).length > 0;
    const arr = [...filteredForDiscover];
    const score = (r) => {
      const flame = getFlameScore(r);
      const personal = hasPersonalization ? (personalizationScores[String(r.id)] || 0) : 0;
      const userRating = userRatings[r.id] || 0;
      return flame * 0.5 + userRating * 0.2 + personal * 0.3;
    };
    arr.sort((a, b) => {
      const diff = score(b) - score(a);
      if (Math.abs(diff) > 0.1) return diff;
      const ha = ((Number(a.id) || 0) * 2654435761 + dayOfYear) >>> 0;
      const hb = ((Number(b.id) || 0) * 2654435761 + dayOfYear) >>> 0;
      return ha - hb;
    });
    return arr;
  }, [filteredForDiscover.length, userRatings, personalizationScores, city, activeFilter, secondaryCuisine, searchQuery, filterMood]);
  const heatCityRestaurants = heatCity === "All" ? allRestaurants : allRestaurants.filter(r => {
    const group = CITY_GROUPS[heatCity] || [heatCity];
    return group.includes(r.city) || group.includes(r.neighborhood);
  });
  // Build a stable deck stored in a ref — only rebuilds when city changes, not on each swipe
  const heatDeckRef = useRef([]);
  const [heatDeckIndex, setHeatDeckIndex] = useState(0);
  const heatDeckCityRef = useRef(null);

  // Rebuild deck when city changes or on first load
  useEffect(() => {
    if (heatDeckCityRef.current === heatCity && heatDeckRef.current.length > 0) return;
    heatDeckCityRef.current = heatCity;

    const active = heatCityRestaurants.filter(r => !isLovedCheck(r.id) && !heatResults.noped.includes(r.id) && !heatResults.skipped.includes(r.id));
    const recycled = heatCityRestaurants.filter(r => heatResults.skipped.includes(r.id));
    const all = [...active, ...recycled];
    if (all.length === 0) { heatDeckRef.current = []; setHeatDeckIndex(0); return; }

    // Seeded RNG
    const uid = user?.id || "x";
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = ((h << 5) - h + uid.charCodeAt(i)) | 0;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    let s = ((Math.abs(h) + dayOfYear * 2654435761) >>> 0) % 2147483647 || 1;
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

    // Priority buckets
    const scores = swipeScoresRef.current;
    const hasScores = Object.keys(scores).length > 0;
    const followedCitySet = new Set(followedCities || []);
    const buckets = { city: [], scored: [], rest: [] };
    for (const r of all) {
      if (followedCitySet.has(r.city)) buckets.city.push(r);
      else if (hasScores && (scores[String(r.id)] || 0) > 0) buckets.scored.push(r);
      else buckets.rest.push(r);
    }
    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    shuffle(buckets.city); shuffle(buckets.scored); shuffle(buckets.rest);

    // Interleave: 60% city, 25% taste, 15% discovery
    const result = [];
    let ci = 0, si = 0, ri = 0;
    for (let i = 0; i < all.length; i++) {
      const roll = rng();
      if (roll < 0.6 && ci < buckets.city.length) result.push(buckets.city[ci++]);
      else if (roll < 0.85 && si < buckets.scored.length) result.push(buckets.scored[si++]);
      else if (ri < buckets.rest.length) result.push(buckets.rest[ri++]);
      else if (ci < buckets.city.length) result.push(buckets.city[ci++]);
      else if (si < buckets.scored.length) result.push(buckets.scored[si++]);
      else if (ri < buckets.rest.length) result.push(buckets.rest[ri++]);
    }

    // Brand limiter: max 1 per 20 cards
    const getBrand = (name) => (name || "").toLowerCase().replace(/\b(the|a|an|of|in|at|on)\b/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
    const final = [], deferred = [], recent = [];
    for (const r of result) {
      const brand = getBrand(r.name);
      if (recent.includes(brand)) { deferred.push(r); }
      else { final.push(r); recent.push(brand); if (recent.length > 20) recent.shift(); }
    }
    heatDeckRef.current = [...final, ...deferred];
    setHeatDeckIndex(0);
  }, [heatCity, allRestaurants.length]);

  // Current visible cards from the stable deck
  const heatDeck = heatDeckRef.current.slice(heatDeckIndex);
  const heatActive = heatCityRestaurants.filter(r => !isLovedCheck(r.id) && !heatResults.noped.includes(r.id) && !heatResults.skipped.includes(r.id));
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

  // Mapbox: create/destroy map when entering/leaving Map tab
  useEffect(() => {
    if (tab !== "map") {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
      return;
    }
    const el = mapRef.current;
    if (!el) return;
    const map = new mapboxgl.Map({
      container: el,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 20],
      zoom: 2,
    });
    mapInstanceRef.current = map;
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
    };
  }, [tab]);

  // Mapbox: update markers and fitBounds when tab is map and city/restaurants change
  useEffect(() => {
    if (tab !== "map" || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const byCity = city === "All" ? allRestaurants : city === "Followed" ? allRestaurants.filter(r => followedCities.includes(r.city)) : allRestaurants.filter(r => r.city === city);
    const mapRestaurants = byCity.filter(r => r.lat != null && r.lng != null && r.lat !== 0);

    const updateMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      mapRestaurants.forEach(r => {
        const fs = getFlameScore(r);
        const glowOpacity = 0.15 + (fs / 5) * 0.45;
        const glowSpread = 2 + Math.round((fs / 5) * 6);
        const el = document.createElement("div");
        el.style.cssText = `width:16px;height:16px;border-radius:50%;background:linear-gradient(160deg,#ffb347 0%,#ff9632 40%,#e07850 70%,#c44060 100%);border:1.5px solid rgba(255,180,140,0.4);cursor:pointer;box-shadow:0 0 ${glowSpread}px ${Math.round(glowSpread*0.6)}px rgba(224,120,80,${glowOpacity});`;
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([r.lng, r.lat])
          .addTo(map);
        el.addEventListener("click", () => setSelectedRest(r));
        markersRef.current.push(marker);
      });
      if (mapRestaurants.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        mapRestaurants.forEach(r => bounds.extend([r.lng, r.lat]));
        map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
      }
    };

    if (map.loaded()) {
      updateMarkers();
    } else {
      map.once("load", updateMarkers);
    }
  }, [tab, city, allRestaurants]);

  const findsIds = (() => { try { return JSON.parse(safeLocalStorageGetItem("cooked_finds") || "[]"); } catch { return []; } })();
  const findsList = findsIds.map((id) => allRestaurants.find((r) => r.id === id || r.id === Number(id))).filter(Boolean);
  const explicitLovedIds = (() => { try { return JSON.parse(safeLocalStorageGetItem("cooked_loved") || "[]"); } catch { return []; } })();
  const lovedList = allRestaurants.filter(r => explicitLovedIds.includes(r.id) || explicitLovedIds.includes(Number(r.id)));
  const lovedRestaurants = lovedList;
  const watchList = allRestaurants.filter(r => isInWatchlist(r.id));
  const lovedFromSwipe = lovedList;

  const toggleLove = (id) => {
    setHeatResults(prev => {
      const isLoved = prev.loved.includes(id);
      const nextLoved = isLoved ? prev.loved.filter(x => x !== id) : [...prev.loved, id];
      try {
        const raw = safeLocalStorageGetItem("cooked_loved");
        const arr = raw ? JSON.parse(raw) : [];
        const set = new Set(arr);
        if (isLoved) {
          set.delete(id);
          set.delete(Number(id));
        } else {
          set.add(id);
        }
        safeSetItem("cooked_loved", JSON.stringify([...set]));
      } catch {}
      const nowLoved = !isLoved;
      if (user?.id) {
        if (nowLoved) {
          logInteraction(user.id, id, 'heat');
          const fullRest = allRestaurants.find(r => r.id === id || r.id === Number(id));
          if (fullRest) syncRestaurant(fullRest);
          syncLove(user.id, id);
          // Notify followers who have this on their watchlist
          supabase.from("user_data").select("clerk_user_id, watchlist").then(({ data, error: selErr }) => {
            if (selErr) { console.error("[Notif] user_data select error:", selErr); return; }
            if (!data) { console.log("[Notif] no user_data rows"); return; }
            const restaurant = allRestaurants.find(r => r.id === id || r.id === Number(id));
            console.log("[Notif] checking", data.length, "users for watchlist match on id:", id);
            data.forEach(row => {
              if (row.clerk_user_id === user.id) return;
              const wl = Array.isArray(row.watchlist) ? row.watchlist : [];
              if (wl.map(String).includes(String(id))) {
                console.log("[Notif] sending watchlist notification to", row.clerk_user_id, "for", restaurant?.name);
                supabase.from("notifications").insert({
                  user_id: row.clerk_user_id,
                  type: "friend_loved_your_watchlist",
                  from_user_id: user.id,
                  restaurant_id: String(id),
                  restaurant_name: restaurant?.name || "",
                  read: false,
                }).then(({ error }) => { if (error) console.error("[Notif] insert error:", error); else console.log("[Notif] watchlist notification sent!"); });
              }
            });
          });
          // Notify followers who follow cities where this restaurant is located
          const restaurant = allRestaurants.find(r => r.id === id || r.id === Number(id));
          if (restaurant?.city) {
            supabase.from("city_follows").select("clerk_user_id").eq("city", restaurant.city).then(({ data: cityFollowers, error: cfErr }) => {
              if (cfErr) { console.error("[Notif] city_follows select error:", cfErr); return; }
              if (!cityFollowers) return;
              console.log("[Notif] checking", cityFollowers.length, "city followers for", restaurant.city);
              cityFollowers.forEach(row => {
                if (row.clerk_user_id === user.id) return;
                console.log("[Notif] sending city notification to", row.clerk_user_id);
                supabase.from("notifications").insert({
                  user_id: row.clerk_user_id,
                  type: "friend_visited_city",
                  from_user_id: user.id,
                  restaurant_id: String(id),
                  restaurant_name: restaurant.name,
                  read: false,
                }).then(({ error }) => { if (error) console.error("[Notif] city insert error:", error); else console.log("[Notif] city notification sent!"); });
              });
            });
          }
          // Sync loved array to Supabase user_data.loved (single source of truth)
          supabase.from("user_data").select("loved").eq("clerk_user_id", user.id).single().then(({ data: ud }) => {
            const current = Array.isArray(ud?.loved) ? ud.loved : [];
            const updated = [...new Set([...current, id, Number(id)])].filter(Boolean);
            supabase.from("user_data").update({ loved: updated }).eq("clerk_user_id", user.id).then(() => {});
          });
        } else {
          removeLove(user.id, id);
          // Remove from Supabase user_data.loved
          supabase.from("user_data").select("loved").eq("clerk_user_id", user.id).single().then(({ data: ud }) => {
            const current = Array.isArray(ud?.loved) ? ud.loved : [];
            const updated = current.filter(x => String(x) !== String(id));
            supabase.from("user_data").update({ loved: updated }).eq("clerk_user_id", user.id).then(() => {});
          });
        }
      }
      return {
        ...prev,
        loved: nextLoved,
      };
    });
    // Refresh feeds after a love action (debounced — wait for swiping to settle)
    clearTimeout(window._feedRefreshTimer);
    window._feedRefreshTimer = setTimeout(refreshFeeds, 5000);
  };
  const toggleWatch = (id) => {
    const normalizedId = isNaN(id) ? id : Number(id);
    setWatchlist(s => {
      const inList = s.includes(normalizedId) || s.includes(Number(id)) || s.includes(String(id));
      if (user?.id) logInteraction(user.id, id, inList ? 'watchlist_remove' : 'watchlist');
      if (inList) return s.filter(x => x !== normalizedId && x !== Number(id) && x !== String(id));
      return [...s, normalizedId];
    });
  };
  const share = async (name, restaurantId) => {
    const text = `Check out ${name} on Cooked — the restaurant app for people who care.`;
    // Log external share for flame score (+5 points)
    if (user?.id && restaurantId) logInteraction(user.id, restaurantId, 'share');
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(text);
        setToast(name);
        setTimeout(() => setToast(null), 2500);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setToast(name);
        setTimeout(() => setToast(null), 2500);
      } catch {}
    }
  };

  const addToCookedFinds = (ids) => {
    try {
      const raw = safeLocalStorageGetItem("cooked_finds");
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set(arr);
      ids.forEach((id) => set.add(id));
      console.log('FINDS SAVE:', ids);
      safeSetItem("cooked_finds", JSON.stringify([...set]));
    } catch {}
  };

  /** After IG import saves to community_restaurants, persist id to Finds (local + Supabase user_data.finds). */
  const persistFindAfterCommunityImport = async (result, restaurantObject) => {
    if (result?.data?.[0]?.id || restaurantObject?.id) {
      const savedId = String(result?.data?.[0]?.id || restaurantObject.id);
      try {
        const finds = JSON.parse(safeLocalStorageGetItem("cooked_finds") || "[]");
        if (!finds.map(String).includes(savedId)) {
          finds.push(savedId);
          safeSetItem("cooked_finds", JSON.stringify(finds));
        }
      } catch {}
      if (user?.id) {
        try {
          const currentFinds = JSON.parse(safeLocalStorageGetItem("cooked_finds") || "[]");
          saveUserData(user.id, { finds: currentFinds });
          // Notify followers that friend added a new Find
          const { data: followers } = await supabase.from("follows").select("follower_id").eq("following_id", user.id);
          if (followers) {
            followers.forEach(row => {
              supabase.from("notifications").insert({
                user_id: row.follower_id,
                type: "friend_new_find",
                from_user_id: user.id,
                restaurant_id: savedId,
                read: false,
              });
            });
          }
        } catch {}
      }
    }
  };

  const ANTHROPIC_PROMPT = `You are a data extraction API. Extract restaurant information from this Instagram post screenshot.

CRITICAL: Return ONLY a valid JSON array. No explanation, no preamble, no markdown, no code blocks. Just the raw JSON array.

Format:
[{"name":"Restaurant Name","city":"City Name","neighborhood":"Neighborhood","cuisine":"Cuisine Type","price":"$$","description":"One evocative sentence about the restaurant.","tags":["tag1","tag2","tag3"]}]

If no restaurant is visible, return: []
If unsure about a field, use "Unknown" for strings or "$" for price.`;

  const unresolvedRestaurants = allRestaurants.filter((r) => !restaurantPhotoInSharedCache(r));
  const resolvedRestaurants = allRestaurants.filter((r) => restaurantPhotoInSharedCache(r));

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
    const toFetch = allRestaurants.filter((r) => !restaurantPhotoInSharedCache(r));
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
    setIgError(null);
    setIgImporting(true);
    try {
      console.log("Starting Claude API call with image size:", base64Data?.length);
      const res = await fetch("https://cooked-proxy.luga-podesta.workers.dev/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      let restaurants = [];
      try {
        // Strip any markdown fences if Claude added them despite instructions
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        // Find the JSON array in the response
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          restaurants = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON array found in response");
        }
      } catch (parseErr) {
        console.error("[IG Import] JSON parse error:", parseErr, "Raw text:", text);
        setIgError("Could not extract restaurant data. Please try a clearer screenshot.");
        setIgImporting(false);
        return;
      }
      const list = Array.isArray(restaurants) ? restaurants : [];
      const googleKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
      const foundBy = user?.fullName || user?.username || "a user";
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
          source: `Found by ${foundBy}`,
          desc: item.description || item.desc || "",
          heat: "🔥🔥",
        };
      });

      if (googleKey) {
        const pickerItems = await Promise.all(baseRestaurants.map(async (restaurant) => {
          const photoOptions = [];
          let enrichedRestaurant = restaurant;
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
            let details = null;
            if (place?.id) {
              try {
                const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
                  headers: {
                    "X-Goog-Api-Key": googleKey,
                    "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours.weekdayDescriptions,websiteUri,location,photos,priceLevel,rating,addressComponents",
                  },
                });
                if (detailsRes.ok) {
                  details = await detailsRes.json();
                } else {
                  const detailsErr = await detailsRes.text().catch(() => "");
                  console.error("[Places API] details error:", detailsRes.status, detailsErr);
                }
              } catch (detailsErr) {
                console.error("[Places API] details fetch error for", restaurant.name, detailsErr);
              }
            }

            const addressComponents = details?.addressComponents || [];
            const cityComponent = addressComponents.find((c) => c?.types?.includes("locality"));
            const neighborhoodComponent =
              addressComponents.find((c) => c?.types?.includes("neighborhood")) ||
              addressComponents.find((c) => c?.types?.includes("sublocality")) ||
              addressComponents.find((c) => c?.types?.includes("sublocality_level_1"));
            const cityFromAddress = cityComponent?.longText || cityComponent?.shortText || "";
            const stateComponent = addressComponents.find((c) =>
              c?.types?.includes("administrative_area_level_1")
            );
            const stateFromAddress = stateComponent?.longText || "";

            const municipalityComponent = addressComponents.find((c) =>
              c?.types?.includes("locality") ||
              c?.types?.includes("administrative_area_level_2")
            );
            const municipalityFromAddress = municipalityComponent?.longText || "";
            const rawCity = municipalityFromAddress || cityFromAddress || stateFromAddress;
            const normalizedCity = normalizeCity(rawCity) || rawCity;
            const neighborhoodFromAddress = neighborhoodComponent?.longText || neighborhoodComponent?.shortText || "";
            const neighborhoodFallback =
              addressComponents.find((c) => c?.types?.includes("sublocality"))?.longText ||
              addressComponents.find((c) => c?.types?.includes("administrative_area_level_2"))?.longText ||
              addressComponents.find((c) => c?.types?.includes("postal_town"))?.longText ||
              normalizedCity ||
              "";
            const level = details?.priceLevel;
            const priceFromLevel =
              typeof level === "number" && level > 0 && level <= 4
                ? "$".repeat(level)
                : restaurant.price;

            enrichedRestaurant = {
              ...restaurant,
              name: details?.displayName?.text || restaurant.name,
              city: normalizedCity || restaurant.city,
              neighborhood:
                neighborhoodFromAddress ||
                neighborhoodFallback ||
                (restaurant.neighborhood !== "Unknown" ? (restaurant.neighborhood || neighborhoodFallback) : neighborhoodFallback),
              address: details?.formattedAddress || restaurant.address,
              phone: details?.nationalPhoneNumber || details?.internationalPhoneNumber || restaurant.phone,
              hours: details?.regularOpeningHours?.weekdayDescriptions || restaurant.hours,
              website: details?.websiteUri || restaurant.website,
              lat: details?.location?.latitude ?? restaurant.lat,
              lng: details?.location?.longitude ?? restaurant.lng,
              rating: details?.rating || restaurant.rating,
              price: priceFromLevel,
              source: `Found by ${foundBy}`,
            };

            let openTableUrl = enrichedRestaurant.website || "";
            try {
              const otRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Goog-Api-Key": googleKey,
                  "X-Goog-FieldMask": "places.websiteUri,places.displayName",
                },
                body: JSON.stringify({ textQuery: `${enrichedRestaurant.name} opentable ${enrichedRestaurant.city}` }),
              });
              if (otRes.ok) {
                const otData = await otRes.json();
                const otPlace = otData.places?.[0];
                if (otPlace?.websiteUri?.includes("opentable.com")) {
                  openTableUrl = otPlace.websiteUri;
                }
              }
            } catch (otErr) {
              console.warn("[OT] search failed", otErr);
            }
            if (openTableUrl.includes("opentable.com")) {
              enrichedRestaurant.website = openTableUrl;
            }

            let aiFields = {};
            try {
              const aiRes = await fetch("https://cooked-proxy.luga-podesta.workers.dev/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "claude-sonnet-4-20250514",
                  max_tokens: 800,
                  system: "You are a food critic and restaurant expert. Return ONLY valid JSON, no markdown, no explanation.",
                  messages: [{
                    role: "user",
                    content: `Generate rich restaurant data for the Cooked app for this restaurant:
Name: ${enrichedRestaurant.name}
City: ${enrichedRestaurant.city}
Neighborhood: ${enrichedRestaurant.neighborhood}
Cuisine: ${enrichedRestaurant.cuisine}
Price: ${enrichedRestaurant.price}
Address: ${enrichedRestaurant.address}
Description: ${enrichedRestaurant.desc || ""}

Return a JSON object with exactly these fields:
{
  "about": "2-3 sentence description of the restaurant, its history and what makes it special",
  "must_order": ["dish 1", "dish 2", "dish 3"],
  "vibe": "one sentence describing the atmosphere and who goes there",
  "best_for": ["occasion 1", "occasion 2", "occasion 3"],
  "known_for": "the one thing this restaurant is most famous for",
  "insider_tip": "a specific actionable tip a local would know",
  "price_detail": "specific price context e.g. '$45 for the omakase, BYOB saves money'"
}`
                  }]
                })
              });
              if (aiRes.ok) {
                const aiData = await aiRes.json();
                const aiText = aiData.content?.[0]?.text || "";
                const cleaned = aiText.replace(/```json|```/g, "").trim();
                aiFields = JSON.parse(cleaned);
              }
            } catch (aiErr) {
              console.warn("[AI enrichment] failed", aiErr);
            }

            enrichedRestaurant = {
              ...enrichedRestaurant,
              about: aiFields.about || enrichedRestaurant.desc || "",
              must_order: aiFields.must_order || [],
              vibe: aiFields.vibe || "",
              best_for: aiFields.best_for || [],
              known_for: aiFields.known_for || "",
              insider_tip: aiFields.insider_tip || "",
              price_detail: aiFields.price_detail || "",
            };

            const photos = (details?.photos || place?.photos || []).slice(0, 12);
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
          return { restaurant: enrichedRestaurant, photoOptions, selectedIndex: 0, isRefreshing: false, refreshOffset: 0, userSelected: false };
        }));
        console.log("[processScreenshot] Setting igPhotoPicker with", pickerItems.length, "items");
        setPickerMode("ig-import");
        setIgPhotoPicker(pickerItems);
      } else {
        console.log("[processScreenshot] No VITE_GOOGLE_PLACES_KEY — not setting igPhotoPicker, adding restaurants directly");
        const existingIds = new Set(allRestaurantsRef.current.map((r) => r.id));
        const toAdd = baseRestaurants.filter((x) => !existingIds.has(x.id));
        setAllRestaurants((prev) => {
          const ids = new Set(prev.map((r) => r.id));
          const newOnes = baseRestaurants.filter((x) => !ids.has(x.id));
          return newOnes.length ? [...newOnes, ...prev] : prev;
        });
        if (toAdd.length) {
          for (const restaurantObject of toAdd) {
            console.log('Saving to community:', restaurantObject);
            const nameForMatch = String(restaurantObject.name || "").trim();
            const { data: existing } = nameForMatch
              ? await supabase
                  .from('community_restaurants')
                  .select('id')
                  .ilike('name', nameForMatch)
                  .limit(1)
              : { data: null };
            if (existing?.length) {
              const existingId = String(existing[0].id);
              persistFindAfterCommunityImport({ data: [{ id: existingId }] }, { id: existingId });
              continue;
            }
            const result = await addCommunityRestaurant(restaurantObject);
            console.log('Community save result:', result);
            if (!result.error) persistFindAfterCommunityImport(result, restaurantObject);
          }
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
    console.log('CONFIRM CLICKED');
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

    console.log('Adding to finds:', confirmedIds);
    addToCookedFinds(confirmedIds);
    setPhotoResolved((prev) => [...new Set([...prev, ...confirmedIds])]);
    // Write to permanent photo vault — this key is NEVER overwritten by merges or updates
    try {
      if (usingSupabasePhotoCache) {
        const updatedPhotos = { ...(photoCacheRef.current || {}) };
        const chosenPairs = [];
        igPhotoPicker.forEach((item) => {
          if (!item.userSelected) return;
          const uri = item.photoOptions[item.selectedIndex]?.photoUri;
          if (!uri) return;
          updatedPhotos[item.restaurant.id] = uri;
          chosenPairs.push([item.restaurant.id, uri]);
        });
        photoCacheRef.current = updatedPhotos;

        // Secondary local cache for offline use.
        try {
          const vault = JSON.parse(safeLocalStorageGetItem("cooked_photos") || "{}");
          chosenPairs.forEach(([rid, uri]) => {
            vault[rid] = uri;
            touchPhotoCacheAccess(rid);
          });
          safeSetItem("cooked_photos", JSON.stringify(vault));
        } catch {}

        chosenPairs.forEach(([rid, uri]) => {
          void saveSharedPhoto(String(rid), uri);
        });
      } else {
        const vault = JSON.parse(safeLocalStorageGetItem("cooked_photos") || "{}");
        igPhotoPicker.forEach((item) => {
          if (item.userSelected && item.photoOptions[item.selectedIndex]?.photoUri) {
            vault[item.restaurant.id] = item.photoOptions[item.selectedIndex].photoUri;
            touchPhotoCacheAccess(item.restaurant.id);
          }
        });
        safeSetItem("cooked_photos", JSON.stringify(vault));
        igPhotoPicker.forEach((item) => {
          if (item.userSelected && item.photoOptions[item.selectedIndex]?.photoUri) {
            void saveSharedPhoto(String(item.restaurant.id), item.photoOptions[item.selectedIndex].photoUri);
          }
        });
      }
    } catch {}
    const updated = igPhotoPicker
      .map(({ restaurant, photoOptions, selectedIndex }) => {
        const chosen = photoOptions[selectedIndex]?.photoUri;
        if (!chosen) return null;
        return { ...restaurant, img: chosen, img2: chosen };
      })
      .filter(Boolean);
    const updatedIds = updated.map(r => r.id);
    console.log('Adding to finds:', updatedIds);
    if (updatedIds.length) addToCookedFinds(updatedIds);
    if (updated.length) {
      (async () => {
        for (const restaurantObject of updated) {
          console.log('Saving to community:', restaurantObject);
          const nameForMatch = String(restaurantObject.name || "").trim();
          const { data: existing } = nameForMatch
            ? await supabase
                .from('community_restaurants')
                .select('id')
                .ilike('name', nameForMatch)
                .limit(1)
            : { data: null };
          if (existing?.length) {
            const existingId = String(existing[0].id);
            persistFindAfterCommunityImport({ data: [{ id: existingId }] }, { id: existingId });
            const selectedPhotoUrl = restaurantObject.img || restaurantObject.img2;
            if (selectedPhotoUrl) void saveSharedPhoto(existingId, selectedPhotoUrl);
            continue;
          }
          const result = await addCommunityRestaurant(restaurantObject);
          console.log('Community save result:', result);
          if (!result.error) {
            persistFindAfterCommunityImport(result, restaurantObject);
            const savedId = String(result?.data?.[0]?.id || restaurantObject.id);
            const selectedPhotoUrl = restaurantObject.img || restaurantObject.img2;
            if (selectedPhotoUrl) void saveSharedPhoto(savedId, selectedPhotoUrl);
          }
        }
      })();
    }
    setIgAddedRestaurants(updated);
    setIgDone(true);
    setIgPhotoPicker([]);

    // Reload remaining unresolved as empty slots — lazy queue will fill them as user scrolls
    const remaining = allRestaurants.filter((r) => !restaurantPhotoInSharedCache(r));
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

  const discoverModeSegmented = (
    <div style={{ display: "flex", gap: 8, padding: "6px 16px 8px" }}>
      {[
        { id: "restaurants", label: "Restaurants" },
        { id: "people", label: "People" },
      ].map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setDiscoverSearchMode(id)}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 20,
            border: `1px solid ${discoverSearchMode === id ? C.terracotta : C.border}`,
            background: discoverSearchMode === id ? C.terracotta : C.bg2,
            color: discoverSearchMode === id ? "#fff" : C.muted,
            fontSize: 11,
            fontFamily: "'Inter', -apple-system, sans-serif",
            letterSpacing: "0.4px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          try {
            localStorage.setItem("cooked_onboarding_done", "1");
          } catch {}
          setShowOnboarding(false);
          skipNextTabPersistRef.current = true;
          setTab("heat");
        }}
      />
    );
  }

  /* "One last thing" gate removed — profile data is now fully collected during onboarding */

  return (
    <>
    {false && <SignedOut>
      <div style={{ width:"100%", minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" }}>
        <div style={{ width:"100%", maxWidth:480, textAlign:"center" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
            <Wordmark size={44} />
          </div>
          <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontStyle:"italic", fontSize:20, color:C.text, marginBottom:24 }}>
            your personal restaurant guide
          </div>
          <SignInButton mode="modal">
            <button
              type="button"
              style={{
                background:C.terracotta,
                color:"#fff",
                border:"none",
                borderRadius:14,
                padding:"14px 28px",
                fontFamily:"'Inter', -apple-system, sans-serif",
                fontSize:15,
                fontWeight:600,
                cursor:"pointer",
              }}
            >
              Sign In
            </button>
          </SignInButton>
        </div>
      </div>
    </SignedOut>}
    {/* <SignedIn> — temporarily bypassed for design work */}
    <div style={{ width:"100%", minHeight:"100vh", fontFamily:"'Inter',sans-serif", overflowX:"hidden" }}>
    <div style={{ maxWidth:480, margin:"0 auto", minHeight:"100vh", paddingBottom:"calc(70px + env(safe-area-inset-bottom, 0px))", position:"relative", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Inter:wght@300;400;500;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .city-row::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Main content (header + tabs): explicit low stacking so detail overlay always wins */}
      <div style={{ position:"relative", zIndex:10, marginTop:0, paddingTop:0 }}>
      {/* Header */}
      <div ref={headerRef} className="d-home-header" style={{ display: (tab === "heat" || tab === "profile") ? "none" : "flex" }}>
        <div className="header-left">
          <div className="d-logo" onClick={() => setTab("home")} style={{ cursor:"pointer" }}>cook<span style={{ WebkitTextFillColor:"#e07850", filter:"drop-shadow(0 0 8px rgba(224,112,80,0.4))" }}>ed</span><span style={{ fontFamily:"'Dancing Script', cursive", fontSize:"0.55em", color:"#f0ebe2", marginLeft:2, fontWeight:400, fontStyle:"normal", position:"relative", top:"0.15em", WebkitTextFillColor:"#f0ebe2", background:"none", WebkitBackgroundClip:"unset", backgroundClip:"unset" }}>beta</span></div>
        </div>
        {(tab === "home" || tab === "discover" || tab === "map") && (
          <div style={{ position:"relative" }}>
            <button className="city-picker" onClick={() => setCityPickerOpen(v => !v)}>
              {city === "All" ? "All Cities" : city === "Followed" ? "Followed Cities" : city} {cityPickerOpen ? "▴" : "▾"}
            </button>
            {cityPickerOpen && (
              <div style={{ position:"absolute", top:"calc(100% + 8px)", right:-60, zIndex:600, background:"#12121a", borderRadius:14, boxShadow:"0 12px 40px rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.06)", width:220, maxHeight:380, overflowY:"auto", scrollbarWidth:"none", padding:"6px 0 8px" }} onClick={e => e.stopPropagation()}>
                {homeCity && (
                  <div style={{ padding:"0 0 4px" }}>
                    <div style={{ padding:"6px 14px 4px", fontFamily:"'Inter', sans-serif", fontSize:8, color:"rgba(245,240,235,0.15)", letterSpacing:"1.8px", textTransform:"uppercase" }}>🏠 Home</div>
                    <button type="button" onClick={() => { setCity(homeCity); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                      style={{ width:"100%", padding:"8px 14px", textAlign:"left", background: city === homeCity ? "rgba(255,150,50,0.1)" : "transparent", border:"none", color: city === homeCity ? "#ff9632" : "#f5f0eb", fontSize:14, fontFamily:"'Inter', sans-serif", fontWeight: city === homeCity ? 600 : 400, cursor:"pointer" }}>
                      {homeCity}
                    </button>
                  </div>
                )}
                {user?.id && followedCities.length > 0 && (
                  <div style={{ borderTop:"1px solid rgba(255,255,255,0.04)", padding:"0 0 4px" }}>
                    <div style={{ padding:"8px 14px 4px", fontFamily:"'Inter', sans-serif", fontSize:8, color:"rgba(245,240,235,0.15)", letterSpacing:"1.8px", textTransform:"uppercase" }}>Followed Cities</div>
                    <button type="button" onClick={() => { setCity("Followed"); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                      style={{ width:"100%", padding:"8px 14px", textAlign:"left", background: city === "Followed" ? "rgba(255,150,50,0.1)" : "transparent", border:"none", color: city === "Followed" ? "#ff9632" : "#f5f0eb", fontSize:14, fontFamily:"'Inter', sans-serif", fontWeight: city === "Followed" ? 600 : 400, cursor:"pointer" }}>
                      All Followed ({followedCities.length})
                    </button>
                    {followedCities.filter(fc => fc !== homeCity).map((fc) => (
                      <button key={fc} type="button" onClick={() => { setCity(fc); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                        style={{ width:"100%", padding:"6px 14px 6px 24px", textAlign:"left", background: city === fc ? "rgba(255,150,50,0.1)" : "transparent", border:"none", color: city === fc ? "#ff9632" : "#f5f0eb", fontSize:13, fontFamily:"'Inter', sans-serif", fontWeight: city === fc ? 600 : 400, cursor:"pointer" }}>
                        {fc}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.04)", padding:"8px 0 0" }}>
                  <div style={{ padding:"0 14px 4px", fontFamily:"'Inter', sans-serif", fontSize:8, color:"rgba(245,240,235,0.15)", letterSpacing:"1.8px", textTransform:"uppercase" }}>All Cities</div>
                  <button type="button" onClick={() => { setCity("All"); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }} style={{ width:"100%", padding:"8px 14px", textAlign:"left", background: city==="All" ? "rgba(255,150,50,0.1)" : "transparent", border:"none", color: city==="All" ? "#ff9632" : "#f5f0eb", fontSize:14, fontFamily:"'Inter', sans-serif", fontWeight: city==="All" ? 600 : 400, cursor:"pointer" }}>All Cities</button>
                </div>
                {getPersonalizedCityRegions(lovedRestaurants, followedCities, heatResults, dynamicCityRegions).map(({ region, cities: regionCities }) => (
                  <div key={region}>
                    <div style={{ padding:"10px 14px 4px", fontFamily:"'Inter', sans-serif", fontSize:8, color:"#ff9632", letterSpacing:"1.8px", textTransform:"uppercase", borderTop:"1px solid rgba(255,255,255,0.06)" }}>{region}</div>
                    {[...regionCities].sort((a, b) => {
                      const aFollowed = followedCities.includes(a) ? 0 : 1;
                      const bFollowed = followedCities.includes(b) ? 0 : 1;
                      if (aFollowed !== bFollowed) return aFollowed - bFollowed;
                      return a.localeCompare(b);
                    }).map((c) => (
                      <div key={c} style={{ display: "flex", alignItems: "stretch", width: "100%" }}>
                        <button type="button" onClick={() => { setCity(c); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                          style={{ flex: 1, minWidth: 0, padding: "8px 8px 8px 14px", textAlign: "left", background: city === c ? "rgba(255,150,50,0.1)" : "transparent", border: "none", color: city === c ? "#ff9632" : "#f5f0eb", fontSize: 14, fontFamily: "'Inter', sans-serif", fontWeight: city === c || followedCities.includes(c) ? 600 : 400, cursor: "pointer" }}>
                          {followedCities.includes(c) ? `★ ${c}` : c}
                        </button>
                        {user?.id ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); toggleCityFollow(c, e); }}
                            style={{ padding: "0 14px", background: "transparent", border: "none", cursor: "pointer", color: followedCities.includes(c) ? "#ff9632" : "rgba(245,240,235,0.3)", fontSize: 16, flexShrink: 0 }}>
                            {followedCities.includes(c) ? "★" : "☆"}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="header-right">
          <div className="d-icon-btn glass-icon" onClick={openDmInbox} style={{ cursor:"pointer", position:"relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            {dmUnread > 0 && <span style={{ position:"absolute", top:-2, right:-2, width:8, height:8, borderRadius:"50%", background:"#ff9632" }} />}
          </div>
          <div className="d-icon-btn glass-icon" onClick={openNotificationsSheet} style={{ cursor:"pointer", position:"relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {notifUnreadCount > 0 && <span style={{ position:"absolute", top:-2, right:-2, width:8, height:8, borderRadius:"50%", background:"#ff9632" }} />}
          </div>
          <div className="header-avatar" onClick={() => setTab("profile")} style={{ cursor:"pointer" }}>
            {headerProfilePhoto || user?.imageUrl ? (
              <img src={headerProfilePhoto || user?.imageUrl || ""} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }} onError={(e) => { e.target.style.display = "none"; }} />
            ) : (
              <AvatarIcon type={getDefaultAvatar(user?.id)} size={18} />
            )}
          </div>
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div style={{ height: 0, margin: 0, padding: 0 }} />

      {/* Home Tab */}
      {tab === "home" && (() => {
        const getCity = (r) => r.city || r.location || r.region || "";
        const allSorted = [...allRestaurants].sort((a, b) => getFlameScore(b) - getFlameScore(a));
        const cityFiltered = city === "All" ? allSorted : city === "Followed"
          ? allSorted.filter(r => followedCities.includes(r.city))
          : allSorted.filter(r => {
            const group = CITY_GROUPS[city] || [city];
            return group.includes(r.city) || group.includes(r.neighborhood);
          });
        const hotNow = cityFiltered.slice(0, 8).length >= 3 ? cityFiltered.slice(0, 8) : allSorted.slice(0, 8);
        const featuredRestaurant = youdLoveFiltered[0] || cityFiltered[0] || allSorted[0];
        return (
        <div className="d-home" style={{ paddingTop: headerHeight + 28 }}>
          <div className="glow-orb glow-amber glow-bg1" />
          <div className="glow-orb glow-rose glow-bg2" />

          {/* Inline chat */}
          <ChatBot key={homeChatKey} inline allRestaurants={allRestaurants} initialInput={chatInput} initialMessages={restoredMessages} userId={user?.id} lovedRestaurants={lovedRestaurants} watchlist={watchlist} followedCities={followedCities} tasteProfile={chatTasteProfile} selectedCity={city} onOpenDetail={setDetailRestaurant} isAdmin={isAdmin} />

          {(() => {
            let recentChats = [];
            try {
              recentChats = JSON.parse(safeLocalStorageGetItem("cooked_chat_history") || "[]").reverse();
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
                const hist = JSON.parse(safeLocalStorageGetItem("cooked_chat_history") || "[]");
                hist.splice(hist.length - 1 - index, 1);
                safeSetItem("cooked_chat_history", JSON.stringify(hist));
                setHomeChatKey((k) => k + 1);
              } catch (e) {}
            };

            if (!recentChats.length) return null;
            return (
              <>
                <button type="button" className="home-section-label" onClick={() => setRecentChatsOpen(o => !o)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                  RECENT CHATS <span style={{ fontSize:8, opacity:0.5, transition:"transform 0.2s", transform: recentChatsOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                </button>
                {recentChatsOpen && (
                  <div className="home-recent">
                    {recentChats.slice(0, 3).map((entry, i) => (
                      <div key={i} className="home-recent-card glass-subtle"
                        onClick={() => { setRestoredMessages(entry.messages || null); setChatInput(entry.query || entry); setHomeChatKey((k) => k + 1); setRecentChatsOpen(false); }}>
                        <div className="chat-icon"><span>🔥</span></div>
                        <div className="chat-preview">
                          <div className="chat-text">{entry.query || entry}</div>
                          <div className="chat-date">{getRelativeTime(entry)}</div>
                        </div>
                        <button className="chat-dismiss" onClick={(e) => { e.stopPropagation(); deleteChat(i); }}>&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          <div className="home-section-header" style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <h3>Cooked for you</h3>
            </div>
            <button className="see-all" onClick={() => setTab("discover")}>see all</button>
          </div>
          {featuredRestaurant ? (
            <div className="home-hero-card" onClick={() => setDetailRestaurant(featuredRestaurant)}>
              <img src={getAnyCachedPhotoForId(featuredRestaurant.id) || featuredRestaurant.img} alt={featuredRestaurant.name} />
              <div className="shade" />
              <div className="label-top glass-pill">✦ BASED ON YOUR TASTE</div>
              <div className="flame-top"><span>{"🔥".repeat(Math.min(Math.round(getFlameScore(featuredRestaurant)), 5))}</span></div>
              <div className="bottom-info">
                <h3>{featuredRestaurant.name}</h3>
                <div className="meta">{[featuredRestaurant.cuisine, featuredRestaurant.neighborhood, featuredRestaurant.price].filter(Boolean).join(" · ")}</div>
                {featuredRestaurant._recommenders?.length > 0 && (
                  <div className="meta" style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>{featuredRestaurant._recommenders[0]} loved this too</div>
                )}
                {!featuredRestaurant._recommenders?.length && (() => {
                  // Match explanation to the actual restaurant's cuisine
                  const rc = (featuredRestaurant.cuisine || "").toLowerCase();
                  const match = (chatTasteProfile?.topCuisines || []).find(c => rc.includes((c.cuisine || c.name || "").toLowerCase()));
                  if (match) return <div className="meta" style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>Because you love {match.cuisine || match.name}</div>;
                  // Fallback: mention neighborhood or a tag
                  if (featuredRestaurant.neighborhood) return <div className="meta" style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>Popular in {featuredRestaurant.neighborhood}</div>;
                  return null;
                })()}
              </div>
            </div>
          ) : null}

          {trendingFiltered.length > 0 ? (
            <>
              <div className="home-section-header">
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <h3>Trending in your cities</h3>
                </div>
              </div>
              <div className="home-rising-scroll">
                {trendingFiltered.map(r => (
                  <div key={`${r.id}-${photoCacheVersion}`} className="home-rising-card" onClick={() => setDetailRestaurant(r)}>
                    <img src={getAnyCachedPhotoForId(r.id) || r.img} alt={r.name} />
                    <div className="shade" />
                    <div className="flame-badge"><span>{"🔥".repeat(Math.min(Math.round(getFlameScore(r)), 5))}</span></div>
                    <div className="card-info">
                      <h4>{r.name}</h4>
                      <div className="sub">{r.cuisine || ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* You'd Love This — collaborative filtering */}
          {youdLoveFiltered.length > 0 && (
            <>
              <div className="home-section-header">
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <h3>You'd love this</h3>
                </div>
              </div>
              <div className="home-rising-scroll">
                {youdLoveFiltered.map(r => (
                  <div key={`rec-${r.id}-${photoCacheVersion}`} className="home-rising-card" onClick={() => setDetailRestaurant(r)}>
                    <img src={getAnyCachedPhotoForId(r.id) || r.img} alt={r.name} />
                    <div className="shade" />
                    <div className="flame-badge"><span>{"🔥".repeat(Math.min(Math.round(getFlameScore(r)), 5))}</span></div>
                    <div className="card-info">
                      <h4>{r.name}</h4>
                      <div className="sub">{r._recommenders?.length > 0 ? `${r._recommenders[0]} loved this` : `${r._weight} taste ${r._weight === 1 ? "match" : "matches"}`}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Rising — trending last 30 days */}
          {risingFiltered.length > 0 && (
            <>
              <div className="home-section-header">
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <h3>Rising</h3>
                  <span className="section-sub">last 30 days</span>
                </div>
                <button className="see-all" onClick={() => setTab("discover")}>see all</button>
              </div>
              <div className="home-rising-scroll">
                {risingFiltered.map(r => (
                  <div key={`rise-${r.id}-${photoCacheVersion}`} className="home-rising-card" onClick={() => setDetailRestaurant(r)}>
                    <img src={getAnyCachedPhotoForId(r.id) || r.img} alt={r.name} />
                    <div className="shade" />
                    <div className="flame-badge"><span>{"🔥".repeat(Math.min(Math.round(getFlameScore(r)), 5))}</span></div>
                    <div className="card-info">
                      <h4>{r.name}</h4>
                      <div className="sub">{r._recentLoves} recent {r._recentLoves === 1 ? "love" : "loves"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Hidden Gems — high rated, few loves */}
          {hiddenGemsFiltered.length > 0 && (
            <>
              <div className="home-section-header">
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <h3>Hidden Gems</h3>
                </div>
                <button className="see-all" onClick={() => setTab("discover")}>see all</button>
              </div>
              {hiddenGemsFiltered.slice(0, 3).map(r => (
                <div key={`gem-${r.id}-${photoCacheVersion}`} className="d-gem-card" onClick={() => setDetailRestaurant(r)}>
                  <img src={getAnyCachedPhotoForId(r.id) || r.img} alt={r.name} />
                  <div className="shade" />
                  <div className="gem-badge glass-pill">💎 Hidden Gem</div>
                  <div className="bottom-info">
                    <h3>{r.name}</h3>
                    <div className="meta">{[r.cuisine, r.neighborhood || r.city].filter(Boolean).join(" · ")}</div>
                    <div className="meta" style={{ opacity: 0.5, fontSize: 11 }}>{r._loveCount === 0 ? "Undiscovered" : `Only ${r._loveCount} ${r._loveCount === 1 ? "person knows" : "people know"}`}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Cross-Cuisine Discovery — same vibes, different cuisine */}
          {crossCuisineRecs.length > 0 && (
            <>
              <div className="home-section-header">
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <h3>New flavors, same vibes</h3>
                </div>
              </div>
              <div className="home-rising-scroll">
                {crossCuisineRecs.slice(0, 6).map(r => (
                  <div key={`cross-${r.id}-${photoCacheVersion}`} className="home-rising-card" onClick={() => setDetailRestaurant(r)}>
                    <img src={getAnyCachedPhotoForId(r.id) || r.img} alt={r.name} />
                    <div className="shade" />
                    <div className="flame-badge"><span>{"🔥".repeat(Math.min(Math.round(getFlameScore(r)), 5))}</span></div>
                    <div className="card-info">
                      <h4>{r.name}</h4>
                      <div className="sub">{r._sharedTags?.length > 0 ? `${r._sharedTags[0]} · ${r.cuisine}` : r.cuisine}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="home-section-header">
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <h3>Hot right now</h3>
            </div>
            <button className="see-all" onClick={() => setTab("discover")}>see all</button>
          </div>
          <div className="home-rising-scroll">
            {hotNow.map(r => (
              <div key={`${r.id}-${photoCacheVersion}`} className="home-rising-card" onClick={() => setDetailRestaurant(r)}>
                <img src={getAnyCachedPhotoForId(r.id) || r.img} alt={r.name} />
                <div className="shade" />
                <div className="flame-badge"><span>{"🔥".repeat(Math.min(Math.round(getFlameScore(r)), 5))}</span></div>
                <div className="card-info">
                  <h4>{r.name}</h4>
                  <div className="sub">{r.cuisine || ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* Discover Tab */}
      {tab === "discover" && (
        discoverSearchMode === "restaurants" ? (
        <div className="d-discover" style={{ paddingTop: headerHeight }}>
          <div className="glow-orb glow-amber glow-bg1" />
          <div className="glow-orb glow-rose glow-bg2" />

          {/* Tabs row */}
          <div className="disc-tabs">
            <div className="disc-tabs-inner">
              {["Places","People"].map((t) => (
                <button key={t} type="button"
                  className={`disc-tab-btn ${(t==="People" ? discoverSearchMode==="people" : discoverSearchMode!=="people") ? "active" : ""}`}
                  onClick={() => setDiscoverSearchMode(t === "People" ? "people" : "restaurants")}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            {discoverSearchMode !== "people" && (
              <button type="button" className="disc-filter-btn" onClick={() => setShowFilterSheet(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                {" "}Filter{(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0) > 0 ? ` (${(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0)})` : ""}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="disc-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,235,0.25)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={discoverSearchMode === "people" ? "Search by username or name..." : "Search by name, neighborhood, vibe..."}
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(245,240,235,0.3)", fontSize:16, lineHeight:1, padding:2 }}>×</button>}
          </div>
          {discoverSearchMode !== "people" && (venueType !== "all" || secondaryCuisine || filterMood) && (
            <div style={{ display:"flex", gap:4, padding:"0 16px 8px", flexWrap:"wrap" }}>
              {venueType !== "all" && <button type="button" onClick={() => setVenueType("all")} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:10, border:"1px solid rgba(255,150,50,0.3)", background:"transparent", color:"#ff9632", fontSize:10, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>{venueType === "restaurants" ? "Restaurants" : venueType === "bars" ? "Bars" : venueType === "hotels" ? "Hotels" : "Coffee"} ×</button>}
              {secondaryCuisine && <button type="button" onClick={() => setSecondaryCuisine(null)} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:10, border:"1px solid rgba(255,150,50,0.3)", background:"transparent", color:"#ff9632", fontSize:10, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>{secondaryCuisine} ×</button>}
              {filterMood && <button type="button" onClick={() => setFilterMood(null)} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:10, border:"1px solid rgba(255,150,50,0.3)", background:"transparent", color:"#ff9632", fontSize:10, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>{filterMood} ×</button>}
            </div>
          )}

          {(() => {
            const lovedIds = heatResults.loved || [];
            const nopedIds = heatResults.noped || [];
            const findsSet = new Set([...findsIds.map((id) => Number(id)), ...findsIds]);
            const inCity = (r) => city === "All" || (city === "Followed" ? followedCities.includes(r.city) : r.city === city);
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
              pool = allRestaurants.filter(inCity).filter((r) => r?.name).filter(r => !filterMood || (r.tags && r.tags.some(t => t.toLowerCase().includes(filterMood.toLowerCase()))) || (r.vibe && r.vibe.toLowerCase().includes(filterMood.toLowerCase())) || (r.best_for && (typeof r.best_for === 'string' ? r.best_for : Array.isArray(r.best_for) ? r.best_for.join(' ') : '').toLowerCase().includes(filterMood.toLowerCase()))).sort((a, b) => ratingNum(b) - ratingNum(a));
            } else {
              pool = allRestaurants
                .filter(inCity)
                .filter((r) => !lovedIds.includes(r.id) && !nopedIds.includes(r.id) && !findsSet.has(r.id) && !findsSet.has(Number(r.id)) && r?.name)
                .filter(r => !filterMood || (r.tags && r.tags.some(t => t.toLowerCase().includes(filterMood.toLowerCase()))) || (r.vibe && r.vibe.toLowerCase().includes(filterMood.toLowerCase())) || (r.best_for && (typeof r.best_for === 'string' ? r.best_for : Array.isArray(r.best_for) ? r.best_for.join(' ') : '').toLowerCase().includes(filterMood.toLowerCase())))
                .sort(sortByHeatThenRating);
            }
            const top20 = pool.slice(0, 20);
            const daySeed = Math.floor(Date.now() / 86400000);
            const recommendation = top20.length ? top20[daySeed % top20.length] : null;
            if (!recommendation) return null;
            const place = recommendation.neighborhood || recommendation.city || "";
            const bannerImg = recommendation.img && !String(recommendation.img).includes("picsum") ? recommendation.img : `https://picsum.photos/seed/${encodeURIComponent(recommendation.name)}/800/600`;
            return (
              <div className="disc-banner" onClick={() => setDetailRestaurant(recommendation)} style={{ cursor:"pointer" }}>
                <img src={bannerImg} alt="" />
                <div className="disc-banner-text">
                  <div className="disc-banner-label">⚡ COOKED FOR YOU</div>
                  <div className="disc-banner-msg">
                    Based on your taste profile, try <em>{recommendation.name}</em>
                    {place ? ` in ${place}` : ""} tonight.
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="disc-section-header">
            <div className="disc-section-title">
              {searchQuery ? `"${searchQuery}"` : secondaryCuisine ? `${secondaryCuisine} in ${city}` : venueType !== "all" ? (venueType === "restaurants" ? "Restaurants" : venueType === "bars" ? "Bars & Nightlife" : venueType === "hotels" ? "Hotels" : venueType === "coffee" ? "Coffee & Cafes" : "Hot") + ` in ${city}` : `Hot in ${city}`}
            </div>
            <div className="disc-section-meta">
              <span className="disc-spot-count">{filteredSorted.length} spots</span>
              <button className="disc-map-btn" type="button" onClick={()=>setTab("map")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2C8 2 5 5.5 5 9c0 5 7 13 7 13s7-8 7-13c0-3.5-3-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                MAP
              </button>
            </div>
          </div>
          {filteredSorted.map((r, index) => (
            <RestCard
              key={`rest-${r.id}-${photoCacheVersion}-${index}`}
              r={r}
              loved={isLovedCheck(r.id)}
              watched={isInWatchlist(r.id)}
              onLove={() => toggleLove(r.id)}
              onWatch={()=>toggleWatch(r.id)}
              onShare={share}
              onOpenDetail={setDetailRestaurant}
              onPhotoFetched={fetchAndCachePhoto}
              getCachedPhotoForId={getAnyCachedPhotoForId}
              photoCacheVersion={photoCacheVersion}
              usingSupabasePhotoCache={usingSupabasePhotoCache}
              flameScore={getFlameScore(r)}
            />
          ))}
          {filteredSorted.length === 0 && <div style={{ textAlign:"center", padding:"48px 20px", color:C.muted }}><div style={{ fontSize:40, marginBottom:10 }}>🍽️</div><div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:20, fontStyle:"italic" }}>No spots yet for this city.</div></div>}
        </div>
        ) : (
          <div style={{ paddingTop: headerHeight }}>
            <div className="disc-tabs">
              <div className="disc-tabs-inner">
              {["Places","People"].map((t) => {
                const active = (t==="People" ? discoverSearchMode==="people" : discoverSearchMode!=="people");
                return (
                  <button key={t} type="button" className={`disc-tab-btn ${active ? "active" : ""}`}
                    onClick={() => setDiscoverSearchMode(t === "People" ? "people" : "restaurants")}>
                    {t.toUpperCase()}
                  </button>
                );
              })}
              </div>
              {discoverSearchMode !== "people" && (
                <button className={`disc-filter-btn ${venueType !== "all" || secondaryCuisine || filterMood ? "active" : ""}`} type="button" onClick={() => setShowFilterSheet(true)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  Filter {(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0) > 0 ? `(${(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0)})` : ""}
                </button>
              )}
            </div>
            <div className="disc-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text"
                value={peopleSearchInput}
                onChange={(e) => setPeopleSearchInput(e.target.value)}
                placeholder="Search by username or name..."
              />
              {peopleSearchInput ? (
                <button type="button" onClick={() => setPeopleSearchInput("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"rgba(245,240,235,0.3)", fontSize:16, lineHeight:1, padding:2 }}>×</button>
              ) : null}
            </div>

              {!peopleSearchInput.trim() ? (
                <div style={{ paddingBottom: 24 }}>
                  {/* Suggested for You — friend of friend with taste overlap */}
                  {suggestedFriends.length > 0 && (
                    <div style={{ padding: "8px 16px 0" }}>
                      <div style={{ fontSize: 9, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>SUGGESTED FOR YOU</div>
                      {suggestedFriends.map(person => (
                        <div key={person.id} onClick={() => person.id && setViewingUserId(person.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <ProfilePhoto photo={null} size={44} userId={person.id} style={{ flexShrink: 0, border: `2px solid ${C.terracotta}` }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: 15, color: C.text }}>{person.name || "User"}</div>
                            <div style={{ fontSize: 11, color: C.terracotta, marginTop: 2, fontFamily: "'Inter', -apple-system, sans-serif" }}>{person.sharedCount} restaurant{person.sharedCount !== 1 ? "s" : ""} in common</div>
                            <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>friend of a friend</div>
                          </div>
                          <button type="button" disabled={!user?.id} onClick={async (e) => {
                            e.stopPropagation();
                            if (!user?.id || !person.id) return;
                            await followUser(user.id, person.id);
                            syncFollow(user.id, person.id);
                            supabase.from("notifications").insert({ user_id: person.id, type: "followed_you", from_user_id: user.id, read: false });
                            setSuggestedFriends(prev => prev.filter(p => p.id !== person.id));
                          }} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", background: C.terracotta, color: "#fff", fontSize: 12, fontFamily: "'Inter', sans-serif", cursor: "pointer", fontWeight: 500 }}>
                            Follow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* People Like You — shared taste */}
                  {peopleLikeYou.length > 0 && (
                    <div style={{ padding: "16px 16px 0" }}>
                      <div style={{ fontSize: 9, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>PEOPLE LIKE YOU</div>
                      {peopleLikeYou.map(person => (
                        <div key={person.id} onClick={() => person.id && setViewingUserId(person.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${C.border}`, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                            <span style={{ fontSize: 16, color: C.muted, fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{(person.name || "?")[0].toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: 15, color: C.text }}>{person.name || "User"}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: "'Inter', -apple-system, sans-serif" }}>{person.sharedCount} restaurant{person.sharedCount !== 1 ? "s" : ""} in common</div>
                          </div>
                          <button type="button" disabled={!user?.id} onClick={async (e) => {
                            e.stopPropagation();
                            if (!user?.id || !person.id) return;
                            await followUser(user.id, person.id);
                            syncFollow(user.id, person.id);
                            supabase.from("notifications").insert({ user_id: person.id, type: "followed_you", from_user_id: user.id, read: false });
                            setPeopleLikeYou(prev => prev.filter(p => p.id !== person.id));
                          }} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.terracotta}`, background: "transparent", color: C.terracotta, fontSize: 12, fontFamily: "'Inter', sans-serif", cursor: "pointer", fontWeight: 500 }}>
                            Follow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Invite Friends */}
                  <div style={{ padding: "16px 16px 0" }}>
                    <div style={{ fontSize: 9, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>INVITE FRIENDS</div>
                    <button type="button" onClick={() => {
                      const url = window.location.origin;
                      if (navigator.share) {
                        navigator.share({ title: "Join me on Cooked", text: "The restaurant app for people who care about where they eat.", url });
                      } else {
                        navigator.clipboard?.writeText(url);
                      }
                    }} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 14, fontFamily: "'Inter', -apple-system, sans-serif", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>📨</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>Share Cooked with a friend</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Send them a link to join</div>
                      </div>
                    </button>
                  </div>

                  {/* Following's Picks — existing feature, moved below */}
                  {!followingPicksLoading && !followingPicksNoFollows && followingPicksRestaurants.length > 0 && (
                    <div style={{ padding: "16px 0 0" }}>
                      <div style={{ fontSize: 9, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted, padding: "4px 16px 10px" }}>FROM PEOPLE YOU FOLLOW</div>
                      {followingPicksRestaurants.map((r, index) => (
                        <RestCard
                          key={`follow-pick-${r.id}-${photoCacheVersion}-${index}`}
                          r={r}
                          loved={isLovedCheck(r.id)}
                          watched={isInWatchlist(r.id)}
                          onLove={() => toggleLove(r.id)}
                          onWatch={() => toggleWatch(r.id)}
                          onShare={share}
                          onOpenDetail={setDetailRestaurant}
                          onPhotoFetched={fetchAndCachePhoto}
                          getCachedPhotoForId={getAnyCachedPhotoForId}
                          photoCacheVersion={photoCacheVersion}
                          usingSupabasePhotoCache={usingSupabasePhotoCache}
                          flameScore={getFlameScore(r)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Your Friends — people you follow */}
                  {yourFriends.length > 0 && (
                    <div style={{ padding: "8px 16px 0" }}>
                      <div style={{ fontSize: 9, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>YOUR FRIENDS</div>
                      {yourFriends.map(friend => (
                        <div key={friend.clerk_user_id} onClick={() => setViewingUserId(friend.clerk_user_id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <ProfilePhoto photo={friend.profile_photo} size={44} userId={friend.clerk_user_id} style={{ flexShrink: 0, border: `2px solid ${C.terracotta}` }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: 15, color: C.text }}>{friend.profile_name || "User"}</div>
                            {friend.profile_username && <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontFamily: "'Inter', -apple-system, sans-serif" }}>@{friend.profile_username}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state when no suggestions and no friends */}
                  {suggestedFriends.length === 0 && peopleLikeYou.length === 0 && followingPicksRestaurants.length === 0 && yourFriends.length === 0 && !followingPicksLoading && (
                    <div style={{ textAlign: "center", padding: "32px 24px", color: C.muted, fontSize: 14, fontFamily: "'Inter', -apple-system, sans-serif" }}>
                      Search for friends above or invite them to join Cooked
                    </div>
                  )}
                </div>
              ) : peopleSearchLoading || peopleSearchInput.trim() !== peopleDebouncedQuery.trim() ? (
                <div style={{ textAlign: "center", padding: "32px 20px", color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>Searching…</div>
              ) : peopleSearchResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted, fontSize: 14, fontFamily: "'Inter', -apple-system, sans-serif" }}>No people found</div>
              ) : (
                <div style={{ padding: "0 0 24px" }}>
                  {peopleSearchResults.map((row) => {
                    const uid = row.clerk_user_id;
                    const following = !!peopleFollowingMap[uid];
                    const cityCount = countCitiesVisitedFromUserRow(row, allRestaurants);
                    const displayName = row.profile_name?.trim() || "User";
                    const uname = formatUsernameForDisplay(row.profile_username);
                    return (
                      <div
                        key={uid || displayName}
                        role="button"
                        tabIndex={0}
                        onClick={() => uid && setViewingUserId(uid)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && uid) {
                            e.preventDefault();
                            setViewingUserId(uid);
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 16px",
                          borderBottom: `1px solid ${C.border}`,
                          cursor: uid ? "pointer" : "default",
                          background: "transparent",
                        }}
                      >
                        <ProfilePhoto photo={row.profile_photo} size={44} userId={uid} style={{ flexShrink: 0, border: `2px solid ${C.terracotta}` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                          <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 12, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{uname}</div>
                          <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Inter', -apple-system, sans-serif", marginTop: 3 }}>
                            {cityCount} {cityCount === 1 ? "city" : "cities"} visited
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!user?.id || !uid || uid === user?.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!user?.id || !uid || uid === user.id) return;
                            if (following) {
                              await unfollowUser(user.id, uid);
                              removeFollow(user?.id, uid);
                              setPeopleFollowingMap((prev) => ({ ...prev, [uid]: false }));
                            } else {
                              await followUser(user.id, uid);
                              syncFollow(user?.id, uid);
                              setPeopleFollowingMap((prev) => ({ ...prev, [uid]: true }));
                              supabase.from("notifications").insert({
                                user_id: uid,
                                type: "followed_you",
                                from_user_id: user.id,
                                read: false,
                              });
                            }
                          }}
                          style={{
                            flexShrink: 0,
                            height: 28,
                            padding: "0 12px",
                            borderRadius: 8,
                            border: `1px solid ${following ? C.border : C.terracotta}`,
                            background: "transparent",
                            color: following ? C.muted : C.terracotta,
                            fontSize: 11,
                            fontFamily: "'Inter', -apple-system, sans-serif",
                            letterSpacing: "0.2px",
                            textTransform: "uppercase",
                            cursor: !user?.id || !uid || uid === user?.id ? "default" : "pointer",
                            opacity: !user?.id || !uid || uid === user?.id ? 0.45 : 1,
                          }}
                        >
                          {following ? "Unfollow" : "Follow"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        )
      )}

      {showFilterSheet && createPortal(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:99999, display:"flex", alignItems:"flex-end" }} onClick={() => setShowFilterSheet(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:480, margin:"0 auto", background:C.bg2, borderRadius:"20px 20px 0 0", maxHeight:"80vh", overflowY:"auto", paddingBottom:32 }}>
            <div style={{ padding:"16px 18px 12px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontStyle:"italic", fontSize:18, color:C.text }}>Filter</div>
              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <button type="button" onClick={() => { setVenueType("all"); setSecondaryCuisine(null); setFilterMood(null); }} style={{ fontSize:11, color:C.muted, background:"none", border:"none", cursor:"pointer", fontFamily:"'Inter', sans-serif" }}>Clear all</button>
                <button type="button" onClick={() => setShowFilterSheet(false)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:22, lineHeight:1, padding:0 }}>×</button>
              </div>
            </div>

            <div style={{ padding:"16px 18px 8px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:C.muted, marginBottom:10, fontFamily:"'Inter', -apple-system, sans-serif" }}>Type</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {[{id:"all",label:"All"},{id:"restaurants",label:"Restaurant"},{id:"bars",label:"Bar"},{id:"hotels",label:"Hotel"},{id:"coffee",label:"Coffee"}].map(({id,label}) => (
                  <button key={id} type="button" onClick={() => setVenueType(id)}
                    style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${venueType===id ? C.terracotta : C.border}`, background: venueType===id ? C.terracotta : "transparent", color: venueType===id ? "#fff" : C.muted, fontSize:12, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:"16px 18px 8px", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:C.muted, marginBottom:10, fontFamily:"'Inter', -apple-system, sans-serif" }}>Cuisine</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {(venueType === "bars" ? ["Cocktail Bar","Wine Bar","Dive Bar","Sports Bar","Rooftop Bar","Jazz Bar","Speakeasy","Craft Beer","Sake Bar","Whiskey Bar"] :
                  venueType === "coffee" ? ["Espresso Bar","Third Wave","Bakery Cafe","Specialty Coffee","Cold Brew","Matcha","Tea House"] :
                  venueType === "hotels" ? ["Luxury","Boutique","Resort","Design Hotel","Historic","Budget"] :
                  ["Italian","Japanese","Mexican","American","French","Chinese","Korean","Thai","Indian","Mediterranean","Seafood","Steakhouse","Pizza","Vegan","Middle Eastern","Spanish","Greek","Vietnamese","Turkish"]).map(c => (
                  <button key={c} type="button" onClick={() => setSecondaryCuisine(secondaryCuisine===c ? null : c)}
                    style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${secondaryCuisine===c ? C.terracotta : C.border}`, background: secondaryCuisine===c ? C.terracotta : "transparent", color: secondaryCuisine===c ? "#fff" : C.muted, fontSize:12, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:"16px 18px 8px", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:C.muted, marginBottom:10, fontFamily:"'Inter', -apple-system, sans-serif" }}>Mood</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {["Date Night","Business Dinner","Lunch","Brunch","Late Night","Group Friendly","Casual","Special Occasion","Outdoor","Bar Hopping"].map(m => (
                  <button key={m} type="button" onClick={() => setFilterMood(filterMood===m ? null : m)}
                    style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${filterMood===m ? C.terracotta : C.border}`, background: filterMood===m ? C.terracotta : "transparent", color: filterMood===m ? "#fff" : C.muted, fontSize:12, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:"16px 18px 0" }}>
              <button type="button" onClick={() => setShowFilterSheet(false)} style={{ width:"100%", padding:"14px", background:C.terracotta, border:"none", borderRadius:14, color:"#fff", fontSize:14, fontFamily:"'Playfair Display', Georgia, serif", fontStyle:"italic", cursor:"pointer" }}>
                Show results
              </button>
            </div>
          </div>
        </div>,
        document.getElementById("root") || document.body
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
          // Fly the current card off-screen
          setHeatFlyDir(dir);
          setSwipeDelta({ x: 0, y: 0 });
          setIsDragging(false);
          dragStart.current = null;
          // After animation completes, advance the deck
          setTimeout(() => {
            setHeatDeckIndex(i => i + 1);
            setHeatFlyDir(null);
            setSwipeDir(null);
            if (dir === 'up') {
              if (user?.id) logInteraction(user.id, r.id, 'skip');
              setHeatResults(prev => ({
                ...prev,
                skipped: [...prev.skipped.filter(id => id !== r.id), r.id],
              }));
            } else {
              if (user?.id) {
                if (dir === 'right') {
                  logInteraction(user.id, r.id, 'heat');
                  const fullRest = allRestaurants.find(ar => ar.id === r.id || ar.id === Number(r.id));
                  if (fullRest) syncRestaurant(fullRest);
                  syncLove(user.id, r.id);
                  // Sync to Supabase user_data.loved
                  supabase.from("user_data").select("loved").eq("clerk_user_id", user.id).single().then(({ data: ud }) => {
                    const current = Array.isArray(ud?.loved) ? ud.loved : [];
                    const updated = [...new Set([...current, r.id, Number(r.id)])].filter(Boolean);
                    supabase.from("user_data").update({ loved: updated }).eq("clerk_user_id", user.id).then(() => {});
                  });
                } else if (dir === 'left') {
                  logInteraction(user.id, r.id, 'pass');
                }
              }
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
              // Sync swipe love to cooked_loved so detail view LOVED button stays in sync
              if (dir === 'right') {
                try {
                  const raw = safeLocalStorageGetItem("cooked_loved");
                  const set = new Set(raw ? JSON.parse(raw) : []);
                  set.add(r.id);
                  safeSetItem("cooked_loved", JSON.stringify([...set]));
                } catch {}
              }
            }
            heatSwipeHandledRef.current = false;
          }, 400);
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

        // Card transform: consistent function list (translateX/translateY/rotate) all in px
        const cardTransform = heatFlyDir === 'right'
          ? "translateX(500px) translateY(0px) rotate(18deg)"
          : heatFlyDir === 'left'
            ? "translateX(-500px) translateY(0px) rotate(-18deg)"
            : heatFlyDir === 'up'
              ? "translateX(0px) translateY(-700px) rotate(0deg)"
              : isDragging
                ? `translateX(${swipeDelta.x}px) translateY(${swipeDelta.y * 0.3}px) rotate(${rotation}deg)`
                : "translateX(0px) translateY(0px) rotate(0deg)";

        return (
          <div className="d-heat">
            <div className="glow-orb glow-orange glow-bg1" />

            {/* Header */}
            <div className="d-heat-header">
              <div className="header-left">
                <div className="d-logo">cook<span style={{ WebkitTextFillColor:"#e07850", filter:"drop-shadow(0 0 8px rgba(224,112,80,0.4))" }}>ed</span><span style={{ fontFamily:"'Dancing Script', cursive", fontSize:"0.55em", color:"#f0ebe2", marginLeft:2, fontWeight:400, fontStyle:"normal", position:"relative", top:"0.15em", WebkitTextFillColor:"#f0ebe2", background:"none", WebkitBackgroundClip:"unset", backgroundClip:"unset" }}>beta</span></div>
              </div>
              <div className="header-right">
                <div className="heat-label">
                  <span className="fire">🔥</span>
                  <span className="heat-counter">{heatActive.length}</span>
                </div>
                {(heatResults.loved.length > 0 || heatResults.noped.length > 0 || heatResults.skipped.length > 0) && (
                  <button className="heat-reset glass-pill" onClick={() => { setHeatResults(prev => ({ ...prev, noped: [], skipped: [], votes: {} })); setSwipeDir(null); setSwipeDelta({ x: 0, y: 0 }); setIsDragging(false); heatDeckCityRef.current = null; setHeatDeckIndex(0); }}>Reset</button>
                )}
                <button className="heat-city" onClick={() => setHeatCityPickerOpen(o => !o)}>{heatCity === "All" ? "All Cities" : heatCity} ▾</button>
              </div>
            </div>
            {heatCityPickerOpen && (
              <div style={{ position:"absolute", top:60, left:16, right:16, background:"#12121a", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, zIndex:200, maxHeight:320, overflowY:"auto", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
                <button type="button" onClick={() => { setHeatCity("All"); setHeatCityPickerOpen(false); }}
                  style={{ display:"block", width:"100%", padding:"10px 16px", textAlign:"left", background: heatCity==="All" ? "rgba(255,150,50,0.1)" : "transparent", border:"none", borderBottom:"1px solid rgba(255,255,255,0.06)", color: heatCity==="All" ? "#ff9632" : "#f5f0eb", fontSize:14, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>
                  All Cities
                </button>
                {getPersonalizedCityRegions(lovedRestaurants, followedCities, heatResults, dynamicCityRegions).map(({ region, cities }) => (
                  <div key={region}>
                    <div style={{ padding:"8px 16px 4px", fontSize:8, fontFamily:"'Inter', -apple-system, sans-serif", color:"#ff9632", letterSpacing:"1.8px", textTransform:"uppercase", borderTop:"1px solid rgba(255,255,255,0.06)" }}>{region}</div>
                    {cities.map(c => (
                      <button key={c} type="button" onClick={() => { setHeatCity(c); setHeatCityPickerOpen(false); }}
                        style={{ display:"block", width:"100%", padding:"8px 16px", textAlign:"left", background: heatCity===c ? "rgba(255,150,50,0.1)" : "transparent", border:"none", color: heatCity===c ? "#ff9632" : "#f5f0eb", fontSize:14, fontFamily:"'Inter', sans-serif", cursor:"pointer" }}>
                        {c}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}


            <div className="heat-content">
              {/* Empty state */}
              {heatDeck.length === 0 && (
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, color:"#f5f0eb", margin:"0 20px" }}>
                  <div style={{ fontSize:48 }}>🎉</div>
                  <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:24, fontStyle:"italic" }}>You've been through it all</div>
                  <div style={{ fontFamily:"'Inter', sans-serif", fontSize:14, color:"rgba(245,240,235,0.3)" }}>
                    {heatResults.loved.length} loved · {heatResults.noped.length} passed
                  </div>
                  <button onClick={() => { setHeatResults(prev => ({ ...prev, noped: [], skipped: [], votes: {} })); setSwipeDir(null); setSwipeDelta({ x: 0, y: 0 }); setIsDragging(false); heatDeckCityRef.current = null; setHeatDeckIndex(0); }} style={{ marginTop:8, padding:"12px 28px", borderRadius:12, background:"#ff9632", color:"#fff", border:"none", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', sans-serif" }}>Start over</button>
                </div>
              )}

              {/* Card stack */}
              {card && (
                <div style={{ position:"relative", height:"56vh", minHeight:0, margin:"0 20px" }}>
                  {/* Next card — static, full size, sits behind ready to be revealed */}
                  {nextCard && (
                    <div
                      className="heat-swipe-area"
                      style={{
                        position:"absolute", inset:0, margin:0,
                        zIndex: 0,
                        pointerEvents:"none",
                      }}
                    >
                      <img src={getAnyCachedPhotoForId(nextCard.id) || nextCard.img} alt={nextCard.name} style={{ pointerEvents:"none" }} />
                      <div className="shade" />
                      <div className="heat-card-info">
                        <h2>{nextCard.name}</h2>
                        <div className="cuisine-line">{[nextCard.cuisine, nextCard.neighborhood, nextCard.price].filter(Boolean).join(" · ")}</div>
                        <div className="desc-line">{nextCard.desc}</div>
                        <div className="tag-pills">
                          {(nextCard.tags || []).slice(0,3).map(t => (
                            <span key={t} className="tag-pill">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Current/top card — draggable, flies out on swipe */}
                  <div
                    key={`swipe-${card.id}`}
                    className="heat-swipe-area"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    style={{
                      position:"absolute", inset:0, margin:0,
                      cursor:isDragging ? "grabbing" : "grab",
                      transform: cardTransform,
                      transition: heatFlyDir ? "transform 0.4s cubic-bezier(0.32, 0, 0.67, 0)" : isDragging ? "none" : "transform 0.3s ease",
                      touchAction:"none",
                      zIndex: 2,
                      willChange: "transform",
                      backfaceVisibility: "hidden",
                    }}
                    onClick={() => {
                      if (heatSwipeHandledRef.current) {
                        heatSwipeHandledRef.current = false;
                        return;
                      }
                      if (Math.abs(swipeDelta.x) < 5 && Math.abs(swipeDelta.y) < 5) setDetailRestaurant(card);
                    }}
                  >
                    <img src={getAnyCachedPhotoForId(card.id) || card.img} alt={card.name} style={{ pointerEvents:"none" }} />
                    <div className="shade" />

                    {/* HEAT stamp */}
                    <div style={{ position:"absolute", top:32, left:24, padding:"8px 18px", borderRadius:8, border:"3px solid #ff9632", color:"#ff9632", fontFamily:"'Inter', sans-serif", fontSize:22, fontWeight:700, letterSpacing:"3px", transform:"rotate(-18deg)", opacity: heatFlyDir === 'right' ? 1 : Math.min(1, Math.max(0, swipeDelta.x - 20) / 60), transition:"opacity 0.05s", pointerEvents:"none", zIndex:8 }}>HEAT</div>

                    {/* PASS stamp */}
                    <div style={{ position:"absolute", top:32, right:24, padding:"8px 18px", borderRadius:8, border:"3px solid #f87171", color:"#f87171", fontFamily:"'Inter', sans-serif", fontSize:22, fontWeight:700, letterSpacing:"3px", transform:"rotate(18deg)", opacity: heatFlyDir === 'left' ? 1 : Math.min(1, Math.max(0, -swipeDelta.x - 20) / 60), transition:"opacity 0.05s", pointerEvents:"none", zIndex:8 }}>PASS</div>
                    {/* SKIP FOR NOW stamp */}
                    <div style={{ position:"absolute", top:"40%", left:"50%", transform:"translateX(-50%) rotate(-5deg)", padding:"8px 18px", borderRadius:8, border:"3px solid #facc15", color:"#facc15", fontFamily:"'Inter', sans-serif", fontSize:22, fontWeight:700, letterSpacing:"3px", opacity: heatFlyDir === 'up' ? 1 : Math.min(1, Math.max(0, -swipeDelta.y - 40) / 60), transition:"opacity 0.05s", pointerEvents:"none", zIndex:8 }}>SKIP FOR NOW</div>

                    {/* Card info */}
                    <div className="heat-card-info">
                      <h2>{card.name}</h2>
                      <div className="cuisine-line">{[card.cuisine, card.neighborhood, card.price].filter(Boolean).join(" · ")}</div>
                      <div className="desc-line">{card.desc}</div>
                      <div className="tag-pills">
                        {(card.tags || []).slice(0,3).map(t => (
                          <span key={t} className="tag-pill">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Skip For Now label */}
              {card && <div className="heat-havent-been">↑ SKIP FOR NOW</div>}

              {/* Action buttons */}
              {card && (
                <div className="heat-actions">
                  <div className="heat-action-wrap">
                    <button className="heat-action-btn pass" onClick={() => doSwipe('left')}>&times;</button>
                    <span className="heat-action-label">Pass</span>
                  </div>
                  <div className="heat-action-wrap">
                    <button
                      className="heat-action-btn watch"
                      type="button"
                      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                      onPointerUp={e => { e.stopPropagation(); if (!isInWatchlist(card.id)) toggleWatch(card.id); doSwipe('up'); }}>
                      +
                    </button>
                    <span className="heat-action-label">Watch</span>
                  </div>
                  <div className="heat-action-wrap">
                    <button className="heat-action-btn heat" onClick={() => doSwipe('right')}>🔥</button>
                    <span className="heat-action-label">Heat</span>
                  </div>
                </div>
              )}
            </div>{/* /heat-content */}
          </div>
        );
      })()}

      {/* Map Tab */}
      {tab === "map" && (
        <>
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:60, zIndex:1, background:C.bg }} />
          <div style={{ position:"fixed", top:0, bottom:60, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, zIndex:2 }}>
            <div ref={mapRef} style={{ width:"100%", height:"100%" }} />
          {selectedRest && (
            <div style={{ position:"absolute", bottom:16, left:16, right:16, background:"rgba(18,18,26,0.4)", backdropFilter:"blur(32px) saturate(1.4)", WebkitBackdropFilter:"blur(32px) saturate(1.4)", borderRadius:20, overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.35), inset 0 0.5px 0 rgba(255,255,255,0.08)", border:"0.5px solid rgba(255,255,255,0.1)", cursor:"pointer" }} onClick={() => { setDetailRestaurant(selectedRest); setSelectedRest(null); }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRest(null); }} style={{ position:"absolute", top:10, right:10, zIndex:10, width:32, height:32, borderRadius:"50%", border:"0.5px solid rgba(255,255,255,0.1)", background:"rgba(10,10,15,0.5)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>✕</button>
              <div style={{ position:"relative", height:140, overflow:"hidden" }}>
                <img src={getAnyCachedPhotoForId(selectedRest.id) || selectedRest.img} alt={selectedRest.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 30%, rgba(10,10,15,0.8) 100%)" }} />
                <div style={{ position:"absolute", bottom:10, left:14, right:14, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                  <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:20, fontWeight:700, color:"#fff", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedRest.name}</div>
                  <div style={{ flexShrink:0, marginLeft:8 }}><FlameRating score={getFlameScore(selectedRest)} size={14} /></div>
                </div>
              </div>
              <div style={{ padding:"12px 16px" }}>
                <div style={{ fontSize:11, color:"rgba(245,240,235,0.35)", fontFamily:"'Inter', -apple-system, sans-serif", letterSpacing:"0.02em", marginBottom:10 }}>{selectedRest.cuisine} · {selectedRest.neighborhood} · {selectedRest.price}</div>
                <div style={{ display:"flex", gap:8 }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={() => toggleLove(selectedRest.id)} style={{ flex:1, padding:"10px 4px", borderRadius:12, border:`0.5px solid ${isLovedCheck(selectedRest.id) ? "rgba(255,150,50,0.3)" : "rgba(255,255,255,0.06)"}`, background: isLovedCheck(selectedRest.id) ? "rgba(255,150,50,0.1)" : "rgba(255,255,255,0.03)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", color: isLovedCheck(selectedRest.id) ? "#ff9632" : "rgba(245,240,235,0.35)", cursor:"pointer", fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500 }}>{isLovedCheck(selectedRest.id) ? "Loved ♥" : "Love It ♡"}</button>
                  <button type="button" onClick={() => toggleWatch(selectedRest.id)} style={{ flex:1, padding:"10px 4px", borderRadius:12, border:`0.5px solid ${isInWatchlist(selectedRest.id) ? "rgba(107,159,255,0.3)" : "rgba(255,255,255,0.06)"}`, background: isInWatchlist(selectedRest.id) ? "rgba(107,159,255,0.08)" : "rgba(255,255,255,0.03)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", color: isInWatchlist(selectedRest.id) ? "#6b9fff" : "rgba(245,240,235,0.35)", cursor:"pointer", fontSize:12, fontFamily:"'Inter', sans-serif", fontWeight:500 }}>{isInWatchlist(selectedRest.id) ? "On Watchlist" : "Watchlist"}</button>
                </div>
              </div>
            </div>
          )}
          </div>
        </>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div>
          <Profile
            onOpenTasteProfile={() => setShowTasteProfile(true)}
            allRestaurants={allRestaurants}
            heatResults={heatResults}
            watchlist={watchlist}
            getFlameScore={getFlameScore}
            onOpenDetail={setDetailRestaurant}
            onFixPhotos={rePickPhotosForAll}
            clerkName={user?.fullName}
            clerkImageUrl={user?.imageUrl}
            onViewUser={setViewingUserId}
            allCitiesFromDb={dynamicAllCities}
            onRestaurantsChanged={refreshRestaurants}
            onOpenIgImport={() => { setIgError(null); setIgAddedRestaurants([]); setIgDone(false); setIgImporting(false); setPickerMode("ig-import"); setIgModal(true); }}
            onSharedPhotoSaved={(restaurantId, photoUrl) => {
              setPhotoResolved((prev) => [...new Set([...prev, restaurantId])]);
              if (photoUrl) {
                photoCacheRef.current = { ...(photoCacheRef.current || {}), [String(restaurantId)]: photoUrl };
                setUsingSupabasePhotoCache(true);
                setPhotoCacheVersion((v) => v + 1);
              }
            }}
          />
        </div>
      )}

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {/* Home */}
        <div
          className={`nav-tab${tab === "home" ? " active" : ""}`}
          onClick={() => setTab("home")}
        >
          <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></span>
          <span>Home</span>
        </div>

        {/* Heat */}
        <div
          className={`nav-tab${tab === "heat" ? " active" : ""}`}
          onClick={() => setTab("heat")}
        >
          <span className="nav-icon"><svg viewBox="0 0 167 200" style={{ width:18, height:22, strokeWidth:12 }}><path d="M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z"/></svg></span>
          <span>Heat</span>
        </div>

        {/* Discover */}
        <div
          className={`nav-tab${tab === "discover" ? " active" : ""}`}
          onClick={() => setTab("discover")}
        >
          <span className="nav-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></span>
          <span>Discover</span>
        </div>

        {/* Map */}
        <div
          className={`nav-tab${tab === "map" ? " active" : ""}`}
          onClick={() => setTab("map")}
        >
          <span className="nav-icon"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
          <span>Map</span>
        </div>

        {/* Profile */}
        <div
          className={`nav-tab${tab === "profile" ? " active" : ""}`}
          onClick={() => setTab("profile")}
        >
          <div className="nav-icon">
            <div className="nav-avatar">
              {safeLocalStorageGetItem("cooked_profile_photo") ? (
                <img
                  src={safeLocalStorageGetItem("cooked_profile_photo") || ""}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius:"50%" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : (
                (safeLocalStorageGetItem("cooked_name") || "?")[0]?.toUpperCase()
              )}
            </div>
          </div>
          <span>Profile</span>
        </div>
      </div>

      {/* IG Modal */}
      {igModal && createPortal(
        <div style={{ position:"fixed", inset:0, background:"rgba(10,10,15,0.7)", zIndex:999999, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={closeIgModal}>
          <div style={{ width:"100%", maxWidth:480, background:C.bg, borderRadius:"24px 24px 0 0", borderTop:`1px solid ${C.border}`, padding:"28px 24px 44px", maxHeight:"85vh", overflowY:"auto", zIndex:1000000 }} onClick={e=>e.stopPropagation()}>
            {pickerMode === "fix-photos" ? (
              <div style={{ padding:"8px 0" }}>
                <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:22, fontWeight:700, marginBottom:16, color:C.text }}>Fix photos</div>
                <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
                  <button type="button" onClick={() => setPickerTab("unresolved")} style={{ flex:1, padding:"10px 12px", fontSize:12, fontFamily:"'Inter', -apple-system, sans-serif", border:"none", borderBottom:`2px solid ${pickerTab === "unresolved" ? C.terracotta : "transparent"}`, background:"transparent", color: pickerTab === "unresolved" ? C.terracotta : C.muted, cursor:"pointer" }}>Unresolved ({unresolvedRestaurants.length})</button>
                  <button type="button" onClick={() => setPickerTab("resolved")} style={{ flex:1, padding:"10px 12px", fontSize:12, fontFamily:"'Inter', -apple-system, sans-serif", border:"none", borderBottom:`2px solid ${pickerTab === "resolved" ? C.terracotta : "transparent"}`, background:"transparent", color: pickerTab === "resolved" ? C.terracotta : C.muted, cursor:"pointer" }}>Resolved ({resolvedRestaurants.length})</button>
                </div>
                {pickerTab === "unresolved" ? (
                  unresolvedRestaurants.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"40px 20px" }}>
                      <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
                      <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:20, fontWeight:700, color:C.terracotta }}>All photos resolved!</div>
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
                      <button type="button" onClick={confirmAddFromPicker} disabled={igPhotoPicker.filter(item => item.userSelected).length === 0} style={{ width:"100%", padding:14, border:"none", borderRadius:12, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, fontFamily:"'Inter', sans-serif", opacity: igPhotoPicker.filter(item => item.userSelected).length === 0 ? 0.4 : 1, cursor: igPhotoPicker.filter(item => item.userSelected).length === 0 ? "not-allowed" : "pointer" }}>Confirm {igPhotoPicker.filter(item => item.userSelected).length} photo{igPhotoPicker.filter(item => item.userSelected).length !== 1 ? "s" : ""}</button>
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
                            <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:16, fontWeight:700, color:C.text }}>{r.name}</div>
                            <div style={{ fontSize:11, color:C.muted }}>{r.cuisine} · {r.city}</div>
                          </div>
                          <button type="button" onClick={() => setPhotoResolved(prev => prev.filter(id => id !== r.id))} style={{ fontSize:11, borderRadius:10, border:`1px solid ${C.border}`, padding:"6px 12px", background:C.card, color:C.muted, cursor:"pointer", fontFamily:"'Inter', -apple-system, sans-serif" }}>Re-pick</button>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <button onClick={closeIgModal} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, color:C.muted, marginTop:16, cursor:"pointer", fontFamily:"'Inter', sans-serif", fontSize:14 }}>Close</button>
              </div>
            ) : igPhotoPicker.length > 0 ? (
              <div style={{ padding:"8px 0" }}>
                <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:22, fontWeight:700, marginBottom:6, color:C.text }}>Choose a photo for each</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.5 }}>Tap a photo to select it, then add all.</div>
                <div style={{ display:"flex", flexDirection:"column", gap:20, marginBottom:24, maxHeight:"50vh", overflowY:"auto" }}>
                  {igPhotoPicker.map((item, pickerIndex) => (
                    <div key={`picker-${pickerIndex}`}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
                        <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:17, fontWeight:700, color:C.text }}>{item.restaurant.name}</div>
                        <button
                          type="button"
                          onClick={() => refreshPickerPhotosForOne(pickerIndex)}
                          style={{ fontSize:11, borderRadius:14, border:`1px solid ${C.border}`, padding:"4px 8px", background:C.card, color:C.muted, cursor:"pointer", fontFamily:"'Inter', -apple-system, sans-serif" }}
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
                <button onClick={confirmAddFromPicker} style={{ width:"100%", padding:14, border:"none", borderRadius:12, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', sans-serif" }}>
                  Add {igPhotoPicker.length} restaurant{igPhotoPicker.length !== 1 ? "s" : ""}
                </button>
                <button onClick={closeIgModal} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, color:C.muted, marginTop:10, cursor:"pointer", fontFamily:"'Inter', sans-serif", fontSize:14 }}>Cancel</button>
              </div>
            ) : igDone ? (
              <div style={{ padding:"12px 0" }}>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ fontSize:52, marginBottom:10 }}>🍝</div>
                  <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:24, fontWeight:700, fontStyle:"italic", color:C.terracotta }}>Added to your list!</div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>{igAddedRestaurants.length} restaurant{igAddedRestaurants.length !== 1 ? "s" : ""} added</div>
                </div>
                <div style={{ marginBottom:20, maxHeight:240, overflowY:"auto" }}>
                  {igAddedRestaurants.map(r => (
                    <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                      <img src={r.img} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:"cover" }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:16, fontWeight:700, color:C.text }}>{r.name}</div>
                        <div style={{ fontSize:11, color:C.muted, fontFamily:"'Inter', -apple-system, sans-serif" }}>{r.cuisine} · {r.city}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={closeIgModal} style={{ width:"100%", padding:14, border:"none", borderRadius:12, background:C.terracotta, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', sans-serif" }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:26, fontWeight:700, marginBottom:6 }}>Add from Instagram</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>Paste a post URL or upload a screenshot. We'll extract the restaurants.</div>
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  <input value={igUrl} onChange={e=>setIgUrl(e.target.value)} placeholder="https://instagram.com/p/..." style={{ flex:1, background:C.warm, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 14px", color:C.text, fontFamily:"'Inter', -apple-system, sans-serif", fontSize:12, outline:"none" }} />
                  <button onClick={()=>{ if (igUrl.trim()) window.open(igUrl.trim(), "_blank", "noopener"); }} disabled={!igUrl.trim()} style={{ flexShrink:0, padding:"12px 16px", border:"none", borderRadius:12, background:"linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", color:"#fff", fontSize:13, fontWeight:600, cursor: igUrl.trim() ? "pointer" : "not-allowed", fontFamily:"'Inter', sans-serif", opacity: igUrl.trim() ? 1 : 0.6 }}>Open in Instagram</button>
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
                    <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{igImporting ? "Processing screenshot…" : "Drop screenshot or tap to upload"}</div>
                    <div style={{ fontSize:12, color:C.muted }}>PNG, JPG, or WebP</div>
                  </label>
                </div>
                {igError && <div style={{ padding:"10px 14px", background:"rgba(196,96,58,0.12)", borderRadius:10, border:`1px solid ${C.terracotta}`, fontSize:12, color:C.terracotta, marginBottom:16 }}>{igError}</div>}
                <button onClick={closeIgModal} style={{ width:"100%", padding:12, background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:12, color:C.muted, cursor:"pointer", fontFamily:"'Inter', sans-serif", fontSize:14 }}>Cancel</button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      </div>
      {/* End main content (zIndex:10) */}

      {tab === "heat" && showHeatTip && createPortal(
        <div
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 98,
            width: "min(calc(100vw - 24px), 420px)",
            zIndex: 99998,
            opacity: heatTipFading ? 0 : 1,
            transition: "opacity 0.6s ease",
            pointerEvents: heatTipFading ? "none" : "auto",
          }}
        >
          <div style={{ position: "relative", background: C.terracotta, borderRadius: 12, padding: "14px 16px 12px", color: "#fff", boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}>
            <button
              type="button"
              aria-label="Dismiss swipe help"
              onClick={() => setShowHeatTip(false)}
              style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
            <div style={{ paddingRight: 18, fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 13, lineHeight: 1.5 }}>
              <div>🔥 Heat - you've been or want to go</div>
              <div>👁 Watch - on your radar</div>
              <div>✕ Pass - not your thing</div>
              <div>↑ Swipe up - already been</div>
            </div>
          </div>
        </div>,
        document.getElementById("root") || document.body
      )}

      {/* Restaurant detail overlay — above main content */}
      {detailRestaurant && (() => {
        const detail = detailRestaurant;
        const place = placeDetails[detail.id];
        // Priority: 1) vault (user-confirmed), 2) preview (auto-fetched, unresolved), 3) non-picsum img, 4) Places API, 5) picsum
        const vaultPhoto = getVaultPhotoForId(detail.id);
        const previewPhoto = getPreviewPhotoForId(detail.id);
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
        <>
        <div className="det-overlay">
          <div className="det-scroll">

            {/* SECTION 1 — HERO */}
            <div className="det-hero">
              <img src={detailPhoto || detail.img} alt={detail.name} onError={(e) => { e.target.onerror = null; e.target.src = detail.img2 || detail.img; }} />
              <div className="det-hero-grad" />
              {/* top bar */}
              <div className="det-hero-top">
                <button type="button" className="det-back-btn" onClick={() => { setDetailRestaurant(null); setSixDegreesResult(null); setSixDegreesTarget(null); setSixDegreesLoading(false); }}>‹</button>
                <div className="det-logo">cook<span style={{ WebkitTextFillColor:"#e07850", filter:"drop-shadow(0 0 8px rgba(224,112,80,0.4))" }}>ed</span><span style={{ fontFamily:"'Dancing Script', cursive", fontSize:"0.55em", color:"#f0ebe2", marginLeft:2, fontWeight:400, fontStyle:"normal", position:"relative", top:"0.15em", WebkitTextFillColor:"#f0ebe2", background:"none", WebkitBackgroundClip:"unset", backgroundClip:"unset" }}>beta</span></div>
              </div>
              {/* bottom overlay */}
              <div className="det-hero-bottom">
                <div className="det-hero-info">
                  <div className="det-hero-name">{detail.name}</div>
                  <div className="det-hero-meta">{[detail.cuisine, detail.neighborhood, detail.price].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="det-hero-flame"><FlameRating score={getFlameScore(detail)} size={20} /></div>
              </div>
            </div>
            {/* thin divider between hero and tags */}
            <div className="det-divider" />

            {/* SECTION 2 — TAGS */}
            <div className="det-tags-bar">
              <div className="tags-wrap">
                {detailTags.map(tag => (
                  <span key={tag} className="det-tag-pill">{tag}</span>
                ))}
              </div>
            </div>

            {/* SECTION 3 — 5 ACTION BUTTONS */}
            <div className="det-actions">
              <div className="det-actions-grid">
                {/* LOVED */}
                <button type="button" className={`det-action-btn${isLovedCheck(detail.id) ? " active-love" : ""}`} onClick={() => toggleLove(detail.id)}>
                  <FlameIcon size={28} filled={isLovedCheck(detail.id)} color={isLovedCheck(detail.id) ? "#ff9632" : "rgba(245,240,235,0.18)"} />
                  <span className={`det-action-label${isLovedCheck(detail.id) ? " loved" : ""}`}>LOVED</span>
                </button>
                {/* WATCH */}
                <button type="button" className={`det-action-btn${isInWatchlist(detail.id) ? " active-watch" : ""}`} onClick={() => toggleWatch(detail.id)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={isInWatchlist(detail.id) ? "#4a90d9" : "rgba(245,240,235,0.18)"} strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke={isInWatchlist(detail.id) ? "#4a90d9" : "rgba(245,240,235,0.18)"} strokeWidth="1.5"/>
                  </svg>
                  <span className={`det-action-label${isInWatchlist(detail.id) ? " watched" : ""}`}>WATCH</span>
                </button>
                {/* MAPS */}
                <button type="button" className="det-action-btn" onClick={() => window.open(detail.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(detail.address||detail.name)}`, "_blank")}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,235,0.18)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  <span className="det-action-label">MAPS</span>
                </button>
                {/* SEND (DM) */}
                <button type="button" className="det-action-btn" onClick={() => { setDmSharePicker(detail); setDmShareSearch(""); }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,235,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                  <span className="det-action-label">SEND</span>
                </button>
                {/* SHARE (external) */}
                <button type="button" className="det-action-btn" onClick={async () => { if (user?.id) logInteraction(user.id, detail.id, 'share'); const shareText = `Check out ${detail.name} — ${detail.cuisine} in ${detail.city}. Found on Cooked.`; try { if (navigator.share) { await navigator.share({ title: detail.name, text: shareText, url: window.location.href }); } else { await navigator.clipboard.writeText(shareText); setDetailShareCopied(true); setTimeout(() => setDetailShareCopied(false), 2000); } } catch { try { await navigator.clipboard.writeText(shareText); setDetailShareCopied(true); setTimeout(() => setDetailShareCopied(false), 2000); } catch {} } }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,235,0.18)" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span className="det-action-label">{detailShareCopied ? "COPIED!" : "SHARE"}</span>
                </button>
              </div>
            </div>

            {/* Friends have been here — between actions and description */}
            {!friendsBeenHere.loading && friendsBeenHere.list.length > 0 && (
              <button type="button" className="det-friends-btn" onClick={() => setFriendsBeenHereSheetOpen(true)}>
                <div className="det-friends-avatars">
                  {friendsBeenHere.list.slice(0, 3).map((f, i) => (
                    <div key={f.clerkUserId} className="det-friend-av" style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }}>
                      {f.profilePhoto ? (
                        <img src={f.profilePhoto} alt="" />
                      ) : (
                        <span className="initial">{(f.profileName || "?").charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="det-friends-text">
                  {friendsBeenHere.list.length === 1
                    ? "1 friend has been here"
                    : `${friendsBeenHere.list.length} friends have been here`}
                </div>
              </button>
            )}

            {/* 6 DEGREES — find connection to another restaurant */}
            <div className="det-degrees">
              {!sixDegreesResult && !sixDegreesLoading && !sixDegreesTarget && (
                <button type="button" className="det-degrees-trigger" onClick={() => setSixDegreesTarget(detail)}>
                  <span style={{ fontSize: 16 }}>&#x1f517;</span>
                  <span>Find a connection to another restaurant</span>
                </button>
              )}
              {sixDegreesTarget && !sixDegreesResult && !sixDegreesLoading && (
                <div>
                  <div className="det-degrees-label">6 DEGREES — pick a restaurant</div>
                  <div className="det-degrees-chips">
                    {allRestaurants
                      .filter(r => String(r.id) !== String(detail.id))
                      .slice(0, 12)
                      .map(r => (
                        <button key={r.id} type="button" className="det-degree-chip" onClick={() => {
                          setSixDegreesLoading(true);
                          getSixDegrees(detail.id, r.id).then(result => { setSixDegreesResult(result); setSixDegreesLoading(false); });
                        }}>{r.name}</button>
                      ))}
                  </div>
                  <button type="button" className="det-degrees-cancel" onClick={() => setSixDegreesTarget(null)}>cancel</button>
                </div>
              )}
              {sixDegreesLoading && (
                <div className="det-degrees-loading">Finding connection...</div>
              )}
              {sixDegreesResult && (
                <div>
                  <div className="det-degrees-label" style={{ marginBottom: 10 }}>THE CHAIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {sixDegreesResult.chain.map((node, i) => (
                      <div key={i} className="det-chain-node">
                        <div className={`det-chain-icon ${node.type === "restaurant" ? "restaurant" : "user"}`}>
                          {node.type === "restaurant" ? "R" : "U"}
                        </div>
                        <div>
                          <div className={`det-chain-name${node.type === "restaurant" ? " bold" : ""}`}>{node.name || "Unknown"}</div>
                          <div className="det-chain-sub">{node.type === "restaurant" ? (node.city || "") : "loved both"}</div>
                        </div>
                        {i < sixDegreesResult.chain.length - 1 && <div className="det-chain-sep" />}
                      </div>
                    ))}
                  </div>
                  <div className="det-chain-result">
                    {Math.floor(sixDegreesResult.pathLength / 2)} degree{Math.floor(sixDegreesResult.pathLength / 2) !== 1 ? "s" : ""} of separation
                  </div>
                  <button type="button" className="det-chain-retry" onClick={() => { setSixDegreesResult(null); setSixDegreesTarget(null); }}>try another</button>
                </div>
              )}
              {sixDegreesResult === null && sixDegreesLoading === false && sixDegreesTarget && (
                <div className="det-chain-nope">No connection found yet</div>
              )}
            </div>

            {/* SECTION 4 — DESCRIPTION */}
            {detail.desc && (
              <div className="det-desc">
                <div className="det-desc-text">{detail.desc}</div>
              </div>
            )}

            {/* SECTION 5 — INFO */}
            {(() => {
              const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
              const todayStr = days[new Date().getDay()];
              const todayHours = (detail.hours||[]).find(h => h.startsWith(todayStr));
              const hoursVal = todayHours ? todayHours.replace(todayStr+": ","") : null;
              const shortAddr = (detail.address||"").split(",").slice(0,2).join(",").trim();
              const websiteRaw = (detail.website || "").trim();
              const websiteLower = websiteRaw.toLowerCase();
              const isReservationPlatformWebsite =
                websiteLower.includes("opentable.com") ||
                websiteLower.includes("resy.com") ||
                websiteLower.includes("tock.com") ||
                websiteLower.includes("sevenrooms.com");
              const hasNonOpenTableWebsite = websiteRaw && !isReservationPlatformWebsite;
              const websiteHref = hasNonOpenTableWebsite
                ? (websiteRaw.startsWith("http://") || websiteRaw.startsWith("https://") ? websiteRaw : `https://${websiteRaw.replace(/^\/+/, "")}`)
                : "";
              const websiteDisplay = (() => {
                if (!hasNonOpenTableWebsite) return "";
                try {
                  return new URL(websiteHref).hostname.replace(/^www\./i, "");
                } catch {
                  return websiteRaw
                    .replace(/^https?:\/\//i, "")
                    .replace(/^www\./i, "")
                    .replace(/\/+$/, "")
                    .split("/")[0];
                }
              })();
              const infoRows = [
                hoursVal && { svgPath:<><circle cx="12" cy="12" r="9" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" fill="none"/><polyline points="12 7 12 12 15 15" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" strokeLinecap="round"/></>, label:"HOURS TODAY", value:hoursVal },
                shortAddr && { svgPath:<><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" fill="none"/><circle cx="12" cy="9" r="2.5" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" fill="none"/></>, label:"ADDRESS", value:shortAddr },
                detail.phone && { svgPath:<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6.1 6.1l1.09-1.09a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" fill="none"/></>, label:"PHONE", value:detail.phone, href:`tel:${detail.phone}` },
                hasNonOpenTableWebsite && { svgPath:<><circle cx="12" cy="12" r="9" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="rgba(245,240,235,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round"/></>, label:"WEBSITE", value:websiteDisplay, href:websiteHref, newTab:true },
              ].filter(Boolean);
              if (!infoRows.length) return null;
              return (
                <div className="det-info">
                  {infoRows.map((row,i) => (
                    <div key={i} className="det-info-row">
                      <svg width="16" height="16" viewBox="0 0 24 24">{row.svgPath}</svg>
                      <div>
                        <div className="det-info-label">{row.label}</div>
                        {row.href
                          ? <a href={row.href} target={row.newTab ? "_blank" : undefined} rel={row.newTab ? "noopener noreferrer" : undefined} className="det-info-val">{row.value}</a>
                          : <div className="det-info-val">{row.value}</div>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* SECTION 6 — RESERVATIONS */}
            {detail.website && (() => {
              const w = (detail.website || "").trim();
              const wl = w.toLowerCase();
              const href = w.startsWith("http://") || w.startsWith("https://") ? w : `https://${w.replace(/^\/+/, "")}`;
              let domain = w;
              try {
                domain = new URL(href).hostname.replace(/^www\./i, "");
              } catch {
                domain = w.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").split("/")[0];
              }
              let btnBg = "#1a0f07";
              let btnBorder = "#3a2010";
              let labelColor = "#e8e0d4";
              let badge = null;
              let label = "";
              if (wl.includes("opentable.com")) {
                badge = <span className="det-reserve-badge ot">OT</span>;
                label = "Book on OpenTable";
              } else if (wl.includes("resy.com")) {
                btnBg = "#E93C51";
                btnBorder = "rgba(0,0,0,0.15)";
                badge = <span className="det-reserve-badge resy">Resy</span>;
                label = "Reserve on Resy";
              } else if (wl.includes("tock.com")) {
                btnBg = "#000000";
                btnBorder = "#333";
                badge = <span className="det-reserve-badge tock">Tock</span>;
                label = "Reserve on Tock";
                labelColor = "#e8e0d4";
              } else if (wl.includes("sevenrooms.com")) {
                btnBg = "#1a1a1a";
                btnBorder = "#3a3a3a";
                badge = <span className="det-reserve-badge sr">7R</span>;
                label = "Reserve on SevenRooms";
              } else {
                const otSearchUrl = `https://www.opentable.com/s/?term=${encodeURIComponent((detail.name || '') + ' ' + (detail.neighborhood || detail.city || ''))}&covers=2`;
                badge = <span className="det-reserve-badge ot">OT</span>;
                label = "Find on OpenTable";
                btnBg = "#1a0f07";
                btnBorder = "#3a2010";
                labelColor = "#e8e0d4";
                return (
                  <div className="det-reservations">
                    <div className="det-section-label">RESERVATIONS</div>
                    <button type="button" className="det-reserve-btn" style={{ background: btnBg, border: `1px solid ${btnBorder}` }} onClick={() => { if (user?.id) logInteraction(user.id, detail.id, 'reservation'); window.open(otSearchUrl, "_blank", "noopener,noreferrer"); }}>
                      <div className="det-reserve-inner">{badge}<span className="det-reserve-label">{label}</span></div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,235,0.3)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                );
              }
              const chevronStroke = wl.includes("resy.com") || wl.includes("tock.com") ? "rgba(255,255,255,0.6)" : "rgba(245,240,235,0.3)";
              return (
                <div className="det-reservations">
                  <div className="det-section-label">RESERVATIONS</div>
                  <button type="button" className="det-reserve-btn" style={{ background: btnBg, border: `1px solid ${btnBorder}` }} onClick={() => { if (user?.id) logInteraction(user.id, detail.id, 'reservation'); window.open(href, "_blank", "noopener,noreferrer"); }}>
                    <div className="det-reserve-inner">{badge}<span className="det-reserve-label" style={{ color: labelColor }}>{label}</span></div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={chevronStroke} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              );
            })()}

            {/* SECTION 8 — YOUR RATING */}
            <div className="det-section">
              <div className="det-section-label">YOUR RATING</div>
              <div className="det-rating-row">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" className="det-rating-btn" onClick={() => { const next = {...(userRatings||{})}; next[detail.id] = n; setUserRatings(next); if (user?.id) logInteraction(user.id, detail.id, 'rating', n); }}>
                    <FlameIcon size={34} filled={(userRatings[detail.id]||0) >= n} color={(userRatings[detail.id]||0) >= n ? "#ff9632" : "#2a1a0a"} />
                  </button>
                ))}
              </div>
              {userRatings[detail.id] && <div className="det-rating-text">Your rating: {userRatings[detail.id]} / 5</div>}
            </div>

            {/* SECTION 9 — CUISINE / MEAL TYPE */}
            <div className="det-section">
              <div className="det-section-label">CUISINE / MEAL TYPE</div>
              <div className="det-meal-pills">
                {[["Breakfast","🍳"],["Brunch","🥐"],["Lunch","🥗"],["Dinner","🍷"],["Bar","🍸"],["Coffee","☕"]].map(([listName, emoji]) => {
                  const isIn = (userLists[listName]||[]).includes(detail.id) || (listName==="Breakfast" && (userLists["Breakfast/Brunch"]||[]).includes(detail.id));
                  return (
                    <button key={listName} type="button" className={`det-meal-pill${isIn ? " active" : ""}`} onClick={() => toggleList(listName==="Breakfast" ? "Breakfast/Brunch" : listName, detail.id)}>
                      <span className="emoji">{emoji}</span>
                      <span>{listName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 10 — TAGS */}
            <div className="det-section">
              <div className="det-section-label">TAGS</div>
              <div className="det-tags-wrap">
                {detailTags.map(tag => (
                  <button key={tag} type="button" className="det-tag-active" onClick={() => { setActiveFilter(tag); setDetailRestaurant(null); }}>{tag}</button>
                ))}
                <button type="button" className="det-tag-add" onClick={() => setShowTagPicker(p => !p)}>+ Add tag</button>
              </div>
              {showTagPicker && (
                <div className="det-tag-picker">
                  {ALL_TAGS.map(tag => {
                    const selected = detailTags.includes(tag);
                    return <button key={tag} type="button" className={`det-tag-option ${selected ? "on" : "off"}`} onClick={() => addOrRemoveTag(tag)}>{tag}</button>;
                  })}
                </div>
              )}
            </div>

            {/* SECTION 11 — NOTES */}
            <div className="det-section">
              <div className="det-section-label">NOTES</div>
              {(userNotes[detail.id]||[]).map((note, i) => (
                <div key={i} className="det-note-card">
                  <div className="det-note-text">{typeof note === "object" && note.text != null ? note.text : note}</div>
                  <div className="det-note-time">{typeof note === "object" && note.time ? note.time : ""}</div>
                </div>
              ))}
              <div className="det-note-row">
                <input className="det-note-input" value={noteInput} onChange={e => setNoteInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (() => { if (!noteInput.trim()) return; setUserNotes(prev => ({ ...prev, [detail.id]: [...(prev[detail.id]||[]), { text: noteInput.trim(), time: new Date().toLocaleString() }] })); setNoteInput(""); })()} placeholder="Add a note..." />
                <button type="button" className="det-note-add" onClick={() => { if (!noteInput.trim()) return; setUserNotes(prev => ({ ...prev, [detail.id]: [...(prev[detail.id]||[]), { text: noteInput.trim(), time: new Date().toLocaleString() }] })); setNoteInput(""); }}>Add</button>
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
                <div className="det-nearby">
                  <div className="det-section-label">NEARBY</div>
                  <div className="det-nearby-scroll">
                    {nearby.map(r => (
                      <HomePhotoCard key={`${r.id}-${photoCacheVersion}`} r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }} onClick={() => setDetailRestaurant(r)} className="det-nearby-card" style={{ minWidth:160, maxWidth:160, height:200, borderRadius:16, flexShrink:0 }}>
                        <div className="card-flame"><FlameRating score={getFlameScore(r)} size={9} /></div>
                        <div className="card-name">{r.name}</div>
                        <div className="card-cuisine">{r.cuisine}</div>
                      </HomePhotoCard>
                    ))}
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
        {friendsBeenHereSheetOpen && friendsBeenHere.list.length > 0 && (
          <div role="presentation" className="det-sheet-backdrop" onClick={() => setFriendsBeenHereSheetOpen(false)}>
            <div role="dialog" aria-label="Friends who have been here" className="det-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="det-sheet-handle" />
              <div className="det-sheet-title">Friends here</div>
              {friendsBeenHere.list.map((f) => (
                <div key={f.clerkUserId} className="det-sheet-row" onClick={() => { setFriendsBeenHereSheetOpen(false); setDetailRestaurant(null); setViewingUserId(f.clerkUserId); }}>
                  <div className="det-sheet-av">
                    {f.profilePhoto ? (
                      <img src={f.profilePhoto} alt="" />
                    ) : (
                      <span className="initial">{(f.profileName || "?").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="det-sheet-name" style={{ marginBottom: f.flameRating != null ? 6 : 0 }}>{f.profileName}</div>
                    {f.flameRating != null && <FlameRating score={f.flameRating} size={10} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>,
        document.getElementById('root') || document.body
        );
      })()}



      {/* Toast */}
      {toast && <div style={{ position:"fixed", top:76, left:"50%", transform:"translateX(-50%)", background:C.terracotta, color:"#fff", borderRadius:20, padding:"10px 20px", fontSize:13, fontWeight:600, zIndex:300, fontFamily:"'Inter', -apple-system, sans-serif", whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(196,96,58,0.4)" }}>Link copied — {toast} 📋</div>}
      {showTasteProfile && (
        <TasteProfile
          onBack={() => setShowTasteProfile(false)}
          onViewUser={(id) => setViewingUserId(id)}
          onOpenDetail={(r) => { setShowTasteProfile(false); setDetailRestaurant(r); }}
          allRestaurants={allRestaurants}
        />
      )}
      {viewingUserId && (
        <UserProfile
          clerkUserId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          onOpenDetail={setDetailRestaurant}
          onViewUser={(id) => setViewingUserId(id)}
          onMessage={(partnerId, partnerName, partnerPhoto) => {
            setViewingUserId(null);
            setDmConvo({ partnerId, partnerName, partnerPhoto });
            setDmOpen(true);
            getConversation(user?.id, partnerId).then(msgs => { setDmMessages(msgs); markMessagesRead(user?.id, partnerId); });
            setTimeout(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
          }}
        />
      )}

      {/* ── DM INBOX MODAL ── */}
      {dmOpen && createPortal(
        <div className="modal-backdrop fullscreen" style={{ background:"rgba(0,0,0,0.7)", zIndex:9999 }} onClick={() => { if (!dmConvo) { setDmOpen(false); } }}>
          <div className="sheet full" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sheet-header">
              {dmConvo ? (
                <>
                  <button type="button" className="sheet-back" style={{ fontSize:18 }} onClick={() => { setDmConvo(null); loadDmInbox(); }}>‹</button>
                  <ProfilePhoto photo={dmConvo.partnerPhoto} size={32} userId={dmConvo.partnerId} />
                  <div className="sheet-header-title" style={{ flex:1 }}>{dmConvo.partnerName}</div>
                </>
              ) : (
                <div className="sheet-header-title large" style={{ flex:1 }}>Messages</div>
              )}
              <button type="button" className="sheet-close" style={{ fontSize:20 }} onClick={() => { setDmOpen(false); setDmConvo(null); }}>✕</button>
            </div>
            {/* Content */}
            {!dmConvo ? (
              /* INBOX */
              <div className="sheet-body" style={{ padding:"8px 0" }}>
                {dmInbox.length === 0 ? (
                  <div className="empty-state" style={{ padding:"60px 20px" }}>
                    <div className="empty-icon">💬</div>
                    <div className="empty-text">No messages yet</div>
                    <div className="empty-sub">Share a restaurant or message a friend to start a conversation.</div>
                  </div>
                ) : dmInbox.map(convo => (
                  <button key={convo.partnerId} type="button" className={`sheet-row${convo.unread > 0 ? " unread" : ""}`} onClick={() => openDmConvo(convo.partnerId, convo.partnerName, convo.partnerPhoto)}>
                    <ProfilePhoto photo={convo.partnerPhoto} size={44} userId={convo.partnerId} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontFamily:"'Inter', -apple-system, sans-serif", fontSize:14, fontWeight: convo.unread > 0 ? 700 : 400, color:C.text }}>{convo.partnerName}</span>
                        <span style={{ fontSize:11, color:C.muted, fontFamily:"'Inter', -apple-system, sans-serif", flexShrink:0 }}>{(() => { const d = Math.floor((Date.now()-new Date(convo.created_at))/60000); return d < 1 ? "now" : d < 60 ? `${d}m` : d < 1440 ? `${Math.floor(d/60)}h` : `${Math.floor(d/1440)}d`; })()}</span>
                      </div>
                      <div style={{ fontSize:12, color: convo.unread > 0 ? C.text : C.muted, fontFamily:"'Inter', -apple-system, sans-serif", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:2 }}>
                        {convo.restaurant_name ? `🍽 ${convo.restaurant_name}` : (convo.content || "...")}
                      </div>
                    </div>
                    {convo.unread > 0 && <span className="unread-dot" />}
                  </button>
                ))}
              </div>
            ) : (
              /* CONVERSATION */
              <>
                <div className="sheet-body" style={{ padding:"12px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                  {dmMessages.map((msg, i) => {
                    const isMine = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id || i} style={{ display:"flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                        <div className={`dm-bubble ${isMine ? "mine" : "theirs"}`} style={ msg.restaurant_name ? { padding:"8px 10px" } : undefined}>
                          {msg.restaurant_name ? (
                            <button type="button" className="dm-rest-card" onClick={() => {
                              const rid = parseInt(msg.restaurant_id);
                              const r = allRestaurants.find(r => r.id === rid);
                              if (r) { setDmOpen(false); setDmConvo(null); setDetailRestaurant(r); }
                            }}>
                              {(() => { const rid = parseInt(msg.restaurant_id); const photo = photoCacheRef.current?.[rid] || photoCacheRef.current?.[String(rid)] || allRestaurants.find(r => r.id === rid)?.img; return photo ? <img src={photo} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:"cover", flexShrink:0 }} /> : null; })()}
                              <div>
                                <div style={{ fontFamily:"'Playfair Display', Georgia, serif", fontStyle:"italic", fontSize:14, color: isMine ? "#fff" : C.text }}>{msg.restaurant_name}</div>
                                <div style={{ fontSize:11, color: isMine ? "rgba(255,255,255,0.7)" : C.muted, marginTop:2 }}>Tap to view</div>
                              </div>
                            </button>
                          ) : msg.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={dmMessagesEndRef} />
                </div>
                {/* Input */}
                <div className="dm-input-bar">
                  <input className="glass-input rounded" value={dmInput} onChange={e => setDmInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendDm(); } }}
                    placeholder="Message..." />
                  <button type="button" className={`dm-send-btn ${dmInput.trim() ? "active" : "inactive"}`} onClick={handleSendDm} disabled={!dmInput.trim() || dmSending}>
                    →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── SHARE VIA DM PICKER ── */}
      {dmSharePicker && createPortal(
        <div className="modal-backdrop" style={{ background:"rgba(0,0,0,0.7)", zIndex:999999 }} onClick={() => setDmSharePicker(null)}>
          <div className="sheet short" onClick={e => e.stopPropagation()} style={{ padding:"20px 18px 36px", overflowY:"auto" }}>
            <div className="sheet-header-title" style={{ marginBottom:4 }}>Send {dmSharePicker.name} to...</div>
            <input className="glass-input" value={dmShareSearch} onChange={e => setDmShareSearch(e.target.value)} placeholder="Search people..." style={{ marginBottom:12 }} />
            {dmShareResults.length === 0 ? <div className="empty-state" style={{ padding:20, fontSize:13 }}>No people found</div> : dmShareResults.map(u => (
              <button key={u.clerk_user_id} type="button" className="sheet-row" onClick={() => handleShareViaDm(u.clerk_user_id, u.profile_name || u.profile_username || "User")}>
                <ProfilePhoto photo={u.profile_photo} size={36} userId={u.clerk_user_id} />
                <div>
                  <div style={{ fontSize:14, color:C.text, fontFamily:"'Inter', -apple-system, sans-serif" }}>{u.profile_name || "User"}</div>
                  {u.profile_username && <div style={{ fontSize:11, color:C.muted }}>@{u.profile_username}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {notifSheetOpen && createPortal(
        <div className="modal-backdrop" style={{ zIndex: 1001 }} onClick={() => setNotifSheetOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh" }}>
            <div className="sheet-header" style={{ justifyContent: "space-between" }}>
              <div className="sheet-header-title large">Notifications</div>
              <button type="button" className="sheet-close" onClick={() => setNotifSheetOpen(false)}>×</button>
            </div>
            <div className="sheet-body" style={{ padding: 0 }}>
              {notifLoading ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>Loading…</div>
              ) : notifList.length === 0 ? (
                <div className="empty-state" style={{ padding: "48px 0" }}>
                  <div className="empty-icon">🔔</div>
                  <div className="empty-text">No notifications yet</div>
                  <div className="empty-sub">When people follow you or love restaurants, you'll see it here.</div>
                </div>
              ) : (
                groupNotifList(notifList).map((item, idx) => {
                  // Section header
                  if (item._sectionHeader) {
                    return (
                      <div key={`section-${item._sectionHeader}`} className="notif-section-header">
                        {item._sectionHeader}
                      </div>
                    );
                  }

                  const unread = item.read === false;
                  const isFollow = item.type === "followed_you";
                  const fromUser = item._fromUser || (item._users && item._users[0]);
                  const restaurant = item.restaurant_id ? allRestaurants.find(r => String(r.id) === String(item.restaurant_id)) : null;

                  // LEFT: always the actor's profile photo
                  const profileSrc = fromUser?.profile_photo;
                  // RIGHT: restaurant photo for restaurant notifs, Follow button for follows
                  const restaurantPhotoSrc = restaurant ? (getAnyCachedPhotoForId(restaurant.id) || restaurant.img) : null;
                  const alreadyFollowing = isFollow && item.from_user_id && notifFollowedBack.has(item.from_user_id);

                  const msg = buildNotifMessage(item);
                  const timeStr = formatNotificationTime(item.created_at);

                  return (
                    <div
                      key={item.id ?? `${item.created_at}-${item.type}-${idx}`}
                      className="notif-item"
                      onClick={() => {
                        if (isFollow && item.from_user_id) {
                          setNotifSheetOpen(false); setViewingUserId(item.from_user_id);
                        } else if (restaurant) {
                          setNotifSheetOpen(false); setDetailRestaurant(restaurant);
                        } else if (item.from_user_id) {
                          setNotifSheetOpen(false); setViewingUserId(item.from_user_id);
                        }
                      }}
                      style={{ opacity: unread ? 1 : 0.7, padding: "10px 16px" }}
                    >
                      {/* Unread glow dot */}
                      {unread && <div className="notif-dot" />}

                      {/* LEFT: User profile photo */}
                      <div className="av-circle" style={unread ? {
                        border: `2px solid ${C.terracotta}`,
                        boxShadow: `0 0 12px rgba(255,150,50,0.3), 0 0 20px rgba(255,150,50,0.1)`,
                      } : undefined}>
                        {profileSrc ? <img src={profileSrc} alt="" /> : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <NotificationTypeIcon type={item.type} size={18} />
                          </div>
                        )}
                      </div>

                      {/* CENTER: Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif",
                          lineHeight: 1.4, overflow: "hidden", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {renderNotifBoldText(msg)}
                          <span style={{ color: "rgba(255,150,50,0.4)", fontSize: 12, marginLeft: 4 }}>{timeStr}</span>
                        </div>
                      </div>

                      {/* RIGHT: Follow button OR restaurant photo */}
                      {isFollow ? (
                        alreadyFollowing ? (
                          <button type="button" className="follow-btn done" disabled onClick={e => e.stopPropagation()}>
                            Following
                          </button>
                        ) : (
                          <button type="button" className="follow-btn primary" onClick={async (e) => {
                            e.stopPropagation();
                            if (!user?.id || !item.from_user_id) return;
                            await followUser(user.id, item.from_user_id);
                            syncFollow(user.id, item.from_user_id);
                            setNotifFollowedBack(prev => new Set([...prev, item.from_user_id]));
                          }}>
                            Follow Back
                          </button>
                        )
                      ) : (restaurant && restaurantPhotoSrc) ? (
                        <div style={{
                          width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                          background: "linear-gradient(145deg, #1e1a24, #12101a)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,220,180,0.08)",
                        }}>
                          <img src={restaurantPhotoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
              <div style={{ height: 24 }} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </div>
    {/* Bug Report Button — visible on every page */}
    <BugReportButton
      userId={user?.id}
      userName={user?.fullName}
      userEmail={user?.primaryEmailAddress?.emailAddress}
      currentTab={tab}
      detailRestaurant={detailRestaurant}
      viewingUserId={viewingUserId}
    />
    {/* </SignedIn> — temporarily bypassed for design work */}
    </>
  );
}
