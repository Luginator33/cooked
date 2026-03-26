import { useState, useEffect } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSmall, btnOutline, sectionHeader, badge, SearchBar, ConfirmDialog, Toast } from "./adminHelpers";
import { getReports, resolveReport, getCommunityRestaurants, updateCommunityRestaurant, deleteCommunityRestaurant, sendBroadcastNotification, getAllUsers, logAdminAction } from "../../lib/supabase";

export default function AdminContent({ userId }) {
  const [section, setSection] = useState("reports");
  const [reports, setReports] = useState([]);
  const [community, setCommunity] = useState([]);
  const [notifMessage, setNotifMessage] = useState("");
  const [notifTarget, setNotifTarget] = useState("all");
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    if (section === "reports") getReports("pending").then(setReports);
    if (section === "community") getCommunityRestaurants().then(setCommunity);
  }, [section]);

  const handleResolve = async (id, resolution) => {
    await resolveReport(id, userId, resolution);
    await logAdminAction("report_" + resolution, userId, "report", String(id), {});
    showToast(`Report ${resolution}`);
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const handleDeleteCommunity = async (r) => {
    await deleteCommunityRestaurant(r.id);
    await logAdminAction("community_delete", userId, "restaurant", String(r.id), { name: r.name });
    showToast(`Removed ${r.name}`);
    setCommunity(prev => prev.filter(c => c.id !== r.id));
    setConfirm(null);
  };

  const handleSendNotification = async () => {
    if (!notifMessage.trim()) return;
    let targetIds;
    if (notifTarget === "all") {
      const users = await getAllUsers(10000);
      targetIds = users.map(u => u.clerk_user_id);
    } else {
      targetIds = notifTarget.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (targetIds.length === 0) return;
    await sendBroadcastNotification(userId, notifMessage.trim(), targetIds);
    await logAdminAction("send_notification", userId, "notification", null, { message: notifMessage, recipients: targetIds.length });
    showToast(`Notification sent to ${targetIds.length} users`);
    setNotifMessage("");
  };

  return (
    <div>
      {toast && <Toast {...toast} />}
      {confirm && <ConfirmDialog {...confirm} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[{ key: "reports", label: "Reports" }, { key: "community", label: "Community" }, { key: "notify", label: "Notifications" }].map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
          }}>{s.label}</button>
        ))}
      </div>

      {/* Reports queue */}
      {section === "reports" && (
        <>
          <div style={sectionHeader}>PENDING REPORTS ({reports.length})</div>
          {reports.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No pending reports.</div>}
          {reports.map(r => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={badge(C.blue)}>{r.target_type}</span>
                <span style={{ fontSize: 9, color: C.dim }}>{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>Target: {r.target_id}</div>
              {r.reason && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontStyle: "italic" }}>"{r.reason}"</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => handleResolve(r.id, "dismissed")} style={btnSmall}>Dismiss</button>
                <button type="button" onClick={() => handleResolve(r.id, "resolved")} style={{ ...btnSmall, color: C.green, borderColor: C.green }}>Resolve</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Community restaurants */}
      {section === "community" && (
        <>
          <div style={sectionHeader}>COMMUNITY RESTAURANTS ({community.length})</div>
          {community.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{r.cuisine} · {r.city} · ID: {r.id}</div>
              </div>
              <button type="button" onClick={() => setConfirm({
                message: `Remove community restaurant "${r.name}"?`,
                onConfirm: () => handleDeleteCommunity(r),
                onCancel: () => setConfirm(null),
              })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Remove</button>
            </div>
          ))}
        </>
      )}

      {/* Send notifications */}
      {section === "notify" && (
        <>
          <div style={sectionHeader}>SEND NOTIFICATION</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>Message</div>
            <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="Your announcement..." style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>Target</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setNotifTarget("all")} style={{ ...btnSmall, background: notifTarget === "all" ? C.terracotta : "transparent", color: notifTarget === "all" ? "#fff" : C.muted, border: notifTarget === "all" ? "none" : `1px solid ${C.border}` }}>All Users</button>
              <button type="button" onClick={() => setNotifTarget("")} style={{ ...btnSmall, background: notifTarget !== "all" ? C.terracotta : "transparent", color: notifTarget !== "all" ? "#fff" : C.muted, border: notifTarget !== "all" ? "none" : `1px solid ${C.border}` }}>Specific</button>
            </div>
            {notifTarget !== "all" && (
              <input type="text" value={notifTarget} onChange={e => setNotifTarget(e.target.value)} placeholder="clerk_user_ids, comma-separated" style={{ ...inputStyle, marginTop: 8 }} />
            )}
          </div>
          <button type="button" onClick={handleSendNotification} style={{ ...btnPrimary, width: "100%" }} disabled={!notifMessage.trim()}>
            Send Notification
          </button>
        </>
      )}
    </div>
  );
}
