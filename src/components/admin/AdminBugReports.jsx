import { useState, useEffect } from "react";
import { C, cardStyle, btnSmall, sectionHeader } from "./adminHelpers";
import { supabase } from "../../lib/supabase";

export default function AdminBugReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open"); // open, resolved, all
  const [expandedId, setExpandedId] = useState(null);

  const loadReports = async () => {
    setLoading(true);
    let query = supabase.from("bug_reports").select("*").order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query.limit(100);
    setReports(data || []);
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, [filter]);

  const updateStatus = async (id, status) => {
    const updates = { status };
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    await supabase.from("bug_reports").update(updates).eq("id", id);
    loadReports();
  };

  const updateNotes = async (id, notes) => {
    await supabase.from("bug_reports").update({ admin_notes: notes }).eq("id", id);
  };

  const deleteReport = async (id) => {
    await supabase.from("bug_reports").delete().eq("id", id);
    loadReports();
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const statusColor = (s) => s === "open" ? "#ef4444" : s === "in_progress" ? "#f59e0b" : "#22c55e";

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["open", "in_progress", "resolved", "all"].map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} style={{
            ...btnSmall,
            background: filter === f ? C.terracotta : "transparent",
            color: filter === f ? "#fff" : C.muted,
            border: filter === f ? "none" : `1px solid ${C.border}`,
            textTransform: "capitalize",
          }}>
            {f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.terracotta, marginBottom: 12 }}>
        {reports.length} {filter === "all" ? "total" : filter} report{reports.length !== 1 ? "s" : ""}
      </div>

      {loading ? (
        <div style={{ color: C.muted, fontSize: 13 }}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "40px 0" }}>
          No {filter} bug reports
        </div>
      ) : (
        reports.map(r => {
          const isExpanded = expandedId === r.id;
          return (
            <div key={r.id} style={{ marginBottom: 10 }}>
              <button type="button" onClick={() => setExpandedId(isExpanded ? null : r.id)} style={{
                width: "100%", textAlign: "left", padding: "12px 14px",
                background: isExpanded ? C.bg3 : C.bg2,
                border: `1px solid ${isExpanded ? C.terracotta : C.border}`,
                borderRadius: isExpanded ? "12px 12px 0 0" : 12,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                color: "inherit", font: "inherit",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(r.status), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.description?.slice(0, 80)}{r.description?.length > 80 ? "..." : ""}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {r.user_name || "Anonymous"} · {r.platform || "Unknown"} · {r.page || r.tab || "—"} · {formatTime(r.created_at)}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div style={{ background: C.bg3, border: `1px solid ${C.terracotta}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: 14 }}>
                  {/* Full description */}
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 12, fontFamily: "'Inter', -apple-system, sans-serif" }}>
                    {r.description}
                  </div>

                  {/* Screenshot */}
                  {r.screenshot_url && (
                    <div style={{ marginBottom: 12, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                      <img src={r.screenshot_url} alt="Bug screenshot" style={{ width: "100%", display: "block" }} />
                    </div>
                  )}

                  {/* Metadata */}
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8, fontFamily: "'Inter', -apple-system, sans-serif", marginBottom: 12 }}>
                    <div><strong style={{ color: C.text }}>User:</strong> {r.user_name || "Anonymous"} ({r.user_email || "—"})</div>
                    <div><strong style={{ color: C.text }}>Platform:</strong> {r.platform} · {r.screen_width}×{r.screen_height}</div>
                    <div><strong style={{ color: C.text }}>Page:</strong> {r.page || "—"} · Tab: {r.tab || "—"}</div>
                    <div><strong style={{ color: C.text }}>URL:</strong> {r.url || "—"}</div>
                    {r.restaurant_name && <div><strong style={{ color: C.text }}>Restaurant:</strong> {r.restaurant_name} (ID: {r.restaurant_id})</div>}
                    {r.viewing_user_id && <div><strong style={{ color: C.text }}>Viewing user:</strong> {r.viewing_user_id}</div>}
                    <div><strong style={{ color: C.text }}>App version:</strong> {r.app_version || "—"}</div>
                    <div><strong style={{ color: C.text }}>User Agent:</strong> <span style={{ fontSize: 9, wordBreak: "break-all" }}>{r.user_agent || "—"}</span></div>
                    <div><strong style={{ color: C.text }}>Submitted:</strong> {new Date(r.created_at).toLocaleString()}</div>
                  </div>

                  {/* Admin notes */}
                  <textarea
                    defaultValue={r.admin_notes || ""}
                    placeholder="Admin notes..."
                    onBlur={e => updateNotes(r.id, e.target.value)}
                    rows={2}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      border: `1px solid ${C.border}`, background: C.bg2,
                      color: C.text, fontSize: 12, resize: "vertical",
                      fontFamily: "'Inter', -apple-system, sans-serif",
                      outline: "none", marginBottom: 10,
                    }}
                  />

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.status !== "in_progress" && (
                      <button type="button" onClick={() => updateStatus(r.id, "in_progress")} style={{ ...btnSmall, background: "#f59e0b22", color: "#f59e0b", borderColor: "#f59e0b44" }}>
                        Mark In Progress
                      </button>
                    )}
                    {r.status !== "resolved" && (
                      <button type="button" onClick={() => updateStatus(r.id, "resolved")} style={{ ...btnSmall, background: "#22c55e22", color: "#22c55e", borderColor: "#22c55e44" }}>
                        Mark Resolved
                      </button>
                    )}
                    {r.status === "resolved" && (
                      <button type="button" onClick={() => updateStatus(r.id, "open")} style={{ ...btnSmall, background: "#ef444422", color: "#ef4444", borderColor: "#ef444444" }}>
                        Reopen
                      </button>
                    )}
                    <button type="button" onClick={() => { if (confirm("Delete this report?")) deleteReport(r.id); }} style={{ ...btnSmall, color: "#ef4444", borderColor: "#ef444444", marginLeft: "auto" }}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
