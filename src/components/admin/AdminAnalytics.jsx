import { useState, useEffect } from "react";
import { C, cardStyle, sectionHeader, StatCard, btnSmall } from "./adminHelpers";
import { getAnalytics, getActivityLog } from "../../lib/supabase";
import { getGraphStats } from "../../lib/neo4j";
import { RESTAURANTS } from "../../data/restaurants";

export default function AdminAnalytics({ allRestaurants }) {
  const [section, setSection] = useState("dashboard");
  const [analytics, setAnalytics] = useState(null);
  const [graphStats, setGraphStats] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (section === "dashboard" && !analytics) {
      getAnalytics().then(data => { setAnalytics(data); setLoading(false); });
    }
    if (section === "graph" && !graphStats) {
      getGraphStats().then(setGraphStats);
    }
    if (section === "log") {
      getActivityLog(50).then(setActivityLog);
    }
  }, [section]);

  const mostLovedRestaurants = (() => {
    if (!analytics) return [];
    // Count how many users have each restaurant in their loved list — approximation from client data
    const counts = {};
    return [];
  })();

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[{ key: "dashboard", label: "Dashboard" }, { key: "graph", label: "Neo4j" }, { key: "log", label: "Activity Log" }].map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
          }}>{s.label}</button>
        ))}
      </div>

      {/* Dashboard */}
      {section === "dashboard" && (
        <>
          <div style={sectionHeader}>OVERVIEW</div>
          {loading ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Loading analytics...</div>
          ) : analytics && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <StatCard label="Users" value={analytics.totalUsers} />
                <StatCard label="Total Loves" value={analytics.totalLoves.toLocaleString()} />
                <StatCard label="Photos" value={analytics.totalPhotos.toLocaleString()} />
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <StatCard label="Restaurants" value={allRestaurants.length.toLocaleString()} />
                <StatCard label="Static" value={RESTAURANTS.length.toLocaleString()} />
                <StatCard label="Community" value={(allRestaurants.length - RESTAURANTS.length).toLocaleString()} />
              </div>

              {/* City breakdown */}
              <div style={sectionHeader}>RESTAURANTS BY CITY</div>
              {(() => {
                const cityCount = {};
                allRestaurants.forEach(r => { if (r.city) cityCount[r.city] = (cityCount[r.city] || 0) + 1; });
                return Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([city, count]) => (
                  <div key={city} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13, color: C.text }}>{city}</span>
                    <span style={{ fontSize: 13, color: C.terracotta, fontFamily: "'DM Mono', monospace" }}>{count}</span>
                  </div>
                ));
              })()}
            </>
          )}
        </>
      )}

      {/* Neo4j Graph Stats */}
      {section === "graph" && (
        <>
          <div style={sectionHeader}>NEO4J GRAPH</div>
          {!graphStats ? (
            <div style={{ color: C.muted, fontSize: 13 }}>Loading graph stats...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <StatCard label="Users" value={graphStats.users} />
                <StatCard label="Restaurants" value={graphStats.restaurants} />
                <StatCard label="Cities" value={graphStats.cities} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <StatCard label="LOVED" value={graphStats.loves} />
                <StatCard label="FOLLOWS" value={graphStats.follows} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Activity Log */}
      {section === "log" && (
        <>
          <div style={sectionHeader}>RECENT ADMIN ACTIONS</div>
          {activityLog.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No activity yet.</div>}
          {activityLog.map(entry => (
            <div key={entry.id} style={{ ...cardStyle, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 12, color: C.terracotta, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{entry.action}</div>
                <div style={{ fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace" }}>
                  {new Date(entry.created_at).toLocaleString()}
                </div>
              </div>
              {entry.target_type && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {entry.target_type}: {entry.target_id}
                </div>
              )}
              {entry.details && (
                <div style={{ fontSize: 10, color: C.dim, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
                  {JSON.stringify(entry.details).slice(0, 100)}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
