import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/clerk-react";
import { RESTAURANTS } from "../data/restaurants";
import {
  followUser,
  getFollowedCities,
  getFollowers,
  getFollowing,
  getUserProfile,
  isFollowing,
  supabase,
  unfollowUser,
} from "../lib/supabase";
import { syncFollow, removeFollow, getOverlapRestaurants } from "../lib/neo4j";

const C = {
  bg: "#0a0a0f",
  bg2: "#12121a",
  bg3: "#1a1a24",
  border: "rgba(255,255,255,0.04)",
  border2: "rgba(255,255,255,0.06)",
  text: "#f5f0eb",
  muted: "rgba(245,240,235,0.3)",
  dim: "rgba(245,240,235,0.18)",
  terracotta: "#ff9632",
  terra2: "#e07850",
  rose: "#c44060",
  cream: "#f5f0eb",
};

const FLAME_PATH = "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

let _uFlameId = 0;
function FlameIcon({ size = 12, filled = true }) {
  const id = useMemo(() => `ufg${_uFlameId++}`, []);
  if (!filled) {
    return (
      <svg width={size} height={size * 1.2} viewBox="0 0 167 200" fill="none" stroke={C.dim} strokeWidth={12} strokeLinecap="round">
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
}

function RestCard({ r, onOpen }) {
  const [imgSrc, setImgSrc] = useState(() => {
    try {
      const cache = JSON.parse(localStorage.getItem("cooked_shared_photos") || "{}");
      return cache[r.id] || cache[String(r.id)] || r.img;
    } catch { return r.img; }
  });
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const cache = JSON.parse(localStorage.getItem("cooked_shared_photos") || "{}");
        const found = cache[r.id] || cache[String(r.id)];
        if (found && found !== imgSrc) { setImgSrc(found); clearInterval(interval); }
      } catch {}
    }, 500);
    setTimeout(() => clearInterval(interval), 5000);
    return () => clearInterval(interval);
  }, [r.id]);

  const flameCount = Math.round((r.rating || 0) / 2);
  return (
    <div
      onClick={() => onOpen && onOpen(r)}
      style={{
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      <div style={{ width: 54, height: 54, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#221508" }}>
        {imgSrc ? <img src={imgSrc} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 17, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: "0.04em", fontFamily: "'Inter', -apple-system, sans-serif" }}>
          {[r.cuisine, r.neighborhood].filter(Boolean).join(" · ")}
        </div>
        <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <FlameIcon key={n} size={12} filled={n <= flameCount} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UserProfile({ clerkUserId, onClose, onOpenDetail, onViewUser, onMessage }) {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // Push a history entry so browser back / mobile swipe-back closes this profile
  useEffect(() => {
    window.history.pushState({ userProfile: clerkUserId }, "");
    const handlePop = (e) => {
      onClose?.();
    };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
  }, [clerkUserId, onClose]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [activeTab, setActiveTab] = useState("loved");
  const [pendingFollow, setPendingFollow] = useState(false);
  const [showFollowersSheet, setShowFollowersSheet] = useState(false);
  const [showFollowingSheet, setShowFollowingSheet] = useState(false);
  const [showCitiesSheet, setShowCitiesSheet] = useState(false);
  const [followersSheetUsers, setFollowersSheetUsers] = useState([]);
  const [followingSheetUsers, setFollowingSheetUsers] = useState([]);
  const [citiesSheetList, setCitiesSheetList] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [followedCitiesCount, setFollowedCitiesCount] = useState(0);
  const [overlapRestaurants, setOverlapRestaurants] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!clerkUserId) return;
    (async () => {
      setLoading(true);
      const [{ data: userData }, followersRes, followingRes, followedCitiesRes] = await Promise.all([
        getUserProfile(clerkUserId),
        getFollowers(clerkUserId),
        getFollowing(clerkUserId),
        getFollowedCities(clerkUserId),
      ]);
      if (cancelled) return;
      setProfile(userData || null);
      setFollowersCount(followersRes?.data?.length || 0);
      setFollowingCount(followingRes?.data?.length || 0);
      const fcRows = followedCitiesRes?.data || [];
      setFollowedCitiesCount(fcRows.length);
      setCitiesSheetList(fcRows.map((r) => r?.city).filter(Boolean));
      if (user?.id && user.id !== clerkUserId) {
        const followState = await isFollowing(user.id, clerkUserId);
        if (!cancelled) setIsFollowingUser(!!followState?.isFollowing);
        getOverlapRestaurants(user.id, clerkUserId).then(results => {
          if (!cancelled) {
            const matched = results
              .map(r => {
                const full = RESTAURANTS.find(ar => String(ar.id) === String(r.id));
                return full || null;
              })
              .filter(Boolean);
            setOverlapRestaurants(matched);
          }
        });
      } else {
        setIsFollowingUser(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkUserId, user?.id]);

  const lovedIds = profile?.loved || profile?.heat?.loved || [];
  const watchlistIds = profile?.watchlist || [];
  const findsIds = profile?.finds || [];
  const isPrivate = !!profile?.is_private;
  const canViewContent = !isPrivate || isFollowingUser || user?.id === clerkUserId;

  const lovedRestaurants = useMemo(() => {
    const set = new Set((lovedIds || []).map((id) => Number(id)));
    return RESTAURANTS.filter((r) => set.has(Number(r.id)));
  }, [lovedIds]);
  const watchlistRestaurants = useMemo(() => {
    const set = new Set((watchlistIds || []).map((id) => Number(id)));
    return RESTAURANTS.filter((r) => set.has(Number(r.id)));
  }, [watchlistIds]);
  const findsRestaurants = useMemo(() => {
    const set = new Set((findsIds || []).map((id) => Number(id)));
    return RESTAURANTS.filter((r) => set.has(Number(r.id)));
  }, [findsIds]);

  const cities = useMemo(() => [...new Set(lovedRestaurants.map((r) => r.city).filter(Boolean))], [lovedRestaurants]);

  useEffect(() => {
    if (!showFollowersSheet || !clerkUserId) return;
    let cancelled = false;
    setSheetLoading(true);
    setFollowersSheetUsers([]);
    (async () => {
      try {
        const res = await getFollowers(clerkUserId);
        const rows = res?.data || [];
        const ids = rows.map((row) => row.follower_id).filter(Boolean);
        const profiles = await Promise.all(
          ids.map(async (id) => {
            const { data } = await getUserProfile(id);
            return {
              clerk_user_id: id,
              profile_name: (data?.profile_name && data.profile_name !== "User") ? data.profile_name : (data?.profile_username || "New Member"),
              profile_username: data?.profile_username || "",
              profile_photo: data?.profile_photo || null,
            };
          })
        );
        if (!cancelled) setFollowersSheetUsers(profiles);
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showFollowersSheet, clerkUserId]);

  useEffect(() => {
    if (!showFollowingSheet || !clerkUserId) return;
    let cancelled = false;
    setSheetLoading(true);
    setFollowingSheetUsers([]);
    (async () => {
      try {
        const res = await getFollowing(clerkUserId);
        const rows = res?.data || [];
        const ids = rows.map((row) => row.following_id).filter(Boolean);
        const profiles = await Promise.all(
          ids.map(async (id) => {
            const { data } = await getUserProfile(id);
            return {
              clerk_user_id: id,
              profile_name: (data?.profile_name && data.profile_name !== "User") ? data.profile_name : (data?.profile_username || "New Member"),
              profile_username: data?.profile_username || "",
              profile_photo: data?.profile_photo || null,
            };
          })
        );
        if (!cancelled) setFollowingSheetUsers(profiles);
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showFollowingSheet, clerkUserId]);

  useEffect(() => {
    if (!showCitiesSheet || !clerkUserId) return;
    let cancelled = false;
    setSheetLoading(true);
    (async () => {
      try {
        const { data } = await getFollowedCities(clerkUserId);
        const names = (data || []).map((r) => r?.city).filter(Boolean);
        if (!cancelled) setCitiesSheetList(names);
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCitiesSheet, clerkUserId]);

  const closeSocialSheets = () => {
    setShowFollowersSheet(false);
    setShowFollowingSheet(false);
    setShowCitiesSheet(false);
  };

  const tabs = [
    { key: "loved", label: "Loved", items: lovedRestaurants },
    { key: "watchlist", label: "Watchlist", items: watchlistRestaurants },
    { key: "finds", label: "Finds", items: findsRestaurants },
  ];
  const activeItems = tabs.find((t) => t.key === activeTab)?.items || [];

  const doToggleFollow = async () => {
    if (!user?.id || !clerkUserId || user.id === clerkUserId || pendingFollow) return;
    const currentUserClerkId = user.id;
    const profileClerkId = clerkUserId;
    setPendingFollow(true);
    if (isFollowingUser) {
      setIsFollowingUser(false);
      setFollowersCount((n) => Math.max(0, n - 1));
      const { error } = await unfollowUser(user.id, clerkUserId);
      if (error) {
        setIsFollowingUser(true);
        setFollowersCount((n) => n + 1);
      } else {
        removeFollow(currentUserClerkId, profileClerkId);
      }
    } else {
      setIsFollowingUser(true);
      setFollowersCount((n) => n + 1);
      const { error } = await followUser(user.id, clerkUserId);
      if (error) {
        console.log("[Notif] followUser error:", error.message, "— still sending notification");
        // Still try to send notification even if follow had a constraint error (re-follow)
      }
      syncFollow(currentUserClerkId, profileClerkId);
      console.log("[Notif] sending follow notification to", profileClerkId, "from", currentUserClerkId);
      supabase.from("notifications").insert({
        user_id: profileClerkId,
        type: "followed_you",
        from_user_id: currentUserClerkId,
        read: false,
      }).then(({ error: notifErr }) => { if (notifErr) console.error("[Notif] follow insert error:", notifErr); else console.log("[Notif] follow notification sent!"); });
    }
    setPendingFollow(false);
  };

  const avatar = profile?.profile_photo || profile?.profile_image_url || null;
  const banner = profile?.banner_photo || null;
  const name = (profile?.profile_name && profile.profile_name !== "User") ? profile.profile_name : (profile?.profile_username || "New Member");
  const username = profile?.profile_username || "";

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 99998, background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.text }}>
        <div style={{ position: "relative", height: 260 }}>
          {banner ? (
            <img src={banner} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #1e1208 0%, #3a1f0d 60%, #2e1008 100%)" }} />
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(15,12,9,0.05) 0%, rgba(15,12,9,0.2) 30%, rgba(15,12,9,0.75) 60%, rgba(15,12,9,1) 100%)" }} />

          <button
            type="button"
            onClick={() => window.history.back()}
            style={{ position: "absolute", top: 16, left: 16, width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.22)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontSize: 20, lineHeight: 1, padding: 0, zIndex: 5 }}
          >
            ‹
          </button>

          <div style={{ position: "absolute", bottom: 16, left: 18, right: 18, display: "flex", alignItems: "flex-end", gap: 14 }}>
            <div style={{ width: 76, height: 76, borderRadius: "50%", border: `2.5px solid ${C.terracotta}`, overflow: "hidden", flexShrink: 0, background: C.bg2 }}>
              {avatar ? <img src={avatar} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 26, color: "#fff", lineHeight: 1.05 }}>{name}</div>
              <div style={{ fontSize: 12, color: "rgba(240,235,226,0.65)", marginTop: 4, fontFamily: "'Inter', -apple-system, sans-serif" }}>{username || "@"}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", padding: "16px 18px 0", alignItems: "center" }}>
          {[
            {
              val: followingCount,
              label: "FOLLOWING",
              onClick: () => {
                setShowFollowersSheet(false);
                setShowCitiesSheet(false);
                setShowFollowingSheet(true);
              },
            },
            {
              val: followersCount,
              label: "FOLLOWERS",
              onClick: () => {
                setShowFollowingSheet(false);
                setShowCitiesSheet(false);
                setShowFollowersSheet(true);
              },
            },
            {
              val: followedCitiesCount,
              label: "CITIES",
              onClick: () => {
                setShowFollowersSheet(false);
                setShowFollowingSheet(false);
                setShowCitiesSheet(true);
              },
            },
          ].map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={s.onClick}
              style={{
                flex: 1,
                borderRight: i < 2 ? `1px solid ${C.border}` : "none",
                textAlign: "center",
                padding: "0 6px",
                background: "none",
                border: "none",
                borderTop: "none",
                borderLeft: "none",
                borderBottom: "none",
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
              }}
            >
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: "bold", fontSize: 26, color: C.text, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'Inter', -apple-system, sans-serif" }}>{s.label}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: "10px 18px 0", fontSize: 12, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif" }}>
          {cities.slice(0, 3).join(" · ") || ""}
        </div>

        {user?.id && user.id !== clerkUserId ? (
          <div style={{ padding: "14px 18px 0" }}>
            <button
              type="button"
              onClick={doToggleFollow}
              disabled={pendingFollow}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: isFollowingUser ? `1px solid ${C.terracotta}` : "none",
                background: isFollowingUser ? "transparent" : C.terracotta,
                color: "#fff",
                fontFamily: "'Inter', -apple-system, sans-serif",
                fontSize: 14,
                cursor: pendingFollow ? "default" : "pointer",
                opacity: pendingFollow ? 0.7 : 1,
              }}
            >
              {isFollowingUser ? "Unfollow" : "Follow"}
            </button>
            {onMessage && (
              <button
                type="button"
                onClick={() => onMessage(clerkUserId, profile?.profile_name || profile?.profile_username || "User", profile?.profile_photo)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 20,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.text,
                  fontFamily: "'Inter', -apple-system, sans-serif",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Message
              </button>
            )}
          </div>
        ) : null}

        {/* Restaurants in Common */}
        {user?.id && user.id !== clerkUserId && overlapRestaurants.length > 0 && (
          <div style={{ padding: "14px 18px 0" }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              {overlapRestaurants.length} {overlapRestaurants.length === 1 ? "restaurant" : "restaurants"} in common
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
              {overlapRestaurants.slice(0, 10).map(r => {
                let imgSrc = r.img;
                try {
                  const cache = JSON.parse(localStorage.getItem("cooked_shared_photos") || "{}");
                  imgSrc = cache[r.id] || cache[String(r.id)] || r.img;
                } catch {}
                return (
                  <div
                    key={r.id}
                    onClick={() => onOpenDetail?.(r)}
                    style={{
                      minWidth: 100, maxWidth: 100, flexShrink: 0, cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 100, height: 100, borderRadius: 12, overflow: "hidden", background: C.bg2, border: `1px solid ${C.border}` }}>
                      {imgSrc ? <img src={imgSrc} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                    </div>
                    <div style={{ fontSize: 11, color: C.text, fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", marginTop: 4, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>
                      {r.city}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && !canViewContent ? (
          <div style={{ textAlign: "center", padding: "56px 20px", color: C.muted }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontSize: 24, color: C.text, marginBottom: 8 }}>This account is private</div>
            <div style={{ fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>Follow to see Loved, Watchlist, and Finds.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, padding: "16px 18px 0" }}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: "7px 18px",
                    borderRadius: 20,
                    border: activeTab === t.key ? "none" : `1px solid ${C.border}`,
                    background: activeTab === t.key ? C.terracotta : "transparent",
                    color: activeTab === t.key ? "#fff" : C.muted,
                    fontSize: 13,
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: "12px 18px 90px" }}>
              {loading ? (
                <div style={{ color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>Loading profile...</div>
              ) : activeItems.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>No restaurants yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeItems.map((r) => (
                    <RestCard key={r.id} r={r} onOpen={onOpenDetail} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(showFollowersSheet || showFollowingSheet || showCitiesSheet) && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100000, display: "flex", alignItems: "flex-end" }}
          onClick={closeSocialSheets}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              margin: "0 auto",
              background: C.bg2,
              borderRadius: "20px 20px 0 0",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontSize: 18, color: C.text }}>
                {showFollowersSheet ? "Followers" : showFollowingSheet ? "Following" : "Cities"}
              </div>
              <button type="button" onClick={closeSocialSheets} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>
            <div style={{ overflowY: "auto", padding: "8px 18px 24px" }}>
              {sheetLoading ? (
                <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>Loading…</div>
              ) : showCitiesSheet ? (
                citiesSheetList.length === 0 ? (
                  <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>No cities yet.</div>
                ) : (
                  citiesSheetList.map((city) => (
                    <div
                      key={city}
                      style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}`, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 14 }}
                    >
                      {city}
                    </div>
                  ))
                )
              ) : showFollowersSheet ? (
                followersSheetUsers.length === 0 ? (
                  <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>No users yet.</div>
                ) : (
                  followersSheetUsers.map((u) => (
                    <button
                      key={u.clerk_user_id}
                      type="button"
                      onClick={() => {
                        closeSocialSheets();
                        onViewUser?.(u.clerk_user_id);
                      }}
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        borderBottom: `1px solid ${C.border}`,
                        padding: "12px 0",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg3, flexShrink: 0 }}>
                        {u.profile_photo ? <img src={u.profile_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 14, fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.profile_name}</div>
                        <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Inter', -apple-system, sans-serif" }}>{u.profile_username}</div>
                      </div>
                    </button>
                  ))
                )
              ) : followingSheetUsers.length === 0 ? (
                <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>No users yet.</div>
              ) : (
                followingSheetUsers.map((u) => (
                  <button
                    key={u.clerk_user_id}
                    type="button"
                    onClick={() => {
                      closeSocialSheets();
                      onViewUser?.(u.clerk_user_id);
                    }}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      borderBottom: `1px solid ${C.border}`,
                      padding: "12px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: `1px solid ${C.border}`, background: C.bg3, flexShrink: 0 }}>
                      {u.profile_photo ? <img src={u.profile_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: C.text, fontSize: 14, fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.profile_name}</div>
                      <div style={{ color: C.muted, fontSize: 12, fontFamily: "'Inter', -apple-system, sans-serif" }}>{u.profile_username}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.getElementById("root") || document.body
  );
}
