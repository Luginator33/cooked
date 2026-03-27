import { useState, useRef, useEffect, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { getFollowers, getFollowing, getUserProfile, saveSharedPhoto, saveUserData, saveUserPhotos, supabase } from "../lib/supabase";
import { getCookedScore, getCityReadiness } from "../lib/neo4j";
import AdminPanel from "../components/admin/AdminPanel";

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

const C = {
  bg: "#0f0c09", bg2: "#1a1208", bg3: "#2e1f0e",
  border: "#2e1f0e", border2: "#1e1208",
  text: "#f0ebe2", muted: "#5a3a20", dim: "#3d2a18",
  terracotta: "#c4603a",
};

const FLAME_PATH = "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

function FlameIcon({ size = 14, filled = true, color }) {
  const c = color || (filled ? C.terracotta : C.dim);
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 167 200" fill={filled ? c : "none"} stroke={filled ? "none" : c} strokeWidth={filled ? 0 : 12} strokeLinecap="round">
      <path d={FLAME_PATH} />
    </svg>
  );
}

function EyeIcon({ size = 14, color = C.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

export default function Profile({
  allRestaurants = [],
  heatResults = {},
  watchlist = [],
  onOpenDetail,
  onFixPhotos,
  clerkName,
  clerkImageUrl,
  onViewUser,
  onOpenTasteProfile,
  allCitiesFromDb = [],
  /** Called after a photo is saved to `restaurant_photos` (e.g. admin sync) so Discover can update queue state. */
  onSharedPhotoSaved,
  onOpenIgImport,
}) {
  const { user } = useUser();
  const NOTIFICATION_TYPES = [
    { key: "followed_you", label: "Someone follows you", sublabel: "Get notified when someone follows your profile." },
    { key: "friend_loved_your_watchlist", label: "Friend loved a restaurant you watchlisted", sublabel: "See when friends love places you've saved." },
    { key: "restaurant_trending", label: "A restaurant you loved is trending", sublabel: "Track momentum for your favorite spots." },
    { key: "friend_new_find", label: "Friend added a new Find", sublabel: "Know when friends discover new places." },
    { key: "friend_visited_your_city", label: "Friend visited a city you follow", sublabel: "Stay updated on friend activity in your cities." },
  ];
  const [photo, setPhoto] = useState(() => clerkImageUrl || localStorage.getItem("cooked_profile_photo") || null);
  const [name, setName] = useState(() => clerkName || localStorage.getItem("cooked_profile_name") || "Luga");
  const [username, setUsername] = useState(() => localStorage.getItem("cooked_profile_username") || "@luginator33");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editUsername, setEditUsername] = useState(username);
  const [activeTab, setActiveTab] = useState("loved");
  const [listModal, setListModal] = useState(null);
  const [socialModal, setSocialModal] = useState(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(() =>
    NOTIFICATION_TYPES.reduce((acc, n) => ({ ...acc, [n.key]: true }), {})
  );
  const fileRef = useRef();
  const [photoCache, setPhotoCache] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [photoSyncRunning, setPhotoSyncRunning] = useState(false);
  const [photoSyncCount, setPhotoSyncCount] = useState(0);
  const [photoSyncTotal, setPhotoSyncTotal] = useState(0);
  const [photoSyncMessage, setPhotoSyncMessage] = useState(null);
  const [cookedScore, setCookedScore] = useState(0);
  const [cityReadiness, setCityReadiness] = useState([]);
  const [adminOpen, setAdminOpen] = useState(false);
  // Settings toggles
  const [privateProfile, setPrivateProfile] = useState(() => localStorage.getItem("cooked_private_profile") === "true");
  const [defaultCity, setDefaultCity] = useState(() => localStorage.getItem("cooked_default_city") || "");
  const [dietaryPrefs, setDietaryPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_dietary_prefs") || "[]"); } catch { return []; }
  });
  const [dmPref, setDmPref] = useState(() => localStorage.getItem("cooked_dm_pref") || "followers");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cooked_dark_mode") !== "false");
  const [settingsSection, setSettingsSection] = useState(null); // null=main, 'notifications', 'dietary', 'privacy', 'about', 'defaultCity'

  useEffect(() => {
    if (!clerkName) return;
    setName(clerkName);
    setEditName(clerkName);
  }, [clerkName]);

  // Custom banner (base64 or URL); when set, overrides rotating loved-photo banner
  const [customBanner, setCustomBanner] = useState(() => localStorage.getItem("cooked_banner_photo") || null);
  const bannerFileRef = useRef();

  // Supabase is source of truth for profile_photo / banner_photo; then Clerk image, then localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        if (!cancelled) {
          setPhoto(clerkImageUrl || localStorage.getItem("cooked_profile_photo") || null);
          setCustomBanner(localStorage.getItem("cooked_banner_photo") || null);
        }
        return;
      }
      const { data } = await getUserProfile(user.id);
      if (cancelled) return;
      setIsAdmin(data?.is_admin === true);
      if (data?.profile_photo) {
        setPhoto(data.profile_photo);
        safeSetItem("cooked_profile_photo", data.profile_photo);
      } else {
        const p = clerkImageUrl || localStorage.getItem("cooked_profile_photo") || null;
        setPhoto(p);
      }
      if (data?.banner_photo) {
        setCustomBanner(data.banner_photo);
        safeSetItem("cooked_banner_photo", data.banner_photo);
      } else {
        const b = localStorage.getItem("cooked_banner_photo") || null;
        setCustomBanner(b);
      }

      try {
        const sharedRaw = localStorage.getItem("cooked_shared_photos");
        const sharedMap = sharedRaw ? JSON.parse(sharedRaw) : {};
        const personalPhotos = (data?.photos && typeof data.photos === "object") ? data.photos : {};
        setPhotoCache({ ...sharedMap, ...personalPhotos });
      } catch {
        setPhotoCache({});
      }

      if (data?.finds && Array.isArray(data.finds) && data.finds.length > 0) {
        const supabaseFinds = data.finds || [];
        let localFinds = [];
        try {
          localFinds = JSON.parse(localStorage.getItem("cooked_finds") || "[]");
        } catch {
          localFinds = [];
        }
        const mergedFinds = [...new Set([...supabaseFinds.map(String), ...localFinds.map(String)])];
        setFinds(mergedFinds);
        safeSetItem("cooked_finds", JSON.stringify(mergedFinds));
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, clerkImageUrl]);

  // Rules: heat (flame) OR loved → Loved list; watchlist → Watchlist list; IG imports → Finds list
  const lovedIds = heatResults?.loved || [];
  const lovedRestaurants = useMemo(() => {
    const arr = allRestaurants.filter(r => lovedIds.includes(r.id));
    const seen = new Set();
    return arr.filter(r => seen.has(r.id) ? false : seen.add(r.id));
  }, [allRestaurants, lovedIds]);
  const watchlistRestaurants = useMemo(() => {
    const ids = watchlist || [];
    const arr = allRestaurants.filter(r => ids.includes(r.id));
    const seen = new Set();
    return arr.filter(r => seen.has(r.id) ? false : seen.add(r.id));
  }, [allRestaurants, watchlist]);

  const [finds, setFinds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cooked_finds") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handler = () => {
      try {
        setFinds(JSON.parse(localStorage.getItem("cooked_finds") || "[]"));
      } catch {}
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // When user switches to the Finds tab within the same session, localStorage won't emit a `storage` event.
  // Re-read immediately so the list updates.
  useEffect(() => {
    if (activeTab !== "finds") return;
    try {
      setFinds(JSON.parse(localStorage.getItem("cooked_finds") || "[]"));
    } catch {}
  }, [activeTab]);

  const findsRestaurants = useMemo(() => {
    const idSet = new Set((finds || []).map(String));
    const arr = allRestaurants.filter((r) => idSet.has(String(r.id)));
    const seen = new Set();
    return arr.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [allRestaurants, finds]);

  const cities = useMemo(() => {
    const uniq = [...new Set(lovedRestaurants.map((r) => r.city).filter(Boolean))];
    const order = new Map((allCitiesFromDb || []).map((c, i) => [c, i]));
    return uniq.sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
  }, [lovedRestaurants, allCitiesFromDb]);

  // Banner rotates through loved photos
  const lovedPhotos = lovedRestaurants.map(r => {
    try {
      if (photoCache && Object.keys(photoCache).length > 0) {
        return (
          photoCache?.[r.id] ||
          photoCache?.[String(r.id)] ||
          photoCache?.[Number(r.id)] ||
          r.img
        );
      }
      const cached = JSON.parse(localStorage.getItem("cooked_photos") || "{}");
      return cached[r.id] || r.img;
    } catch { return r.img; }
  }).filter(Boolean);

  useEffect(() => {
    if (customBanner || lovedPhotos.length <= 1) return;
    const timer = setInterval(() => setBannerIdx(i => (i + 1) % lovedPhotos.length), 4000);
    return () => clearInterval(timer);
  }, [customBanner, lovedPhotos.length]);

  const rotatingBanner = lovedPhotos[bannerIdx] || null;
  const currentBanner = customBanner || rotatingBanner;

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const input = e.target;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64DataUrl = ev.target.result;
      setPhoto(base64DataUrl);
      safeSetItem("cooked_profile_photo", base64DataUrl);
      if (user?.id) saveUserData(user.id, { profile_photo: base64DataUrl });
      input.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleBannerUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const input = e.target;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64DataUrl = ev.target.result;
      setCustomBanner(base64DataUrl);
      safeSetItem("cooked_banner_photo", base64DataUrl);
      if (user?.id) saveUserData(user.id, { banner_photo: base64DataUrl });
      input.value = "";
    };
    reader.readAsDataURL(file);
  };

  const saveEdit = () => {
    setName(editName); setUsername(editUsername);
    safeSetItem("cooked_profile_name", editName);
    safeSetItem("cooked_profile_username", editUsername);
    setEditing(false);
    setSettingsOpen(true);
  };

  const syncPhotosToSharedLibrary = async () => {
    if (!user?.id) return;
    let localPhotos = {};
    try {
      localPhotos = JSON.parse(localStorage.getItem("cooked_photos") || "{}");
    } catch {
      localPhotos = {};
    }
    const merged = { ...(localPhotos || {}), ...(photoCache || {}) };
    const entries = Object.entries(merged).filter(([, url]) => !!url);
    const total = entries.length;
    if (total === 0) {
      setPhotoSyncMessage("No photos found.");
      return;
    }

    setPhotoSyncRunning(true);
    setPhotoSyncCount(0);
    setPhotoSyncTotal(total);
    setPhotoSyncMessage(null);

    let synced = 0;
    try {
      for (const [restaurantId, photoUrl] of entries) {
        await saveSharedPhoto(restaurantId, photoUrl);
        onSharedPhotoSaved?.(restaurantId, photoUrl);
        synced += 1;
        if (synced === total || synced % 25 === 0) {
          setPhotoSyncCount(synced);
        }
      }
      setPhotoSyncCount(total);
      setPhotoSyncMessage(`Synced ${total.toLocaleString()} photos to shared library`);
    } catch (e) {
      console.error("syncPhotosToSharedLibrary error:", e);
      setPhotoSyncMessage("Sync failed. Please try again.");
    } finally {
      setPhotoSyncRunning(false);
    }
  };

  const exportBackup = () => {
    const keys = ["cooked_photos","cooked_photo_resolved","cooked_heat","cooked_hidden","cooked_watchlist","cooked_finds","cooked_profile_photo","cooked_banner_photo","cooked_profile_name","cooked_profile_username","cooked_data_version"];
    const backup = {};
    keys.forEach(k => { const v = localStorage.getItem(k); if (v) backup[k] = v; });
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cooked_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          Object.entries(data).forEach(([k, v]) => {
            if (k === "cooked_restaurants") return; // legacy key — never restore (Safari quota)
            safeSetItem(k, v);
          });

          // Restore photos from legacy `cooked_restaurants` without restoring the full array.
          let restoredPhotosCount = 0;
          try {
            const clerkUserId = user?.id;
            const raw = data?.cooked_restaurants;
            const parsedRestaurants = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
            if (Array.isArray(parsedRestaurants) && parsedRestaurants.length > 0) {
              const photos = {};
              parsedRestaurants.forEach((r) => {
                if (r?.id && r?.img && !String(r.img).includes("picsum.photos")) {
                  photos[String(r.id)] = r.img;
                }
              });
              const resolved = Object.keys(photos);
              if (resolved.length > 0) {
                restoredPhotosCount = resolved.length;

                // Push to Supabase first (primary source of truth).
                if (clerkUserId) {
                  await saveUserPhotos(clerkUserId, photos);
                  await saveUserData(clerkUserId, { photo_resolved: resolved });
                }

                // Local fallback for offline/unauthenticated mode.
                safeSetItem("cooked_photos", JSON.stringify(photos));
                safeSetItem("cooked_photo_resolved", JSON.stringify(resolved));
              }
            }
          } catch {
            // Ignore legacy photo extraction failures; other keys were already restored.
          }

          alert(
            restoredPhotosCount > 0
              ? `Restored ${restoredPhotosCount.toLocaleString()} photos. Reloading…`
              : "Backup restored! Reloading…"
          );
          window.location.reload();
        } catch { alert("Invalid backup file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setFollowersCount(0);
      setFollowingCount(0);
      return;
    }
    (async () => {
      const [followersRes, followingRes] = await Promise.all([
        getFollowers(user.id),
        getFollowing(user.id),
      ]);
      if (cancelled) return;
      setFollowersCount(followersRes?.data?.length || 0);
      setFollowingCount(followingRes?.data?.length || 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) { setCookedScore(0); return; }
    getCookedScore(user.id).then((score) => setCookedScore(score));
    getCityReadiness(user.id).then((data) => setCityReadiness(data || []));
  }, [user?.id]);

  const openSocialList = async (kind) => {
    if (!user?.id) return;
    setSocialModal({ title: kind === "followers" ? "Followers" : "Following", users: [], loading: true });
    const res = kind === "followers" ? await getFollowers(user.id) : await getFollowing(user.id);
    const rows = res?.data || [];
    const ids = rows
      .map((row) => (kind === "followers" ? row.follower_id : row.following_id))
      .filter(Boolean);
    const profiles = await Promise.all(ids.map(async (id) => {
      const { data } = await getUserProfile(id);
      return {
        clerk_user_id: id,
        profile_name: data?.profile_name || "User",
        profile_username: data?.profile_username || "",
        profile_photo: data?.profile_photo || null,
      };
    }));
    setSocialModal({ title: kind === "followers" ? "Followers" : "Following", users: profiles, loading: false });
  };

  const openNotifications = async () => {
    setNotificationsOpen(true);
    if (!user?.id) return;
    setNotifLoading(true);
    const defaults = NOTIFICATION_TYPES.reduce((acc, n) => ({ ...acc, [n.key]: true }), {});
    try {
      const { data } = await supabase
        .from("notification_prefs")
        .select("*")
        .eq("clerk_user_id", user.id);
      const merged = { ...defaults };
      (data || []).forEach((row) => {
        if (row?.type) merged[row.type] = row.enabled !== false;
      });
      setNotifPrefs(merged);
    } finally {
      setNotifLoading(false);
    }
  };

  const toggleNotificationPref = async (type) => {
    if (!user?.id) return;
    const nextEnabled = !notifPrefs[type];
    setNotifPrefs((prev) => ({ ...prev, [type]: nextEnabled }));
    const { error } = await supabase
      .from("notification_prefs")
      .upsert(
        { clerk_user_id: user.id, type, enabled: nextEnabled, updated_at: new Date().toISOString() },
        { onConflict: "clerk_user_id,type" }
      );
    if (error) {
      setNotifPrefs((prev) => ({ ...prev, [type]: !nextEnabled }));
    }
  };

  const tabs = [
    { key: "loved", label: "Loved", items: lovedRestaurants },
    { key: "watchlist", label: "Watchlist", items: watchlistRestaurants },
    { key: "finds", label: "Finds", items: findsRestaurants },
  ];
  const activeItems = tabs.find(t => t.key === activeTab)?.items || [];

  const stats = [
    { val: followingCount, label: "FOLLOWING", items: [], title: "Following", onClick: () => openSocialList("following") },
    { val: followersCount, label: "FOLLOWERS", items: [], title: "Followers", onClick: () => openSocialList("followers") },
    { val: cities.length, label: "CITIES", items: cities.map(c => ({ id: c, name: c })), title: "Cities" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 100, color: C.text }}>

      {/* HERO BANNER — full width with gradient fade */}
      <div style={{ position: "relative", height: 260 }}>
        {/* Banner image */}
        {currentBanner ? (
          <img
            src={currentBanner}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #1e1208 0%, #3a1f0d 60%, #2e1008 100%)" }} />
        )}

        {/* Gradient fade to bg at bottom — where content begins */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(15,12,9,0.05) 0%, rgba(15,12,9,0.2) 30%, rgba(15,12,9,0.75) 60%, rgba(15,12,9,1) 100%)",
        }} />

        {/* Settings top-right */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          style={{ position: "absolute", top: 16, right: 16, background: "rgba(15,12,9,0.5)", border: "1px solid rgba(240,235,226,0.15)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.text }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {/* Profile info overlaid at the fade zone */}
        <div style={{ position: "absolute", bottom: 16, left: 18, right: 18, display: "flex", alignItems: "flex-end", gap: 14 }}>
          {/* Avatar — tap to change */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 76, height: 76, borderRadius: "50%",
              border: `2.5px solid ${C.terracotta}`,
              overflow: "hidden", cursor: "pointer", flexShrink: 0,
              background: C.bg2, boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
            }}
          >
            {photo ? (
              <img src={photo} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />

          {/* Name + cities */}
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 26, color: "#fff", lineHeight: 1.05 }}>{name}</div>
            <div style={{ fontSize: 12, color: "rgba(240,235,226,0.65)", marginTop: 4, fontFamily: "-apple-system,sans-serif" }}>
              {cities.slice(0, 3).join(" · ") || ""}
            </div>
          </div>
        </div>
      </div>

      {/* Stats — plain, no card/pill */}
      <div style={{ display: "flex", padding: "16px 18px 0", alignItems: "center" }}>
        <div style={{ display: "flex", flex: 1 }}>
        {stats.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              if (s.onClick) { s.onClick(); return; }
              if (s.items.length > 0) setListModal({ title: s.title, items: s.items });
            }}
            style={{
              flex: 1, background: "none", border: "none",
              borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : "none",
              padding: "0 6px 0", cursor: (s.onClick || s.items.length > 0) ? "pointer" : "default",
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 26, color: C.text, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "-apple-system,sans-serif" }}>{s.label}</div>
          </button>
        ))}
        </div>
        {/* Settings gear — always visible here */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 14px", color: C.muted, flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {user?.id && onOpenTasteProfile ? (
        <div
          style={{
            margin: "12px 18px 0",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "-apple-system,sans-serif", marginBottom: 4 }}>
              Cooked score
            </div>
            <div style={{ fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 28, color: C.terracotta, lineHeight: 1 }}>{cookedScore}</div>
          </div>
          <button
            type="button"
            onClick={() => onOpenTasteProfile()}
            style={{
              flexShrink: 0,
              background: "transparent",
              border: `1px solid ${C.terracotta}`,
              color: C.terracotta,
              borderRadius: 20,
              padding: "8px 14px",
              fontSize: 13,
              fontFamily: "-apple-system,sans-serif",
              cursor: "pointer",
            }}
          >
            View taste profile →
          </button>
        </div>
      ) : null}

      {/* City Readiness */}
      {cityReadiness.length > 0 && (
        <div style={{ padding: "12px 18px 0" }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            City readiness
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            {cityReadiness.map(c => {
              const pct = Math.round((c.pctExplored || 0) * 100);
              const circumference = 2 * Math.PI * 22;
              const offset = circumference - (pct / 100) * circumference;
              return (
                <div key={c.city} style={{ minWidth: 110, maxWidth: 110, flexShrink: 0, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
                  <svg width="52" height="52" viewBox="0 0 52 52" style={{ display: "block", margin: "0 auto 6px" }}>
                    <circle cx="26" cy="26" r="22" fill="none" stroke={C.dim} strokeWidth="4" />
                    <circle cx="26" cy="26" r="22" fill="none" stroke={C.terracotta} strokeWidth="4"
                      strokeDasharray={circumference} strokeDashoffset={offset}
                      strokeLinecap="round" transform="rotate(-90 26 26)" />
                    <text x="26" y="28" textAnchor="middle" fill={C.text} fontSize="13" fontFamily="Georgia,serif" fontWeight="bold">
                      {pct}%
                    </text>
                  </svg>
                  <div style={{ fontSize: 12, color: C.text, fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", marginBottom: 2 }}>
                    {c.city}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted }}>
                    {c.lovedInCity}/{c.totalInCity} spots
                  </div>
                  {c.untriedCuisines.length > 0 && (
                    <div style={{ fontSize: 8, color: C.terracotta, marginTop: 4, lineHeight: 1.3 }}>
                      Try: {c.untriedCuisines.slice(0, 2).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Username */}
      <div style={{ padding: "10px 18px 0", fontSize: 12, color: C.muted, fontFamily: "-apple-system,sans-serif" }}>{username}</div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "16px 18px 0" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "7px 18px", borderRadius: 20,
              border: activeTab === t.key ? "none" : `1px solid ${C.border}`,
              background: activeTab === t.key ? C.terracotta : "transparent",
              color: activeTab === t.key ? "#fff" : C.muted,
              fontSize: 13, fontFamily: "-apple-system,sans-serif",
              cursor: "pointer",
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Section label */}
      {activeItems.length > 0 && (
        <div style={{ padding: "14px 18px 4px", display: "flex", alignItems: "center", gap: 6 }}>
          {activeTab === "watchlist"
            ? <EyeIcon size={11} color={C.muted} />
            : <FlameIcon size={11} filled={activeTab === "loved"} color={activeTab === "loved" ? C.terracotta : C.muted} />
          }
          <span style={{ fontSize: 10, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "-apple-system,sans-serif" }}>
            {activeTab === "loved" ? "LOVED" : activeTab === "watchlist" ? "WATCHLIST" : "FINDS"}
          </span>
        </div>
      )}

      {/* Restaurant list */}
      <div style={{ padding: "4px 18px 0" }}>
        {activeItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 20px", color: C.muted }}>
            <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}>
              {activeTab === "watchlist"
                ? <EyeIcon size={40} color={C.dim} />
                : <FlameIcon size={36} filled={false} color={C.dim} />
              }
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, fontFamily: "-apple-system,sans-serif" }}>
              {activeTab === "loved" ? "Swipe right in Heat to love restaurants" :
               activeTab === "watchlist" ? "Tap Watch on any restaurant to save it here" :
               "Finds come from your Instagram imports"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeItems.map(r => <RestCard key={r.id} r={r} onOpen={onOpenDetail} photoCache={photoCache} />)}
          </div>
        )}
      </div>

      {/* Stats list modal */}
      {listModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setListModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>{listModal.title}</div>
              <button type="button" onClick={() => setListModal(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "8px 18px 24px" }}>
              {listModal.items.map((r, i) => (
                r.cuisine !== undefined ? (
                  <div key={r.id} style={{ marginTop: i === 0 ? 6 : 0, marginBottom: 8 }}>
                    <RestCard r={r} compact onOpen={onOpenDetail} photoCache={photoCache} />
                  </div>
                ) : (
                  <div key={r.id || r.name} style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}`, color: C.text, fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 16 }}>
                    {r.name}
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {socialModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setSocialModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>{socialModal.title}</div>
              <button type="button" onClick={() => setSocialModal(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "8px 18px 24px" }}>
              {socialModal.loading ? (
                <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>Loading…</div>
              ) : (
                socialModal.users.map((u) => (
                  <button
                    key={u.clerk_user_id}
                    type="button"
                    onClick={() => {
                      setSocialModal(null);
                      onViewUser?.(u.clerk_user_id);
                    }}
                    style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, padding: "12px 0", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg3, flexShrink: 0 }}>
                      {u.profile_photo ? <img src={u.profile_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 14, fontFamily: "-apple-system,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.profile_name}</div>
                      <div style={{ color: C.muted, fontSize: 12, fontFamily: "-apple-system,sans-serif" }}>{u.profile_username}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && (() => {
        const SectionLabel = ({ children }) => (
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 6, marginTop: 16, fontFamily: "-apple-system,sans-serif" }}>{children}</div>
        );
        const Row = ({ label, sub, onClick, right, danger }) => (
          <button type="button" onClick={onClick}
            style={{ width: "100%", padding: "13px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: danger ? "#e74c3c" : C.text, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", textAlign: "left", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div>{label}</div>
              {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
            </div>
            {right || <span style={{ color: C.muted, fontSize: 16 }}>›</span>}
          </button>
        );
        const Toggle = ({ label, sub, value, onChange }) => (
          <div style={{ width: "100%", padding: "13px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontFamily: "-apple-system,sans-serif" }}>{label}</div>
              {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: "-apple-system,sans-serif" }}>{sub}</div>}
            </div>
            <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? C.terracotta : C.border, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: value ? 22 : 2, transition: "left 0.2s" }} />
            </div>
          </div>
        );
        const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Gluten-Free", "Halal", "Kosher", "Dairy-Free", "Nut-Free", "Pescatarian"];
        const DM_OPTIONS = [{ value: "everyone", label: "Everyone" }, { value: "followers", label: "Followers only" }, { value: "nobody", label: "Nobody" }];

        const savePref = (key, val) => { try { localStorage.setItem(key, typeof val === "object" ? JSON.stringify(val) : String(val)); } catch {} };

        // Sub-screens
        if (settingsSection === "notifications") return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => { setSettingsSection(null); }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <button type="button" onClick={() => setSettingsSection(null)} style={{ background: "none", border: "none", color: C.terracotta, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", padding: "0 8px 0 0" }}>‹ Back</button>
                <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>Notifications</div>
              </div>
              {NOTIFICATION_TYPES.map(n => (
                <Toggle key={n.key} label={n.label} sub={n.sublabel} value={notifPrefs[n.key] !== false} onChange={v => {
                  const updated = { ...notifPrefs, [n.key]: v };
                  setNotifPrefs(updated);
                  if (user?.id) supabase.from("notification_prefs").upsert({ clerk_user_id: user.id, ...updated }, { onConflict: "clerk_user_id" });
                }} />
              ))}
            </div>
          </div>
        );

        if (settingsSection === "dietary") return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setSettingsSection(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <button type="button" onClick={() => setSettingsSection(null)} style={{ background: "none", border: "none", color: C.terracotta, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", padding: "0 8px 0 0" }}>‹ Back</button>
                <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>Dietary Preferences</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, fontFamily: "-apple-system,sans-serif" }}>These help the chatbot and recommendations filter for you.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DIETARY_OPTIONS.map(d => {
                  const active = dietaryPrefs.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => {
                      const updated = active ? dietaryPrefs.filter(x => x !== d) : [...dietaryPrefs, d];
                      setDietaryPrefs(updated);
                      savePref("cooked_dietary_prefs", updated);
                    }} style={{ padding: "8px 16px", borderRadius: 20, border: `1px solid ${active ? C.terracotta : C.border}`, background: active ? C.terracotta + "22" : C.bg, color: active ? C.terracotta : C.text, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif" }}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

        if (settingsSection === "about") return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setSettingsSection(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <button type="button" onClick={() => setSettingsSection(null)} style={{ background: "none", border: "none", color: C.terracotta, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", padding: "0 8px 0 0" }}>‹ Back</button>
                <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>About</div>
              </div>
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 28, color: C.text }}>cook<span style={{ color: C.terracotta }}>ed</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: "-apple-system,sans-serif" }}>Your personal concierge</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 12, fontFamily: "-apple-system,sans-serif" }}>Version 1.0.0</div>
              </div>
              <Row label="What's New" sub="See recent updates" onClick={() => { /* TODO: changelog */ }} />
              <Row label="Help & Feedback" sub="Report a bug or request a feature" onClick={() => window.open("mailto:support@getcooked.app", "_blank")} />
              <Row label="Privacy Policy" onClick={() => { /* TODO: link */ }} />
              <Row label="Terms of Service" onClick={() => { /* TODO: link */ }} />
              <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.muted, fontFamily: "-apple-system,sans-serif" }}>Made with ♡ in Los Angeles</div>
            </div>
          </div>
        );

        if (settingsSection === "defaultCity") {
          const allCities = allCitiesFromDb.length ? allCitiesFromDb : [];
          // Also pull from restaurant data
          const citiesFromData = [...new Set(allRestaurants.map(r => r.city).filter(Boolean))].sort();
          const cities = [...new Set([...allCities, ...citiesFromData])].sort();
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setSettingsSection(null)}>
              <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px", maxHeight: "80vh", overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                  <button type="button" onClick={() => setSettingsSection(null)} style={{ background: "none", border: "none", color: C.terracotta, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", padding: "0 8px 0 0" }}>‹ Back</button>
                  <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>Default City</div>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, fontFamily: "-apple-system,sans-serif" }}>Choose your default city. This is what loads when you open the app.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {cities.map(city => {
                    const isDefault = defaultCity === city;
                    return (
                      <button key={city} type="button" onClick={() => {
                        setDefaultCity(city);
                        savePref("cooked_default_city", city);
                      }} style={{
                        padding: "10px 18px", borderRadius: 24,
                        border: `1.5px solid ${isDefault ? C.terracotta : C.border}`,
                        background: isDefault ? C.terracotta + "22" : C.bg,
                        color: isDefault ? C.terracotta : C.text,
                        fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif",
                        fontWeight: isDefault ? 600 : 400,
                      }}>
                        {city} {isDefault && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }

        // Main settings screen
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => { setSettingsOpen(false); setSettingsSection(null); }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px", maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 4 }}>Settings</div>

              {/* ACCOUNT */}
              <SectionLabel>Account</SectionLabel>
              <Row label="Edit Profile" sub="Name, username, photo" onClick={() => { setSettingsOpen(false); setSettingsSection(null); setEditing(true); setEditName(name); setEditUsername(username); }} />
              <Row label="Change Banner Photo" onClick={() => { bannerFileRef.current?.click(); }} />
              <input ref={bannerFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBannerUpload} />
              <Row label="Share Profile Link" sub="Copy link to your profile" onClick={() => {
                const link = `${window.location.origin}?user=${user?.id || ""}`;
                navigator.clipboard?.writeText(link);
                alert("Profile link copied!");
              }} right={<span style={{ fontSize: 12, color: C.muted }}>Copy</span>} />

              {/* PREFERENCES */}
              <SectionLabel>Preferences</SectionLabel>
              <Row label="Default City" sub={defaultCity || "Not set"} onClick={() => setSettingsSection("defaultCity")} right={<span style={{ fontSize: 12, color: C.muted }}>{defaultCity || "Set"}</span>} />
              <Row label="Dietary Preferences" sub={dietaryPrefs.length ? dietaryPrefs.join(", ") : "None set"} onClick={(e) => { e.stopPropagation(); setSettingsSection("dietary"); }} />
              <Row label="Notification Preferences" onClick={(e) => { e.stopPropagation(); setSettingsSection("notifications"); }} />
              <Toggle label="Private Profile" sub="Only followers can see your loved & watchlist" value={privateProfile} onChange={v => { setPrivateProfile(v); savePref("cooked_private_profile", v); }} />

              {/* SOCIAL */}
              <SectionLabel>Social</SectionLabel>
              <div style={{ width: "100%", padding: "13px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 6 }}>
                <div style={{ color: C.text, fontSize: 14, fontFamily: "-apple-system,sans-serif", marginBottom: 8 }}>Who can DM me</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ value: "everyone", label: "Everyone" }, { value: "followers", label: "Followers" }, { value: "nobody", label: "Nobody" }].map(o => (
                    <button key={o.value} type="button" onClick={() => { setDmPref(o.value); savePref("cooked_dm_pref", o.value); }}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${dmPref === o.value ? C.terracotta : C.border}`, background: dmPref === o.value ? C.terracotta + "22" : "transparent", color: dmPref === o.value ? C.terracotta : C.muted, fontSize: 12, cursor: "pointer", fontFamily: "-apple-system,sans-serif" }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <Row label="Blocked Users" sub="Manage blocked accounts" onClick={() => { /* TODO: blocked list */ }} />

              {/* DISCOVERY */}
              <SectionLabel>Discovery</SectionLabel>
              <Row label="Hidden Restaurants" sub="Restaurants you've permanently passed" onClick={() => { /* TODO */ }} />
              <Row label="Reset Heat Deck" sub="Start swiping fresh for a city" onClick={() => {
                if (confirm("Reset your Heat deck? You'll see all restaurants again.")) {
                  localStorage.removeItem("cooked_heat_results");
                  alert("Heat deck reset! Reload to see changes.");
                }
              }} />

              {/* IMPORT */}
              <SectionLabel>Import</SectionLabel>
              {onOpenIgImport && <Row label="Import from Instagram" sub="Add restaurants from IG screenshots" onClick={() => { setSettingsOpen(false); setSettingsSection(null); onOpenIgImport(); }} />}

              {/* DATA */}
              <SectionLabel>Data</SectionLabel>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <button type="button" onClick={() => { exportBackup(); }}
                  style={{ flex: 1, padding: "12px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif" }}>
                  Export Backup
                </button>
                <button type="button" onClick={() => { importBackup(); }}
                  style={{ flex: 1, padding: "12px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif" }}>
                  Import Backup
                </button>
              </div>
              <Row label="Download My Data" sub="Export all your activity as JSON" onClick={() => {
                const data = {
                  profile: { name, username, photo },
                  heatResults,
                  watchlist,
                  lovedRestaurants: Object.entries(heatResults).filter(([,v]) => v === "loved").map(([id]) => id),
                  finds: JSON.parse(localStorage.getItem("cooked_finds") || "[]"),
                  exportedAt: new Date().toISOString(),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cooked_my_data_${new Date().toISOString().slice(0,10)}.json`; a.click();
              }} />
              <Row label="Clear Cache" sub="Wipe local data without losing your account" onClick={() => {
                if (confirm("Clear all cached data? Your account and cloud data are safe.")) {
                  const keysToKeep = ["cooked_onboarding_done", "cooked_profile_setup_done"];
                  const saved = {};
                  keysToKeep.forEach(k => { saved[k] = localStorage.getItem(k); });
                  localStorage.clear();
                  Object.entries(saved).forEach(([k, v]) => { if (v) localStorage.setItem(k, v); });
                  alert("Cache cleared. Reloading...");
                  window.location.reload();
                }
              }} />

              {/* ABOUT */}
              <SectionLabel>About</SectionLabel>
              <Row label="About Cooked" sub="Version, help, legal" onClick={() => setSettingsSection("about")} />
              <Row label="Replay Onboarding" sub="See the intro walkthrough again" onClick={() => {
                localStorage.removeItem("cooked_onboarding_done");
                localStorage.removeItem("cooked_last_tab");
                window.location.reload();
              }} />

              {/* ADMIN */}
              {isAdmin && (
                <>
                  <SectionLabel>Admin</SectionLabel>
                  {onFixPhotos && (
                    <Row label="Fix Restaurant Photos" sub="Re-pick photos from Google Places" onClick={() => { setSettingsOpen(false); setSettingsSection(null); onFixPhotos(); }} />
                  )}
                  <Row label="Sync Photos to Library" sub={photoSyncRunning ? `Syncing... ${photoSyncCount}/${photoSyncTotal}` : (photoSyncMessage || "Push local photos to shared library")} onClick={syncPhotosToSharedLibrary} />
                  <button type="button" onClick={() => { setSettingsOpen(false); setSettingsSection(null); setAdminOpen(true); }}
                    style={{ width: "100%", padding: "14px 16px", background: C.terracotta, border: "none", borderRadius: 12, color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", textAlign: "center", marginBottom: 6, fontWeight: 600 }}>
                    Open Admin Panel
                  </button>
                </>
              )}

              {/* SIGN OUT */}
              <div style={{ marginTop: 16 }} />
              <Row label="Sign Out" danger onClick={() => {
                if (confirm("Sign out of Cooked?")) {
                  window.Clerk?.signOut?.();
                  localStorage.removeItem("cooked_profile_setup_done");
                  window.location.reload();
                }
              }} right={<span style={{ color: "#e74c3c", fontSize: 16 }}>›</span>} />

              <button type="button" onClick={() => { setSettingsOpen(false); setSettingsSection(null); }}
                style={{ width: "100%", padding: 14, background: "transparent", border: "none", borderRadius: 12, color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif", marginTop: 8 }}>
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* Admin Panel */}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} allRestaurants={allRestaurants} userId={user?.id} />}

      {/* Edit profile modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => { setEditing(false); setSettingsOpen(true); }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
              <button type="button" onClick={() => { setEditing(false); setSettingsOpen(true); }} style={{ background: "none", border: "none", color: C.terracotta, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", padding: "0 8px 0 0" }}>‹ Back</button>
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.text }}>Edit Profile</div>
            </div>
            {/* Profile photo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div onClick={() => fileRef.current?.click()} style={{ position: "relative", cursor: "pointer" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden", border: `2px solid ${C.border}`, background: C.bg }}>
                  {photo ? <img src={photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 28 }}>👤</div>}
                </div>
                <div style={{ position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: "50%", background: C.terracotta, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff" }}>✎</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const file = e.target.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                  const url = ev.target.result;
                  setPhoto(url);
                  safeSetItem("cooked_profile_photo", url);
                  if (user?.id) supabase.from("user_data").upsert({ clerk_user_id: user.id, profile_photo: url }, { onConflict: "clerk_user_id" });
                };
                reader.readAsDataURL(file);
              }} />
            </div>
            {[{ label: "Name", val: editName, set: setEditName }, { label: "Username", val: editUsername, set: setEditUsername }].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.14em", color: C.muted, marginBottom: 6, textTransform: "uppercase", fontFamily: "-apple-system,sans-serif" }}>{f.label}</div>
                <input value={f.val} onChange={e => f.set(e.target.value)}
                  style={{ width: "100%", padding: "11px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "-apple-system,sans-serif" }} />
              </div>
            ))}
            <button type="button" onClick={saveEdit}
              style={{ width: "100%", padding: 14, background: C.terracotta, border: "none", borderRadius: 12, color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "Georgia,serif", fontStyle: "italic", marginTop: 6 }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RestCard({ r, compact, onOpen, photoCache }) {
  const [imgSrc, setImgSrc] = useState(
    (photoCache && (photoCache[r.id] || photoCache[String(r.id)])) || r.img
  );
  useEffect(() => {
    const fromCache = photoCache && (photoCache[r.id] || photoCache[String(r.id)]);
    if (fromCache) { setImgSrc(fromCache); return; }
    try { const cached = JSON.parse(localStorage.getItem("cooked_photos") || "{}"); if (cached[r.id]) setImgSrc(cached[r.id]); } catch {}
  }, [r.id, photoCache]);

  const flameCount = Math.round((r.rating || 0) / 2);

  return (
    <div
      onClick={() => onOpen && onOpen(r)}
      style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: compact ? "8px 12px" : "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: onOpen ? "pointer" : "default" }}
    >
      <div style={{ width: compact ? 42 : 54, height: compact ? 42 : 54, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#221508" }}>
        {imgSrc && <img src={imgSrc} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgSrc(null)} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: compact ? 15 : 17, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: "0.04em", fontFamily: "-apple-system,sans-serif" }}>
          {[r.cuisine, r.neighborhood].filter(Boolean).join(" · ")}
        </div>
        {!compact && (
          <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
            {[1,2,3,4,5].map(n => <FlameIcon key={n} size={12} filled={n <= flameCount} color={n <= flameCount ? C.terracotta : C.dim} />)}
          </div>
        )}
      </div>
    </div>
  );
}
