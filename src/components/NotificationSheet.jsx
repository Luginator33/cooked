import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/clerk-react";
import { followUser, supabase } from "../lib/supabase";
import { syncFollow } from "../lib/neo4j";

const C = {
  bg:        "#0f0c09",
  bg2:       "#1a1208",
  bg3:       "#2e1f0e",
  border:    "#2e1f0e",
  text:      "#f0ebe2",
  muted:     "#5a3a20",
  dim:       "#3d2a18",
  terracotta:"#c4603a",
  cream:     "#faf6f0",
};

/* ── helpers ──────────────────────────────────────────── */

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  const week = Math.floor(day / 7);
  if (min < 1) return "1m";
  if (min < 60) return `${min}m`;
  if (h < 24) return `${h}h`;
  if (day < 7) return `${day}d`;
  if (week < 5) return `${week}w`;
  return `${Math.floor(day / 30)}mo`;
}

function getTimeGroup(iso) {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  if (d >= todayStart) return "Today";
  if (d >= yesterdayStart) return "Yesterday";
  if (d >= weekStart) return "This Week";
  return "Earlier";
}

/**
 * Group notifications by same restaurant + type within the same time group.
 * e.g. 3 people loved Bestia today => one grouped row.
 */
function groupNotifications(notifications) {
  const TIME_GROUP_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];
  const grouped = {};

  for (const n of notifications) {
    const timeGroup = getTimeGroup(n.created_at);
    if (!grouped[timeGroup]) grouped[timeGroup] = [];

    // Only group "friend_loved_your_watchlist" and "friend_new_find" by restaurant
    const canGroup = n.restaurant_id && (n.type === "friend_loved_your_watchlist" || n.type === "friend_new_find");

    if (canGroup) {
      const key = `${n.type}:${n.restaurant_id}`;
      const existing = grouped[timeGroup].find(g => g._groupKey === key);
      if (existing) {
        existing._users.push(n._fromUser);
        existing._allNotifs.push(n);
        if (!existing.read && n.read) { /* keep unread */ }
        if (!n.read) existing.read = false;
        continue;
      }
    }

    grouped[timeGroup].push({
      ...n,
      _groupKey: n.restaurant_id && (n.type === "friend_loved_your_watchlist" || n.type === "friend_new_find")
        ? `${n.type}:${n.restaurant_id}` : null,
      _users: n._fromUser ? [n._fromUser] : [],
      _allNotifs: [n],
    });
  }

  const result = [];
  for (const tg of TIME_GROUP_ORDER) {
    if (grouped[tg] && grouped[tg].length > 0) {
      result.push({ _sectionHeader: tg });
      result.push(...grouped[tg]);
    }
  }
  return result;
}

function buildGroupedMessage(row) {
  const users = (row._users || []).filter(Boolean);
  const restName = row.restaurant_name || "a restaurant";

  if (users.length === 0) {
    // Fallback for non-user notifications
    switch (row.type) {
      case "restaurant_trending":
      case "trending_in_city":
        return { text: `${restName} is trending in your city`, bold: restName };
      default:
        return { text: "New activity", bold: "" };
    }
  }

  const firstName = users[0]?.profile_name || "Someone";
  const othersCount = users.length - 1;

  switch (row.type) {
    case "followed_you":
      return { text: `${firstName} started following you.`, bold: firstName };
    case "friend_loved_your_watchlist": {
      if (othersCount === 0) return { text: `${firstName} loved ${restName} \u2014 it's on your watchlist!`, bold: firstName };
      if (othersCount === 1) {
        const second = users[1]?.profile_name || "someone";
        return { text: `${firstName}, ${second} loved ${restName}`, bold: `${firstName}, ${second}` };
      }
      return { text: `${firstName}, ${users[1]?.profile_name || "someone"} and ${othersCount - 1} other${othersCount - 1 > 1 ? "s" : ""} loved ${restName}`, bold: firstName };
    }
    case "friend_new_find": {
      if (othersCount === 0) return { text: `${firstName} added a new Find: ${restName}`, bold: firstName };
      return { text: `${firstName} and ${othersCount} other${othersCount > 1 ? "s" : ""} added ${restName}`, bold: firstName };
    }
    case "trending_in_city":
    case "restaurant_trending":
      return { text: `${restName} is trending right now`, bold: restName };
    case "friend_visited_city":
      return { text: `${firstName} loved ${restName} in a city you follow`, bold: firstName };
    default:
      return { text: `${firstName} \u00b7 ${restName}`, bold: firstName };
  }
}

/* ── sub-components ──────────────────────────────────── */

function ProfilePic({ src, size = 44 }) {
  const [err, setErr] = useState(false);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden",
      background: C.bg3, flexShrink: 0,
    }}>
      {src && !err ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setErr(true)} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5">
            <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
          </svg>
        </div>
      )}
    </div>
  );
}

function SquareThumb({ src, size = 44 }) {
  const [err, setErr] = useState(false);
  if (!src || err) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, overflow: "hidden",
      background: C.bg3, flexShrink: 0,
    }}>
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setErr(true)} />
    </div>
  );
}

function FollowBackButton({ userId, onFollowBack }) {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (done || loading) return;
    setLoading(true);
    try {
      await onFollowBack(userId);
      setDone(true);
    } catch (err) {
      console.error("[NotifSheet] follow back error:", err);
    }
    setLoading(false);
  };

  if (done) {
    return (
      <button type="button" disabled style={{
        height: 30, padding: "0 14px", borderRadius: 8, border: `1px solid ${C.border}`,
        background: "transparent", color: C.muted, fontSize: 12, fontWeight: 600,
        fontFamily: "-apple-system,sans-serif", cursor: "default", flexShrink: 0,
      }}>
        Following
      </button>
    );
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} style={{
      height: 30, padding: "0 14px", borderRadius: 8, border: "none",
      background: C.terracotta, color: "#fff", fontSize: 12, fontWeight: 600,
      fontFamily: "-apple-system,sans-serif", cursor: loading ? "wait" : "pointer",
      flexShrink: 0, opacity: loading ? 0.6 : 1,
    }}>
      {loading ? "..." : "Follow Back"}
    </button>
  );
}

/* ── main component ──────────────────────────────────── */

export default function NotificationSheet({
  open,
  onClose,
  notifications,
  loading,
  onViewUser,
  onViewRestaurant,
  allRestaurants,
  getPhotoForId,
}) {
  const { user } = useUser();
  const [followedBackIds, setFollowedBackIds] = useState(new Set());

  // Check which "followed_you" senders the user already follows
  useEffect(() => {
    if (!user?.id || !notifications?.length) return;
    let cancelled = false;
    (async () => {
      const followNotifs = notifications.filter(n => n.type === "followed_you" && n.from_user_id);
      if (followNotifs.length === 0) return;
      const fromIds = [...new Set(followNotifs.map(n => n.from_user_id))];
      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", fromIds);
      if (cancelled) return;
      if (data) setFollowedBackIds(new Set(data.map(d => d.following_id)));
    })();
    return () => { cancelled = true; };
  }, [user?.id, notifications]);

  const handleFollowBack = useCallback(async (targetUserId) => {
    if (!user?.id) return;
    await followUser(user.id, targetUserId);
    syncFollow(user.id, targetUserId);
    setFollowedBackIds(prev => new Set([...prev, targetUserId]));
    // Send notification to the person we followed back
    supabase.from("notifications").insert({
      user_id: targetUserId,
      type: "followed_you",
      from_user_id: user.id,
      read: false,
    });
  }, [user?.id]);

  const grouped = useMemo(() => groupNotifications(notifications || []), [notifications]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, margin: "0 auto",
          background: C.bg2, borderRadius: "20px 20px 0 0",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 18px 12px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 18, color: C.text }}>
            Notifications
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: C.muted, fontSize: 13, fontFamily: "-apple-system,sans-serif" }}>
              Loading...
            </div>
          ) : grouped.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 14, fontFamily: "-apple-system,sans-serif" }}>
              No notifications yet
            </div>
          ) : (
            grouped.map((item, idx) => {
              // Section header
              if (item._sectionHeader) {
                return (
                  <div key={`section-${item._sectionHeader}`} style={{
                    padding: "14px 16px 6px",
                    fontSize: 14, fontWeight: 700, color: C.text,
                    fontFamily: "-apple-system,sans-serif",
                  }}>
                    {item._sectionHeader}
                  </div>
                );
              }

              const unread = item.read === false;
              const isFollow = item.type === "followed_you";
              const fromUser = item._fromUser || (item._users && item._users[0]);
              const restaurant = item.restaurant_id
                ? allRestaurants.find(r => String(r.id) === String(item.restaurant_id))
                : null;

              // Profile pic: always the actor's photo on the left
              const profileSrc = fromUser?.profile_photo;

              // Right-side thumbnail: restaurant photo for restaurant-related notifs
              const showRestaurantThumb = !isFollow && restaurant;
              const restaurantPhotoSrc = restaurant
                ? (getPhotoForId ? getPhotoForId(restaurant.id) : null) || restaurant.img
                : null;

              // For follow notifs: check if already following back
              const alreadyFollowing = isFollow && item.from_user_id && followedBackIds.has(item.from_user_id);

              const msg = buildGroupedMessage(item);
              const timeStr = formatRelativeTime(item.created_at);

              return (
                <div
                  key={item.id ?? `${item.created_at}-${item.type}-${idx}`}
                  onClick={() => {
                    if (isFollow && item.from_user_id) {
                      onClose(); onViewUser?.(item.from_user_id);
                    } else if (restaurant) {
                      onClose(); onViewRestaurant?.(restaurant);
                    } else if (item.from_user_id) {
                      onClose(); onViewUser?.(item.from_user_id);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 16px", cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {/* Unread dot */}
                  {unread && (
                    <div style={{
                      position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
                      width: 6, height: 6, borderRadius: "50%", background: C.terracotta,
                    }} />
                  )}

                  {/* Profile pic */}
                  <ProfilePic src={profileSrc} size={44} />

                  {/* Text content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: C.text, fontFamily: "-apple-system,sans-serif",
                      lineHeight: 1.4, overflow: "hidden", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>
                      {renderMessageWithBold(msg)}
                      <span style={{ color: C.muted, fontSize: 12, marginLeft: 4 }}>{timeStr}</span>
                    </div>
                  </div>

                  {/* Right side: Follow Back button OR restaurant thumbnail */}
                  {isFollow && !alreadyFollowing ? (
                    <FollowBackButton userId={item.from_user_id} onFollowBack={handleFollowBack} />
                  ) : showRestaurantThumb ? (
                    <SquareThumb src={restaurantPhotoSrc} size={44} />
                  ) : null}
                </div>
              );
            })
          )}
          {/* Bottom padding for safe area */}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Render message text with the first user name in bold */
function renderMessageWithBold({ text, bold }) {
  if (!bold || !text.includes(bold)) {
    return <span>{text}</span>;
  }
  const idx = text.indexOf(bold);
  return (
    <span>
      {text.slice(0, idx)}
      <span style={{ fontWeight: 600 }}>{bold}</span>
      {text.slice(idx + bold.length)}
    </span>
  );
}
