import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { getTasteFingerprint, getCookedScore, getPeopleLikeYou, getWhoToFollow, getYoudLoveThis } from "../lib/neo4j";

const C = {
  bg: "#0f0c09",
  bg2: "#1a1208",
  bg3: "#2e1f0e",
  border: "#2e1f0e",
  text: "#f0ebe2",
  muted: "#5a3a20",
  dim: "#3d2a18",
  terracotta: "#c4603a",
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
          0%, 100% { transform: scale(1); box-shadow: 0 0 20px 6px rgba(196,96,58,0.4), 0 0 40px 12px rgba(196,96,58,0.15); }
          50% { transform: scale(1.1); box-shadow: 0 0 28px 10px rgba(228,110,50,0.5), 0 0 56px 20px rgba(196,96,58,0.2); }
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
          background: radial-gradient(circle at 40% 38%, #ff9a4a 0%, #c4603a 45%, #8b2a12 100%);
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
          background: radial-gradient(circle at 45% 42%, #ffe0b0 0%, #ffaa50 40%, #c4603a 100%);
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
          fontFamily: "DM Sans, sans-serif",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: MAX_W, minHeight: "100%", position: "relative" }}>
          {/* Header */}
          <div
            style={{
              position: "sticky",
              top: 0,
              background: C.bg,
              padding: "14px 20px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              zIndex: 20,
              boxSizing: "border-box",
            }}
          >
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              style={{
                background: C.bg2,
                border: "none",
                color: C.text,
                borderRadius: "50%",
                width: 40,
                height: 40,
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ←
            </button>
            <span
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontStyle: "italic",
                fontSize: 22,
                color: C.text,
                flex: 1,
              }}
            >
              Your Taste Profile
            </span>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 1,
                background: C.terracotta,
                opacity: 0.85,
              }}
            />
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
              <div
                style={{
                  borderRadius: 22,
                  padding: "28px 22px 26px",
                  marginBottom: 28,
                  background: "radial-gradient(ellipse 120% 100% at 50% 30%, #2a1810 0%, #120c08 45%, #0a0806 100%)",
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "stretch",
                  justifyContent: "space-between",
                  gap: 12,
                  boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 8,
                    }}
                  >
                    COOKED SCORE
                  </div>
                  <div
                    style={{
                      fontSize: 96,
                      lineHeight: 0.95,
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
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
                      fontFamily: "DM Sans, sans-serif",
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
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, fontFamily: "'DM Mono', monospace", marginBottom: 10 }}>
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
                          style={{ minWidth: 130, maxWidth: 130, flexShrink: 0, cursor: "pointer" }}
                        >
                          <div style={{ width: 130, height: 130, borderRadius: 14, overflow: "hidden", background: C.bg2, border: `1px solid ${C.border}`, position: "relative" }}>
                            {imgSrc ? <img src={imgSrc} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                            <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "2px 6px", fontSize: 11, color: C.terracotta, fontFamily: "Georgia,serif", fontWeight: "bold" }}>
                              {r.rating}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: C.text, fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", marginTop: 6, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.name}
                          </div>
                          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                            {r.cuisine} · {r.city}
                          </div>
                          <div style={{ fontSize: 9, color: C.terracotta, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
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
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 14,
                    }}
                  >
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
                          <span style={{ color: C.muted, fontSize: 12, fontFamily: '"DM Mono", monospace' }}>{count}</span>
                        </div>
                        <div
                          style={{
                            background: C.border,
                            borderRadius: 8,
                            height: 8,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: cuisineBarsReady ? `${pct}%` : "0%",
                              borderRadius: 8,
                              background: "linear-gradient(90deg, #c4603a 0%, #8a3a18 100%)",
                              transition: "width 0.85s cubic-bezier(0.22, 1, 0.36, 1)",
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
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 14,
                    }}
                  >
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
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace', marginTop: 2 }}>{count}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Cities — horizontal scroll */}
              {topCitiesFiltered.length > 0 && (
                <section style={{ marginBottom: 28 }}>
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 12,
                    }}
                  >
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
                        style={{
                          flexShrink: 0,
                          padding: "12px 18px",
                          borderRadius: 999,
                          border: `1px solid ${C.border}`,
                          background: C.bg2,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: '"Cormorant Garamond", Georgia, serif',
                            fontStyle: "italic",
                            fontSize: 17,
                            color: C.text,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </span>
                        <span
                          style={{
                            background: C.terracotta,
                            color: "#fff",
                            borderRadius: 999,
                            padding: "3px 9px",
                            fontSize: 11,
                            fontFamily: '"DM Mono", monospace',
                            fontWeight: 600,
                          }}
                        >
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
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 12,
                    }}
                  >
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
                            fontFamily: "DM Sans, sans-serif",
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
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 12,
                    }}
                  >
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
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 10,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: "2px",
                      marginBottom: 12,
                    }}
                  >
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
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px 12px 0",
        marginBottom: 10,
        background: C.bg2,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        borderLeft: "none",
        cursor: "pointer",
        textAlign: "left",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: C.terracotta,
          borderRadius: "14px 0 0 14px",
        }}
      />
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          marginLeft: 14,
          flexShrink: 0,
          background: `linear-gradient(145deg, ${C.bg3}, ${C.border})`,
          border: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontFamily: '"DM Mono", monospace',
          fontWeight: 600,
          color: C.text,
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: C.text,
            fontSize: 17,
            fontFamily: '"Cormorant Garamond", Georgia, serif',
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
            fontFamily: '"DM Mono", ui-monospace, monospace',
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
