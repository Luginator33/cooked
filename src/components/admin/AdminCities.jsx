import { useState, useMemo } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSmall, sectionHeader, Toast } from "./adminHelpers";
import { CITY_REGIONS, CITY_FLAGS, normalizeCity } from "../../data/restaurants";

// ---------------------------------------------------------------------------
// AdminCities — manage approved cities, review unapproved ones, assign regions
// ---------------------------------------------------------------------------

const REGION_OPTIONS = [
  "United States",
  "Europe",
  "Asia",
  "Mexico & Caribbean",
  "Africa",
  "Middle East",
  "Canada",
];

export default function AdminCities({ allRestaurants }) {
  const [section, setSection] = useState("unapproved");
  const [toast, setToast] = useState(null);

  // Build the set of approved cities from CITY_REGIONS
  const approvedCities = useMemo(() => {
    const set = new Set();
    CITY_REGIONS.forEach(r => r.cities.forEach(c => set.add(c)));
    return set;
  }, []);

  // Build a map: city → region for approved cities
  const cityToRegion = useMemo(() => {
    const map = {};
    CITY_REGIONS.forEach(r => r.cities.forEach(c => { map[c] = r.region; }));
    return map;
  }, []);

  // Find all unique cities in restaurant data
  const allCitiesInData = useMemo(() => {
    const counts = {};
    for (const r of allRestaurants) {
      if (r.city) {
        const normalized = normalizeCity(r.city);
        counts[normalized] = (counts[normalized] || 0) + 1;
      }
    }
    return counts;
  }, [allRestaurants]);

  // Split into approved vs unapproved
  const unapprovedCities = useMemo(() => {
    return Object.entries(allCitiesInData)
      .filter(([city]) => !approvedCities.has(city))
      .sort((a, b) => b[1] - a[1]); // sort by count desc
  }, [allCitiesInData, approvedCities]);

  // Approved cities with counts
  const approvedWithCounts = useMemo(() => {
    return CITY_REGIONS.map(r => ({
      region: r.region,
      cities: r.cities.map(c => ({ name: c, count: allCitiesInData[c] || 0, flag: CITY_FLAGS[c] || "" }))
        .sort((a, b) => b.count - a.count),
    }));
  }, [allCitiesInData]);

  const sections = [
    { key: "unapproved", label: "Needs Review", icon: "⚠", count: unapprovedCities.length },
    { key: "approved", label: "Approved", icon: "✓" },
  ];

  const flash = (msg, type = "success") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div>
      {toast && <Toast {...toast} />}

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {sections.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            style={{
              ...btnSmall,
              background: section === s.key ? "rgba(255,150,50,0.12)" : "transparent",
              color: section === s.key ? C.terracotta : C.muted,
              borderColor: section === s.key ? "rgba(255,150,50,0.25)" : C.border,
            }}
          >
            {s.icon} {s.label} {s.count != null ? `(${s.count})` : ""}
          </button>
        ))}
      </div>

      {section === "unapproved" && (
        <UnapprovedPanel
          cities={unapprovedCities}
          approvedCities={approvedCities}
          allRestaurants={allRestaurants}
          flash={flash}
        />
      )}

      {section === "approved" && (
        <ApprovedPanel regions={approvedWithCounts} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnapprovedPanel — cities in the data that aren't in CITY_REGIONS
// ---------------------------------------------------------------------------
function UnapprovedPanel({ cities, approvedCities, allRestaurants, flash }) {
  const [assignCity, setAssignCity] = useState(null); // city being assigned
  const [assignRegion, setAssignRegion] = useState("");
  const [assignTarget, setAssignTarget] = useState(""); // for "group under existing"
  const [mode, setMode] = useState(""); // "new" or "group"

  if (cities.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
        All cities are approved. Nothing to review.
      </div>
    );
  }

  const handleStartAssign = (cityName) => {
    setAssignCity(cityName);
    setMode("");
    setAssignRegion("");
    setAssignTarget("");
  };

  // Get sample restaurants for a given city
  const getSamples = (cityName) => {
    return allRestaurants
      .filter(r => {
        const normalized = normalizeCity(r.city);
        return normalized === cityName || r.city === cityName;
      })
      .slice(0, 3)
      .map(r => r.name);
  };

  return (
    <div>
      <div style={{ ...sectionHeader, marginBottom: 14 }}>
        Cities in data not in approved list — assign or group them
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
        These cities were imported from research or Google Places. Assign each to a region as a new city, or group it under an existing approved city.
        <br /><br />
        <strong style={{ color: C.terra2 }}>Note:</strong> To add aliases (so these auto-map in the future), update the <code>CITY_ALIAS_MAP</code> in <code>restaurants.js</code>.
      </div>

      {cities.map(([cityName, count]) => (
        <div key={cityName} style={{ ...cardStyle, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{cityName}</span>
              <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{count} restaurant{count !== 1 ? "s" : ""}</span>
            </div>
            <button
              type="button"
              onClick={() => handleStartAssign(cityName)}
              style={{
                ...btnSmall,
                color: C.terracotta,
                borderColor: "rgba(255,150,50,0.25)",
              }}
            >
              Assign
            </button>
          </div>

          {/* Sample restaurants */}
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            {getSamples(cityName).join(", ")}
          </div>

          {/* Assignment UI */}
          {assignCity === cityName && (
            <div style={{ marginTop: 12, padding: "12px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  style={{
                    ...btnSmall,
                    flex: 1,
                    background: mode === "new" ? "rgba(255,150,50,0.12)" : "transparent",
                    color: mode === "new" ? C.terracotta : C.muted,
                    borderColor: mode === "new" ? "rgba(255,150,50,0.25)" : C.border,
                  }}
                >
                  Add as New City
                </button>
                <button
                  type="button"
                  onClick={() => setMode("group")}
                  style={{
                    ...btnSmall,
                    flex: 1,
                    background: mode === "group" ? "rgba(255,150,50,0.12)" : "transparent",
                    color: mode === "group" ? C.terracotta : C.muted,
                    borderColor: mode === "group" ? "rgba(255,150,50,0.25)" : C.border,
                  }}
                >
                  Group Under Existing
                </button>
              </div>

              {mode === "new" && (
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Select region:</div>
                  <select
                    value={assignRegion}
                    onChange={e => setAssignRegion(e.target.value)}
                    style={{ ...inputStyle, fontSize: 13, marginBottom: 8 }}
                  >
                    <option value="">Choose region...</option>
                    {REGION_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {assignRegion && (
                    <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
                      Will add "{cityName}" to {assignRegion} in CITY_REGIONS.
                      <br />You'll need to add it to <code>restaurants.js</code> manually.
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!assignRegion}
                    onClick={() => {
                      flash(`${cityName} approved for ${assignRegion}. Add to CITY_REGIONS in restaurants.js`);
                      setAssignCity(null);
                    }}
                    style={{ ...btnPrimary, width: "100%", opacity: assignRegion ? 1 : 0.4, fontSize: 12 }}
                  >
                    Approve as New City
                  </button>
                </div>
              )}

              {mode === "group" && (
                <div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Group under which city?</div>
                  <select
                    value={assignTarget}
                    onChange={e => setAssignTarget(e.target.value)}
                    style={{ ...inputStyle, fontSize: 13, marginBottom: 8 }}
                  >
                    <option value="">Choose city...</option>
                    {REGION_OPTIONS.map(region => {
                      const regionData = CITY_REGIONS.find(r => r.region === region);
                      if (!regionData) return null;
                      return (
                        <optgroup key={region} label={region}>
                          {regionData.cities.map(c => (
                            <option key={c} value={c}>{CITY_FLAGS[c] || ""} {c}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {assignTarget && (
                    <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
                      Will add "{cityName.toLowerCase()}" → "{assignTarget}" to CITY_ALIAS_MAP.
                      <br />You'll need to update <code>restaurants.js</code> manually.
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!assignTarget}
                    onClick={() => {
                      flash(`${cityName} → ${assignTarget}. Add alias to restaurants.js`);
                      setAssignCity(null);
                    }}
                    style={{ ...btnPrimary, width: "100%", opacity: assignTarget ? 1 : 0.4, fontSize: 12 }}
                  >
                    Group Under {assignTarget || "..."}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setAssignCity(null)}
                style={{ ...btnSmall, width: "100%", marginTop: 6, color: C.muted }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApprovedPanel — view all approved cities by region with restaurant counts
// ---------------------------------------------------------------------------
function ApprovedPanel({ regions }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <div style={{ ...sectionHeader, marginBottom: 14 }}>
        Approved cities by region
      </div>

      {regions.map(r => {
        const total = r.cities.reduce((sum, c) => sum + c.count, 0);
        const isExpanded = expanded === r.region;

        return (
          <div key={r.region} style={{ ...cardStyle, marginBottom: 8, cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : r.region)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{r.region}</span>
                <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{r.cities.length} cities</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.terracotta, fontSize: 13, fontWeight: 600 }}>{total}</span>
                <span style={{ color: C.muted, fontSize: 12 }}>{isExpanded ? "▾" : "▸"}</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                {r.cities.map(c => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                    <span style={{ color: c.count > 0 ? C.text : C.dim, fontSize: 13 }}>
                      {c.flag} {c.name}
                    </span>
                    <span style={{ color: c.count > 0 ? C.muted : C.dim, fontSize: 12 }}>
                      {c.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
