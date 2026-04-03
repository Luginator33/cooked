import { useState, useEffect, useCallback } from "react";
import { C, cardStyle, btnPrimary, btnSecondary, btnDanger, btnSmall, sectionHeader } from "./adminHelpers";
import { getNewPlaces, updateNewPlaceStatus, deleteNewPlace, upsertRestaurant, saveSharedPhoto, getResearchSources, addResearchSource, updateResearchSource, deleteResearchSource } from "../../lib/supabase";
import { syncRestaurant } from "../../lib/neo4j";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

const WORKER_URL = "https://cooked-proxy.luga-podesta.workers.dev";

const TYPE_TABS = [
  { key: "pending", label: "To Review" },
  { key: "imported", label: "Imported" },
  { key: "dismissed", label: "Dismissed" },
  { key: "sources", label: "Auto Sources" },
];

function PlaceCard({ place, allRestaurants, onImport, onDismiss, onDelete, status }) {
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [googleData, setGoogleData] = useState(null); // extra data from Google Places
  const [form, setForm] = useState({
    name: place.name || "",
    city: place.city || "",
    neighborhood: place.neighborhood || "",
    cuisine: place.cuisine || "",
    price: place.price || "",
    description: place.description || "",
  });

  // Check if a similar restaurant already exists in the database
  const possibleDuplicate = allRestaurants?.find(r => {
    const nameMatch = r.name?.toLowerCase().trim() === place.name?.toLowerCase().trim();
    const cityMatch = r.city?.toLowerCase().includes(place.city?.toLowerCase());
    return nameMatch && cityMatch;
  });

  // Fetch photos from Google Places
  const fetchPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const query = `${form.name} ${form.neighborhood || ""} ${form.city || ""}`.trim();
      const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.photos",
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      });

      if (!searchRes.ok) throw new Error("Google search failed");
      const searchData = await searchRes.json();
      const gPlace = searchData.places?.[0];
      if (!gPlace) { setLoadingPhotos(false); setShowPhotos(true); return; }

      // Fetch full details
      const detailRes = await fetch(`https://places.googleapis.com/v1/places/${gPlace.id}`, {
        headers: {
          "X-Goog-Api-Key": GOOGLE_KEY,
          "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,websiteUri,location,photos,rating,userRatingCount,priceLevel,addressComponents,types",
        },
      });

      if (detailRes.ok) {
        const d = await detailRes.json();
        // Store extra Google data for import
        const placeTypes = d.types || [];
        const isLodging = placeTypes.some(t => t === "lodging" || t === "hotel" || t === "resort_hotel" || t === "extended_stay_hotel" || t === "motel");
        setGoogleData({
          rating: d.rating || null,
          phone: d.nationalPhoneNumber || null,
          website: d.websiteUri || null,
          lat: d.location?.latitude || null,
          lng: d.location?.longitude || null,
          address: d.formattedAddress || null,
          isHotel: isLodging,
          placeTypes,
        });

        // Fetch photo URLs
        const photoUrls = [];
        for (const p of (d.photos || []).slice(0, 8)) {
          try {
            const photoRes = await fetch(
              `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&skipHttpRedirect=true`,
              { headers: { "X-Goog-Api-Key": GOOGLE_KEY } }
            );
            if (photoRes.ok) {
              const photoData = await photoRes.json();
              if (photoData.photoUri) { photoUrls.push(photoData.photoUri); continue; }
            }
            photoUrls.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
          } catch {
            photoUrls.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
          }
        }
        setPhotos(photoUrls);
      }
    } catch (err) {
      console.error("Photo fetch error:", err);
    }
    setLoadingPhotos(false);
    setShowPhotos(true);
  };

  const handleImportWithPhoto = async () => {
    setImporting(true);
    try {
      const photoUrl = photos[selectedPhoto] || null;
      await onImport(place.id, form, photoUrl, googleData);
    } finally {
      setImporting(false);
    }
  };

  const handleQuickImport = async () => {
    setImporting(true);
    try {
      await onImport(place.id, form, null, null);
    } finally {
      setImporting(false);
    }
  };

  const typeIcon = (() => {
    const c = (form.cuisine || "").toLowerCase();
    if (/(bar|cocktail|wine|lounge|pub|speakeasy|nightclub|brewery|club)/i.test(c)) return "🍸";
    if (/(hotel|resort|inn|lodge)/i.test(c)) return "🏨";
    if (/(coffee|cafe|café|tea|matcha)/i.test(c)) return "☕";
    return "🍽";
  })();

  return (
    <div style={{ ...cardStyle, position: "relative" }}>
      {possibleDuplicate && (
        <div style={{ background: "rgba(255,150,50,0.1)", border: "1px solid rgba(255,150,50,0.2)", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 11, color: C.terracotta, fontFamily: "'Inter', -apple-system, sans-serif" }}>
          ⚠️ Possible duplicate of <strong>{possibleDuplicate.name}</strong> ({possibleDuplicate.city})
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{typeIcon}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif" }}>{place.name}</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", marginBottom: 2 }}>
            {[place.city, place.neighborhood].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 12, color: "rgba(245,240,235,0.5)", fontFamily: "'Inter', -apple-system, sans-serif", marginBottom: 4 }}>
            {[place.cuisine, place.price].filter(Boolean).join(" · ")}
          </div>
          {place.description && (
            <div style={{ fontSize: 12, color: "rgba(245,240,235,0.6)", fontFamily: "'Inter', -apple-system, sans-serif", lineHeight: 1.4 }}>
              {place.description}
            </div>
          )}
          {place.source_url && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Source: {(() => { try { return new URL(place.source_url).hostname.replace("www.", ""); } catch { return place.source_url; } })()}
            </div>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {["name", "city", "neighborhood", "cuisine", "price", "description"].map(field => (
            <input
              key={field}
              value={form[field]}
              onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif", boxSizing: "border-box", outline: "none" }}
            />
          ))}
        </div>
      )}

      {/* Photo picker */}
      {showPhotos && (
        <div style={{ marginTop: 10 }}>
          {photos.length > 0 ? (
            <>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: "'Inter', -apple-system, sans-serif" }}>
                Pick a photo ({photos.length} found)
              </div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
                {photos.map((url, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedPhoto(i)}
                    style={{
                      width: 80, height: 80, borderRadius: 10, overflow: "hidden", flexShrink: 0, cursor: "pointer",
                      border: selectedPhoto === i ? `2px solid ${C.terracotta}` : "2px solid transparent",
                      opacity: selectedPhoto === i ? 1 : 0.6,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))}
              </div>
              {/* Google extra data preview */}
              {googleData && (
                <div style={{ marginTop: 6, fontSize: 10, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif" }}>
                  {googleData.isHotel && <span style={{ color: "#e0a050" }}>🏨 Hotel · </span>}
                  {googleData.rating && <span>Rating: {googleData.rating} · </span>}
                  {googleData.website && <span>Has website · </span>}
                  {googleData.lat && <span>Has coords</span>}
                </div>
              )}
              <button type="button" onClick={handleImportWithPhoto} disabled={importing}
                style={{ ...btnSmall, ...btnPrimary, marginTop: 8, opacity: importing ? 0.5 : 1 }}>
                {importing ? "Importing..." : "Import with Photo"}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif" }}>
              No photos found on Google Places.
              <button type="button" onClick={handleQuickImport} disabled={importing}
                style={{ ...btnSmall, ...btnPrimary, marginLeft: 8, opacity: importing ? 0.5 : 1 }}>
                {importing ? "Importing..." : "Import Without Photo"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {status === "pending" && !showPhotos && (
          <>
            <button type="button" onClick={fetchPhotos} disabled={loadingPhotos || importing}
              style={{ ...btnSmall, ...btnPrimary, opacity: loadingPhotos ? 0.5 : 1 }}>
              {loadingPhotos ? "Finding photos..." : "Import"}
            </button>
            <button type="button" onClick={() => setEditing(v => !v)}
              style={{ ...btnSmall, ...btnSecondary }}>
              {editing ? "Done" : "Edit"}
            </button>
            <button type="button" onClick={() => onDismiss(place.id)}
              style={{ ...btnSmall, background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer" }}>
              Skip
            </button>
          </>
        )}
        {status === "pending" && showPhotos && (
          <>
            <button type="button" onClick={() => { setShowPhotos(false); setPhotos([]); setGoogleData(null); }}
              style={{ ...btnSmall, ...btnSecondary }}>
              Back
            </button>
            <button type="button" onClick={() => onDismiss(place.id)}
              style={{ ...btnSmall, background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer" }}>
              Skip
            </button>
          </>
        )}
        {status === "dismissed" && (
          <button type="button" onClick={fetchPhotos} disabled={loadingPhotos}
            style={{ ...btnSmall, ...btnPrimary }}>
            {loadingPhotos ? "Finding photos..." : "Import Anyway"}
          </button>
        )}
        <button type="button" onClick={() => onDelete(place.id)}
          style={{ ...btnSmall, ...btnDanger, marginLeft: "auto" }}>
          Delete
        </button>
      </div>

      <div style={{ fontSize: 10, color: C.muted, marginTop: 6, fontFamily: "'Inter', -apple-system, sans-serif" }}>
        {new Date(place.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

// ── Sources Panel ─────────────────────────────────────────
function SourcesPanel({ showToast }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [running, setRunning] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    const { data } = await getResearchSources();
    setSources(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const handleAdd = async () => {
    if (!newUrl.trim()) return;
    const name = newName.trim() || (() => { try { return new URL(newUrl).hostname.replace("www.", ""); } catch { return newUrl; } })();
    const { error } = await addResearchSource({ url: newUrl.trim(), name });
    if (error) { showToast(`Error: ${error.message}`); return; }
    setNewUrl("");
    setNewName("");
    showToast("Source added!");
    loadSources();
  };

  const handleToggle = async (id, active) => {
    await updateResearchSource(id, { active: !active });
    loadSources();
  };

  const handleDelete = async (id) => {
    await deleteResearchSource(id);
    loadSources();
  };

  const handleRunNow = async () => {
    setRunning(true);
    showToast("Auto-research started...");
    try {
      const res = await fetch(`${WORKER_URL}/auto-research/run`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast(`Done! ${data.totalPlaces || 0} new places found`);
      } else {
        showToast(`Error: ${data.error || "Unknown"}`);
      }
    } catch (err) {
      showToast(`Failed: ${err.message}`);
    }
    setRunning(false);
    loadSources();
  };

  return (
    <div>
      <div style={{ ...sectionHeader, marginBottom: 8 }}>
        Auto-crawl sources — checked twice a week
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, fontFamily: "'Inter', -apple-system, sans-serif", lineHeight: 1.5 }}>
        Add food websites here. The bot will automatically crawl them for new restaurants, bars, and hotels.
      </div>

      {/* Add new source */}
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://la.eater.com" style={{ flex: 2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif", boxSizing: "border-box", outline: "none" }} />
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)" style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif", boxSizing: "border-box", outline: "none" }} />
        </div>
        <button type="button" onClick={handleAdd} disabled={!newUrl.trim()} style={{ ...btnSmall, ...btnPrimary, opacity: newUrl.trim() ? 1 : 0.5 }}>Add Source</button>
      </div>

      {/* Source list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 20, color: C.muted }}>Loading...</div>
      ) : sources.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>
          No sources yet. Add food websites above to start auto-crawling.
        </div>
      ) : (
        sources.map(s => (
          <div key={s.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={() => handleToggle(s.id, s.active)}
              style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
                background: s.active ? C.terracotta : C.bg3, transition: "background 0.2s" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2,
                left: s.active ? 18 : 2, transition: "left 0.2s" }} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.active ? C.text : C.muted, fontFamily: "'Inter', -apple-system, sans-serif" }}>{s.name}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</div>
              {s.last_crawled && <div style={{ fontSize: 10, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", marginTop: 2 }}>Last crawled: {new Date(s.last_crawled).toLocaleDateString()}</div>}
            </div>
            <button type="button" onClick={() => handleDelete(s.id)} style={{ ...btnSmall, ...btnDanger, flexShrink: 0 }}>Remove</button>
          </div>
        ))
      )}

      {/* Run Now button */}
      {sources.length > 0 && (
        <button type="button" onClick={handleRunNow} disabled={running}
          style={{ ...btnPrimary, width: "100%", padding: "12px", borderRadius: 10, fontSize: 14, fontWeight: 600, marginTop: 14, cursor: running ? "default" : "pointer", opacity: running ? 0.6 : 1, fontFamily: "'Inter', -apple-system, sans-serif", border: "none" }}>
          {running ? "Running auto-research..." : "Run Now"}
        </button>
      )}
    </div>
  );
}

export default function AdminImports({ allRestaurants, userId, onRestaurantsChanged }) {
  const [tab, setTab] = useState("pending");
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    const { data } = await getNewPlaces(tab, 100);
    setPlaces(data);
    setLoading(false);
  }, [tab]);

  useEffect(() => { loadPlaces(); }, [loadPlaces]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleImport = async (placeId, form, photoUrl, googleData) => {
    try {
      const id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Auto-detect hotel from Google Places types or name
      const nameHasHotel = /(hotel|resort)/i.test(form.name);
      const isHotel = googleData?.isHotel || nameHasHotel;
      const baseTags = form.cuisine ? form.cuisine.split(/[,/]/).map(t => t.trim()).filter(Boolean) : [];
      // If it's a hotel, make sure "hotel" is in the tags so detection works everywhere
      if (isHotel && !baseTags.some(t => /(hotel|resort)/i.test(t))) baseTags.push("hotel");

      const newRestaurant = {
        name: form.name,
        city: form.city,
        neighborhood: form.neighborhood || "",
        cuisine: form.cuisine || "",
        price: form.price || "",
        desc: form.description || "",
        tags: baseTags,
        rating: googleData?.rating || null,
        lat: googleData?.lat || null,
        lng: googleData?.lng || null,
        phone: googleData?.phone || null,
        website: googleData?.website || null,
        address: googleData?.address || null,
        isHotel: isHotel || undefined,
        img: photoUrl || null,
        img2: photoUrl || null,
        source: "research_import",
      };

      const { error } = await upsertRestaurant({ id, ...newRestaurant });
      if (error) throw error;

      // Save photo to shared library
      if (photoUrl) {
        await saveSharedPhoto(String(id), photoUrl);
      }

      // Sync to Neo4j
      try { await syncRestaurant(id, newRestaurant); } catch {}

      const { error: statusErr } = await updateNewPlaceStatus(placeId, "imported");
      if (statusErr) throw statusErr;
      await loadPlaces();
      showToast(`${form.name} imported!`);
      if (onRestaurantsChanged) onRestaurantsChanged();
    } catch (err) {
      console.error("Import error:", err);
      showToast(`Error: ${err.message}`);
    }
  };

  const handleDismiss = async (placeId) => {
    const { error } = await updateNewPlaceStatus(placeId, "dismissed");
    if (error) { showToast(`Error: ${error.message}`); return; }
    await loadPlaces();
    showToast("Skipped");
  };

  const handleDelete = async (placeId) => {
    const { error } = await deleteNewPlace(placeId);
    if (error) { showToast(`Error: ${error.message}`); return; }
    await loadPlaces();
    showToast("Deleted");
  };

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        {TYPE_TABS.map(t => (
          <button
            key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{
              background: "none", border: "none",
              borderBottom: tab === t.key ? `2px solid ${C.terracotta}` : "2px solid transparent",
              color: tab === t.key ? C.terracotta : C.muted,
              padding: "8px 14px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: "'Inter', -apple-system, sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sources" ? (
        <SourcesPanel showToast={showToast} />
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>Loading...</div>
      ) : places.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{tab === "pending" ? "✨" : tab === "imported" ? "📦" : "🗑"}</div>
          <div style={{ color: C.muted, fontSize: 13, fontFamily: "'Inter', -apple-system, sans-serif" }}>
            {tab === "pending" ? "No new places to review. Use the Research feature in the chatbot to find new places!" : tab === "imported" ? "No imported places yet" : "No dismissed places"}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ ...sectionHeader, marginBottom: 12 }}>
            {places.length} {tab === "pending" ? "to review" : tab}
          </div>
          {places.map(place => (
            <PlaceCard
              key={place.id}
              place={place}
              allRestaurants={allRestaurants}
              onImport={handleImport}
              onDismiss={handleDismiss}
              onDelete={handleDelete}
              status={tab}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: C.bg2, border: `1px solid ${C.terracotta}`, borderRadius: 12,
          padding: "10px 20px", fontSize: 13, color: C.text, zIndex: 100000,
          fontFamily: "'Inter', -apple-system, sans-serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
