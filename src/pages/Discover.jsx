import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { SignInButton, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { RESTAURANTS, ALL_TAGS } from "../data/restaurants";

/** All cities present in the restaurant database — single source for filters across tabs */
const CITY_REGIONS = [
  { region: "United States", cities: ["Los Angeles","New York","Ventura County","Malibu","Chicago","Miami","Las Vegas","San Francisco","San Diego","Austin","Nashville","Maui","Napa","Ojai","Portland","Dallas","Savannah","Scottsdale"] },
  { region: "Mexico & Caribbean", cities: ["Mexico City","Playa del Carmen","Canouan Island","Liberia"] },
  { region: "Europe", cities: ["London","UK","Paris","Barcelona","Amsterdam","Copenhagen","Lisbon","Rome","Berlin","Istanbul","Munich","Prague","Stockholm","Vienna","Ibiza","Mykonos","Malta","Cannes"] },
  { region: "Middle East", cities: ["Dubai","Tel Aviv"] },
  { region: "Asia", cities: ["Tokyo","Seoul","Hong Kong","Bangkok","Bali","Singapore","Mumbai"] },
  { region: "Canada", cities: ["Toronto"] },
];

const ALL_CITIES = [...new Set(CITY_REGIONS.flatMap(r => r.cities))];

function getPersonalizedCityRegions(lovedRestaurants, followedCities, heatResults) {
  const cityScores = {};
  // Score from loved restaurants
  (lovedRestaurants || []).forEach(r => {
    if (r.city) cityScores[r.city] = (cityScores[r.city] || 0) + 3;
  });
  // Score from followed cities
  (followedCities || []).forEach(c => {
    cityScores[c] = (cityScores[c] || 0) + 5;
  });
  // Score from heat loved
  const heatLoved = heatResults?.loved || [];
  heatLoved.forEach(id => {
    const r = RESTAURANTS.find(x => x.id === id || x.id === Number(id));
    if (r?.city) cityScores[r.city] = (cityScores[r.city] || 0) + 1;
  });
  return CITY_REGIONS.map(region => ({
    ...region,
    cities: [...region.cities].sort((a, b) => (cityScores[b] || 0) - (cityScores[a] || 0)),
  }));
}
import ChatBot from "../components/ChatBot";
import NotificationSheet from "../components/NotificationSheet";
import Profile from "./Profile";
import TasteProfile from "./TasteProfile";
import UserProfile from "./UserProfile";
import Onboarding from "./Onboarding";
import { addCommunityRestaurant, followCity, followUser, getCommunityRestaurants, getFollowedCities, getFollowing, isFollowing as checkUserIsFollowing, loadSharedPhotos, loadUserData, saveSharedPhoto, saveUserData, supabase, unfollowCity, unfollowUser, getAdminOverrides } from "../lib/supabase";
import { syncLove, removeLove, syncFollow, removeFollow, syncCityFollow, removeCityFollow, getFriendsWhoLovedRestaurant, getTrendingInFollowedCities, syncRestaurant, seedAllRestaurants, getYoudLoveThis, getRisingRestaurants, getHiddenGems, getSixDegrees, getTasteFingerprint, getPeopleLikeYou, getWhoToFollow } from "../lib/neo4j";

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
      // Fallback: try to construct something useful from available fields
      if (row?.restaurant_name && row?._fromUser?.profile_name) return `${userName} · ${restName}`;
      if (row?.restaurant_name) return restName;
      if (row?._fromUser?.profile_name) return `Activity from ${userName}`;
      return "New activity";
  }
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

function RestCard({ r, loved, watched, onLove, onWatch, onShare, onOpenDetail, onPhotoFetched, getCachedPhotoForId, photoCacheVersion = 0, usingSupabasePhotoCache }) {
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

  return (
    <div ref={cardRef} style={{ margin:"0 16px 16px", borderRadius:18, overflow:"hidden", background:C.bg2, border:`0.5px solid ${C.border}`, cursor:"pointer" }} onClick={() => onOpenDetail?.(r)}>
      <div style={{ position:"relative", height:150, overflow:"hidden" }}>
        <img src={imgSrc} alt={r.name} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform 0.4s" }} />
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 50%, rgba(30,18,8,0.7) 100%)" }} />
        {r.source && (
          <div style={{ position:"absolute", top:10, left:10, background:"rgba(15,12,9,0.75)", border:`0.5px solid ${C.border2}`, borderRadius:16, padding:"3px 9px", fontFamily:"-apple-system, sans-serif", fontSize:9, color:C.cream, display:"flex", alignItems:"center", gap:6 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.cream} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
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

  const [showHeatTip, setShowHeatTip] = useState(false);
  const [heatTipFading, setHeatTipFading] = useState(false);
  const [setupGateOpen, setSetupGateOpen] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupSaving, setSetupSaving] = useState(false);
  const [city, setCity] = useState("Los Angeles");
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
  const [followingPicksLoading, setFollowingPicksLoading] = useState(false);
  const [followingPicksRestaurants, setFollowingPicksRestaurants] = useState([]);
  const [followingPicksNoFollows, setFollowingPicksNoFollows] = useState(false);
  const [venueType, setVenueType] = useState("all"); // "all" | "restaurants" | "bars" | "coffee"
  const [secondaryCuisine, setSecondaryCuisine] = useState(null); // dropdown selection when restaurants or bars
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterMood, setFilterMood] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [restoredMessages, setRestoredMessages] = useState(null);
  const [homeChatKey, setHomeChatKey] = useState(0);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(52);
  useLayoutEffect(() => {
    if (tab !== "discover") {
      if (discoverSearchMode !== "restaurants") setDiscoverSearchMode("restaurants");
      return;
    }
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.getBoundingClientRect().height);
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
  useEffect(() => {
    if (safeLocalStorageGetItem("cooked_graph_seeded_v2")) return;
    if (!import.meta.env.VITE_NEO4J_URI) return;
    seedAllRestaurants(allRestaurants).then(() => {
      try { window.localStorage.setItem("cooked_graph_seeded_v2", "1"); } catch {}
      console.log("[Neo4j] Graph seeded with", allRestaurants.length, "restaurants");
    }).catch(e => console.error("[Neo4j] Seed error:", e));
  }, []);

  // Fetch Neo4j-powered discovery feeds (global, then filter by city client-side)
  useEffect(() => {
    if (!user?.id) return;
    getYoudLoveThis(user.id, 30).then(results => {
      const matched = results
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _weight: r.weight, _recommenders: r.recommenders } : null;
        })
        .filter(Boolean);
      setYoudLoveThis(matched);
    });
    getRisingRestaurants(30).then(results => {
      const matched = results
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _recentLoves: r.recentLoves } : null;
        })
        .filter(Boolean);
      setRisingRestaurants(matched);
    });
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
    });
  }, [user?.id]);

  // Filter Neo4j sections by selected city — show nothing if no city matches (don't fall back to global)
  const youdLoveFiltered = useMemo(() => {
    if (!city || city === "All") return youdLoveThis.slice(0, 8);
    return youdLoveThis.filter(r => r.city === city).slice(0, 8);
  }, [youdLoveThis, city]);

  const risingFiltered = useMemo(() => {
    if (!city || city === "All") return risingRestaurants.slice(0, 8);
    return risingRestaurants.filter(r => r.city === city).slice(0, 8);
  }, [risingRestaurants, city]);

  const hiddenGemsFiltered = useMemo(() => {
    if (!city || city === "All") return hiddenGems.slice(0, 8);
    return hiddenGems.filter(r => r.city === city).slice(0, 8);
  }, [hiddenGems, city]);

  const trendingFiltered = useMemo(() => {
    if (!city || city === "All") return trendingInCities;
    return trendingInCities.filter(r => r.city === city);
  }, [trendingInCities, city]);

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
        setSetupName(profileName && profileName.toLowerCase() !== "user" ? profileName : (user.fullName || user.firstName || ""));
        setSetupUsername(profileUsername || user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "");
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

  // Poll for new followers and create "followed_you" notifications for any missing ones.
  // Compares current follower set against a cached set so it works even if follows table
  // has no created_at column. Catches follows where the inline insert failed.
  const knownFollowersRef = useRef(null);
  useEffect(() => {
    if (!user?.id) return;
    const checkNewFollowers = async () => {
      try {
        // Get all current followers
        const { data: allFollows, error: fErr } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", user.id);
        if (fErr || !allFollows) return;
        const currentFollowerIds = allFollows.map(f => f.follower_id);
        // First run: seed the known set and check for any followers without notifications
        if (knownFollowersRef.current === null) {
          knownFollowersRef.current = new Set(currentFollowerIds);
          // On first load, check for followers that have no "followed_you" notification at all
          if (currentFollowerIds.length > 0) {
            const { data: existingNotifs } = await supabase
              .from("notifications")
              .select("from_user_id")
              .eq("user_id", user.id)
              .eq("type", "followed_you")
              .in("from_user_id", currentFollowerIds);
            const alreadyNotified = new Set((existingNotifs || []).map(n => n.from_user_id));
            const missing = currentFollowerIds.filter(fid => !alreadyNotified.has(fid));
            if (missing.length > 0) {
              const rows = missing.map(fid => ({
                user_id: user.id,
                type: "followed_you",
                from_user_id: fid,
                read: false,
              }));
              await supabase.from("notifications").insert(rows);
            }
          }
          return;
        }
        // Subsequent runs: detect new followers since last check
        const newFollowers = currentFollowerIds.filter(fid => !knownFollowersRef.current.has(fid));
        if (newFollowers.length > 0) {
          // Double-check no notification already exists for these
          const { data: existingNotifs } = await supabase
            .from("notifications")
            .select("from_user_id")
            .eq("user_id", user.id)
            .eq("type", "followed_you")
            .in("from_user_id", newFollowers);
          const alreadyNotified = new Set((existingNotifs || []).map(n => n.from_user_id));
          const missing = newFollowers.filter(fid => !alreadyNotified.has(fid));
          if (missing.length > 0) {
            const rows = missing.map(fid => ({
              user_id: user.id,
              type: "followed_you",
              from_user_id: fid,
              read: false,
            }));
            await supabase.from("notifications").insert(rows);
          }
        }
        knownFollowersRef.current = new Set(currentFollowerIds);
      } catch (e) {
        console.error("[Notif] follow poll error:", e);
      }
    };
    // Run once on mount, then every 30 seconds
    checkNewFollowers();
    const pollId = setInterval(checkNewFollowers, 30000);
    return () => clearInterval(pollId);
  }, [user?.id]);

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
      .limit(50);
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
  const dragStart = useRef(null);
  const swipeDeltaRef = useRef({ x: 0, y: 0 });
  const heatSwipeHandledRef = useRef(false);
  const backupInputRef = useRef(null);

  const [userLists, setUserLists] = useState(() => {
    try { return JSON.parse(safeLocalStorageGetItem("cooked_lists") || "{\"Breakfast/Brunch\":[],\"Lunch\":[],\"Dinner\":[],\"Bar\":[],\"Coffee\":[]}"); } catch { return { "Breakfast/Brunch": [], "Lunch": [], "Dinner": [], "Bar": [], "Coffee": [] }; }
  });
  const supabaseLoadedRef = useRef(false);

  // Merge in community restaurants from Supabase so all users can see them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const community = await getCommunityRestaurants();
      if (cancelled || !Array.isArray(community) || community.length === 0) return;
      setAllRestaurants((prev) => {
        const byId = new Map(prev.map((r) => [String(r.id), r]));
        const byName = new Map(prev.map((r) => [r.name?.toLowerCase().trim(), r]));
        community.forEach((r) => {
          if (!r || r.id == null) return;
          const key = String(r.id);
          const nameKey = r.name?.toLowerCase().trim();
          if (nameKey) {
            const existingByName = byName.get(nameKey);
            if (existingByName && String(existingByName.id) !== key) {
              byId.delete(String(existingByName.id));
            }
          }
          const merged = { ...(byId.get(key) || {}), ...r };
          byId.set(key, merged);
          if (nameKey) byName.set(nameKey, merged);
        });
        return Array.from(byId.values());
      });
    })();
    return () => { cancelled = true; };
  }, []);

  // Apply admin overrides (edits/deletions) from Supabase
  useEffect(() => {
    getAdminOverrides().then(overrides => {
      if (!overrides || overrides.length === 0) return;
      setAllRestaurants(prev => {
        let result = prev;
        const deleteIds = new Set();
        const edits = {};
        overrides.forEach(o => {
          if (o.action === "delete" || o.action === "merge_into") deleteIds.add(String(o.restaurant_id));
          if (o.action === "edit" && o.override_data) edits[String(o.restaurant_id)] = o.override_data;
        });
        if (deleteIds.size > 0) result = result.filter(r => !deleteIds.has(String(r.id)));
        if (Object.keys(edits).length > 0) result = result.map(r => edits[String(r.id)] ? { ...r, ...edits[String(r.id)] } : r);
        return result;
      });
    });
  }, []);

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
        const clerkProfileName = user.fullName || user.firstName || "User";
        const clerkProfileUsername = user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "";
        const remoteHeat = remote.heat || {
          loved: Array.isArray(remote.loved) ? remote.loved : [],
          noped: Array.isArray(remote.noped) ? remote.noped : [],
          skipped: Array.isArray(remote.skipped) ? remote.skipped : [],
          votes: remote.votes && typeof remote.votes === "object" ? remote.votes : {},
        };
        const remoteWatchlist = Array.isArray(remote.watchlist) ? [...new Set(remote.watchlist.map(id => isNaN(id) ? id : Number(id)))] : [];
        const remoteRatings = remote.ratings && typeof remote.ratings === "object" ? remote.ratings : {};
        const remotePhotoResolved = Array.isArray(remote.photo_resolved) ? remote.photo_resolved : [];

        setHeatResults(remoteHeat);
        setWatchlist(remoteWatchlist);
        setUserRatings(remoteRatings);
        setPhotoResolved(remotePhotoResolved);

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

  function HomePhotoCard({ r, style, children, onClick }) {
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
    if (venueType === "hotels") {
      return cu.includes("hotel") || cu.includes("resort") || r.isHotel === true;
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
    const byCity = city === "All" ? allRestaurants : allRestaurants.filter(r => r.city === city);
    const mapRestaurants = byCity.filter(r => r.lat != null && r.lng != null && r.lat !== 0);

    const updateMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      mapRestaurants.forEach(r => {
        const el = document.createElement("div");
        el.style.cssText = "width:14px;height:14px;border-radius:50%;background:#c4603a;border:2px solid #fff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.35);";
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
  const watchList = allRestaurants.filter(r => watchlist.includes(r.id));
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
        } else {
          removeLove(user.id, id);
        }
      }
      return {
        ...prev,
        loved: nextLoved,
      };
    });
  };
  const toggleWatch = (id) => {
    const normalizedId = isNaN(id) ? id : Number(id);
    setWatchlist(s => s.includes(normalizedId) ? s.filter(x=>x!==normalizedId) : [...s,normalizedId]);
  };
  const share = async (name) => {
    const text = `Check out ${name} on Cooked — the restaurant app for people who care.`;
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
            const cityNormalizations = {
              "ciudad de méxico": "Mexico City",
              "ciudad de mexico": "Mexico City",
              "cdmx": "Mexico City",
              "new york city": "New York",
              "nyc": "New York",
              "los ángeles": "Los Angeles",
              "los angeles": "Los Angeles",
              "londres": "London",
              "parís": "Paris",
              "tokio": "Tokyo",
              "seúl": "Seoul",
              "dubái": "Dubai",
            };
            const rawCity = municipalityFromAddress || cityFromAddress || stateFromAddress;
            const normalizedCity = cityNormalizations[rawCity.toLowerCase()] || rawCity;
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
            fontFamily: "'DM Mono',monospace",
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
          setShowHeatTip(true);
        }}
      />
    );
  }

  if (user?.id && setupGateOpen) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 460, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 34, color: C.text, marginBottom: 4 }}>One last thing.</div>
          <div style={{ color: C.muted, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, marginBottom: 16 }}>What should we call you?</div>
          <input
            value={setupName}
            onChange={(e) => setSetupName(e.target.value)}
            placeholder="Your name"
            style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "12px 16px", marginBottom: 10, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, outline: "none" }}
          />
          <input
            value={setupUsername}
            onChange={(e) => setSetupUsername(e.target.value)}
            placeholder="@handle"
            style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, outline: "none" }}
          />
          <button
            type="button"
            disabled={setupSaving || !setupName.trim() || !setupUsername.trim()}
            onClick={async () => {
              if (!user?.id || !setupName.trim() || !setupUsername.trim()) return;
              setSetupSaving(true);
              try {
                const username = setupUsername.trim().replace(/^@+/, "");
                await saveUserData(user.id, {
                  profile_name: setupName.trim(),
                  profile_username: username,
                });
                safeSetItem("cooked_profile_name", setupName.trim());
                safeSetItem("cooked_profile_username", username);
                setSetupGateOpen(false);
              } finally {
                setSetupSaving(false);
              }
            }}
            style={{ width: "100%", background: C.terracotta, color: "#fff", border: "none", borderRadius: 12, padding: "12px 16px", fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, fontWeight: 600, cursor: setupSaving ? "default" : "pointer", opacity: setupSaving ? 0.7 : 1 }}
          >
            Let's eat
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <SignedOut>
      <div style={{ width:"100%", minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" }}>
        <div style={{ width:"100%", maxWidth:480, textAlign:"center" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
            <Wordmark size={44} />
          </div>
          <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:20, color:C.text, marginBottom:24 }}>
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
                fontFamily:"-apple-system,sans-serif",
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
    </SignedOut>
    <SignedIn>
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
          onLogoClick={() => setTab("home")}
          right={
            <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
              {(tab === "home" || tab === "discover" || tab === "map") && (
                <div style={{ position:"relative" }}>
                  <button onClick={() => setCityPickerOpen(v => !v)} style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", padding:0, outline:"none" }}>
                    <span style={{ fontFamily:"Cormorant Garamond,Georgia,serif", fontSize:15, fontWeight:700, color:C.terracotta, fontStyle:"italic" }}>{city === "All" ? "All Cities" : city}</span>
                    <span style={{ fontSize:11, color:C.muted, marginTop:1 }}>{cityPickerOpen ? "▴" : "▾"}</span>
                  </button>
                  {cityPickerOpen && (
                    <div style={{ position:"absolute", top:"calc(100% + 8px)", left:-12, zIndex:600, background:C.bg2, borderRadius:14, boxShadow:"0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)", border:`1px solid ${C.border}`, width:220, maxHeight:340, overflowY:"auto", scrollbarWidth:"none", padding:"6px 0 8px" }} onClick={e => e.stopPropagation()}>
                      {user?.id && followedCities.length > 0 ? (
                        <div style={{ padding:"0 0 8px", borderBottom:`1px solid ${C.border2}` }}>
                          <div style={{ padding:"6px 14px 6px", fontFamily:"'DM Mono',monospace", fontSize:8, color:C.dim, letterSpacing:"1.8px", textTransform:"uppercase" }}>Cities You Follow</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6, padding:"0 10px 4px" }}>
                            {followedCities.map((fc) => (
                              <button
                                key={fc}
                                type="button"
                                onClick={() => { setCity(fc); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                                style={{
                                  padding:"5px 10px",
                                  borderRadius:14,
                                  border:`1px solid ${city === fc ? C.terracotta : C.border}`,
                                  background: city === fc ? `${C.terracotta}22` : C.bg3,
                                  color: city === fc ? C.terracotta : C.text,
                                  fontSize:11,
                                  fontFamily:"'DM Sans',sans-serif",
                                  fontWeight: city === fc ? 600 : 400,
                                  cursor:"pointer",
                                  maxWidth:"100%",
                                  whiteSpace:"nowrap",
                                  overflow:"hidden",
                                  textOverflow:"ellipsis",
                                }}
                              >
                                {fc}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div style={{ padding: "8px 16px 4px", fontFamily: "'DM Mono', monospace", fontSize: 8, color: C.dim, letterSpacing: "1.8px", textTransform: "uppercase", borderTop: user?.id && followedCities.length > 0 ? `1px solid ${C.border2}` : "none" }}>
                        All cities
                      </div>
                      <div style={{ display: "flex", alignItems: "stretch", width: "100%" }}>
                        <button type="button" onClick={() => { setCity("All"); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }} style={{ flex:1, padding:"8px 8px 8px 14px", textAlign:"left", background: city==="All" ? `${C.terracotta}18` : "transparent", border:"none", color: city==="All" ? C.terracotta : C.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", fontWeight: city==="All" ? 600 : 400, cursor:"pointer" }}>All Cities</button>
                      </div>
                      {getPersonalizedCityRegions(lovedRestaurants, followedCities, heatResults).map(({ region, cities }) => (
                        <div key={region}>
                          <div style={{ padding:"10px 14px 4px", fontFamily:"'DM Mono',monospace", fontSize:8, color:C.terracotta, letterSpacing:"1.8px", textTransform:"uppercase", borderTop:`1px solid ${C.border}` }}>{region}</div>
                          {cities.map((c) => (
                            <div key={c} style={{ display: "flex", alignItems: "stretch", width: "100%" }}>
                              <button type="button" onClick={() => { setCity(c); setSecondaryCuisine(null); setSearchQuery(""); setCityPickerOpen(false); }}
                                style={{ flex: 1, minWidth: 0, padding: "8px 8px 8px 14px", textAlign: "left", background: city === c ? `${C.terracotta}18` : "transparent", border: "none", color: city === c ? C.terracotta : C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", fontWeight: city === c ? 600 : 400, cursor: "pointer", letterSpacing: "-0.1px", lineHeight: 1.3 }}
                              >
                                {c}
                              </button>
                              {user?.id ? (
                                <button
                                  type="button"
                                  aria-label={followedCities.includes(c) ? `Unfollow ${c}` : `Follow ${c}`}
                                  onClick={(e) => { e.stopPropagation(); toggleCityFollow(c, e); }}
                                  style={{ padding: "0 14px", background: "transparent", border: "none", cursor: "pointer", color: followedCities.includes(c) ? C.terracotta : C.muted, fontSize: 16, flexShrink: 0 }}
                                >
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
              <button onClick={()=>{ setIgError(null); setIgAddedRestaurants([]); setIgDone(false); setIgImporting(false); setPickerMode("ig-import"); setIgModal(true); }}
                title="Add from Instagram"
                style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", border:"none", fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                📸
              </button>
              <button
                type="button"
                onClick={openNotificationsSheet}
                aria-label="Notifications"
                style={{ position:"relative", width:40, height:40, borderRadius:"50%", border:"none", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0, flexShrink:0 }}
              >
                <NotificationBellIcon color={C.text} />
                {notifUnreadCount > 0 ? (
                  <span style={{ position:"absolute", top:0, right:0, minWidth:18, height:18, borderRadius:9, background:"#FF3B30", pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:"center", padding:"0 5px", boxSizing:"border-box", border:`2px solid ${C.bg}` }}>
                    <span style={{ fontSize:10, fontWeight:700, color:"#fff", fontFamily:"-apple-system,sans-serif", lineHeight:1 }}>{notifUnreadCount > 99 ? "99+" : notifUnreadCount}</span>
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setTab("profile")}
                aria-label="Profile"
                style={{ width:36, height:36, borderRadius:"50%", border:`1.5px solid ${C.border}`, overflow:"hidden", padding:0, cursor:"pointer", background:C.bg2, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}
              >
                {headerProfilePhoto || user?.imageUrl ? (
                  <img
                    src={headerProfilePhoto || user?.imageUrl || ""}
                    alt=""
                    style={{ width:"100%", height:"100%", objectFit:"cover" }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                ) : (
                  <div style={{ width:"100%", height:"100%", background:C.bg3 }} />
                )}
              </button>
            </div>
          }
        />
      </div>

      {/* Spacer for fixed header */}
      <div style={{ height: 0, margin: 0, padding: 0 }} />

      {/* Home Tab */}
      {tab === "home" && (() => {
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
            <ChatBot key={homeChatKey} inline allRestaurants={allRestaurants} initialInput={chatInput} initialMessages={restoredMessages} userId={user?.id} lovedRestaurants={lovedRestaurants} watchlist={watchlist} followedCities={followedCities} tasteProfile={chatTasteProfile} selectedCity={city} onOpenDetail={setDetailRestaurant} />
          </div>

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
                key={`${featuredRestaurant.id}-${photoCacheVersion}`}
                r={{ ...featuredRestaurant, img: getAnyCachedPhotoForId(featuredRestaurant.id) || featuredRestaurant.img }}
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

          {trendingFiltered.length > 0 ? (
            <div style={{ padding: "0 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontSize: 22, color: C.text }}>
                  Trending in your cities
                </span>
              </div>
              {trendingFiltered.map((r, i) => (
                <HomePhotoCard
                  key={`${r.id}-${photoCacheVersion}`}
                  r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }}
                  onClick={() => setDetailRestaurant(r)}
                  style={{
                    width: "100%",
                    height: 200,
                    borderRadius: 14,
                    marginBottom: i < trendingFiltered.length - 1 ? 12 : 0,
                  }}
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
          ) : null}

          {/* You'd Love This — collaborative filtering */}
          {youdLoveFiltered.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ padding: "0 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontSize: 22, color: C.text }}>You'd love this</span>
              </div>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
                {youdLoveFiltered.map(r => (
                  <HomePhotoCard
                    key={`rec-${r.id}-${photoCacheVersion}`}
                    r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }}
                    onClick={() => setDetailRestaurant(r)}
                    style={{ minWidth: 170, maxWidth: 170, height: 220, borderRadius: 14, flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 15, color: "#c4603a" }}>
                      {r.rating}
                    </div>
                    <div style={{ position: "absolute", bottom: 40, left: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 14, color: "#f0ebe2", lineHeight: 1.2 }}>
                      {r.name}
                    </div>
                    <div style={{ position: "absolute", bottom: 24, left: 10, fontSize: 11, color: "rgba(240,235,226,0.6)" }}>
                      {r.cuisine || ""}
                    </div>
                    <div style={{ position: "absolute", bottom: 8, left: 10, fontSize: 10, color: "#c4603a", fontFamily: "'DM Mono', monospace" }}>
                      {r._weight} {r._weight === 1 ? "match" : "matches"}
                    </div>
                  </HomePhotoCard>
                ))}
              </div>
            </div>
          )}

          {/* Rising — trending last 30 days */}
          {risingFiltered.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ padding: "0 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontSize: 22, color: C.text }}>Rising</span>
                <span style={{ fontSize: 11, color: "#5a3a20", fontFamily: "'DM Mono', monospace" }}>last 30 days</span>
              </div>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
                {risingFiltered.map(r => (
                  <HomePhotoCard
                    key={`rise-${r.id}-${photoCacheVersion}`}
                    r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }}
                    onClick={() => setDetailRestaurant(r)}
                    style={{ minWidth: 150, maxWidth: 150, height: 200, borderRadius: 14, flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 15, color: "#c4603a" }}>
                      {r.rating}
                    </div>
                    <div style={{ position: "absolute", bottom: 28, left: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 14, color: "#f0ebe2", lineHeight: 1.2 }}>
                      {r.name}
                    </div>
                    <div style={{ position: "absolute", bottom: 10, left: 10, fontSize: 10, color: "rgba(240,235,226,0.6)" }}>
                      {r._recentLoves} recent {r._recentLoves === 1 ? "love" : "loves"}
                    </div>
                  </HomePhotoCard>
                ))}
              </div>
            </div>
          )}

          {/* Hidden Gems — high rated, few loves */}
          {hiddenGemsFiltered.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ padding: "0 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontSize: 22, color: C.text }}>Hidden gems</span>
              </div>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
                {hiddenGemsFiltered.map(r => (
                  <HomePhotoCard
                    key={`gem-${r.id}-${photoCacheVersion}`}
                    r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }}
                    onClick={() => setDetailRestaurant(r)}
                    style={{ minWidth: 170, maxWidth: 170, height: 220, borderRadius: 14, flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 15, color: "#c4603a" }}>
                      {r.rating}
                    </div>
                    <div style={{ position: "absolute", bottom: 40, left: 10, right: 10, fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 14, color: "#f0ebe2", lineHeight: 1.2 }}>
                      {r.name}
                    </div>
                    <div style={{ position: "absolute", bottom: 24, left: 10, fontSize: 11, color: "rgba(240,235,226,0.6)" }}>
                      {r.cuisine || ""}
                    </div>
                    <div style={{ position: "absolute", bottom: 8, left: 10, fontSize: 10, color: "#c4603a", fontFamily: "'DM Mono', monospace" }}>
                      {r.city}
                    </div>
                  </HomePhotoCard>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <div style={{ padding: "0 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 20, color: "#f0ebe2" }}>Hot right now</span>
              <button type="button" onClick={() => setTab("discover")} style={{ background: "none", border: "none", color: "#c4603a", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>see all</button>
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 8 }}>
              {hotNow.map(r => (
                <HomePhotoCard
                  key={`${r.id}-${photoCacheVersion}`}
                  r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }}
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
        discoverSearchMode === "restaurants" ? (
        <div style={{ paddingTop: headerHeight }}>
          {/* Tabs row */}
          <div style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${C.border}`, padding:"10px 16px 0", position:"relative" }}>
            <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
            {["Places","People"].map((t) => (
              <button key={t} type="button"
                onClick={() => setDiscoverSearchMode(t === "People" ? "people" : "restaurants")}
                style={{ padding:"12px 24px 11px", borderRadius:0, fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:"1.2px", textTransform:"uppercase", background:"none", border:"none", borderBottom: (t==="People" ? discoverSearchMode==="people" : discoverSearchMode!=="people") ? `2px solid ${C.terracotta}` : `2px solid transparent`, color: (t==="People" ? discoverSearchMode==="people" : discoverSearchMode!=="people") ? C.terracotta : C.muted, cursor:"pointer", marginBottom:"-1px", flexShrink:0, transition:"color 0.15s" }}>
                {t}
              </button>
            ))}
            </div>
            <div style={{ position:"absolute", bottom:0, left:"10%", right:"10%", height:"1px", background:`linear-gradient(to right, transparent, ${C.border} 20%, ${C.border} 80%, transparent)` }} />
            {discoverSearchMode !== "people" && (
              <button type="button" onClick={() => setShowFilterSheet(true)}
                style={{ flexShrink:0, display:"flex", alignItems:"center", gap:5, padding:"6px 12px", border:`1px solid ${venueType !== "all" || secondaryCuisine || filterMood ? C.terracotta : C.border}`, borderRadius:10, background:"transparent", color: venueType !== "all" || secondaryCuisine || filterMood ? C.terracotta : C.muted, fontSize:10, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                Filter {(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0) > 0 ? `(${(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0)})` : ""}
              </button>
            )}
          </div>

          {/* Search + Filter + chips */}
          <div style={{ padding:"10px 16px 8px" }}>
            <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
              <div style={{ flex:1, position:"relative" }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.muted, pointerEvents:"none" }}>🔍</span>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder={discoverSearchMode === "people" ? "Search by username or name..." : "Search by name, neighborhood, vibe..."}
                  style={{ width:"100%", boxSizing:"border-box", padding:"11px 32px 11px 34px", borderRadius:14, border:`1.5px solid ${C.border}`, background:C.bg2, fontSize:14, color:C.text, fontFamily:"Cormorant Garamond,Georgia,serif", fontStyle:"italic", outline:"none" }}
                />
                {searchQuery && <button onClick={() => setSearchQuery("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:16, lineHeight:1, padding:2 }}>×</button>}
              </div>
              {discoverSearchMode !== "people" && (venueType !== "all" || secondaryCuisine || filterMood) && (
                <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start", flexShrink:0 }}>
                  {venueType !== "all" && <button type="button" onClick={() => setVenueType("all")} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:10, border:`1px solid ${C.terracotta}`, background:"transparent", color:C.terracotta, fontSize:10, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>{venueType === "restaurants" ? "Restaurants" : venueType === "bars" ? "Bars" : venueType === "hotels" ? "Hotels" : "Coffee"} ×</button>}
                  {secondaryCuisine && <button type="button" onClick={() => setSecondaryCuisine(null)} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:10, border:`1px solid ${C.terracotta}`, background:"transparent", color:C.terracotta, fontSize:10, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>{secondaryCuisine} ×</button>}
                  {filterMood && <button type="button" onClick={() => setFilterMood(null)} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:10, border:`1px solid ${C.terracotta}`, background:"transparent", color:C.terracotta, fontSize:10, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>{filterMood} ×</button>}
                </div>
              )}
            </div>
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
              {searchQuery ? `"${searchQuery}"` : secondaryCuisine ? `${secondaryCuisine} in ${city}` : venueType !== "all" ? (venueType === "restaurants" ? "Restaurants" : venueType === "bars" ? "Bars & Nightlife" : venueType === "hotels" ? "Hotels" : venueType === "coffee" ? "Coffee & Cafes" : "Hot") + ` in ${city}` : `Hot in ${city}`}
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
          {filteredSorted.map((r, index) => (
            <RestCard
              key={`rest-${r.id}-${photoCacheVersion}-${index}`}
              r={r}
              loved={heatResults.loved.includes(r.id)}
              watched={watchlist.includes(r.id)}
              onLove={() => toggleLove(r.id)}
              onWatch={()=>toggleWatch(r.id)}
              onShare={share}
              onOpenDetail={setDetailRestaurant}
              onPhotoFetched={fetchAndCachePhoto}
              getCachedPhotoForId={getAnyCachedPhotoForId}
              photoCacheVersion={photoCacheVersion}
              usingSupabasePhotoCache={usingSupabasePhotoCache}
            />
          ))}
          {filteredSorted.length === 0 && <div style={{ textAlign:"center", padding:"48px 20px", color:C.muted }}><div style={{ fontSize:40, marginBottom:10 }}>🍽️</div><div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontStyle:"italic" }}>No spots yet for this city.</div></div>}
        </div>
        ) : (
          <div style={{ paddingTop: headerHeight }}>
            {/* Tabs row */}
            <div style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${C.border}`, padding:"10px 16px 0", position:"relative" }}>
              <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
              {["Places","People"].map((t) => (
                <button key={t} type="button"
                  onClick={() => setDiscoverSearchMode(t === "People" ? "people" : "restaurants")}
                  style={{ padding:"12px 24px 11px", borderRadius:0, fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:"1.2px", textTransform:"uppercase", background:"none", border:"none", borderBottom: (t==="People" ? discoverSearchMode==="people" : discoverSearchMode!=="people") ? `2px solid ${C.terracotta}` : `2px solid transparent`, color: (t==="People" ? discoverSearchMode==="people" : discoverSearchMode!=="people") ? C.terracotta : C.muted, cursor:"pointer", marginBottom:"-1px", flexShrink:0, transition:"color 0.15s" }}>
                  {t}
                </button>
              ))}
              </div>
              <div style={{ position:"absolute", bottom:0, left:"10%", right:"10%", height:"1px", background:`linear-gradient(to right, transparent, ${C.border} 20%, ${C.border} 80%, transparent)` }} />
              {discoverSearchMode !== "people" && (
                <button type="button" onClick={() => setShowFilterSheet(true)}
                  style={{ flexShrink:0, display:"flex", alignItems:"center", gap:5, padding:"6px 12px", border:`1px solid ${venueType !== "all" || secondaryCuisine || filterMood ? C.terracotta : C.border}`, borderRadius:10, background:"transparent", color: venueType !== "all" || secondaryCuisine || filterMood ? C.terracotta : C.muted, fontSize:10, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  Filter {(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0) > 0 ? `(${(venueType !== "all" ? 1 : 0) + (secondaryCuisine ? 1 : 0) + (filterMood ? 1 : 0)})` : ""}
                </button>
              )}
            </div>
            <div style={{ padding:"10px 16px 8px" }}>
              <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                <div style={{ flex:1, position:"relative" }}>
                  <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.muted, pointerEvents:"none" }}>🔍</span>
                  <input
                    type="text"
                    value={peopleSearchInput}
                    onChange={(e) => setPeopleSearchInput(e.target.value)}
                    placeholder="Search by username or name..."
                    style={{ width:"100%", boxSizing:"border-box", padding:"11px 32px 11px 34px", borderRadius:14, border:`1.5px solid ${C.border}`, background:C.bg2, fontSize:14, color:C.text, fontFamily:"Cormorant Garamond,Georgia,serif", fontStyle:"italic", outline:"none" }}
                  />
                  {peopleSearchInput ? (
                    <button type="button" onClick={() => setPeopleSearchInput("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:16, lineHeight:1, padding:2 }}>×</button>
                  ) : null}
                </div>
              </div>
            </div>

              {!peopleSearchInput.trim() ? (
                <div style={{ paddingBottom: 24 }}>
                  {/* Suggested for You — friend of friend with taste overlap */}
                  {suggestedFriends.length > 0 && (
                    <div style={{ padding: "8px 16px 0" }}>
                      <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>SUGGESTED FOR YOU</div>
                      {suggestedFriends.map(person => (
                        <div key={person.id} onClick={() => person.id && setViewingUserId(person.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${C.terracotta}`, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                            <span style={{ fontSize: 16, color: C.terracotta, fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold" }}>{(person.name || "?")[0].toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontStyle: "italic", fontSize: 15, color: C.text }}>{person.name || "User"}</div>
                            <div style={{ fontSize: 11, color: C.terracotta, marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{person.sharedCount} restaurant{person.sharedCount !== 1 ? "s" : ""} in common</div>
                            <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>friend of a friend</div>
                          </div>
                          <button type="button" disabled={!user?.id} onClick={async (e) => {
                            e.stopPropagation();
                            if (!user?.id || !person.id) return;
                            await followUser(user.id, person.id);
                            syncFollow(user.id, person.id);
                            supabase.from("notifications").insert({ user_id: person.id, type: "followed_you", from_user_id: user.id, read: false });
                            setSuggestedFriends(prev => prev.filter(p => p.id !== person.id));
                          }} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "none", background: C.terracotta, color: "#fff", fontSize: 12, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", fontWeight: 500 }}>
                            Follow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* People Like You — shared taste */}
                  {peopleLikeYou.length > 0 && (
                    <div style={{ padding: "16px 16px 0" }}>
                      <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>PEOPLE LIKE YOU</div>
                      {peopleLikeYou.map(person => (
                        <div key={person.id} onClick={() => person.id && setViewingUserId(person.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", border: `2px solid ${C.border}`, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                            <span style={{ fontSize: 16, color: C.muted, fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold" }}>{(person.name || "?")[0].toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontStyle: "italic", fontSize: 15, color: C.text }}>{person.name || "User"}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: "'DM Mono',monospace" }}>{person.sharedCount} restaurant{person.sharedCount !== 1 ? "s" : ""} in common</div>
                          </div>
                          <button type="button" disabled={!user?.id} onClick={async (e) => {
                            e.stopPropagation();
                            if (!user?.id || !person.id) return;
                            await followUser(user.id, person.id);
                            syncFollow(user.id, person.id);
                            supabase.from("notifications").insert({ user_id: person.id, type: "followed_you", from_user_id: user.id, read: false });
                            setPeopleLikeYou(prev => prev.filter(p => p.id !== person.id));
                          }} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.terracotta}`, background: "transparent", color: C.terracotta, fontSize: 12, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", fontWeight: 500 }}>
                            Follow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Invite Friends */}
                  <div style={{ padding: "16px 16px 0" }}>
                    <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>INVITE FRIENDS</div>
                    <button type="button" onClick={() => {
                      const url = window.location.origin;
                      if (navigator.share) {
                        navigator.share({ title: "Join me on Cooked", text: "The restaurant app for people who care about where they eat.", url });
                      } else {
                        navigator.clipboard?.writeText(url);
                      }
                    }} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, fontSize: 14, fontFamily: "-apple-system,sans-serif", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
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
                      <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted, padding: "4px 16px 10px" }}>FROM PEOPLE YOU FOLLOW</div>
                      {followingPicksRestaurants.map((r, index) => (
                        <RestCard
                          key={`follow-pick-${r.id}-${photoCacheVersion}-${index}`}
                          r={r}
                          loved={heatResults.loved.includes(r.id)}
                          watched={watchlist.includes(r.id)}
                          onLove={() => toggleLove(r.id)}
                          onWatch={() => toggleWatch(r.id)}
                          onShare={share}
                          onOpenDetail={setDetailRestaurant}
                          onPhotoFetched={fetchAndCachePhoto}
                          getCachedPhotoForId={getAnyCachedPhotoForId}
                          photoCacheVersion={photoCacheVersion}
                          usingSupabasePhotoCache={usingSupabasePhotoCache}
                        />
                      ))}
                    </div>
                  )}

                  {/* Empty state when no suggestions and no following picks */}
                  {suggestedFriends.length === 0 && peopleLikeYou.length === 0 && followingPicksRestaurants.length === 0 && !followingPicksLoading && (
                    <div style={{ textAlign: "center", padding: "32px 24px", color: C.muted, fontSize: 14, fontFamily: "-apple-system,sans-serif" }}>
                      Search for friends above or invite them to join Cooked
                    </div>
                  )}
                </div>
              ) : peopleSearchLoading || peopleSearchInput.trim() !== peopleDebouncedQuery.trim() ? (
                <div style={{ textAlign: "center", padding: "32px 20px", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>Searching…</div>
              ) : peopleSearchResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted, fontSize: 14, fontFamily: "-apple-system,sans-serif" }}>No people found</div>
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
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            overflow: "hidden",
                            flexShrink: 0,
                            border: `2px solid ${C.terracotta}`,
                            background: C.bg3,
                          }}
                        >
                          {row.profile_photo ? (
                            <img src={row.profile_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : null}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontStyle: "italic", fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{uname}</div>
                          <div style={{ fontSize: 11, color: C.dim, fontFamily: "'DM Mono',monospace", marginTop: 3 }}>
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
                            fontFamily: "'DM Mono',monospace",
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
              <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:18, color:C.text }}>Filter</div>
              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <button type="button" onClick={() => { setVenueType("all"); setSecondaryCuisine(null); setFilterMood(null); }} style={{ fontSize:11, color:C.muted, background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Clear all</button>
                <button type="button" onClick={() => setShowFilterSheet(false)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:22, lineHeight:1, padding:0 }}>×</button>
              </div>
            </div>

            <div style={{ padding:"16px 18px 8px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:C.muted, marginBottom:10, fontFamily:"'DM Mono',monospace" }}>Type</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {[{id:"all",label:"All"},{id:"restaurants",label:"Restaurant"},{id:"bars",label:"Bar"},{id:"hotels",label:"Hotel"},{id:"coffee",label:"Coffee"}].map(({id,label}) => (
                  <button key={id} type="button" onClick={() => setVenueType(id)}
                    style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${venueType===id ? C.terracotta : C.border}`, background: venueType===id ? C.terracotta : "transparent", color: venueType===id ? "#fff" : C.muted, fontSize:12, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:"16px 18px 8px", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:C.muted, marginBottom:10, fontFamily:"'DM Mono',monospace" }}>Cuisine</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {(venueType === "bars" ? ["Cocktail Bar","Wine Bar","Dive Bar","Sports Bar","Rooftop Bar","Jazz Bar","Speakeasy","Craft Beer","Sake Bar","Whiskey Bar"] :
                  venueType === "coffee" ? ["Espresso Bar","Third Wave","Bakery Cafe","Specialty Coffee","Cold Brew","Matcha","Tea House"] :
                  venueType === "hotels" ? ["Luxury","Boutique","Resort","Design Hotel","Historic","Budget"] :
                  ["Italian","Japanese","Mexican","American","French","Chinese","Korean","Thai","Indian","Mediterranean","Seafood","Steakhouse","Pizza","Vegan","Middle Eastern","Spanish","Greek","Vietnamese","Turkish"]).map(c => (
                  <button key={c} type="button" onClick={() => setSecondaryCuisine(secondaryCuisine===c ? null : c)}
                    style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${secondaryCuisine===c ? C.terracotta : C.border}`, background: secondaryCuisine===c ? C.terracotta : "transparent", color: secondaryCuisine===c ? "#fff" : C.muted, fontSize:12, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:"16px 18px 8px", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:C.muted, marginBottom:10, fontFamily:"'DM Mono',monospace" }}>Mood</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {["Date Night","Business Dinner","Lunch","Brunch","Late Night","Group Friendly","Casual","Special Occasion","Outdoor","Bar Hopping"].map(m => (
                  <button key={m} type="button" onClick={() => setFilterMood(filterMood===m ? null : m)}
                    style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${filterMood===m ? C.terracotta : C.border}`, background: filterMood===m ? C.terracotta : "transparent", color: filterMood===m ? "#fff" : C.muted, fontSize:12, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:"16px 18px 0" }}>
              <button type="button" onClick={() => setShowFilterSheet(false)} style={{ width:"100%", padding:"14px", background:C.terracotta, border:"none", borderRadius:14, color:"#fff", fontSize:14, fontFamily:"Georgia,serif", fontStyle:"italic", cursor:"pointer" }}>
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
                  <span style={{ fontFamily:"-apple-system,sans-serif", fontSize:12, color:C.muted, marginLeft:2 }}>{heatActive.length}</span>
                </div>
                {(heatResults.loved.length > 0 || heatResults.noped.length > 0 || heatResults.skipped.length > 0) && (
                  <button onClick={() => { setHeatResults(prev => ({ ...prev, noped: [], skipped: [], votes: {} })); setSwipeDir(null); setSwipeDelta({ x: 0, y: 0 }); setIsDragging(false); }} style={{ fontFamily:"-apple-system,sans-serif", fontSize:10, color:C.muted, background:"none", border:`1px solid ${C.border}`, borderRadius:12, padding:"4px 10px", cursor:"pointer" }}>Reset</button>
                )}
              </div>
            </div>
            {/* City filter — compact dropdown */}
            <div style={{ padding:"4px 16px 8px" }}>
              <button
                type="button"
                onClick={() => setHeatCityPickerOpen(o => !o)}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:20, border:`1.5px solid ${C.border}`, background:"transparent", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}
              >
                <span>{heatCity === "All" ? "All Cities" : heatCity}</span>
                <span style={{ fontSize:10, color:C.muted }}>▾</span>
              </button>
              {heatCityPickerOpen && (
                <div style={{ position:"absolute", top:90, left:16, right:16, background:C.bg2, border:`1px solid ${C.border}`, borderRadius:14, zIndex:200, maxHeight:320, overflowY:"auto", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
                  <button type="button" onClick={() => { setHeatCity("All"); setHeatCityPickerOpen(false); }}
                    style={{ display:"block", width:"100%", padding:"10px 16px", textAlign:"left", background: heatCity==="All" ? `${C.terracotta}18` : "transparent", border:"none", borderBottom:`1px solid ${C.border}`, color: heatCity==="All" ? C.terracotta : C.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                    All Cities
                  </button>
                  {getPersonalizedCityRegions(lovedRestaurants, followedCities, heatResults).map(({ region, cities }) => (
                    <div key={region}>
                      <div style={{ padding:"8px 16px 4px", fontSize:8, fontFamily:"'DM Mono',monospace", color:C.terracotta, letterSpacing:"1.8px", textTransform:"uppercase", borderTop:`1px solid ${C.border}` }}>{region}</div>
                      {cities.map(c => (
                        <button key={c} type="button" onClick={() => { setHeatCity(c); setHeatCityPickerOpen(false); }}
                          style={{ display:"block", width:"100%", padding:"8px 16px", textAlign:"left", background: heatCity===c ? `${C.terracotta}18` : "transparent", border:"none", color: heatCity===c ? C.terracotta : C.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                          {c}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
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
                  <button onClick={() => { setHeatResults(prev => ({ ...prev, noped: [], skipped: [], votes: {} })); setSwipeDir(null); setSwipeDelta({ x: 0, y: 0 }); setIsDragging(false); }} style={{ marginTop:8, padding:"12px 28px", borderRadius:12, background:C.terracotta, color:"#fff", border:"none", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Start over</button>
                </div>
              )}

              {/* Next card (behind) */}
              {nextCard && (
                <div style={{ position:"absolute", inset:0, borderRadius:20, overflow:"hidden", transform:"scale(0.95) translateY(8px)", transition:"transform 0.2s", boxShadow:"0 4px 20px rgba(30,18,8,0.12)" }}>
                  <img src={getAnyCachedPhotoForId(nextCard.id) || nextCard.img} alt={nextCard.name} style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top" }} />
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
                  <img src={getAnyCachedPhotoForId(card.id) || card.img} alt={card.name} style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top", pointerEvents:"none" }} />
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
                      onPointerUp={e => { e.stopPropagation(); if (!watchlist.includes(card.id)) toggleWatch(card.id); doSwipe('up'); }}
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
        <>
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:60, zIndex:1, background:C.bg }} />
          <div style={{ position:"fixed", top:0, bottom:60, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, zIndex:2 }}>
            <div ref={mapRef} style={{ width:"100%", height:"100%" }} />
          {selectedRest && (
            <div style={{ position:"absolute", bottom:16, left:16, right:16, background:"#fff9f2", borderRadius:20, overflow:"hidden", boxShadow:"0 8px 40px rgba(30,18,8,0.25)", border:"1px solid #ddd0bc", cursor:"pointer" }} onClick={() => { setDetailRestaurant(selectedRest); setSelectedRest(null); }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRest(null); }} style={{ position:"absolute", top:10, right:10, zIndex:10, width:32, height:32, borderRadius:"50%", border:"none", background:"rgba(30,18,8,0.5)", backdropFilter:"blur(4px)", color:"#fff", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, isolation:"isolate" }}>✕</button>
              <div style={{ position:"relative", height:140, overflow:"hidden" }}>
                <img src={getAnyCachedPhotoForId(selectedRest.id) || selectedRest.img} alt={selectedRest.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
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
        </>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div style={{ paddingTop: headerHeight }}>
          <Profile
            onOpenTasteProfile={() => setShowTasteProfile(true)}
            allRestaurants={allRestaurants}
            heatResults={heatResults}
            watchlist={watchlist}
            onOpenDetail={setDetailRestaurant}
            onFixPhotos={rePickPhotosForAll}
            clerkName={user?.fullName}
            clerkImageUrl={user?.imageUrl}
            onViewUser={setViewingUserId}
            allCitiesFromDb={ALL_CITIES}
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
            {safeLocalStorageGetItem("cooked_profile_photo") ? (
              <img
                src={safeLocalStorageGetItem("cooked_profile_photo") || ""}
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
          <div style={{ width:"100%", maxWidth:480, background:C.bg, borderRadius:"24px 24px 0 0", borderTop:`1px solid ${C.border}`, padding:"28px 24px 44px", maxHeight:"85vh", overflowY:"auto", zIndex:1000000 }} onClick={e=>e.stopPropagation()}>
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
            <div style={{ paddingRight: 18, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 13, lineHeight: 1.5 }}>
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
        <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"min(100vw, 480px)", bottom:0, zIndex:99999, height:"100%", background:"#0e0804", overflow:"hidden" }}>
          <div style={{ height:"100%", overflowY:"auto", paddingBottom:60 }}>

            {/* SECTION 1 — HERO */}
            <div style={{ position:"relative", height:300, flexShrink:0 }}>
              <img src={detailPhoto || detail.img} alt={detail.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={(e) => { e.target.onerror = null; e.target.src = detail.img2 || detail.img; }} />
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(5,3,1,0.08) 0%, rgba(5,3,1,0.15) 25%, rgba(5,3,1,0.72) 60%, rgba(5,3,1,0.97) 100%)" }} />
              {/* top bar */}
              <div style={{ position:"absolute", top:16, left:16, right:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <button type="button" onClick={() => { setDetailRestaurant(null); setSixDegreesResult(null); setSixDegreesTarget(null); setSixDegreesLoading(false); }} style={{ width:30, height:30, minWidth:30, minHeight:30, maxWidth:30, maxHeight:30, borderRadius:"50%", background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.22)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#ffffff", fontSize:16, lineHeight:1, padding:0, boxSizing:"border-box", flexShrink:0, textAlign:"center" }}>‹</button>
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

            {/* Friends have been here — between actions and description */}
            {!friendsBeenHere.loading && friendsBeenHere.list.length > 0 && (
              <button
                type="button"
                onClick={() => setFriendsBeenHereSheetOpen(true)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  background: "#130d06",
                  padding: "12px 18px",
                  border: "none",
                  borderBottom: "1px solid #2e1f0e",
                  cursor: "pointer",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                  {friendsBeenHere.list.slice(0, 3).map((f, i) => (
                    <div
                      key={f.clerkUserId}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        border: "1.5px solid #c4603a",
                        marginLeft: i === 0 ? 0 : -8,
                        overflow: "hidden",
                        background: "#c4603a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        zIndex: 3 - i,
                        position: "relative",
                      }}
                    >
                      {f.profilePhoto ? (
                        <img src={f.profilePhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#f0ebe2",
                            fontFamily: "-apple-system,sans-serif",
                            lineHeight: 1,
                          }}
                        >
                          {(f.profileName || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: C.muted,
                    fontFamily: "-apple-system,sans-serif",
                    flex: 1,
                    textAlign: "right",
                  }}
                >
                  {friendsBeenHere.list.length === 1
                    ? "1 friend has been here"
                    : `${friendsBeenHere.list.length} friends have been here`}
                </div>
              </button>
            )}

            {/* 6 DEGREES — find connection to another restaurant */}
            <div style={{ background: "#130d06", borderBottom: "1px solid #2e1f0e", padding: "12px 18px" }}>
              {!sixDegreesResult && !sixDegreesLoading && !sixDegreesTarget && (
                <button
                  type="button"
                  onClick={() => setSixDegreesTarget(detail)}
                  style={{
                    width: "100%", background: "transparent", border: "1px solid #2e1f0e",
                    borderRadius: 10, padding: "10px 14px", color: "#c4603a", fontSize: 13,
                    fontFamily: "'DM Mono', monospace", cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>&#x1f517;</span>
                  <span>Find a connection to another restaurant</span>
                </button>
              )}
              {sixDegreesTarget && !sixDegreesResult && !sixDegreesLoading && (
                <div>
                  <div style={{ fontSize: 10, color: "#5a3a20", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    6 DEGREES — pick a restaurant
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {allRestaurants
                      .filter(r => String(r.id) !== String(detail.id))
                      .slice(0, 12)
                      .map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSixDegreesLoading(true);
                            getSixDegrees(detail.id, r.id).then(result => {
                              setSixDegreesResult(result);
                              setSixDegreesLoading(false);
                            });
                          }}
                          style={{
                            background: "#1a1208", border: "1px solid #2e1f0e", borderRadius: 8,
                            padding: "6px 10px", color: "#f0ebe2", fontSize: 12, cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {r.name}
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSixDegreesTarget(null)}
                    style={{ background: "none", border: "none", color: "#5a3a20", fontSize: 11, marginTop: 8, cursor: "pointer" }}
                  >
                    cancel
                  </button>
                </div>
              )}
              {sixDegreesLoading && (
                <div style={{ color: "#5a3a20", fontSize: 13, fontFamily: "'DM Mono', monospace", padding: "8px 0" }}>
                  Finding connection...
                </div>
              )}
              {sixDegreesResult && (
                <div>
                  <div style={{ fontSize: 10, color: "#5a3a20", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                    THE CHAIN
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {sixDegreesResult.chain.map((node, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          background: node.type === "restaurant" ? "#c4603a" : "#2e1f0e",
                          color: "#f0ebe2", fontSize: 12, fontWeight: "bold", flexShrink: 0,
                        }}>
                          {node.type === "restaurant" ? "R" : "U"}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: "#f0ebe2", fontFamily: "'DM Sans', sans-serif", fontWeight: node.type === "restaurant" ? "bold" : "normal" }}>
                            {node.name || "Unknown"}
                          </div>
                          <div style={{ fontSize: 10, color: "#5a3a20" }}>
                            {node.type === "restaurant" ? (node.city || "") : "loved both"}
                          </div>
                        </div>
                        {i < sixDegreesResult.chain.length - 1 && (
                          <div style={{ position: "absolute", left: 31, marginTop: 36, width: 1, height: 12, background: "#2e1f0e" }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#c4603a", fontFamily: "'DM Mono', monospace" }}>
                    {Math.floor(sixDegreesResult.pathLength / 2)} degree{Math.floor(sixDegreesResult.pathLength / 2) !== 1 ? "s" : ""} of separation
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSixDegreesResult(null); setSixDegreesTarget(null); }}
                    style={{ background: "none", border: "none", color: "#5a3a20", fontSize: 11, marginTop: 6, cursor: "pointer" }}
                  >
                    try another
                  </button>
                </div>
              )}
              {sixDegreesResult === null && sixDegreesLoading === false && sixDegreesTarget && (
                <div style={{ color: "#5a3a20", fontSize: 12, fontStyle: "italic", marginTop: 4 }}>
                  No connection found yet
                </div>
              )}
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
                hoursVal && { svgPath:<><circle cx="12" cy="12" r="9" stroke="#5a3a20" strokeWidth="1.5" fill="none"/><polyline points="12 7 12 12 15 15" stroke="#5a3a20" strokeWidth="1.5" strokeLinecap="round"/></>, label:"HOURS TODAY", value:hoursVal },
                shortAddr && { svgPath:<><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="#5a3a20" strokeWidth="1.5" fill="none"/><circle cx="12" cy="9" r="2.5" stroke="#5a3a20" strokeWidth="1.5" fill="none"/></>, label:"ADDRESS", value:shortAddr },
                detail.phone && { svgPath:<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6.1 6.1l1.09-1.09a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="#5a3a20" strokeWidth="1.5" fill="none"/></>, label:"PHONE", value:detail.phone, href:`tel:${detail.phone}` },
                hasNonOpenTableWebsite && { svgPath:<><circle cx="12" cy="12" r="9" stroke="#5a3a20" strokeWidth="1.5" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="#5a3a20" strokeWidth="1.5" fill="none" strokeLinecap="round"/></>, label:"WEBSITE", value:websiteDisplay, href:websiteHref, newTab:true },
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
                          ? <a href={row.href} target={row.newTab ? "_blank" : undefined} rel={row.newTab ? "noopener noreferrer" : undefined} style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"#e8e0d4", textDecoration:"none" }}>{row.value}</a>
                          : <div style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:"#e8e0d4" }}>{row.value}</div>
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
                badge = <span style={{ background:"#e8333c", color:"#fff", borderRadius:8, padding:"5px 9px", fontWeight:"bold", fontSize:12, fontFamily:"-apple-system,sans-serif", letterSpacing:"0.05em" }}>OT</span>;
                label = "Book on OpenTable";
              } else if (wl.includes("resy.com")) {
                btnBg = "#E93C51";
                btnBorder = "rgba(0,0,0,0.15)";
                badge = <span style={{ background:"rgba(255,255,255,0.2)", color:"#fff", borderRadius:8, padding:"5px 9px", fontWeight:"bold", fontSize:12, fontFamily:"-apple-system,sans-serif", letterSpacing:"0.05em" }}>Resy</span>;
                label = "Reserve on Resy";
              } else if (wl.includes("tock.com")) {
                btnBg = "#000000";
                btnBorder = "#333";
                badge = <span style={{ background:"#fff", color:"#000", borderRadius:8, padding:"5px 9px", fontWeight:"bold", fontSize:11, fontFamily:"-apple-system,sans-serif", letterSpacing:"0.05em" }}>Tock</span>;
                label = "Reserve on Tock";
                labelColor = "#e8e0d4";
              } else if (wl.includes("sevenrooms.com")) {
                btnBg = "#1a1a1a";
                btnBorder = "#3a3a3a";
                badge = <span style={{ background:"#c9a227", color:"#111", borderRadius:8, padding:"5px 9px", fontWeight:"bold", fontSize:11, fontFamily:"-apple-system,sans-serif", letterSpacing:"0.05em" }}>7R</span>;
                label = "Reserve on SevenRooms";
              } else {
                const otSearchUrl = `https://www.opentable.com/s/?term=${encodeURIComponent(detail.name)}&metroName=${encodeURIComponent(detail.city || '')}&covers=2`;
                badge = <span style={{ background:"#e8333c", color:"#fff", borderRadius:8, padding:"5px 9px", fontWeight:"bold", fontSize:12, fontFamily:"-apple-system,sans-serif", letterSpacing:"0.05em" }}>OT</span>;
                label = "Find on OpenTable";
                btnBg = "#1a0f07";
                btnBorder = "#3a2010";
                labelColor = "#e8e0d4";
                return (
                  <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
                    <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:10, fontFamily:"-apple-system,sans-serif" }}>RESERVATIONS</div>
                    <button type="button" onClick={() => window.open(otSearchUrl, "_blank", "noopener,noreferrer")} style={{ width:"100%", background:btnBg, border:`1px solid ${btnBorder}`, borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        {badge}
                        <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:labelColor }}>{label}</span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a3a20" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                );
              }
              const chevronStroke = wl.includes("resy.com") || wl.includes("tock.com") ? "rgba(255,255,255,0.6)" : "#5a3a20";
              return (
                <div style={{ background:"#130d06", borderBottom:"1px solid #2e1f0e", padding:"14px 18px" }}>
                  <div style={{ fontSize:9, letterSpacing:"0.16em", textTransform:"uppercase", color:"#5a3a20", marginBottom:10, fontFamily:"-apple-system,sans-serif" }}>RESERVATIONS</div>
                  <button type="button" onClick={() => window.open(href, "_blank", "noopener,noreferrer")} style={{ width:"100%", background:btnBg, border:`1px solid ${btnBorder}`, borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      {badge}
                      <span style={{ fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:15, color:labelColor }}>{label}</span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={chevronStroke} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              );
            })()}

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
                      <HomePhotoCard key={`${r.id}-${photoCacheVersion}`} r={{ ...r, img: getAnyCachedPhotoForId(r.id) || r.img }} onClick={() => setDetailRestaurant(r)} style={{ minWidth:150, maxWidth:150, height:160, borderRadius:14, flexShrink:0 }}>
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
        </div>
        {friendsBeenHereSheetOpen && friendsBeenHere.list.length > 0 && (
          <div
            role="presentation"
            onClick={() => setFriendsBeenHereSheetOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100000,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
          >
            <div
              role="dialog"
              aria-label="Friends who have been here"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(100vw, 480px)",
                maxHeight: "50vh",
                overflowY: "auto",
                background: "#0e0804",
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                borderTop: "1px solid #2e1f0e",
                borderLeft: "1px solid #2e1f0e",
                borderRight: "1px solid #2e1f0e",
                padding: "18px 18px max(20px, env(safe-area-inset-bottom))",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "#3d2a18",
                  margin: "0 auto 14px",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#5a3a20",
                  marginBottom: 10,
                  fontFamily: "-apple-system,sans-serif",
                }}
              >
                Friends here
              </div>
              {friendsBeenHere.list.map((f, idx) => (
                <div
                  key={f.clerkUserId}
                  onClick={() => { setFriendsBeenHereSheetOpen(false); setDetailRestaurant(null); setViewingUserId(f.clerkUserId); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: idx === friendsBeenHere.list.length - 1 ? "none" : "1px solid #2e1f0e",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      border: "1.5px solid #c4603a",
                      overflow: "hidden",
                      background: "#c4603a",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {f.profilePhoto ? (
                      <img src={f.profilePhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#f0ebe2",
                          fontFamily: "-apple-system,sans-serif",
                        }}
                      >
                        {(f.profileName || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        color: "#e8e0d4",
                        fontFamily: "-apple-system,sans-serif",
                        marginBottom: f.flameRating != null ? 6 : 0,
                      }}
                    >
                      {f.profileName}
                    </div>
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
      {toast && <div style={{ position:"fixed", top:76, left:"50%", transform:"translateX(-50%)", background:C.terracotta, color:"#fff", borderRadius:20, padding:"10px 20px", fontSize:13, fontWeight:600, zIndex:300, fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(196,96,58,0.4)" }}>Link copied — {toast} 📋</div>}
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
        />
      )}

      <NotificationSheet
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
        notifications={notifList}
        loading={notifLoading}
        onViewUser={(id) => { setNotifSheetOpen(false); setViewingUserId(id); }}
        onViewRestaurant={(r) => { setNotifSheetOpen(false); setDetailRestaurant(r); }}
        allRestaurants={allRestaurants}
        getPhotoForId={getAnyCachedPhotoForId}
      />
    </div>
    </div>
    </SignedIn>
    </>
  );
}
