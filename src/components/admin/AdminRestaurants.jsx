import { useState, useMemo, useCallback } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnDanger, btnSmall, btnOutline, sectionHeader, SearchBar, ConfirmDialog, Toast } from "./adminHelpers";
import { upsertAdminOverride, deleteAdminOverride, addCommunityRestaurant, deleteCommunityRestaurant, updateCommunityRestaurant, saveSharedPhoto, logAdminAction } from "../../lib/supabase";
import { transferLoves, syncRestaurant } from "../../lib/neo4j";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;
const ANTHROPIC_PROXY = "https://cooked-proxy.luga-podesta.workers.dev/";

export default function AdminRestaurants({ allRestaurants, userId, onRestaurantsChanged }) {
  const [section, setSection] = useState("search");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  // Smart Import state
  const [importSearch, setImportSearch] = useState("");
  const [importCity, setImportCity] = useState("");
  const [placesResults, setPlacesResults] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importStage, setImportStage] = useState(null); // null | "searching" | "enriching" | "preview"
  const [importPreview, setImportPreview] = useState(null);
  const [importPhotos, setImportPhotos] = useState([]);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);

  // Bulk import
  const [bulkJson, setBulkJson] = useState("");

  // Merge
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };
  const isCommunity = (id) => Number(id) >= 100000;

  // ── SEARCH & EDIT ──
  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allRestaurants.filter(r => r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || String(r.id) === q).slice(0, 20);
  }, [search, allRestaurants]);

  const handleRemove = async (r) => {
    if (isCommunity(r.id)) await deleteCommunityRestaurant(r.id);
    else await upsertAdminOverride(r.id, "delete", null, userId);
    await logAdminAction("restaurant_remove", userId, "restaurant", String(r.id), { name: r.name });
    showToast(`Removed ${r.name}`);
    onRestaurantsChanged?.();
    setConfirm(null);
  };

  const startEdit = (r) => {
    setEditing(r);
    setEditForm({
      name: r.name || "", city: r.city || "", cuisine: r.cuisine || "", neighborhood: r.neighborhood || "",
      price: r.price || "", rating: String(r.rating || ""), desc: r.desc || r.description || "",
      tags: (r.tags || []).join(", "), website: r.website || "", lat: String(r.lat || ""), lng: String(r.lng || ""),
      phone: r.phone || "", address: r.address || "",
    });
    setSection("search");
  };

  const saveEdit = async () => {
    const data = { ...editForm, rating: Number(editForm.rating) || 0, lat: Number(editForm.lat) || 0, lng: Number(editForm.lng) || 0, tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean) };
    if (isCommunity(editing.id)) await updateCommunityRestaurant(editing.id, data);
    else await upsertAdminOverride(editing.id, "edit", data, userId);
    await logAdminAction("restaurant_edit", userId, "restaurant", String(editing.id), { name: data.name });
    showToast(`Updated ${data.name}`);
    setEditing(null);
    onRestaurantsChanged?.();
  };

  // ── SMART IMPORT ──
  const searchGooglePlaces = async () => {
    if (!importSearch.trim()) return;
    setImportStage("searching");
    setPlacesResults([]);
    try {
      const query = importCity ? `${importSearch} ${importCity}` : importSearch;
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.photos" },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      });
      const data = await res.json();
      setPlacesResults(data.places || []);
      setImportStage("results");
    } catch (e) {
      showToast("Google Places search failed", "error");
      setImportStage(null);
    }
  };

  const selectPlace = async (place) => {
    setImportStage("enriching");
    try {
      // Fetch full details
      const detailRes = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
        headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,websiteUri,location,photos,rating,userRatingCount,priceLevel,addressComponents" },
      });
      const d = await detailRes.json();

      // Parse city/neighborhood from address components
      let city = "", neighborhood = "";
      (d.addressComponents || []).forEach(c => {
        if (c.types?.includes("locality")) city = c.longText;
        if (c.types?.includes("neighborhood")) neighborhood = c.longText;
        if (!neighborhood && c.types?.includes("sublocality")) neighborhood = c.longText;
      });

      // Price conversion
      const priceMap = { PRICE_LEVEL_FREE: "$", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" };
      const price = priceMap[d.priceLevel] || "$$";

      // Fetch photos — use direct media URL (no skipHttpRedirect, just the image URL)
      const photos = [];
      for (const p of (d.photos || []).slice(0, 8)) {
        try {
          // Try the JSON approach first
          const photoRes = await fetch(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": GOOGLE_KEY } });
          if (photoRes.ok) {
            const photoData = await photoRes.json();
            if (photoData.photoUri) { photos.push(photoData.photoUri); continue; }
          }
          // Fallback: construct direct URL
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
        } catch {
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
        }
      }
      setImportPhotos(photos);

      const baseName = d.displayName?.text || place.displayName?.text || importSearch;

      // AI enrichment via Claude
      let aiData = {};
      try {
        const aiRes = await fetch(ANTHROPIC_PROXY, {
          method: "POST",
          headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1024,
            system: "You are a food critic and restaurant expert. Return ONLY valid JSON, no markdown.",
            messages: [{ role: "user", content: `Tell me about the restaurant "${baseName}" in ${city || "unknown city"}, ${neighborhood || ""}. Return JSON with these fields: cuisine (string), tags (array of 3 tags like "date night", "omakase", "craft cocktails"), about (2-3 sentence description of restaurant history & uniqueness), must_order (array of 3 dish recommendations), vibe (one sentence about atmosphere), best_for (array of 3 occasion types), known_for (one thing it's most famous for), insider_tip (specific actionable local knowledge), desc (one poetic sentence for the card)` }],
          }),
        });
        const aiJson = await aiRes.json();
        let text = aiJson.content?.[0]?.text?.trim() || "{}";
        if (text.includes("```")) text = text.split("```")[1].replace(/^json/, "").trim();
        aiData = JSON.parse(text);
      } catch (e) { console.error("AI enrichment failed:", e); }

      // Search for reservation link
      let reservationUrl = d.websiteUri || "";
      try {
        const otRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "places.websiteUri" },
          body: JSON.stringify({ textQuery: `${baseName} opentable ${city}`, maxResultCount: 1 }),
        });
        const otData = await otRes.json();
        const otUrl = otData.places?.[0]?.websiteUri || "";
        if (otUrl.includes("opentable") || otUrl.includes("resy.com") || otUrl.includes("tock.com")) {
          reservationUrl = otUrl;
        }
      } catch {}

      const preview = {
        name: baseName,
        city: city || importCity || "",
        neighborhood: neighborhood || "",
        address: d.formattedAddress || "",
        phone: d.nationalPhoneNumber || d.internationalPhoneNumber || "",
        website: reservationUrl || d.websiteUri || "",
        hours: d.regularOpeningHours?.weekdayDescriptions || [],
        lat: d.location?.latitude || 0,
        lng: d.location?.longitude || 0,
        rating: d.rating ? Math.min(10, Math.round(d.rating * 2 * 10) / 10) : 8.5,
        googleRating: d.rating || 0,
        googleReviews: d.userRatingCount || 0,
        price,
        placeId: place.id,
        cuisine: aiData.cuisine || "",
        tags: aiData.tags || [],
        desc: aiData.desc || "",
        about: aiData.about || "",
        must_order: aiData.must_order || [],
        vibe: aiData.vibe || "",
        best_for: aiData.best_for || [],
        known_for: aiData.known_for || "",
        insider_tip: aiData.insider_tip || "",
        source: "Admin Import",
        heat: "🔥🔥",
        img: photos[0] || "",
        img2: photos[1] || photos[0] || "",
      };

      setImportPreview(preview);
      setImportStage("preview");
    } catch (e) {
      showToast("Failed to fetch place details: " + e.message, "error");
      setImportStage("results");
    }
  };

  const confirmImport = async () => {
    const photoUrl = importPhotos[selectedPhotoIdx] || importPreview.img;
    // Build restaurant object with only the fields the community_restaurants table accepts
    const r = {
      name: importPreview.name,
      city: importPreview.city,
      neighborhood: importPreview.neighborhood,
      cuisine: importPreview.cuisine,
      price: importPreview.price,
      rating: importPreview.rating,
      desc: importPreview.desc || importPreview.about || "",
      tags: importPreview.tags,
      lat: importPreview.lat,
      lng: importPreview.lng,
      address: importPreview.address,
      phone: importPreview.phone,
      website: importPreview.website,
      img: photoUrl,
      img2: photoUrl,
      source: "Admin Import",
      heat: importPreview.heat || "🔥🔥",
    };
    try {
      const { data, error } = await addCommunityRestaurant(r);
      if (error) {
        console.error("Import error:", error);
        showToast("Save failed: " + (error.message || "unknown error"), "error");
        return;
      }
      const savedId = data?.[0]?.id || r.id;
      if (photoUrl) {
        await saveSharedPhoto(String(savedId), photoUrl);
      }
      // Sync to Neo4j with the saved ID
      await syncRestaurant({ ...r, id: savedId });
      await logAdminAction("restaurant_smart_import", userId, "restaurant", String(savedId), { name: r.name, city: r.city });
      showToast(`Imported ${r.name} (ID: ${savedId})`);
      setImportPreview(null);
      setImportStage(null);
      setImportSearch("");
      setImportCity("");
      setPlacesResults([]);
      setImportPhotos([]);
      setSelectedPhotoIdx(0);
      onRestaurantsChanged?.();
    } catch (e) {
      console.error("Import exception:", e);
      showToast("Import failed: " + e.message, "error");
    }
  };

  // ── MERGE ──
  const handleMerge = async () => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    await transferLoves(mergeFrom, mergeTo);
    if (isCommunity(mergeFrom)) await deleteCommunityRestaurant(Number(mergeFrom));
    else await upsertAdminOverride(mergeFrom, "merge_into", null, userId);
    await logAdminAction("restaurant_merge", userId, "restaurant", mergeFrom, { merged_into: mergeTo });
    showToast("Restaurants merged");
    setMergeFrom(""); setMergeTo("");
    onRestaurantsChanged?.();
  };

  // ── MISSING DATA ──
  const missingData = useMemo(() => {
    if (section !== "missing") return [];
    return allRestaurants.filter(r => !r.website || !r.lat || !r.lng || !r.desc).slice(0, 50);
  }, [section, allRestaurants]);

  // ── UI ──
  const sections = [
    { key: "search", label: "Search & Edit", icon: "🔍" },
    { key: "import", label: "Smart Import", icon: "✦" },
    { key: "bulk", label: "Bulk Import", icon: "📦" },
    { key: "merge", label: "Merge", icon: "🔗" },
    { key: "missing", label: "Missing Data", icon: "⚠" },
  ];

  const renderEditForm = () => {
    const fields = [
      { key: "name", label: "Name" }, { key: "city", label: "City" }, { key: "cuisine", label: "Cuisine" },
      { key: "neighborhood", label: "Neighborhood" }, { key: "price", label: "Price ($-$$$$)" },
      { key: "rating", label: "Rating (0-10)", type: "number" }, { key: "website", label: "Website / Reservation URL" },
      { key: "phone", label: "Phone" }, { key: "address", label: "Address" },
      { key: "lat", label: "Latitude", type: "number" }, { key: "lng", label: "Longitude", type: "number" },
      { key: "tags", label: "Tags (comma-separated)" }, { key: "desc", label: "Description", type: "textarea" },
    ];
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>
            Editing: {editing.name}
          </div>
          <button type="button" onClick={() => setEditing(null)} style={{ ...btnSmall, fontSize: 18, border: "none", padding: "4px 8px" }}>×</button>
        </div>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{f.label}</div>
            {f.type === "textarea" ? (
              <textarea value={editForm[f.key] || ""} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
            ) : (
              <input type={f.type || "text"} value={editForm[f.key] || ""} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={() => setEditing(null)} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
          <button type="button" onClick={saveEdit} style={{ ...btnPrimary, flex: 1 }}>Save Changes</button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {toast && <Toast {...toast} />}
      {confirm && <ConfirmDialog {...confirm} />}

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {sections.map(s => (
          <button key={s.key} type="button" onClick={() => { setSection(s.key); setEditing(null); }} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* ── SEARCH & EDIT ── */}
      {section === "search" && !editing && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Search restaurants by name, city, or ID..." />
          {filtered.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}>
              {r.img && <img src={r.img} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{r.cuisine} · {r.city} · {r.neighborhood}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => startEdit(r)} style={btnSmall}>Edit</button>
                <button type="button" onClick={() => setConfirm({ message: `Remove "${r.name}" from the app?`, onConfirm: () => handleRemove(r), onCancel: () => setConfirm(null) })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Remove</button>
              </div>
            </div>
          ))}
          {search && filtered.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No restaurants found.</div>}
        </>
      )}
      {section === "search" && editing && renderEditForm()}

      {/* ── SMART IMPORT ── */}
      {section === "import" && (
        <>
          {!importStage && (
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 12 }}>
                Add a restaurant
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
                Search Google Places — we'll auto-fill everything.
              </div>
              <input type="text" value={importSearch} onChange={e => setImportSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchGooglePlaces()} placeholder="Restaurant name..." style={{ ...inputStyle, marginBottom: 8 }} />
              <input type="text" value={importCity} onChange={e => setImportCity(e.target.value)} onKeyDown={e => e.key === "Enter" && searchGooglePlaces()} placeholder="City (optional, helps accuracy)..." style={{ ...inputStyle, marginBottom: 12 }} />
              <button type="button" onClick={searchGooglePlaces} style={{ ...btnPrimary, width: "100%" }} disabled={!importSearch.trim()}>
                Search Google Places
              </button>
            </div>
          )}

          {importStage === "searching" && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 14 }}>Searching Google Places...</div>
            </div>
          )}

          {importStage === "results" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>Pick the right one:</div>
                <button type="button" onClick={() => { setImportStage(null); setPlacesResults([]); }} style={{ ...btnSmall, border: "none" }}>← Back</button>
              </div>
              {placesResults.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No results found. Try a different search.</div>}
              {placesResults.map(p => (
                <button
                  key={p.id} type="button" onClick={() => selectPlace(p)}
                  style={{ ...cardStyle, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.border}` }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: C.bg, flexShrink: 0, overflow: "hidden" }}>
                    {p.photos?.[0]?.name && <img src={`https://places.googleapis.com/v1/${p.photos[0].name}/media?maxWidthPx=200&key=${GOOGLE_KEY}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{p.displayName?.text}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.formattedAddress}</div>
                    {p.rating && <div style={{ fontSize: 10, color: C.terracotta, marginTop: 2 }}>★ {p.rating}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {importStage === "enriching" && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
              <div style={{ fontSize: 14 }}>Fetching details, photos & AI enrichment...</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>This takes a few seconds</div>
            </div>
          )}

          {importStage === "preview" && importPreview && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>
                  Preview
                </div>
                <button type="button" onClick={() => { setImportStage("results"); setImportPreview(null); }} style={{ ...btnSmall, border: "none" }}>← Back</button>
              </div>

              {/* Photo picker */}
              {importPhotos.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", height: 180, marginBottom: 8 }}>
                    <img src={importPhotos[selectedPhotoIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                    {importPhotos.map((url, i) => (
                      <img key={i} src={url} alt="" onClick={() => setSelectedPhotoIdx(i)} style={{
                        width: 52, height: 52, borderRadius: 8, objectFit: "cover", cursor: "pointer", flexShrink: 0,
                        border: i === selectedPhotoIdx ? `2px solid ${C.terracotta}` : `2px solid transparent`, opacity: i === selectedPhotoIdx ? 1 : 0.5,
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Restaurant info */}
              <div style={cardStyle}>
                <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 22, color: C.text }}>{importPreview.name}</div>
                <div style={{ fontSize: 11, color: C.terracotta, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {importPreview.cuisine} · {importPreview.city} · {importPreview.price}
                </div>
                {importPreview.desc && <div style={{ fontSize: 13, color: C.muted, marginTop: 8, fontStyle: "italic", lineHeight: 1.5 }}>{importPreview.desc}</div>}
              </div>

              {/* Details grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Rating", value: importPreview.rating },
                  { label: "Google", value: `★ ${importPreview.googleRating} (${importPreview.googleReviews})` },
                  { label: "Neighborhood", value: importPreview.neighborhood },
                  { label: "Price", value: importPreview.price },
                ].map(d => (
                  <div key={d.label} style={{ background: C.bg2, borderRadius: 10, padding: "8px 10px", border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 9, color: C.dim, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{d.label}</div>
                    <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>{d.value || "—"}</div>
                  </div>
                ))}
              </div>

              {/* AI insights */}
              {importPreview.about && (
                <div style={{ ...cardStyle, borderLeft: `3px solid ${C.terracotta}` }}>
                  <div style={{ fontSize: 9, color: C.terracotta, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", marginBottom: 4 }}>AI INSIGHTS</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{importPreview.about}</div>
                  {importPreview.known_for && <div style={{ fontSize: 11, color: C.muted }}>Known for: {importPreview.known_for}</div>}
                  {importPreview.must_order?.length > 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Must order: {importPreview.must_order.join(", ")}</div>}
                  {importPreview.insider_tip && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Tip: {importPreview.insider_tip}</div>}
                </div>
              )}

              {/* Tags */}
              {importPreview.tags?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {importPreview.tags.map(t => (
                    <span key={t} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, border: `1px solid ${C.border}`, color: C.muted }}>{t}</span>
                  ))}
                </div>
              )}

              <button type="button" onClick={confirmImport} style={{ ...btnPrimary, width: "100%", padding: "14px", fontSize: 15 }}>
                Import {importPreview.name}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── BULK IMPORT ── */}
      {section === "bulk" && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>Bulk Import</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Paste a JSON array of restaurant objects.</div>
          <textarea value={bulkJson} onChange={e => setBulkJson(e.target.value)} placeholder='[{"name":"...","city":"...","cuisine":"..."}]' style={{ ...inputStyle, minHeight: 150, fontFamily: "'DM Mono', monospace", fontSize: 11, resize: "vertical" }} />
          <button type="button" onClick={async () => {
            try {
              const arr = JSON.parse(bulkJson);
              if (!Array.isArray(arr)) throw new Error("Must be a JSON array");
              for (const r of arr) await addCommunityRestaurant(r);
              await logAdminAction("restaurant_bulk_import", userId, "restaurant", null, { count: arr.length });
              showToast(`Imported ${arr.length} restaurants`);
              setBulkJson("");
              onRestaurantsChanged?.();
            } catch (e) { showToast(e.message, "error"); }
          }} style={{ ...btnPrimary, width: "100%", marginTop: 10 }} disabled={!bulkJson.trim()}>
            Import All
          </button>
        </div>
      )}

      {/* ── MERGE ── */}
      {section === "merge" && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>Merge Duplicates</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Transfer all loves and photos from one restaurant to another, then remove the source.</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Source restaurant ID (will be removed)</div>
            <input type="text" value={mergeFrom} onChange={e => setMergeFrom(e.target.value)} style={inputStyle} placeholder="e.g. 1234" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Target restaurant ID (will keep)</div>
            <input type="text" value={mergeTo} onChange={e => setMergeTo(e.target.value)} style={inputStyle} placeholder="e.g. 5678" />
          </div>
          <button type="button" onClick={() => setConfirm({ message: `Merge ${mergeFrom} into ${mergeTo}? This transfers all loves and removes the source.`, onConfirm: () => { handleMerge(); setConfirm(null); }, onCancel: () => setConfirm(null) })} style={{ ...btnPrimary, width: "100%" }} disabled={!mergeFrom || !mergeTo}>
            Merge
          </button>
        </div>
      )}

      {/* ── MISSING DATA ── */}
      {section === "missing" && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>Missing Data</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{missingData.length} restaurants missing website, coordinates, or description.</div>
          {missingData.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {!r.website && <span style={{ color: C.red, marginRight: 6 }}>no website</span>}
                  {!r.lat && <span style={{ color: C.red, marginRight: 6 }}>no coords</span>}
                  {!r.desc && <span style={{ color: C.red }}>no description</span>}
                </div>
              </div>
              <button type="button" onClick={() => startEdit(r)} style={btnSmall}>Fix</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
