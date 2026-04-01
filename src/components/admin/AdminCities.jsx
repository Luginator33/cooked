import { useState, useMemo, useCallback } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSmall, sectionHeader, Toast, ConfirmDialog } from "./adminHelpers";
import {
  CITY_REGIONS, CITY_FLAGS, normalizeCity,
  getFullCityRegions, getAllApprovedCities,
  addCustomApprovedCity, removeCustomApprovedCity, getCustomApprovedCities,
} from "../../data/restaurants";
import { deleteCommunityRestaurant, updateCommunityRestaurant } from "../../lib/supabase";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

/**
 * Look up a restaurant on Google Places and return city + coords.
 */
async function fetchCityFromGoogle(restaurantName) {
  if (!GOOGLE_KEY) return null;
  try {
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.addressComponents,places.location,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: restaurantName, maxResultCount: 1 }),
    });
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const place = data.places?.[0];
    if (!place) return null;

    // Extract city from addressComponents
    let city = null;
    let neighborhood = null;
    for (const comp of (place.addressComponents || [])) {
      if (comp.types?.includes("locality")) city = comp.longText;
      if (comp.types?.includes("sublocality_level_1") || comp.types?.includes("neighborhood")) neighborhood = comp.longText;
    }

    return {
      city: city || null,
      neighborhood: neighborhood || null,
      lat: place.location?.latitude || null,
      lng: place.location?.longitude || null,
      address: place.formattedAddress || null,
    };
  } catch {
    return null;
  }
}

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
  "South America",
  "Oceania",
];

// Flag lookup by region (for new cities)
const REGION_FLAG_HINT = {
  "United States": "🇺🇸",
  "Canada": "🇨🇦",
  "Mexico & Caribbean": "🇲🇽",
};

export default function AdminCities({ allRestaurants, onRestaurantsChanged }) {
  const [section, setSection] = useState("unapproved");
  const [toast, setToast] = useState(null);
  const [version, setVersion] = useState(0); // bump to re-render after approve/deny

  const [denied, setDenied] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cooked_denied_cities") || "[]"); }
    catch { return []; }
  });

  // Get effective city regions (base + custom approved)
  const effectiveRegions = useMemo(() => getFullCityRegions(), [version]);
  const approvedCities = useMemo(() => getAllApprovedCities(), [version]);
  const customCities = useMemo(() => getCustomApprovedCities(), [version]);

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

  // Split into approved vs unapproved (exclude denied)
  const deniedSet = useMemo(() => new Set(denied), [denied]);
  const unapprovedCities = useMemo(() => {
    return Object.entries(allCitiesInData)
      .filter(([city]) => !approvedCities.has(city) && !deniedSet.has(city))
      .sort((a, b) => b[1] - a[1]);
  }, [allCitiesInData, approvedCities, deniedSet]);

  // Denied cities with counts
  const deniedCities = useMemo(() => {
    return denied
      .map(c => [c, allCitiesInData[c] || 0])
      .filter(([, count]) => count > 0);
  }, [denied, allCitiesInData]);

  // Approved cities with counts (using effective regions)
  const approvedWithCounts = useMemo(() => {
    return effectiveRegions.map(r => ({
      region: r.region,
      cities: r.cities.map(c => ({
        name: c,
        count: allCitiesInData[c] || 0,
        flag: CITY_FLAGS[c] || "",
        isCustom: customCities.some(cc => cc.city === c),
      })).sort((a, b) => b.count - a.count),
    }));
  }, [allCitiesInData, effectiveRegions, customCities]);

  const totalApprovedCityCount = useMemo(() => effectiveRegions.reduce((sum, r) => sum + r.cities.length, 0), [effectiveRegions]);
  const totalApprovedRestaurants = useMemo(() => {
    return Object.entries(allCitiesInData)
      .filter(([city]) => approvedCities.has(city))
      .reduce((sum, [, count]) => sum + count, 0);
  }, [allCitiesInData, approvedCities]);
  const totalUnapprovedRestaurants = useMemo(() => {
    return unapprovedCities.reduce((sum, [, count]) => sum + count, 0);
  }, [unapprovedCities]);
  const noCityRestaurants = useMemo(() => {
    return allRestaurants.filter(r => !r.city || !r.city.trim());
  }, [allRestaurants]);
  const totalAllRestaurants = allRestaurants.length;
  const totalUnassigned = totalUnapprovedRestaurants + noCityRestaurants.length;

  const sections = [
    { key: "unapproved", label: "Needs Review", icon: "⚠", count: unapprovedCities.length + (noCityRestaurants.length > 0 ? 1 : 0) },
    { key: "approved", label: `Approved (${totalApprovedCityCount})`, icon: "✓" },
    { key: "denied", label: "Denied", icon: "✕", count: deniedCities.length },
  ];

  const flash = (msg, type = "success") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleApprove = (cityName, region, flag) => {
    addCustomApprovedCity(cityName, region, flag);
    setVersion(v => v + 1);
    flash(`${cityName} added to ${region}`);
  };

  const handleUnapprove = (cityName) => {
    removeCustomApprovedCity(cityName);
    setVersion(v => v + 1);
    flash(`${cityName} removed from approved list`);
  };

  const addDenied = (cityName) => {
    const updated = [...denied, cityName];
    setDenied(updated);
    localStorage.setItem("cooked_denied_cities", JSON.stringify(updated));
  };

  const removeDenied = (cityName) => {
    const updated = denied.filter(c => c !== cityName);
    setDenied(updated);
    localStorage.setItem("cooked_denied_cities", JSON.stringify(updated));
  };

  return (
    <div>
      {toast && <Toast {...toast} />}

      {/* Summary stats */}
      <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.terracotta, fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic" }}>{totalAllRestaurants.toLocaleString()}</div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Places</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic" }}>{totalApprovedRestaurants.toLocaleString()}</div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>In Approved Cities</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: totalUnassigned > 0 ? "#e0a050" : C.dim, fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic" }}>{totalUnassigned.toLocaleString()}</div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Unassigned</div>
        </div>
      </div>

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
          allRestaurants={allRestaurants}
          noCityRestaurants={noCityRestaurants}
          flash={flash}
          onApprove={handleApprove}
          onDeny={addDenied}
          onRestaurantsChanged={onRestaurantsChanged}
          effectiveRegions={effectiveRegions}
        />
      )}

      {section === "approved" && (
        <ApprovedPanel
          regions={approvedWithCounts}
          onUnapprove={handleUnapprove}
        />
      )}

      {section === "denied" && (
        <DeniedPanel
          cities={deniedCities}
          flash={flash}
          onUndeny={removeDenied}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnapprovedPanel — cities in the data that aren't in approved list
// ---------------------------------------------------------------------------
function UnapprovedPanel({ cities, allRestaurants, noCityRestaurants, flash, onApprove, onDeny, onRestaurantsChanged, effectiveRegions }) {
  const [assignCity, setAssignCity] = useState(null);
  const [assignRegion, setAssignRegion] = useState("");
  const [assignTarget, setAssignTarget] = useState("");
  const [assignFlag, setAssignFlag] = useState("");
  const [mode, setMode] = useState("");
  const [confirmDeny, setConfirmDeny] = useState(null);
  const [denyDeleting, setDenyDeleting] = useState(false);
  const [showNoCity, setShowNoCity] = useState(false);
  const [grouping, setGrouping] = useState(false);

  if (cities.length === 0 && (!noCityRestaurants || noCityRestaurants.length === 0)) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
        All cities are approved or denied. Nothing to review.
      </div>
    );
  }

  const handleStartAssign = (cityName) => {
    setAssignCity(cityName);
    setMode("");
    setAssignRegion("");
    setAssignTarget("");
    setAssignFlag("");
  };

  const getSamples = (cityName) => {
    return allRestaurants
      .filter(r => {
        const normalized = normalizeCity(r.city);
        return normalized === cityName || r.city === cityName;
      })
      .slice(0, 3)
      .map(r => r.name);
  };

  const getRestaurantsForCity = (cityName) => {
    return allRestaurants.filter(r => {
      const normalized = normalizeCity(r.city);
      return normalized === cityName || r.city === cityName;
    });
  };

  const handleDenyConfirm = async (cityName) => {
    setDenyDeleting(true);
    const cityRestaurants = getRestaurantsForCity(cityName);
    const communityOnes = cityRestaurants.filter(r => r.id >= 100000);

    let deleted = 0;
    for (const r of communityOnes) {
      const { error } = await deleteCommunityRestaurant(r.id);
      if (!error) deleted++;
    }

    onDeny(cityName);
    setConfirmDeny(null);
    setDenyDeleting(false);

    if (deleted > 0) {
      flash(`Denied "${cityName}" — deleted ${deleted} restaurant${deleted !== 1 ? "s" : ""}`);
      if (onRestaurantsChanged) onRestaurantsChanged();
    } else {
      flash(`Denied "${cityName}"`);
    }
  };

  return (
    <div>
      {confirmDeny && (
        <ConfirmDialog
          message={`Deny "${confirmDeny}"?\n\nImported restaurants in this city will be deleted.`}
          onConfirm={() => handleDenyConfirm(confirmDeny)}
          onCancel={() => setConfirmDeny(null)}
        />
      )}

      <div style={{ ...sectionHeader, marginBottom: 14 }}>
        Cities in data not yet approved
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
        Approve to add to the city list, group under an existing city, or deny to remove restaurants.
      </div>

      {cities.map(([cityName, count]) => (
        <div key={cityName} style={{ ...cardStyle, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{cityName}</span>
              <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{count} restaurant{count !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setConfirmDeny(cityName)}
                disabled={denyDeleting}
                style={{ ...btnSmall, color: "#e05050", borderColor: "rgba(224,80,80,0.25)" }}
              >
                Deny
              </button>
              <button
                type="button"
                onClick={() => handleStartAssign(cityName)}
                style={{ ...btnSmall, color: C.terracotta, borderColor: "rgba(255,150,50,0.25)" }}
              >
                Assign
              </button>
            </div>
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
                    ...btnSmall, flex: 1,
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
                    ...btnSmall, flex: 1,
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
                    onChange={e => {
                      setAssignRegion(e.target.value);
                      setAssignFlag(REGION_FLAG_HINT[e.target.value] || "");
                    }}
                    style={{ ...inputStyle, fontSize: 13, marginBottom: 8 }}
                  >
                    <option value="">Choose region...</option>
                    {REGION_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {assignRegion && (
                    <>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Flag emoji (optional):</div>
                      <input
                        value={assignFlag}
                        onChange={e => setAssignFlag(e.target.value)}
                        placeholder="e.g. 🇺🇸"
                        style={{ ...inputStyle, fontSize: 13, marginBottom: 10 }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    disabled={!assignRegion}
                    onClick={() => {
                      onApprove(cityName, assignRegion, assignFlag);
                      setAssignCity(null);
                    }}
                    style={{ ...btnPrimary, width: "100%", opacity: assignRegion ? 1 : 0.4, fontSize: 12 }}
                  >
                    Approve "{cityName}" → {assignRegion || "..."}
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
                    {effectiveRegions.map(regionObj => (
                      <optgroup key={regionObj.region} label={regionObj.region}>
                        {regionObj.cities.map(c => (
                          <option key={c} value={c}>{CITY_FLAGS[c] || ""} {c}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {assignTarget && (
                    <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
                      All "{cityName}" restaurants will be re-labeled as "{assignTarget}".
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!assignTarget || grouping}
                    onClick={async () => {
                      setGrouping(true);
                      // Bulk update community restaurants with this city
                      const cityRestaurants = allRestaurants.filter(r => {
                        const n = normalizeCity(r.city);
                        return n === cityName || r.city === cityName;
                      });
                      const communityOnes = cityRestaurants.filter(r => r.id >= 100000);
                      let updated = 0;
                      for (const r of communityOnes) {
                        const { error } = await updateCommunityRestaurant(r.id, { city: assignTarget });
                        if (!error) updated++;
                      }
                      setGrouping(false);
                      flash(`${cityName} → ${assignTarget} (${updated} updated)`);
                      setAssignCity(null);
                      if (updated > 0 && onRestaurantsChanged) onRestaurantsChanged();
                    }}
                    style={{ ...btnPrimary, width: "100%", opacity: assignTarget && !grouping ? 1 : 0.4, fontSize: 12 }}
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

      {/* No-city restaurants — auto-fix with Google Places */}
      {noCityRestaurants && noCityRestaurants.length > 0 && (
        <NoCityPanel
          restaurants={noCityRestaurants}
          flash={flash}
          onRestaurantsChanged={onRestaurantsChanged}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoCityPanel — restaurants with no city, auto-fix via Google Places
// ---------------------------------------------------------------------------
function NoCityPanel({ restaurants, flash, onRestaurantsChanged }) {
  const [fixing, setFixing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, fixed: 0, failed: 0 });
  const [results, setResults] = useState([]); // [{id, name, city, status}]
  const [showResults, setShowResults] = useState(false);

  const handleFixAll = useCallback(async () => {
    if (!GOOGLE_KEY) {
      flash("Missing VITE_GOOGLE_PLACES_KEY", "error");
      return;
    }

    setFixing(true);
    const total = restaurants.length;
    setProgress({ done: 0, total, fixed: 0, failed: 0 });
    const fixResults = [];
    let fixed = 0;
    let failed = 0;

    // Process in batches of 5 with small delay to avoid rate limiting
    for (let i = 0; i < restaurants.length; i++) {
      const r = restaurants[i];
      const data = await fetchCityFromGoogle(r.name);

      if (data?.city) {
        const normalizedCity = normalizeCity(data.city);
        const updates = { city: normalizedCity };
        if (data.neighborhood) updates.neighborhood = data.neighborhood;
        if (data.lat) updates.lat = data.lat;
        if (data.lng) updates.lng = data.lng;
        if (data.address && !r.address) updates.address = data.address;

        // Only update community restaurants (id >= 100000)
        if (r.id >= 100000) {
          await updateCommunityRestaurant(r.id, updates);
        }

        fixResults.push({ id: r.id, name: r.name, city: normalizedCity, neighborhood: data.neighborhood, status: "fixed" });
        fixed++;
      } else {
        fixResults.push({ id: r.id, name: r.name, city: null, status: "not_found" });
        failed++;
      }

      setProgress({ done: i + 1, total, fixed, failed });

      // Small delay every 5 requests to avoid rate limits
      if ((i + 1) % 5 === 0) await new Promise(resolve => setTimeout(resolve, 300));
    }

    setResults(fixResults);
    setShowResults(true);
    setFixing(false);
    flash(`Fixed ${fixed} of ${total} restaurants`);
    if (fixed > 0 && onRestaurantsChanged) onRestaurantsChanged();
  }, [restaurants, flash, onRestaurantsChanged]);

  return (
    <div style={{ ...cardStyle, marginTop: 16, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ color: "#e0a050", fontSize: 14, fontWeight: 600 }}>No City Assigned</span>
          <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{restaurants.length} restaurant{restaurants.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          type="button"
          onClick={handleFixAll}
          disabled={fixing}
          style={{
            ...btnPrimary,
            fontSize: 11,
            padding: "6px 14px",
            opacity: fixing ? 0.5 : 1,
          }}
        >
          {fixing ? `Fixing... ${progress.done}/${progress.total}` : "Auto-Fix All"}
        </button>
      </div>

      {/* Progress bar */}
      {fixing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ background: C.bg, borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{
              width: `${(progress.done / progress.total) * 100}%`,
              height: "100%",
              background: C.terracotta,
              borderRadius: 4,
              transition: "width 0.2s",
            }} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {progress.fixed} fixed, {progress.failed} not found
          </div>
        </div>
      )}

      {/* Results */}
      {showResults && results.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10, maxHeight: 400, overflowY: "auto" }}>
          {results.map(r => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12 }}>
              <span style={{ color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              {r.status === "fixed" ? (
                <span style={{ color: "#50c878", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>→ {r.city}</span>
              ) : (
                <span style={{ color: "#e05050", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>not found</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview list when not fixing */}
      {!showResults && !fixing && (
        <div
          style={{ marginTop: 8, fontSize: 11, color: C.dim, cursor: "pointer" }}
          onClick={() => setShowResults(!showResults)}
        >
          Uses Google Places API to look up each restaurant and assign a city automatically.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeniedPanel — cities you've rejected
// ---------------------------------------------------------------------------
function DeniedPanel({ cities, flash, onUndeny }) {
  if (cities.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
        No denied cities.
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...sectionHeader, marginBottom: 14 }}>
        Denied cities — restaurants removed
      </div>

      {cities.map(([cityName, count]) => (
        <div key={cityName} style={{ ...cardStyle, marginBottom: 8, opacity: 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: C.text, fontSize: 14, fontWeight: 600, textDecoration: "line-through" }}>{cityName}</span>
              <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{count} remaining</span>
            </div>
            <button
              type="button"
              onClick={() => { onUndeny(cityName); flash(`${cityName} moved back to review`); }}
              style={{ ...btnSmall, color: C.terracotta, borderColor: "rgba(255,150,50,0.25)" }}
            >
              Undo
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApprovedPanel — view all approved cities by region with restaurant counts
// ---------------------------------------------------------------------------
function ApprovedPanel({ regions, onUnapprove }) {
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
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }} onClick={e => e.stopPropagation()}>
                {r.cities.map(c => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                    <span style={{ color: c.count > 0 ? C.text : C.dim, fontSize: 13 }}>
                      {c.flag} {c.name}
                      {c.isCustom && <span style={{ fontSize: 9, color: C.terracotta, marginLeft: 6 }}>ADDED</span>}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: c.count > 0 ? C.muted : C.dim, fontSize: 12 }}>
                        {c.count}
                      </span>
                      {c.isCustom && (
                        <button
                          type="button"
                          onClick={() => onUnapprove(c.name)}
                          style={{ ...btnSmall, fontSize: 9, padding: "2px 6px", color: "#e05050", borderColor: "rgba(224,80,80,0.2)" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
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
