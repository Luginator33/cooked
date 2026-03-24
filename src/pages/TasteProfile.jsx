import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { getTasteFingerprint, getCookedScore, getPeopleLikeYou, getWhoToFollow } from "../lib/neo4j";

const C = {
  bg: "#0f0c09", bg2: "#1a1208", bg3: "#2e1f0e",
  border: "#2e1f0e", text: "#f0ebe2", muted: "#5a3a20",
  dim: "#3d2a18", terracotta: "#c4603a",
};

export default function TasteProfile({ onBack, onViewUser, allRestaurants = [] }) {
  const { user } = useUser();
  const [fingerprint, setFingerprint] = useState(null);
  const [cookedScore, setCookedScore] = useState(0);
  const [peopleLikeYou, setPeopleLikeYou] = useState([]);
  const [whoToFollow, setWhoToFollow] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getTasteFingerprint(user.id),
      getCookedScore(user.id),
      getPeopleLikeYou(user.id, 5),
      getWhoToFollow(user.id, 5),
    ]).then(([fp, score, people, follow]) => {
      setFingerprint(fp);
      setCookedScore(score);
      setPeopleLikeYou(people);
      setWhoToFollow(follow);
      setLoading(false);
    });
  }, [user?.id]);

  // Get price distribution from allRestaurants
  const priceDistribution = (() => {
    if (!fingerprint?.restaurantIds?.length) return [];
    const loved = allRestaurants.filter(r => 
      fingerprint.restaurantIds.includes(String(r.id))
    );
    const dist = { "$": 0, "$$": 0, "$$$": 0, "$$$$": 0 };
    loved.forEach(r => { if (r.price && dist[r.price] !== undefined) dist[r.price]++; });
    return Object.entries(dist).map(([price, count]) => ({ price, count }));
  })();

  // Get top tags from loved restaurants
  const topTags = (() => {
    if (!fingerprint?.restaurantIds?.length) return [];
    const loved = allRestaurants.filter(r => 
      fingerprint.restaurantIds.includes(String(r.id))
    );
    const tagCounts = {};
    loved.forEach(r => (r.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }));
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  })();

  const maxCuisineCount = fingerprint?.topCuisines?.[0]?.count || 1;

  return (
    <div style={{ 
      position: "fixed", inset: 0, background: C.bg, 
      zIndex: 999, overflowY: "auto",
      fontFamily: "DM Sans, sans-serif"
    }}>
      {/* Header */}
      <div style={{ 
        position: "sticky", top: 0, background: C.bg, 
        borderBottom: `1px solid ${C.border}`,
        padding: "16px 20px", display: "flex", 
        alignItems: "center", gap: 12, zIndex: 10
      }}>
        <button onClick={onBack} style={{
          background: C.bg2, border: "none", color: C.text,
          borderRadius: 20, padding: "6px 14px", cursor: "pointer",
          fontSize: 14
        }}>← Back</button>
        <span style={{ 
          fontFamily: "Cormorant Garamond, serif", 
          fontStyle: "italic", fontSize: 22, color: C.text 
        }}>Your Taste Profile</span>
      </div>

      {loading ? (
        <div style={{ 
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "60vh", color: C.muted, fontSize: 16 
        }}>Building your taste profile...</div>
      ) : !fingerprint ? (
        <div style={{ 
          display: "flex", flexDirection: "column", alignItems: "center", 
          justifyContent: "center", height: "60vh", gap: 12,
          color: C.muted, fontSize: 16, padding: 32, textAlign: "center"
        }}>
          <span style={{ fontSize: 40 }}>🔥</span>
          <p>Love some restaurants to build your taste profile.</p>
        </div>
      ) : (
        <div style={{ padding: "20px 20px 100px" }}>

          {/* Cooked Score */}
          <div style={{
            background: C.bg2, borderRadius: 16, padding: 20,
            marginBottom: 20, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div>
              <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 4 }}>COOKED SCORE</div>
              <div style={{ fontSize: 48, fontFamily: "Cormorant Garamond, serif", fontStyle: "italic", color: C.terracotta, lineHeight: 1 }}>{cookedScore}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Based on {fingerprint.totalLoves} loves across {fingerprint.topCities.length} cities</div>
            </div>
            <div style={{ fontSize: 48 }}>🔥</div>
          </div>

          {/* Top Cuisines */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 12 }}>TOP CUISINES</div>
            {fingerprint.topCuisines.map(({ name, count }) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.text, fontSize: 14 }}>{name}</span>
                  <span style={{ color: C.muted, fontSize: 12 }}>{count}</span>
                </div>
                <div style={{ background: C.border, borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{
                    background: C.terracotta, height: "100%", borderRadius: 4,
                    width: `${(count / maxCuisineCount) * 100}%`,
                    transition: "width 0.8s ease"
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Price Distribution */}
          {priceDistribution.some(p => p.count > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 12 }}>PRICE RANGE</div>
              <div style={{ display: "flex", gap: 8 }}>
                {priceDistribution.map(({ price, count }) => (
                  <div key={price} style={{
                    flex: 1, background: count > 0 ? C.terracotta : C.bg2,
                    borderRadius: 10, padding: "12px 8px", textAlign: "center",
                    border: `1px solid ${C.border}`, opacity: count > 0 ? 1 : 0.4
                  }}>
                    <div style={{ color: count > 0 ? "#fff" : C.muted, fontSize: 14, fontWeight: 600 }}>{price}</div>
                    <div style={{ color: count > 0 ? "rgba(255,255,255,0.7)" : C.muted, fontSize: 11, marginTop: 2 }}>{count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Cities */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 12 }}>YOUR CITIES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {fingerprint.topCities.map(({ name, count }) => (
                <div key={name} style={{
                  background: C.bg2, border: `1px solid ${C.border}`,
                  borderRadius: 20, padding: "6px 14px",
                  display: "flex", alignItems: "center", gap: 6
                }}>
                  <span style={{ color: C.text, fontSize: 13 }}>{name}</span>
                  <span style={{ 
                    background: C.terracotta, color: "#fff", 
                    borderRadius: 10, padding: "1px 6px", fontSize: 10 
                  }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Vibes / Tags */}
          {topTags.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 12 }}>YOUR VIBES</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topTags.map(({ tag, count }) => (
                  <div key={tag} style={{
                    background: count >= 3 ? C.bg3 : C.bg2,
                    border: `1px solid ${count >= 3 ? C.terracotta : C.border}`,
                    borderRadius: 20, padding: "6px 14px",
                    color: count >= 3 ? C.terracotta : C.muted, fontSize: 13
                  }}>{tag}</div>
                ))}
              </div>
            </div>
          )}

          {/* People Like You */}
          {peopleLikeYou.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 12 }}>PEOPLE LIKE YOU</div>
              {peopleLikeYou.map(person => (
                <div key={person.id} onClick={() => onViewUser?.(person.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", background: C.bg2, borderRadius: 12,
                    marginBottom: 8, border: `1px solid ${C.border}`, cursor: "pointer"
                  }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 15, fontFamily: "Cormorant Garamond, serif", fontStyle: "italic" }}>{person.name || person.username}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                      {person.sharedCount} restaurant{person.sharedCount !== 1 ? "s" : ""} in common
                    </div>
                  </div>
                  <span style={{ color: C.terracotta, fontSize: 20 }}>→</span>
                </div>
              ))}
            </div>
          )}

          {/* Who To Follow */}
          {whoToFollow.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace", letterSpacing: 1, marginBottom: 12 }}>WHO TO FOLLOW</div>
              {whoToFollow.map(person => (
                <div key={person.id} onClick={() => onViewUser?.(person.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", background: C.bg2, borderRadius: 12,
                    marginBottom: 8, border: `1px solid ${C.border}`, cursor: "pointer"
                  }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 15, fontFamily: "Cormorant Garamond, serif", fontStyle: "italic" }}>{person.name || person.username}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                      {person.sharedCount} taste match · friend of a friend
                    </div>
                  </div>
                  <span style={{ color: C.terracotta, fontSize: 20 }}>→</span>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
