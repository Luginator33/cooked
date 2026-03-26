import { useState, useEffect } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnDanger, btnSmall, btnOutline, sectionHeader, badge, SearchBar, ConfirmDialog, Toast } from "./adminHelpers";
import { getAllUsers, setUserAdmin, deleteUserData, blockUser, unblockUser, getBlockedUsers, logAdminAction, saveUserData } from "../../lib/supabase";
import { deleteUserFromGraph } from "../../lib/neo4j";

export default function AdminUsers({ userId }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState("search");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [blockReason, setBlockReason] = useState("");

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    if (section === "blocked") {
      getBlockedUsers().then(setBlocked);
    }
  }, [section]);

  const doSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    const results = await getAllUsers(50, 0, search);
    setUsers(results);
    setLoading(false);
  };

  const handleGrantAdmin = async (clerkId, name) => {
    await setUserAdmin(clerkId, true);
    await logAdminAction("grant_admin", userId, "user", clerkId, { name });
    showToast(`${name} is now an admin`);
    doSearch();
  };

  const handleRevokeAdmin = async (clerkId, name) => {
    await setUserAdmin(clerkId, false);
    await logAdminAction("revoke_admin", userId, "user", clerkId, { name });
    showToast(`Removed admin from ${name}`);
    doSearch();
  };

  const handleBlock = async (clerkId, name) => {
    await blockUser(clerkId, userId, blockReason);
    await logAdminAction("block_user", userId, "user", clerkId, { name, reason: blockReason });
    showToast(`Blocked ${name}`);
    setBlockReason("");
    setConfirm(null);
    doSearch();
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
    doSearch();
  };

  const handleForceLogout = async (clerkId, name) => {
    await saveUserData(clerkId, { force_logout: true });
    await logAdminAction("force_logout", userId, "user", clerkId, { name });
    showToast(`Force logout set for ${name}`);
  };

  return (
    <div>
      {toast && <Toast {...toast} />}
      {confirm && <ConfirmDialog {...confirm} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button type="button" onClick={() => setSection("search")} style={{ ...btnSmall, background: section === "search" ? C.terracotta : "transparent", color: section === "search" ? "#fff" : C.muted, border: section === "search" ? "none" : `1px solid ${C.border}` }}>Search Users</button>
        <button type="button" onClick={() => setSection("blocked")} style={{ ...btnSmall, background: section === "blocked" ? C.terracotta : "transparent", color: section === "blocked" ? "#fff" : C.muted, border: section === "blocked" ? "none" : `1px solid ${C.border}` }}>Blocked</button>
      </div>

      {section === "search" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search by name or username..." />
            </div>
            <button type="button" onClick={doSearch} style={{ ...btnPrimary, height: 42, flexShrink: 0 }}>Search</button>
          </div>

          {loading && <div style={{ color: C.muted, fontSize: 13 }}>Searching...</div>}

          {users.map(u => (
            <div key={u.clerk_user_id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {u.profile_photo && <img src={u.profile_photo} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `1px solid ${C.border}` }} />}
                  <div>
                    <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>{u.profile_name || "User"}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{u.profile_username || "no username"}</div>
                  </div>
                </div>
                {u.is_admin && <span style={badge(C.terracotta)}>ADMIN</span>}
              </div>
              <div style={{ fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>{u.clerk_user_id}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {!u.is_admin ? (
                  <button type="button" onClick={() => handleGrantAdmin(u.clerk_user_id, u.profile_name)} style={btnSmall}>Make Admin</button>
                ) : u.clerk_user_id !== userId ? (
                  <button type="button" onClick={() => handleRevokeAdmin(u.clerk_user_id, u.profile_name)} style={btnSmall}>Remove Admin</button>
                ) : null}
                <button type="button" onClick={() => setConfirm({
                  message: <div><div>Block {u.profile_name}?</div><input type="text" value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason (optional)" style={{ ...inputStyle, marginTop: 10 }} /></div>,
                  onConfirm: () => handleBlock(u.clerk_user_id, u.profile_name),
                  onCancel: () => setConfirm(null),
                })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Block</button>
                <button type="button" onClick={() => handleForceLogout(u.clerk_user_id, u.profile_name)} style={btnSmall}>Reset Session</button>
                <button type="button" onClick={() => setConfirm({
                  message: `Permanently delete ${u.profile_name}? This removes all their data, follows, and graph relationships.`,
                  onConfirm: () => handleDelete(u.clerk_user_id, u.profile_name),
                  onCancel: () => setConfirm(null),
                })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Delete</button>
              </div>
            </div>
          ))}
        </>
      )}

      {section === "blocked" && (
        <>
          <div style={sectionHeader}>BLOCKED USERS ({blocked.length})</div>
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
