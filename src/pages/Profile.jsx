import { useState, useRef, useEffect, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { getFollowers, getFollowing, getUserProfile, saveUserData, saveUserPhotos, supabase } from "../lib/supabase";

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

export default function Profile({ allRestaurants = [], heatResults = {}, watchlist = [], onOpenDetail, onFixPhotos, clerkName, clerkImageUrl, onViewUser }) {
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

      // Prefer Supabase photos (Discover uses Supabase as the photo cache source of truth).
      if (data?.photos && typeof data.photos === "object" && Object.keys(data.photos).length > 0) {
        setPhotoCache(data.photos);
      } else {
        setPhotoCache({});
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

  const [findsIds, setFindsIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_finds") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    const handler = () => {
      try { setFindsIds(JSON.parse(localStorage.getItem("cooked_finds") || "[]")); } catch {}
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // When user switches to the Finds tab within the same session, localStorage won't emit a `storage` event.
  // Re-read immediately so the list updates.
  useEffect(() => {
    if (activeTab !== "finds") return;
    try { setFindsIds(JSON.parse(localStorage.getItem("cooked_finds") || "[]")); } catch {}
  }, [activeTab]);

  const findsRestaurants = useMemo(() => {
    const ids = new Set((findsIds || []).map(id => Number(id)));
    const arr = allRestaurants.filter(r => ids.has(Number(r.id)));
    const seen = new Set();
    return arr.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [allRestaurants, findsIds]);

  const cities = [...new Set(lovedRestaurants.map(r => r.city).filter(Boolean))];

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
    { val: cities.length || 12, label: "CITIES", items: cities.map(c => ({ id: c, name: c })), title: "Cities" },
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
              {cities.slice(0, 3).join(" · ") || "Los Angeles · New York"}
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
            {activeItems.map(r => <RestCard key={r.id} r={r} onOpen={onOpenDetail} />)}
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
                    <RestCard r={r} compact onOpen={onOpenDetail} />
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
      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setSettingsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px" }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 20 }}>Settings</div>

            {/* Edit profile */}
            <button type="button" onClick={() => { setSettingsOpen(false); setEditing(true); setEditName(name); setEditUsername(username); }}
              style={{ width: "100%", padding: "14px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", textAlign: "left", marginBottom: 10 }}>
              Edit Profile
            </button>

            <button type="button" onClick={() => { bannerFileRef.current?.click(); }}
              style={{ width: "100%", padding: "14px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", textAlign: "left", marginBottom: 10 }}>
              Change banner photo
            </button>
            <input ref={bannerFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBannerUpload} />

            {/* Fix photos */}
            {onFixPhotos && (
              <button type="button" onClick={() => { setSettingsOpen(false); onFixPhotos(); }}
                style={{ width: "100%", padding: "14px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", textAlign: "left", marginBottom: 10 }}>
                🖼 Fix Photos
              </button>
            )}

            <button
              type="button"
              onClick={openNotifications}
              style={{ width: "100%", padding: "14px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 14, cursor: "pointer", fontFamily: "-apple-system,sans-serif", textAlign: "left", marginBottom: 10 }}
            >
              Notification Preferences
            </button>

            {/* Backup */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button type="button" onClick={() => { exportBackup(); setSettingsOpen(false); }}
                style={{ flex: 1, padding: "12px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "-apple-system,sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ↓ Export Backup
              </button>
              <button type="button" onClick={() => { importBackup(); setSettingsOpen(false); }}
                style={{ flex: 1, padding: "12px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "-apple-system,sans-serif", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                ↑ Import Backup
              </button>
            </div>

            <button type="button" onClick={() => setSettingsOpen(false)}
              style={{ width: "100%", padding: 14, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "flex-end" }} onClick={() => setNotificationsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px", maxHeight: "78vh", overflowY: "auto" }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 14 }}>Notification Preferences</div>
            {notifLoading ? (
              <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>Loading…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {NOTIFICATION_TYPES.map((pref) => {
                  const enabled = notifPrefs[pref.key] !== false;
                  return (
                    <div key={pref.key} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 14, fontFamily: "-apple-system,sans-serif", marginBottom: 2 }}>{pref.label}</div>
                        <div style={{ color: C.muted, fontSize: 12, fontFamily: "-apple-system,sans-serif" }}>{pref.sublabel}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotificationPref(pref.key)}
                        style={{
                          width: 44,
                          height: 24,
                          borderRadius: 999,
                          border: `1px solid ${enabled ? C.terracotta : C.dim}`,
                          background: enabled ? C.terracotta : C.dim,
                          cursor: "pointer",
                          padding: 2,
                          display: "flex",
                          justifyContent: enabled ? "flex-end" : "flex-start",
                          alignItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", display: "block" }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" onClick={() => setNotificationsOpen(false)} style={{ width: "100%", padding: 14, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "-apple-system,sans-serif", marginTop: 14 }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Edit profile modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 999, display: "flex", alignItems: "flex-end" }} onClick={() => setEditing(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: C.bg2, borderRadius: "20px 20px 0 0", padding: "24px 18px 44px" }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 20 }}>Edit Profile</div>
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

function RestCard({ r, compact, onOpen }) {
  const [imgSrc, setImgSrc] = useState(r.img);
  useEffect(() => {
    try { const cached = JSON.parse(localStorage.getItem("cooked_photos") || "{}"); if (cached[r.id]) setImgSrc(cached[r.id]); } catch {}
  }, [r.id]);

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
