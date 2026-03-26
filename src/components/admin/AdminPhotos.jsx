import { useState, useEffect, useMemo } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnSmall, btnOutline, sectionHeader, SearchBar, Toast } from "./adminHelpers";
import { saveSharedPhoto, loadSharedPhotos, getPhotoSubmissions, reviewPhotoSubmission, logAdminAction } from "../../lib/supabase";

export default function AdminPhotos({ allRestaurants, userId }) {
  const [section, setSection] = useState("fix");
  const [search, setSearch] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [sharedPhotos, setSharedPhotos] = useState({});
  const [toast, setToast] = useState(null);
  const [bulkSearch, setBulkSearch] = useState("");

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    loadSharedPhotos().then(setSharedPhotos);
  }, []);

  useEffect(() => {
    if (section === "moderate") {
      getPhotoSubmissions("pending").then(setSubmissions);
    }
  }, [section]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allRestaurants.filter(r => r.name?.toLowerCase().includes(q) || String(r.id) === q).slice(0, 20);
  }, [search, allRestaurants]);

  const noPhotoRestaurants = useMemo(() => {
    if (section !== "bulk") return [];
    const q = bulkSearch.toLowerCase();
    return allRestaurants.filter(r => {
      const hasPhoto = sharedPhotos[String(r.id)] || sharedPhotos[r.id];
      const matchesSearch = !q || r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q);
      return !hasPhoto && matchesSearch;
    }).slice(0, 50);
  }, [section, allRestaurants, sharedPhotos, bulkSearch]);

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
    if (approved) {
      await saveSharedPhoto(sub.restaurant_id, sub.photo_url);
    }
    await logAdminAction(approved ? "photo_approve" : "photo_reject", userId, "photo", String(sub.id), { restaurant_id: sub.restaurant_id });
    showToast(approved ? "Photo approved" : "Photo rejected");
    setSubmissions(prev => prev.filter(s => s.id !== sub.id));
  };

  return (
    <div>
      {toast && <Toast {...toast} />}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[{ key: "fix", label: "Fix Photo" }, { key: "bulk", label: "Missing Photos" }, { key: "moderate", label: "Moderation" }].map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
          }}>{s.label}</button>
        ))}
      </div>

      {/* Fix individual photo */}
      {section === "fix" && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Search restaurant to fix photo..." />
          {!selected && filtered.map(r => {
            const currentPhoto = sharedPhotos[String(r.id)];
            return (
              <div key={r.id} onClick={() => { setSelected(r); setPhotoUrl(currentPhoto || ""); }} style={{ ...cardStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                {currentPhoto && <img src={currentPhoto} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />}
                <div>
                  <div style={{ fontSize: 14, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{r.city} · ID: {r.id} · {currentPhoto ? "has photo" : "no photo"}</div>
                </div>
              </div>
            );
          })}
          {selected && (
            <div style={cardStyle}>
              <div style={sectionHeader}>FIX PHOTO: {selected.name}</div>
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

      {/* Missing photos */}
      {section === "bulk" && (
        <>
          <SearchBar value={bulkSearch} onChange={setBulkSearch} placeholder="Filter missing photos..." />
          <div style={sectionHeader}>RESTAURANTS WITHOUT PHOTOS ({noPhotoRestaurants.length})</div>
          {noPhotoRestaurants.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{r.city} · ID: {r.id}</div>
              </div>
              <button type="button" onClick={() => { setSection("fix"); setSelected(r); setPhotoUrl(""); }} style={btnSmall}>Add Photo</button>
            </div>
          ))}
        </>
      )}

      {/* Photo moderation */}
      {section === "moderate" && (
        <>
          <div style={sectionHeader}>PENDING SUBMISSIONS ({submissions.length})</div>
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
