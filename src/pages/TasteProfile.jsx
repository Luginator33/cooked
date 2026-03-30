import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { getTasteFingerprint, getCookedScore, getPeopleLikeYou, getWhoToFollow, getYoudLoveThis } from "../lib/neo4j";

const C = {
  bg: "#0a0a0f",
  bg2: "#12121a",
  bg3: "#1a1a24",
  border: "rgba(255,255,255,0.04)",
  border2: "rgba(255,255,255,0.06)",
  text: "#f5f0eb",
  muted: "rgba(245,240,235,0.3)",
  dim: "rgba(245,240,235,0.18)",
  terracotta: "#ff9632",
  terra2: "#e07850",
  rose: "#c44060",
  cream: "#f5f0eb",
  priceLight: "#8B5E3C",
};

const MAX_W = 430;

function initialsFromPerson(person) {
  const s = (person?.name || person?.username || "?").trim();
  if (!s) return "?";
  const parts = s.replace(/^@/, "").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return s.slice(0, 2).toUpperCase();
}

export default function TasteProfile({ onBack, onViewUser, onOpenDetail, allRestaurants = [] }) {
  const { user } = useUser();
  const [fingerprint, setFingerprint] = useState(null);
  const [cookedScore, setCookedScore] = useState(0);
  const [peopleLikeYou, setPeopleLikeYou] = useState([]);
  const [whoToFollow, setWhoToFollow] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cuisineBarsReady, setCuisineBarsReady] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getTasteFingerprint(user.id),
      getCookedScore(user.id),
      getPeopleLikeYou(user.id, 5),
      getWhoToFollow(user.id, 5),
      getYoudLoveThis(user.id, 6),
    ]).then(([fp, score, people, follow, recs]) => {
      setFingerprint(fp);
      setCookedScore(score);
      setPeopleLikeYou(people);
      setWhoToFollow(follow);
      const matched = (recs || [])
        .map(r => {
          const full = allRestaurants.find(ar => String(ar.id) === String(r.id));
          return full ? { ...full, _weight: r.weight, _recommenders: r.recommenders } : null;
        })
        .filter(Boolean);
      setRecommendations(matched);
      setLoading(false);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!fingerprint) return;
    setCuisineBarsReady(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setCuisineBarsReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, [fingerprint]);

  const priceDistribution = useMemo(() => {
    if (!fingerprint?.restaurantIds?.length) return [];
    const loved = allRestaurants.filter((r) => fingerprint.restaurantIds.includes(String(r.id)));
    const dist = { $: 0, $$: 0, $$$: 0, $$$$: 0 };
    loved.forEach((r) => {
      if (r.price && dist[r.price] !== undefined) dist[r.price]++;
    });
    return Object.entries(dist).map(([price, count]) => ({ price, count }));
  }, [fingerprint, allRestaurants]);

  const topTags = useMemo(() => {
    if (!fingerprint?.restaurantIds?.length) return [];
    const loved = allRestaurants.filter((r) => fingerprint.restaurantIds.includes(String(r.id)));
    const tagCounts = {};
    loved.forEach((r) =>
      (r.tags || []).forEach((t) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      })
    );
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [fingerprint, allRestaurants]);

  const cuisinesFiltered = useMemo(() => {
    const list = fingerprint?.topCuisines?.filter(({ name }) => name && name !== "Unknown") || [];
    return list;
  }, [fingerprint]);

  const topCitiesFiltered = useMemo(
    () => fingerprint?.topCities?.filter((c) => c.name && c.name !== "Unknown") ?? [],
    [fingerprint]
  );

  const maxCuisineCount = cuisinesFiltered[0]?.count || 1;

  const priceTotal = priceDistribution.reduce((a, p) => a + p.count, 0);
  const priceColors = [C.priceLight, "#a05238", "#b85532", C.terracotta];

  const tagMax = topTags[0]?.count || 1;
  const tagMin = topTags[topTags.length - 1]?.count || 0;
  const tagRange = Math.max(1, tagMax - tagMin);

  return (
    <>
      <style>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 20px 6px rgba(255,150,50,0.4), 0 0 40px 12px rgba(255,150,50,0.15); }
          50% { transform: scale(1.1); box-shadow: 0 0 28px 10px rgba(255,180,80,0.5), 0 0 56px 20px rgba(255,150,50,0.2); }
        }
        @keyframes orb-inner {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes taste-skeleton-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.85; }
        }
        .taste-scroll-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .taste-scroll-hide::-webkit-scrollbar {
          display: none;
        }
        .taste-flame {
          position: relative;
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .taste-flame .orb-outer {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 38%, #ff9a4a 0%, #ff9632 45%, #8b2a12 100%);
          animation: orb-pulse 2.4s ease-in-out infinite;
        }
        .taste-flame .orb-inner {
          position: absolute;
          top: 50%;
          left: 50%;
          margin-top: -14px;
          margin-left: -14px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: radial-gradient(circle at 45% 42%, #ffe0b0 0%, #ffaa50 40%, #ff9632 100%);
          animation: orb-inner 2.4s ease-in-out infinite;
          animation-delay: 0.3s;
        }
      `}</style>
      <div
        className="taste-scroll-hide"
        style={{
          position: "fixed",
          inset: 0,
          background: C.bg,
          zIndex: 999,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          fontFamily: "'Inter', -apple-system, sans-serif",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: MAX_W, minHeight: "100%", position: "relative" }}>
          {/* Header */}
          <div className="taste-header">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="taste-back-btn"
            >
              ←
            </button>
            <span className="taste-title">
              Your Taste Profile
            </span>
            <div className="taste-header-line" />
          </div>

          {loading ? (
            <div style={{ padding: "24px 20px 100px" }}>
              <div
                style={{
                  borderRadius: 20,
                  height: 200,
                  marginBottom: 28,
                  background: C.bg2,
                  animation: "taste-skeleton-pulse 1.2s ease-in-out infinite",
                }}
              />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      height: 10,
                      width: "40%",
                      borderRadius: 6,
                      background: C.bg2,
                      marginBottom: 10,
                      animation: "taste-skeleton-pulse 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.08}s`,
                    }}
                  />
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: C.bg2,
                      animation: "taste-skeleton-pulse 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.08 + 0.05}s`,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : !fingerprint ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "55vh",
                gap: 16,
                color: C.muted,
                fontSize: 16,
                padding: "32px 20px",
                textAlign: "center",
              }}
            >
              <div className="taste-flame" aria-hidden style={{ marginBottom: 8 }}>
                <span className="f1" />
                <span className="f2" />
                <span className="f3" />
              </div>
              <p style={{ margin: 0, lineHeight: 1.5, maxWidth: 280 }}>Love some restaurants to build your taste profile.</p>
            </div>
          ) : (
            <div style={{ padding: "20px 20px 100px" }}>
              {/* Cooked Score hero */}
              <div className="taste-score-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="taste-section-label">
                    COOKED SCORE
                  </div>
                  <div
                    style={{
                      fontSize: 96,
                      lineHeight: 0.95,
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontStyle: "italic",
                      fontWeight: 600,
                      color: C.terracotta,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {cookedScore}
                  </div>
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 13,
                      marginTop: 14,
                      lineHeight: 1.45,
                      fontFamily: "'Inter', -apple-system, sans-serif",
                    }}
                  >
                    Based on {fingerprint.totalLoves} loves across {fingerprint.topCities.length} cities
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 8 }}>
                  <div className="taste-flame" aria-hidden>
                    <div className="orb-outer" />
                    <div className="orb-inner" />
                  </div>
                </div>
              </div>

              {/* You'd Love This */}
              {recommendations.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 10 }}>
                    YOU'D LOVE THIS
                  </div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch", marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16 }}>
                    {recommendations.map(r => {
                      let imgSrc = r.img;
                      try {
                        const cache = JSON.parse(localStorage.getItem("cooked_shared_photos") || "{}");
                        imgSrc = cache[r.id] || cache[String(r.id)] || r.img;
                      } catch {}
                      return (
                        <div
                          key={r.id}
                          onClick={() => onOpenDetail?.(r)}
                          className="taste-rec-card"
                          style={{ minWidth: 130, maxWidth: 130, flexShrink: 0, cursor: "pointer" }}
                        >
                          <div className="taste-rec-img" style={{ width: 130, height: 130 }}>
                            {imgSrc ? <img src={imgSrc} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                            <div className="taste-rec-badge">
                              {r.rating}
                            </div>
                          </div>
                          <div className="taste-rec-name">
                            {r.name}
                          </div>
                          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                            {r.cuisine} · {r.city}
                          </div>
                          <div style={{ fontSize: 9, color: C.terracotta, marginTop: 2, fontFamily: "'Inter', -apple-system, sans-serif" }}>
                            {r._weight} {r._weight === 1 ? "taste match" : "taste matches"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Top Cuisines */}
              {cuisinesFiltered.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 14 }}>
                    TOP CUISINES
                  </div>
                  {cuisinesFiltered.map(({ name, count }, i) => {
                    const pct = maxCuisineCount ? (count / maxCuisineCount) * 100 : 0;
                    return (
                      <div key={name} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ color: C.text, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                            {i === 0 ? <span style={{ fontSize: 13 }}>🥇</span> : null}
                            {name}
                          </span>
                          <span style={{ color: C.muted, fontSize: 12, fontFamily: "'Inter', -apple-system, sans-serif" }}>{count}</span>
                        </div>
                        <div className="taste-bar-track">
                          <div
                            className="taste-bar-fill"
                            style={{
                              width: cuisineBarsReady ? `${pct}%` : "0%",
                              transitionDelay: `${i * 0.07}s`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              {/* Price range bar */}
              {priceDistribution.some((p) => p.count > 0) && priceTotal > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 14 }}>
                    PRICE RANGE
                  </div>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 12,
                      overflow: "hidden",
                      height: 14,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    {priceDistribution.map(({ price, count }, idx) => {
                      const w = (count / priceTotal) * 100;
                      return (
                        <div
                          key={price}
                          title={`${price}: ${count}`}
                          style={{
                            width: `${w}%`,
                            minWidth: count > 0 ? 4 : 0,
                            background: priceColors[idx],
                            transition: "width 0.4s ease",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", marginTop: 10, justifyContent: "space-between", gap: 4 }}>
                    {priceDistribution.map(({ price, count }, idx) => (
                      <div
                        key={price}
                        style={{
                          flex: 1,
                          textAlign: "center",
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: count > 0 ? priceColors[idx] : C.dim }}>{price}</div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", marginTop: 2 }}>{count}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Cities — horizontal scroll */}
              {topCitiesFiltered.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 12 }}>
                    YOUR CITIES
                  </div>
                  <div
                    className="taste-scroll-hide"
                    style={{
                      display: "flex",
                      gap: 10,
                      overflowX: "auto",
                      paddingBottom: 6,
                      marginLeft: -4,
                      paddingLeft: 4,
                      WebkitOverflowScrolling: "touch",
                    }}
                  >
                    {topCitiesFiltered.map(({ name, count }) => (
                      <div
                        key={name}
                        className="taste-city-pill"
                      >
                        <span className="taste-city-name">
                          {name}
                        </span>
                        <span className="taste-city-count">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Vibes word cloud */}
              {topTags.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 12 }}>
                    YOUR VIBES
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "baseline",
                      gap: "10px 14px",
                      lineHeight: 1.35,
                    }}
                  >
                    {topTags.map(({ tag, count }, idx) => {
                      const t = (count - tagMin) / tagRange;
                      const fontSize = 12 + Math.round(t * 14);
                      const topTier = idx < 3;
                      return (
                        <span
                          key={tag}
                          style={{
                            fontSize,
                            fontWeight: topTier ? 600 : 400,
                            color: topTier ? C.terracotta : C.muted,
                            fontFamily: "'Inter', -apple-system, sans-serif",
                          }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* People like you */}
              {peopleLikeYou.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 12 }}>
                    PEOPLE LIKE YOU
                  </div>
                  {peopleLikeYou.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      subtitle={`${person.sharedCount} restaurant${person.sharedCount !== 1 ? "s" : ""} in common`}
                      onClick={() => onViewUser?.(person.id)}
                    />
                  ))}
                </section>
              )}

              {/* Who to follow */}
              {whoToFollow.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div className="taste-section-label" style={{ marginBottom: 12 }}>
                    WHO TO FOLLOW
                  </div>
                  {whoToFollow.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      subtitle={`${person.sharedCount} restaurants in common · friend of a friend`}
                      onClick={() => onViewUser?.(person.id)}
                    />
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PersonRow({ person, subtitle, onClick }) {
  const initials = initialsFromPerson(person);
  return (
    <button
      type="button"
      onClick={onClick}
      className="taste-person-row"
    >
      <div className="tp-accent" />
      <div className="tp-avatar">
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: C.text,
            fontSize: 17,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {person.name || person.username}
        </div>
        <div
          style={{
            color: C.muted,
            fontSize: 10,
            fontFamily: "'Inter', -apple-system, sans-serif",
            letterSpacing: "0.06em",
            marginTop: 4,
          }}
        >
          {subtitle}
        </div>
      </div>
      <span style={{ color: C.dim, fontSize: 16, flexShrink: 0, opacity: 0.85 }} aria-hidden>
        →
      </span>
    </button>
  );
}
