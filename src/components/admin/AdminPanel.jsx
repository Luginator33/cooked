import { useState } from "react";
import { createPortal } from "react-dom";
import { C } from "./adminHelpers";
import AdminRestaurants from "./AdminRestaurants";
import AdminUsers from "./AdminUsers";
import AdminPhotos from "./AdminPhotos";
import AdminContent from "./AdminContent";
import AdminAnalytics from "./AdminAnalytics";
import AdminSystem from "./AdminSystem";
import AdminFlames from "./AdminFlames";

const TABS = [
  { key: "restaurants", label: "Restaurants" },
  { key: "users", label: "Users" },
  { key: "photos", label: "Photos" },
  { key: "content", label: "Content" },
  { key: "analytics", label: "Analytics" },
  { key: "flames", label: "Flames" },
  { key: "system", label: "System" },
];

export default function AdminPanel({ onClose, allRestaurants, userId, onRestaurantsChanged }) {
  const [tab, setTab] = useState("restaurants");

  const tabProps = { allRestaurants, userId, onRestaurantsChanged };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "14px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, color: C.text }}>
              Admin Panel
            </span>
            <button
              type="button" onClick={onClose}
              style={{ background: C.bg2, border: "none", color: C.muted, borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ×
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, marginTop: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", borderBottom: `1px solid ${C.border}` }}>
            {TABS.map(t => (
              <button
                key={t.key} type="button" onClick={() => setTab(t.key)}
                style={{
                  background: "none", border: "none", borderBottom: tab === t.key ? `2px solid ${C.terracotta}` : "2px solid transparent",
                  color: tab === t.key ? C.terracotta : C.muted, padding: "8px 12px", fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 20px 40px" }}>
          {tab === "restaurants" && <AdminRestaurants {...tabProps} />}
          {tab === "users" && <AdminUsers {...tabProps} />}
          {tab === "photos" && <AdminPhotos {...tabProps} />}
          {tab === "content" && <AdminContent {...tabProps} />}
          {tab === "analytics" && <AdminAnalytics {...tabProps} />}
          {tab === "flames" && <AdminFlames {...tabProps} />}
          {tab === "system" && <AdminSystem {...tabProps} />}
        </div>
      </div>
    </div>,
    document.body
  );
}
