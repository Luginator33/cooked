import { useState, useEffect } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnDanger, btnSmall, btnOutline, sectionHeader, badge, SearchBar, ConfirmDialog, Toast } from "./adminHelpers";
import { getAllUsers, setUserAdmin, deleteUserData, blockUser, unblockUser, getBlockedUsers, logAdminAction, saveUserData } from "../../lib/supabase";
import { deleteUserFromGraph } from "../../lib/neo4j";
import { ProfilePhoto } from "../AvatarIcon";

export default function AdminUsers({ userId }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState("search");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [blockReason, setBlockReason] = useState("");

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  // Load all users on mount
  useEffect(() => {
    setLoading(true);
    getAllUsers(200).then(data => { setUsers(data); setLoading(false); });
  }, []);

  useEffect(() => {
    if (section === "blocked") getBlockedUsers().then(setBlocked);
  }, [section]);

  const refreshUsers = () => getAllUsers(200).then(setUsers);

  const filteredUsers = search.trim()
    ? users.filter(u => (u.profile_name || "").toLowerCase().includes(search.toLowerCase()) || (u.profile_username || "").toLowerCase().includes(search.toLowerCase()) || u.clerk_user_id.includes(search))
    : users;

  const handleGrantAdmin = async (clerkId, name) => {
    await setUserAdmin(clerkId, true);
    await logAdminAction("grant_admin", userId, "user", clerkId, { name });
    showToast(`${name} is now an admin`);
    refreshUsers();
  };

  const handleRevokeAdmin = async (clerkId, name) => {
    await setUserAdmin(clerkId, false);
    await logAdminAction("revoke_admin", userId, "user", clerkId, { name });
    showToast(`Removed admin from ${name}`);
    refreshUsers();
  };

  const handleBlock = async (clerkId, name) => {
    await blockUser(clerkId, userId, blockReason);
    await logAdminAction("block_user", userId, "user", clerkId, { name, reason: blockReason });
    showToast(`Blocked ${name}`);
    setBlockReason("");
    setConfirm(null);
    refreshUsers();
  };

  const handleUnblock = async (clerkId) => {
    await unblockUser(clerkId);
    await logAdminAction("unblock_user", userId, "user", clerkId, {});
    showToast("User unblocked");
    getBlockedUsers().then(setBlocked);
  };

  const handleDelete = async (clerkId, name) => {
    await deleteUserData(clerkId);
    await deleteUserFromGraph(clerkId);
    await logAdminAction("delete_user", userId, "user", clerkId, { name });
    showToast(`Deleted ${name}`);
    setConfirm(null);
    refreshUsers();
  };

  const handleForceLogout = async (clerkId, name) => {
    await saveUserData(clerkId, { force_logout: true });
    await logAdminAction("force_logout", userId, "user", clerkId, { name });
    showToast(`Force logout set for ${name}`);
  };

  const timeSince = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  return (
    <div>
      {toast && <Toast {...toast} />}
      {confirm && <ConfirmDialog {...confirm} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button type="button" onClick={() => setSection("search")} style={{ ...btnSmall, background: section === "search" ? C.terracotta : "transparent", color: section === "search" ? "#fff" : C.muted, border: section === "search" ? "none" : `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12 }}>👥</span> All Users ({users.length})
        </button>
        <button type="button" onClick={() => setSection("blocked")} style={{ ...btnSmall, background: section === "blocked" ? C.terracotta : "transparent", color: section === "blocked" ? "#fff" : C.muted, border: section === "blocked" ? "none" : `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12 }}>🚫</span> Blocked ({blocked.length})
        </button>
      </div>

      {section === "search" && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Filter by name, username, or ID..." />

          {loading ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Loading users...</div>
          ) : (
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>
              {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
            </div>
          )}

          {filteredUsers.map(u => (
            <div key={u.clerk_user_id} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <ProfilePhoto photo={u.profile_photo} size={42} userId={u.clerk_user_id} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 15, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{u.profile_name || "User"}</span>
                    {u.is_admin && <span style={badge(C.terracotta)}>ADMIN</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                    {u.profile_username || "no username"} · {timeSince(u.updated_at)}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {!u.is_admin ? (
                  <button type="button" onClick={() => handleGrantAdmin(u.clerk_user_id, u.profile_name)} style={btnSmall}>Make Admin</button>
                ) : u.clerk_user_id !== userId ? (
                  <button type="button" onClick={() => handleRevokeAdmin(u.clerk_user_id, u.profile_name)} style={btnSmall}>Remove Admin</button>
                ) : null}
                <button type="button" onClick={() => setConfirm({
                  message: `Block ${u.profile_name || "this user"}?`,
                  onConfirm: () => handleBlock(u.clerk_user_id, u.profile_name),
                  onCancel: () => setConfirm(null),
                })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Block</button>
                <button type="button" onClick={() => handleForceLogout(u.clerk_user_id, u.profile_name)} style={btnSmall}>Reset Session</button>
                {u.clerk_user_id !== userId && (
                  <button type="button" onClick={() => setConfirm({
                    message: `Permanently delete ${u.profile_name || "this user"}? This removes all data, follows, and graph relationships.`,
                    onConfirm: () => handleDelete(u.clerk_user_id, u.profile_name),
                    onCancel: () => setConfirm(null),
                  })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {section === "blocked" && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 10 }}>Blocked Users</div>
          {blocked.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No blocked users.</div>}
          {blocked.map(b => (
            <div key={b.clerk_user_id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text }}>{b.clerk_user_id}</div>
                {b.reason && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Reason: {b.reason}</div>}
                <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{new Date(b.blocked_at).toLocaleDateString()}</div>
              </div>
              <button type="button" onClick={() => handleUnblock(b.clerk_user_id)} style={{ ...btnSmall, color: C.green, borderColor: C.green }}>Unblock</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
