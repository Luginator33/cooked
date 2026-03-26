import { useState, useEffect, useMemo } from "react";
import { C, cardStyle, sectionHeader, StatCard, btnSmall, SearchBar } from "./adminHelpers";
import { getAnalytics, getActivityLog, getAllUsers } from "../../lib/supabase";
import { getGraphStats, runQuery } from "../../lib/neo4j";
import { RESTAURANTS } from "../../data/restaurants";

export default function AdminAnalytics({ allRestaurants }) {
  const [section, setSection] = useState("dashboard");
  const [analytics, setAnalytics] = useState(null);
  const [graphStats, setGraphStats] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState(null); // { type, title, data }
  const [graphDetails, setGraphDetails] = useState(null); // top loved, top users, etc.

  useEffect(() => {
    if (section === "dashboard" && !analytics) {
      Promise.all([
        getAnalytics(),
        getAllUsers(10000),
      ]).then(([data, users]) => {
        // Compute most loved restaurants
        const loveCounts = {};
        users.forEach(u => {
          const loved = Array.isArray(u.loved) ? u.loved : [];
          loved.forEach(id => { loveCounts[id] = (loveCounts[id] || 0) + 1; });
        });
        const topLoved = Object.entries(loveCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([id, count]) => {
            const r = allRestaurants.find(r => String(r.id) === String(id));
            return { id, name: r?.name || `ID ${id}`, city: r?.city || "", cuisine: r?.cuisine || "", count };
          });

        // City breakdown
        const cityCount = {};
        allRestaurants.forEach(r => { if (r.city) cityCount[r.city] = (cityCount[r.city] || 0) + 1; });
        const citySorted = Object.entries(cityCount).sort((a, b) => b[1] - a[1]);

        // Cuisine breakdown
        const cuisineCount = {};
        allRestaurants.forEach(r => { if (r.cuisine) cuisineCount[r.cuisine] = (cuisineCount[r.cuisine] || 0) + 1; });
        const cuisineSorted = Object.entries(cuisineCount).sort((a, b) => b[1] - a[1]);

        // Most active users
        const activeUsers = users
          .map(u => ({ ...u, loveCount: Array.isArray(u.loved) ? u.loved.length : 0 }))
          .sort((a, b) => b.loveCount - a.loveCount)
          .slice(0, 20);

        setAnalytics({ ...data, topLoved, citySorted, cuisineSorted, activeUsers, allUsers: users });
        setLoading(false);
      });
    }
    if (section === "graph" && !graphStats) {
      getGraphStats().then(setGraphStats);
      // Fetch additional graph details
      Promise.all([
        runQuery("MATCH (u:User)-[l:LOVED]->(r:Restaurant) RETURN r.name AS name, r.city AS city, count(l) AS loves ORDER BY loves DESC LIMIT 15"),
        runQuery("MATCH (u:User)-[l:LOVED]->(r:Restaurant) RETURN u.name AS name, u.username AS username, count(l) AS loves ORDER BY loves DESC LIMIT 15"),
        runQuery("MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN u.name AS name, count(f) AS following ORDER BY following DESC LIMIT 10"),
      ]).then(([topRest, topUsers, topFollowing]) => {
        setGraphDetails({
          topRestaurants: topRest.map(r => ({ name: r.get("name"), city: r.get("city"), loves: r.get("loves").toNumber() })),
          topUsers: topUsers.map(r => ({ name: r.get("name"), username: r.get("username"), loves: r.get("loves").toNumber() })),
          topFollowing: topFollowing.map(r => ({ name: r.get("name"), following: r.get("following").toNumber() })),
        });
      });
    }
    if (section === "log") {
      getActivityLog(100).then(setActivityLog);
    }
  }, [section]);

  const actionLabel = (action) => {
    const map = {
      restaurant_remove: "Removed restaurant", restaurant_edit: "Edited restaurant", restaurant_smart_import: "Imported restaurant",
      restaurant_bulk_import: "Bulk import", restaurant_merge: "Merged restaurants", restaurant_city_fix: "Fixed city",
      grant_admin: "Granted admin", revoke_admin: "Revoked admin", block_user: "Blocked user", unblock_user: "Unblocked user",
      delete_user: "Deleted user", force_logout: "Force logout", photo_fix: "Fixed photo", photo_replace: "Replaced photo",
      photo_approve: "Approved photo", photo_reject: "Rejected photo", toggle_feature: "Toggled feature",
      send_notification: "Sent notification", bulk_import: "Bulk import",
    };
    return map[action] || action;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { key: "dashboard", label: "Dashboard", icon: "📊" },
          { key: "graph", label: "Neo4j Graph", icon: "🔗" },
          { key: "log", label: "Activity Log", icon: "📋" },
        ].map(s => (
          <button key={s.key} type="button" onClick={() => { setSection(s.key); setDrillDown(null); }} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {section === "dashboard" && !drillDown && (
        <>
          {loading ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Loading analytics...</div>
          ) : analytics && (
            <>
              {/* Top stats */}
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div onClick={() => setDrillDown({ type: "users", title: "All Users" })} style={{ flex: 1, cursor: "pointer" }}>
                  <StatCard label="Users" value={analytics.totalUsers} />
                </div>
                <div onClick={() => setDrillDown({ type: "loved", title: "Most Loved" })} style={{ flex: 1, cursor: "pointer" }}>
                  <StatCard label="Total Loves" value={analytics.totalLoves.toLocaleString()} />
                </div>
                <StatCard label="Photos" value={analytics.totalPhotos.toLocaleString()} />
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div onClick={() => setDrillDown({ type: "cities", title: "Restaurants by City" })} style={{ flex: 1, cursor: "pointer" }}>
                  <StatCard label="Cities" value={analytics.citySorted.length} />
                </div>
                <div onClick={() => setDrillDown({ type: "cuisines", title: "Cuisines" })} style={{ flex: 1, cursor: "pointer" }}>
                  <StatCard label="Cuisines" value={analytics.cuisineSorted.length} />
                </div>
                <StatCard label="Restaurants" value={allRestaurants.length.toLocaleString()} />
              </div>

              {/* Most loved */}
              <div onClick={() => setDrillDown({ type: "loved", title: "Most Loved Restaurants" })} style={{ cursor: "pointer" }}>
                <div style={{ ...sectionHeader, display: "flex", justifyContent: "space-between" }}>
                  <span>MOST LOVED</span>
                  <span style={{ color: C.terracotta }}>see all →</span>
                </div>
              </div>
              {analytics.topLoved.slice(0, 5).map((r, i) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono', monospace", width: 20 }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{r.cuisine} · {r.city}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: C.terracotta, fontFamily: "'DM Mono', monospace", fontWeight: "bold" }}>{r.count}</span>
                </div>
              ))}

              {/* Most active users */}
              <div onClick={() => setDrillDown({ type: "active", title: "Most Active Users" })} style={{ cursor: "pointer", marginTop: 16 }}>
                <div style={{ ...sectionHeader, display: "flex", justifyContent: "space-between" }}>
                  <span>MOST ACTIVE USERS</span>
                  <span style={{ color: C.terracotta }}>see all →</span>
                </div>
              </div>
              {analytics.activeUsers.slice(0, 5).map((u, i) => (
                <div key={u.clerk_user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono', monospace", width: 20 }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: 13, color: C.text }}>{u.profile_name || "User"}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{u.profile_username || ""}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{u.loveCount} loves</span>
                </div>
              ))}

              {/* Cities */}
              <div onClick={() => setDrillDown({ type: "cities", title: "Restaurants by City" })} style={{ cursor: "pointer", marginTop: 16 }}>
                <div style={{ ...sectionHeader, display: "flex", justifyContent: "space-between" }}>
                  <span>TOP CITIES</span>
                  <span style={{ color: C.terracotta }}>see all →</span>
                </div>
              </div>
              {analytics.citySorted.slice(0, 8).map(([city, count]) => (
                <div key={city} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, color: C.text }}>{city}</span>
                  <span style={{ fontSize: 13, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{count}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* Drill-down view */}
      {section === "dashboard" && drillDown && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button type="button" onClick={() => setDrillDown(null)} style={{ ...btnSmall, border: "none", fontSize: 16 }}>←</button>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>{drillDown.title}</div>
          </div>

          {drillDown.type === "loved" && analytics?.topLoved.map((r, i) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono', monospace", width: 24 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{r.cuisine} · {r.city}</div>
                </div>
              </div>
              <span style={{ fontSize: 16, color: C.terracotta, fontFamily: "'DM Mono', monospace", fontWeight: "bold" }}>{r.count}</span>
            </div>
          ))}

          {drillDown.type === "active" && analytics?.activeUsers.map((u, i) => (
            <div key={u.clerk_user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono', monospace", width: 24 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 14, color: C.text }}>{u.profile_name || "User"}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{u.profile_username}</div>
                </div>
              </div>
              <span style={{ fontSize: 14, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{u.loveCount} loves</span>
            </div>
          ))}

          {drillDown.type === "cities" && analytics?.citySorted.map(([city, count]) => (
            <div key={city} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, color: C.text }}>{city}</span>
              <span style={{ fontSize: 14, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{count}</span>
            </div>
          ))}

          {drillDown.type === "cuisines" && analytics?.cuisineSorted.map(([cuisine, count]) => (
            <div key={cuisine} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14, color: C.text }}>{cuisine}</span>
              <span style={{ fontSize: 14, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{count}</span>
            </div>
          ))}

          {drillDown.type === "users" && analytics?.allUsers.map(u => (
            <div key={u.clerk_user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: C.bg2, border: `1px solid ${C.border}` }}>
                {u.profile_photo && <img src={u.profile_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text }}>{u.profile_name || "User"}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{u.profile_username}</div>
              </div>
              {u.is_admin && <span style={{ fontSize: 9, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>ADMIN</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── NEO4J GRAPH ── */}
      {section === "graph" && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 12 }}>
            Neo4j Graph Database
          </div>

          {!graphStats ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Loading graph stats...</div>
          ) : (
            <>
              {/* Node counts */}
              <div style={sectionHeader}>NODES</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <StatCard label="Users" value={graphStats.users} />
                <StatCard label="Restaurants" value={graphStats.restaurants} />
                <StatCard label="Cities" value={graphStats.cities} />
              </div>

              {/* Relationship counts */}
              <div style={sectionHeader}>RELATIONSHIPS</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <StatCard label="LOVED" value={graphStats.loves} />
                <StatCard label="FOLLOWS" value={graphStats.follows} />
              </div>

              {/* Visual node diagram */}
              <div style={sectionHeader}>GRAPH STRUCTURE</div>
              <div style={{ ...cardStyle, padding: "20px 16px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  {/* User node */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", background: C.terracotta, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 22, color: "#fff", fontWeight: "bold" }}>
                      {graphStats.users}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>:User</div>
                  </div>

                  {/* Arrows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace" }}>
                    <div>—LOVED→ ({graphStats.loves})</div>
                    <div>—FOLLOWS→ ({graphStats.follows})</div>
                  </div>

                  {/* Restaurant node */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 60, height: 60, borderRadius: 12, background: C.bg, border: `2px solid ${C.terracotta}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18, color: C.terracotta, fontWeight: "bold" }}>
                      {graphStats.restaurants}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>:Restaurant</div>
                  </div>

                  {/* Arrow to city */}
                  <div style={{ fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace" }}>—IN→</div>

                  {/* City node */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 50, height: 50, borderRadius: 8, background: C.bg, border: `2px solid ${C.blue}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 16, color: C.blue, fontWeight: "bold" }}>
                      {graphStats.cities}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>:City</div>
                  </div>
                </div>
              </div>

              {/* Graph detail lists */}
              {graphDetails && (
                <>
                  <div style={{ ...sectionHeader, marginTop: 16 }}>MOST LOVED IN GRAPH</div>
                  {graphDetails.topRestaurants.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <span style={{ fontSize: 13, color: C.text }}>{r.name}</span>
                        <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>{r.city}</span>
                      </div>
                      <span style={{ fontSize: 13, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{r.loves}</span>
                    </div>
                  ))}

                  <div style={{ ...sectionHeader, marginTop: 16 }}>TOP USERS BY LOVES</div>
                  {graphDetails.topUsers.map((u, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, color: C.text }}>{u.name || u.username || "Unknown"}</span>
                      <span style={{ fontSize: 13, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{u.loves}</span>
                    </div>
                  ))}

                  <div style={{ ...sectionHeader, marginTop: 16 }}>MOST CONNECTED (FOLLOWING)</div>
                  {graphDetails.topFollowing.map((u, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, color: C.text }}>{u.name || "Unknown"}</span>
                      <span style={{ fontSize: 13, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{u.following}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── ACTIVITY LOG ── */}
      {section === "log" && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 10 }}>
            Activity Log
          </div>
          {activityLog.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No admin activity yet.</div>}
          {activityLog.map(entry => (
            <div key={entry.id} style={{ ...cardStyle, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 13, color: C.terracotta, fontWeight: 600 }}>{actionLabel(entry.action)}</div>
                <div style={{ fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                  {new Date(entry.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {entry.details && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {entry.details.name && <span>{entry.details.name}</span>}
                  {entry.details.count && <span>{entry.details.count} items</span>}
                  {entry.details.message && <span>"{entry.details.message.slice(0, 50)}"</span>}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
