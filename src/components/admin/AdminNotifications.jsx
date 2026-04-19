import { useState, useEffect } from "react";
import { C, cardStyle, btnPrimary, btnSecondary, inputStyle, sectionHeader } from "./adminHelpers";
import { supabase } from "../../lib/supabase";

const WORKER_URL = "https://cooked-proxy.luga-podesta.workers.dev";

export default function AdminNotifications({ userId }) {
  const [mode, setMode] = useState("user"); // "user" | "broadcast"
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [users, setUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);
  const [deviceCounts, setDeviceCounts] = useState({ total: 0, users: 0 });

  useEffect(() => {
    (async () => {
      const { data: userRows } = await supabase
        .from("user_data")
        .select("clerk_user_id, profile_name, email")
        .order("profile_name", { ascending: true, nullsFirst: false });
      setUsers(userRows || []);

      const { data: tokens } = await supabase
        .from("user_push_tokens")
        .select("clerk_user_id");
      const uniqueUsers = new Set((tokens || []).map(t => t.clerk_user_id));
      setDeviceCounts({ total: tokens?.length || 0, users: uniqueUsers.size });

      loadLog();
    })();
  }, []);

  const loadLog = async () => {
    const { data } = await supabase
      .from("notifications_log")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(30);
    setLog(data || []);
  };

  const canSend = title.trim() && body.trim() && !sending && (mode === "broadcast" || recipientId);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const path = mode === "broadcast" ? "/push/broadcast" : "/push/send";
      const payload = {
        admin_clerk_user_id: userId,
        title: title.trim(),
        body: body.trim(),
        ...(mode === "user" && { recipient_clerk_user_id: recipientId }),
      };
      const res = await fetch(`${WORKER_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": import.meta.env.VITE_ADMIN_PUSH_SECRET || "",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error || `HTTP ${res.status}` });
      } else {
        setResult({ ok: true, message: formatSendResult(data, mode) });
        setTitle("");
        setBody("");
        loadLog();
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSending(false);
    }
  };

  const formatSendResult = (data, mode) => {
    if (mode === "broadcast") {
      return `Broadcast: ${data.sent} sent, ${data.failed || 0} failed (${data.tried || 0} tokens tried).`;
    }
    if (data.sent === 0) return data.note || "No devices on file for that user.";
    return `Delivered to ${data.sent} of ${data.tried} device(s).`;
  };

  const recipientName = (clerkId) => {
    const u = users.find(x => x.clerk_user_id === clerkId);
    return u?.profile_name || u?.email || clerkId?.slice(0, 12) || "—";
  };

  const timeAgo = (ts) => {
    if (!ts) return "";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h`;
    return `${Math.floor(diff / 1440)}d`;
  };

  return (
    <div>
      <div style={sectionHeader}>Compose</div>

      <div style={cardStyle}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            type="button" onClick={() => setMode("user")}
            style={{
              ...btnSecondary, flex: 1,
              background: mode === "user" ? C.terracotta : "transparent",
              color: mode === "user" ? "#fff" : C.muted,
              border: mode === "user" ? "none" : `1px solid ${C.border}`,
            }}
          >
            To one user
          </button>
          <button
            type="button" onClick={() => setMode("broadcast")}
            style={{
              ...btnSecondary, flex: 1,
              background: mode === "broadcast" ? C.terracotta : "transparent",
              color: mode === "broadcast" ? "#fff" : C.muted,
              border: mode === "broadcast" ? "none" : `1px solid ${C.border}`,
            }}
          >
            Broadcast to all
          </button>
        </div>

        {mode === "user" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6 }}>Recipient</label>
            <select
              value={recipientId} onChange={(e) => setRecipientId(e.target.value)}
              style={{ ...inputStyle, padding: "10px 12px" }}
            >
              <option value="">— pick a user —</option>
              {users.map(u => (
                <option key={u.clerk_user_id} value={u.clerk_user_id}>
                  {u.profile_name || u.email || u.clerk_user_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "broadcast" && (
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Will send to <strong style={{ color: C.text }}>{deviceCounts.total}</strong> device(s) across <strong style={{ color: C.text }}>{deviceCounts.users}</strong> user(s).
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6 }}>Title</label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New place in Venice"
            maxLength={80}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 6 }}>Body</label>
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="The message body…"
            maxLength={200} rows={3}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ fontSize: 10, color: C.dim, textAlign: "right", marginTop: 4 }}>
            {body.length}/200
          </div>
        </div>

        <button
          type="button" onClick={send} disabled={!canSend}
          style={{ ...btnPrimary, width: "100%", opacity: canSend ? 1 : 0.4, cursor: canSend ? "pointer" : "not-allowed" }}
        >
          {sending ? "Sending…" : mode === "broadcast" ? "Send to everyone" : "Send"}
        </button>

        {result && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8, fontSize: 12,
            background: result.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            color: result.ok ? "#86efac" : "#fca5a5",
            border: `1px solid ${result.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}>
            {result.message}
          </div>
        )}
      </div>

      <div style={{ ...sectionHeader, marginTop: 24 }}>History</div>
      {log.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          Nothing sent yet.
        </div>
      ) : (
        log.map(entry => (
          <div key={entry.id} style={{ ...cardStyle, marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{entry.title}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{timeAgo(entry.sent_at)}</div>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{entry.body}</div>
            <div style={{ fontSize: 10, color: C.dim, display: "flex", gap: 10 }}>
              <span>→ {recipientName(entry.recipient_id)}</span>
              <span style={{
                color: entry.apns_status === 200 ? "#86efac" : "#fca5a5"
              }}>
                {entry.apns_status === 200 ? "delivered" : entry.apns_status ? `APNs ${entry.apns_status}` : "—"}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
