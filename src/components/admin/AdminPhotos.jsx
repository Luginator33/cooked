import { useState, useEffect, useMemo } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSmall, btnOutline, sectionHeader, SearchBar, Toast } from "./adminHelpers";
import { saveSharedPhoto, loadSharedPhotos, getPhotoSubmissions, reviewPhotoSubmission, logAdminAction } from "../../lib/supabase";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

export default function AdminPhotos({ allRestaurants, userId }) {
  const [section, setSection] = useState("wrong");
  const [search, setSearch] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [sharedPhotos, setSharedPhotos] = useState({});
  const [toast, setToast] = useState(null);
  const [bulkSearch, setBulkSearch] = useState("");

  // Wrong photo state
  const [wrongSearch, setWrongSearch] = useState("");
  const [wrongSelected, setWrongSelected] = useState(null);
  const [googlePhotos, setGooglePhotos] = useState([]);
  const [googleLoading, setGoogleLoading] = useState(false);

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    loadSharedPhotos().then(setSharedPhotos);
  }, []);

  useEffect(() => {
    if (section === "moderate") {
      getPhotoSubmissions("pending").then(setSubmissions);
    }
  }, [section]);

  const wrongFiltered = useMemo(() => {
    if (!wrongSearch.trim()) return [];
    const q = wrongSearch.toLowerCase();
    return allRestaurants.filter(r => r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || String(r.id) === q).slice(0, 20);
  }, [wrongSearch, allRestaurants]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allRestaurants.filter(r => r.name?.toLowerCase().includes(q) || String(r.id) === q).slice(0, 20);
  }, [search, allRestaurants]);

  const noPhotoRestaurants = useMemo(() => {
    if (section !== "missing") return [];
    const q = bulkSearch.toLowerCase();
    return allRestaurants.filter(r => {
      const hasPhoto = sharedPhotos[String(r.id)] || sharedPhotos[r.id];
      const matchesSearch = !q || r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q);
      return !hasPhoto && matchesSearch;
    }).slice(0, 50);
  }, [section, allRestaurants, sharedPhotos, bulkSearch]);

  // Fetch Google Places photos for a restaurant
  const fetchGooglePhotos = async (r) => {
    setGoogleLoading(true);
    setGooglePhotos([]);
    try {
      // Search Google Places for this restaurant
      const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.photos" },
        body: JSON.stringify({ textQuery: `${r.name} ${r.city || ""}`, maxResultCount: 1 }),
      });
      const searchData = await searchRes.json();
      const place = searchData.places?.[0];
      if (!place?.photos?.length) {
        showToast("No Google photos found for this restaurant", "info");
        setGoogleLoading(false);
        return;
      }

      // Fetch photo URLs
      const photos = [];
      for (const p of place.photos.slice(0, 12)) {
        try {
          const photoRes = await fetch(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": GOOGLE_KEY } });
          if (photoRes.ok) {
            const photoData = await photoRes.json();
            if (photoData.photoUri) { photos.push(photoData.photoUri); continue; }
          }
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
        } catch {
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${GOOGLE_KEY}`);
        }
      }
      setGooglePhotos(photos);
    } catch (e) {
      showToast("Failed to fetch photos: " + e.message, "error");
    }
    setGoogleLoading(false);
  };

  const selectNewPhoto = async (url) => {
    if (!wrongSelected) return;
    await saveSharedPhoto(String(wrongSelected.id), url);
    await logAdminAction("photo_replace", userId, "restaurant", String(wrongSelected.id), { name: wrongSelected.name });
    setSharedPhotos(prev => ({ ...prev, [String(wrongSelected.id)]: url }));
    showToast(`Photo updated for ${wrongSelected.name}`);
    setWrongSelected(null);
    setGooglePhotos([]);
    setWrongSearch("");
  };

  const handleSavePhoto = async () => {
    if (!selected || !photoUrl.trim()) return;
    await saveSharedPhoto(selected.id, photoUrl.trim());
    await logAdminAction("photo_fix", userId, "restaurant", String(selected.id), { name: selected.name });
    setSharedPhotos(prev => ({ ...prev, [String(selected.id)]: photoUrl.trim() }));
    showToast(`Photo updated for ${selected.name}`);
    setPhotoUrl("");
    setSelected(null);
  };

  const handleReview = async (sub, approved) => {
    await reviewPhotoSubmission(sub.id, approved, userId);
    if (approved) await saveSharedPhoto(sub.restaurant_id, sub.photo_url);
    await logAdminAction(approved ? "photo_approve" : "photo_reject", userId, "photo", String(sub.id), { restaurant_id: sub.restaurant_id });
    showToast(approved ? "Photo approved" : "Photo rejected");
    setSubmissions(prev => prev.filter(s => s.id !== sub.id));
  };

  return (
    <div>
      {toast && <Toast {...toast} />}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { key: "wrong", label: "Wrong Photo", icon: "📷" },
          { key: "fix", label: "Paste URL", icon: "🔗" },
          { key: "missing", label: "Missing Photos", icon: "⚠" },
          { key: "moderate", label: "Moderation", icon: "✓" },
        ].map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* ── WRONG PHOTO ── */}
      {section === "wrong" && !wrongSelected && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>
            Fix a wrong photo
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Search for the restaurant, see its current photo, then pick a new one from Google Places.
          </div>
          <SearchBar value={wrongSearch} onChange={setWrongSearch} placeholder="Search restaurant..." />
          {wrongFiltered.map(r => {
            const currentPhoto = sharedPhotos[String(r.id)] || r.img;
            return (
              <div key={r.id} onClick={() => { setWrongSelected(r); fetchGooglePhotos(r); }} style={{ ...cardStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.bg, border: `1px solid ${C.border}` }}>
                  {currentPhoto && <img src={currentPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{r.cuisine} · {r.city}</div>
                </div>
                <div style={{ fontSize: 11, color: C.terracotta, flexShrink: 0 }}>Fix →</div>
              </div>
            );
          })}
        </>
      )}

      {section === "wrong" && wrongSelected && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>
              {wrongSelected.name}
            </div>
            <button type="button" onClick={() => { setWrongSelected(null); setGooglePhotos([]); }} style={{ ...btnSmall, border: "none", fontSize: 16 }}>×</button>
          </div>

          {/* Current photo */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", marginBottom: 6 }}>CURRENT PHOTO</div>
            <div style={{ borderRadius: 12, overflow: "hidden", height: 140, background: C.bg, border: `1px solid ${C.border}` }}>
              {(sharedPhotos[String(wrongSelected.id)] || wrongSelected.img) && (
                <img src={sharedPhotos[String(wrongSelected.id)] || wrongSelected.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
              )}
            </div>
          </div>

          {/* Google photos */}
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", marginBottom: 6 }}>
            {googleLoading ? "LOADING GOOGLE PHOTOS..." : `PICK A NEW PHOTO (${googlePhotos.length} available)`}
          </div>

          {googleLoading && (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.muted, fontSize: 13 }}>
              Fetching photos from Google Places...
            </div>
          )}

          {!googleLoading && googlePhotos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
              {googlePhotos.map((url, i) => (
                <div
                  key={i} onClick={() => selectNewPhoto(url)}
                  style={{ borderRadius: 10, overflow: "hidden", height: 100, cursor: "pointer", border: `2px solid transparent`, position: "relative" }}
                >
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0)", transition: "background 0.15s" }} onMouseEnter={e => e.target.style.background = "rgba(196,96,58,0.3)"} onMouseLeave={e => e.target.style.background = "rgba(0,0,0,0)"} />
                </div>
              ))}
            </div>
          )}

          {!googleLoading && googlePhotos.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>No photos found. You can paste a URL instead:</div>
          )}

          {/* Manual URL fallback */}
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="Or paste a photo URL..." style={{ ...inputStyle, flex: 1 }} />
            <button type="button" onClick={() => { if (photoUrl.trim()) selectNewPhoto(photoUrl.trim()); }} style={btnPrimary} disabled={!photoUrl.trim()}>Save</button>
          </div>
        </div>
      )}

      {/* ── PASTE URL (simple) ── */}
      {section === "fix" && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>
            Fix photo by URL
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Search a restaurant and paste a direct image URL.</div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search restaurant..." />
          {!selected && filtered.map(r => {
            const currentPhoto = sharedPhotos[String(r.id)];
            return (
              <div key={r.id} onClick={() => { setSelected(r); setPhotoUrl(currentPhoto || ""); }} style={{ ...cardStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                {currentPhoto && <img src={currentPhoto} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
                <div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{r.city} · ID: {r.id}</div>
                </div>
              </div>
            );
          })}
          {selected && (
            <div style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 15, color: C.text, fontWeight: "bold" }}>{selected.name}</div>
                <button type="button" onClick={() => { setSelected(null); setPhotoUrl(""); }} style={{ ...btnSmall, border: "none", fontSize: 16 }}>×</button>
              </div>
              {photoUrl && (
                <div style={{ marginBottom: 10, borderRadius: 10, overflow: "hidden", height: 150 }}>
                  <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                </div>
              )}
              <input type="text" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="Paste photo URL..." style={{ ...inputStyle, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setSelected(null); setPhotoUrl(""); }} style={btnOutline}>Cancel</button>
                <button type="button" onClick={handleSavePhoto} style={btnPrimary} disabled={!photoUrl.trim()}>Save Photo</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MISSING PHOTOS ── */}
      {section === "missing" && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>
            Missing Photos
          </div>
          <SearchBar value={bulkSearch} onChange={setBulkSearch} placeholder="Filter..." />
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{noPhotoRestaurants.length} restaurants without photos</div>
          {noPhotoRestaurants.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{r.city}</div>
              </div>
              <button type="button" onClick={() => { setSection("wrong"); setWrongSelected(r); fetchGooglePhotos(r); }} style={btnSmall}>Add Photo</button>
            </div>
          ))}
        </>
      )}

      {/* ── MODERATION ── */}
      {section === "moderate" && (
        <>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text, marginBottom: 6 }}>
            Photo Moderation
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{submissions.length} pending submissions</div>
          {submissions.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No pending photo submissions.</div>}
          {submissions.map(sub => (
            <div key={sub.id} style={cardStyle}>
              <div style={{ borderRadius: 10, overflow: "hidden", height: 150, marginBottom: 10 }}>
                <img src={sub.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ fontSize: 12, color: C.text }}>Restaurant ID: {sub.restaurant_id}</div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Submitted by: {sub.submitted_by}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => handleReview(sub, false)} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Reject</button>
                <button type="button" onClick={() => handleReview(sub, true)} style={{ ...btnSmall, color: C.green, borderColor: C.green }}>Approve</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
