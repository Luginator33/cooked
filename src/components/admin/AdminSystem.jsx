import { useState, useEffect } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSmall, btnOutline, sectionHeader, Toast } from "./adminHelpers";
import { getFeatureFlags, setFeatureFlag, getAllUsers, logAdminAction } from "../../lib/supabase";
import { RESTAURANTS } from "../../data/restaurants";

export default function AdminSystem({ allRestaurants, userId }) {
  const [section, setSection] = useState("flags");
  const [flags, setFlags] = useState([]);
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    if (section === "flags") {
      getFeatureFlags().then(setFlags);
    }
  }, [section]);

  const toggleFlag = async (key, currentEnabled) => {
    await setFeatureFlag(key, !currentEnabled, userId);
    await logAdminAction("toggle_feature", userId, "feature_flag", key, { enabled: !currentEnabled });
    showToast(`${key}: ${!currentEnabled ? "enabled" : "disabled"}`);
    setFlags(prev => prev.map(f => f.key === key ? { ...f, enabled: !currentEnabled } : f));
  };

  const addFlag = async () => {
    if (!newFlagKey.trim()) return;
    await setFeatureFlag(newFlagKey.trim(), true, userId, newFlagDesc.trim());
    await logAdminAction("add_feature_flag", userId, "feature_flag", newFlagKey.trim(), { description: newFlagDesc });
    showToast(`Added flag: ${newFlagKey}`);
    setNewFlagKey(""); setNewFlagDesc("");
    getFeatureFlags().then(setFlags);
  };

  const exportData = (type) => {
    let data, filename;
    if (type === "restaurants") {
      data = allRestaurants.map(r => ({
        id: r.id, name: r.name, city: r.city, neighborhood: r.neighborhood,
        cuisine: r.cuisine, price: r.price, rating: r.rating, website: r.website,
        lat: r.lat, lng: r.lng, tags: (r.tags || []).join(";"),
      }));
      filename = "cooked_restaurants.csv";
    }
    if (!data) return;
    const headers = Object.keys(data[0] || {});
    const csv = [
      headers.join(","),
      ...data.map(row => headers.map(h => {
        const v = String(row[h] ?? "").replace(/"/g, '""');
        return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
      }).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${data.length} rows`);
  };

  const exportUsers = async () => {
    const users = await getAllUsers(10000);
    const data = users.map(u => ({
      clerk_user_id: u.clerk_user_id,
      name: u.profile_name || "",
      username: u.profile_username || "",
      is_admin: u.is_admin ? "yes" : "no",
      last_active: u.updated_at || "",
    }));
    const headers = Object.keys(data[0] || {});
    const csv = [headers.join(","), ...data.map(row => headers.map(h => String(row[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cooked_users.csv"; a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${data.length} users`);
  };

  return (
    <div>
      {toast && <Toast {...toast} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[{ key: "flags", label: "Feature Flags" }, { key: "export", label: "Export Data" }].map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
          }}>{s.label}</button>
        ))}
      </div>

      {/* Feature Flags */}
      {section === "flags" && (
        <>
          <div style={sectionHeader}>FEATURE FLAGS</div>
          {flags.map(f => (
            <div key={f.key} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontFamily: "'DM Mono', monospace" }}>{f.key}</div>
                {f.description && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{f.description}</div>}
              </div>
              <button
                type="button" onClick={() => toggleFlag(f.key, f.enabled)}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                  background: f.enabled ? C.terracotta : C.dim,
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 3,
                  left: f.enabled ? 25 : 3, transition: "left 0.2s",
                }} />
              </button>
            </div>
          ))}

          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={sectionHeader}>ADD NEW FLAG</div>
            <input type="text" value={newFlagKey} onChange={e => setNewFlagKey(e.target.value)} placeholder="flag_key" style={{ ...inputStyle, marginBottom: 8, fontFamily: "'DM Mono', monospace" }} />
            <input type="text" value={newFlagDesc} onChange={e => setNewFlagDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inputStyle, marginBottom: 8 }} />
            <button type="button" onClick={addFlag} style={btnPrimary} disabled={!newFlagKey.trim()}>Add Flag</button>
          </div>
        </>
      )}

      {/* Export Data */}
      {section === "export" && (
        <>
          <div style={sectionHeader}>EXPORT DATA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" onClick={() => exportData("restaurants")} style={{ ...cardStyle, cursor: "pointer", textAlign: "left", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>Export Restaurants (CSV)</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{allRestaurants.length} restaurants with all fields</div>
            </button>
            <button type="button" onClick={exportUsers} style={{ ...cardStyle, cursor: "pointer", textAlign: "left", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>Export Users (CSV)</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>All users with names, usernames, admin status</div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
