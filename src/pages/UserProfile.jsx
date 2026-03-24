import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/clerk-react";
import { RESTAURANTS } from "../data/restaurants";
import {
  followUser,
  getFollowers,
  getFollowing,
  getUserProfile,
  isFollowing,
  unfollowUser,
} from "../lib/supabase";
import { syncFollow, removeFollow } from "../lib/neo4j";

const C = {
  bg: "#0f0c09",
  bg2: "#1a1208",
  bg3: "#2e1f0e",
  border: "#2e1f0e",
  text: "#f0ebe2",
  muted: "#5a3a20",
  dim: "#3d2a18",
  terracotta: "#c4603a",
};

const FLAME_PATH = "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

function FlameIcon({ size = 12, filled = true }) {
  const c = filled ? C.terracotta : C.dim;
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 167 200" fill={filled ? c : "none"} stroke={filled ? "none" : c} strokeWidth={filled ? 0 : 12} strokeLinecap="round">
      <path d={FLAME_PATH} />
    </svg>
  );
}

function RestCard({ r, onOpen }) {
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
        {r.img ? <img src={r.img} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 17, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: "0.04em", fontFamily: "-apple-system,sans-serif" }}>
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

export default function UserProfile({ clerkUserId, onClose, onOpenDetail, onViewUser }) {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [activeTab, setActiveTab] = useState("loved");
  const [pendingFollow, setPendingFollow] = useState(false);
  const [socialSheet, setSocialSheet] = useState(null); // null | "followers" | "following" | "cities"
  const [socialList, setSocialList] = useState([]);
  const [socialLoading, setSocialLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!clerkUserId) return;
    (async () => {
      setLoading(true);
      const [{ data: userData }, followersRes, followingRes] = await Promise.all([
        getUserProfile(clerkUserId),
        getFollowers(clerkUserId),
        getFollowing(clerkUserId),
      ]);
      if (cancelled) return;
      setProfile(userData || null);
      setFollowersCount(followersRes?.data?.length || 0);
      setFollowingCount(followingRes?.data?.length || 0);
      if (user?.id && user.id !== clerkUserId) {
        const followState = await isFollowing(user.id, clerkUserId);
        if (!cancelled) setIsFollowingUser(!!followState?.isFollowing);
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

  const tabs = [
    { key: "loved", label: "Loved", items: lovedRestaurants },
    { key: "watchlist", label: "Watchlist", items: watchlistRestaurants },
    { key: "finds", label: "Finds", items: findsRestaurants },
  ];
  const activeItems = tabs.find((t) => t.key === activeTab)?.items || [];

  const openSocialSheet = async (kind) => {
    if (!clerkUserId) return;
    if (kind === "cities") {
      setSocialSheet("cities");
      setSocialList(cities);
      setSocialLoading(false);
      return;
    }
    setSocialSheet(kind);
    setSocialList([]);
    setSocialLoading(true);
    try {
      const res = kind === "following" ? await getFollowing(clerkUserId) : await getFollowers(clerkUserId);
      const rows = res?.data || [];
      const ids = rows
        .map((row) => (kind === "following" ? row.following_id : row.follower_id))
        .filter(Boolean);
      const profiles = await Promise.all(
        ids.map(async (id) => {
          const { data } = await getUserProfile(id);
          return {
            clerk_user_id: id,
            profile_name: data?.profile_name || "User",
            profile_username: data?.profile_username || "",
            profile_photo: data?.profile_photo || null,
          };
        })
      );
      setSocialList(profiles);
    } finally {
      setSocialLoading(false);
    }
  };

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
        setIsFollowingUser(false);
        setFollowersCount((n) => Math.max(0, n - 1));
      } else {
        syncFollow(currentUserClerkId, profileClerkId);
      }
    }
    setPendingFollow(false);
  };

  const avatar = profile?.profile_photo || profile?.profile_image_url || null;
  const banner = profile?.banner_photo || null;
  const name = profile?.profile_name || "User";
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
            onClick={onClose}
            style={{ position: "absolute", top: 16, left: 16, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.22)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontSize: 16, lineHeight: 1, padding: 0 }}
          >
            ‹
          </button>

          <div style={{ position: "absolute", bottom: 16, left: 18, right: 18, display: "flex", alignItems: "flex-end", gap: 14 }}>
            <div style={{ width: 76, height: 76, borderRadius: "50%", border: `2.5px solid ${C.terracotta}`, overflow: "hidden", flexShrink: 0, background: C.bg2 }}>
              {avatar ? <img src={avatar} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 26, color: "#fff", lineHeight: 1.05 }}>{name}</div>
              <div style={{ fontSize: 12, color: "rgba(240,235,226,0.65)", marginTop: 4, fontFamily: "-apple-system,sans-serif" }}>{username || "@"}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", padding: "16px 18px 0", alignItems: "center" }}>
          {[
            { val: followingCount, label: "FOLLOWING", kind: "following" },
            { val: followersCount, label: "FOLLOWERS", kind: "followers" },
            { val: cities.length, label: "CITIES", kind: "cities" },
          ].map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => openSocialSheet(s.kind)}
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
              <div style={{ fontFamily: "Georgia,serif", fontWeight: "bold", fontSize: 26, color: C.text, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "-apple-system,sans-serif" }}>{s.label}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: "10px 18px 0", fontSize: 12, color: C.muted, fontFamily: "-apple-system,sans-serif" }}>
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
                fontFamily: "-apple-system,sans-serif",
                fontSize: 14,
                cursor: pendingFollow ? "default" : "pointer",
                opacity: pendingFollow ? 0.7 : 1,
              }}
            >
              {isFollowingUser ? "Unfollow" : "Follow"}
            </button>
          </div>
        ) : null}

        {!loading && !canViewContent ? (
          <div style={{ textAlign: "center", padding: "56px 20px", color: C.muted }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 24, color: C.text, marginBottom: 8 }}>This account is private</div>
            <div style={{ fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>Follow to see Loved, Watchlist, and Finds.</div>
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
                    fontFamily: "-apple-system,sans-serif",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: "12px 18px 90px" }}>
              {loading ? (
                <div style={{ color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>Loading profile...</div>
              ) : activeItems.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>No restaurants yet.</div>
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

      {socialSheet && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100000, display: "flex", alignItems: "flex-end" }}
          onClick={() => setSocialSheet(null)}
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
              <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>
                {socialSheet === "followers" ? "Followers" : socialSheet === "following" ? "Following" : "Cities"}
              </div>
              <button type="button" onClick={() => setSocialSheet(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>
            <div style={{ overflowY: "auto", padding: "8px 18px 24px" }}>
              {socialLoading ? (
                <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>Loading…</div>
              ) : socialSheet === "cities" ? (
                socialList.length === 0 ? (
                  <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>No cities yet.</div>
                ) : (
                  socialList.map((city) => (
                    <div
                      key={city}
                      style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}`, color: C.text, fontFamily: "-apple-system,sans-serif", fontSize: 14 }}
                    >
                      {city}
                    </div>
                  ))
                )
              ) : socialList.length === 0 ? (
                <div style={{ padding: "16px 0", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>No users yet.</div>
              ) : (
                socialList.map((u) => (
                  <button
                    key={u.clerk_user_id}
                    type="button"
                    onClick={() => {
                      setSocialSheet(null);
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
    </div>,
    document.getElementById("root") || document.body
  );
}
