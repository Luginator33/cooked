import { useState, useMemo } from "react";
import { C, cardStyle, inputStyle, btnPrimary, btnDanger, btnSmall, btnOutline, sectionHeader, SearchBar, ConfirmDialog, Toast } from "./adminHelpers";
import { upsertAdminOverride, deleteAdminOverride, getAdminOverrides, addCommunityRestaurant, deleteCommunityRestaurant, updateCommunityRestaurant, saveSharedPhoto, logAdminAction } from "../../lib/supabase";
import { transferLoves } from "../../lib/neo4j";
import { RESTAURANTS } from "../../data/restaurants";

export default function AdminRestaurants({ allRestaurants, userId, onRestaurantsChanged }) {
  const [section, setSection] = useState("search");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [importForm, setImportForm] = useState({ name: "", city: "", cuisine: "", neighborhood: "", price: "$$", rating: "", desc: "", tags: "", lat: "", lng: "" });
  const [bulkJson, setBulkJson] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [overrides, setOverrides] = useState([]);

  const showToast = (msg, type = "success") => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 2500); };

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allRestaurants.filter(r => r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || String(r.id) === q).slice(0, 20);
  }, [search, allRestaurants]);

  const missingData = useMemo(() => {
    if (section !== "missing") return [];
    return allRestaurants.filter(r => !r.website || !r.lat || !r.lng || !r.desc).slice(0, 50);
  }, [section, allRestaurants]);

  const missingReservations = useMemo(() => {
    if (section !== "reservations") return [];
    return allRestaurants.filter(r => {
      const w = (r.website || "").toLowerCase();
      return !w.includes("opentable") && !w.includes("resy.com") && !w.includes("tock.com") && !w.includes("sevenrooms");
    }).slice(0, 50);
  }, [section, allRestaurants]);

  const isCommunity = (id) => Number(id) >= 100000;

  const handleRemove = async (r) => {
    if (isCommunity(r.id)) {
      await deleteCommunityRestaurant(r.id);
    } else {
      await upsertAdminOverride(r.id, "delete", null, userId);
    }
    await logAdminAction("restaurant_remove", userId, "restaurant", String(r.id), { name: r.name });
    showToast(`Removed ${r.name}`);
    onRestaurantsChanged?.();
    setConfirm(null);
  };

  const startEdit = (r) => {
    setEditing(r);
    setEditForm({ name: r.name || "", city: r.city || "", cuisine: r.cuisine || "", neighborhood: r.neighborhood || "", price: r.price || "", rating: r.rating || "", desc: r.desc || r.description || "", tags: (r.tags || []).join(", "), website: r.website || "", lat: r.lat || "", lng: r.lng || "" });
  };

  const saveEdit = async () => {
    const data = { ...editForm, rating: Number(editForm.rating) || 0, lat: Number(editForm.lat) || 0, lng: Number(editForm.lng) || 0, tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean) };
    if (isCommunity(editing.id)) {
      await updateCommunityRestaurant(editing.id, data);
    } else {
      await upsertAdminOverride(editing.id, "edit", data, userId);
    }
    await logAdminAction("restaurant_edit", userId, "restaurant", String(editing.id), { name: data.name });
    showToast(`Updated ${data.name}`);
    setEditing(null);
    onRestaurantsChanged?.();
  };

  const handleImport = async () => {
    if (!importForm.name.trim()) return;
    const obj = { ...importForm, rating: Number(importForm.rating) || 0, lat: Number(importForm.lat) || 0, lng: Number(importForm.lng) || 0, tags: importForm.tags.split(",").map(t => t.trim()).filter(Boolean) };
    await addCommunityRestaurant(obj);
    await logAdminAction("restaurant_import", userId, "restaurant", null, { name: obj.name });
    showToast(`Imported ${obj.name}`);
    setImportForm({ name: "", city: "", cuisine: "", neighborhood: "", price: "$$", rating: "", desc: "", tags: "", lat: "", lng: "" });
    onRestaurantsChanged?.();
  };

  const handleBulkImport = async () => {
    try {
      const arr = JSON.parse(bulkJson);
      if (!Array.isArray(arr)) throw new Error("Must be an array");
      for (const r of arr) {
        await addCommunityRestaurant(r);
      }
      await logAdminAction("restaurant_bulk_import", userId, "restaurant", null, { count: arr.length });
      showToast(`Imported ${arr.length} restaurants`);
      setBulkJson("");
      onRestaurantsChanged?.();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleMerge = async () => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    await transferLoves(mergeFrom, mergeTo);
    if (isCommunity(mergeFrom)) {
      await deleteCommunityRestaurant(Number(mergeFrom));
    } else {
      await upsertAdminOverride(mergeFrom, "merge_into", null, userId);
    }
    await logAdminAction("restaurant_merge", userId, "restaurant", mergeFrom, { merged_into: mergeTo });
    showToast("Restaurants merged");
    setMergeFrom(""); setMergeTo("");
    onRestaurantsChanged?.();
  };

  const handleBulkCityFix = async (restaurantId, newCity, newLat, newLng) => {
    const data = { city: newCity };
    if (newLat) data.lat = Number(newLat);
    if (newLng) data.lng = Number(newLng);
    if (isCommunity(restaurantId)) {
      await updateCommunityRestaurant(restaurantId, data);
    } else {
      await upsertAdminOverride(restaurantId, "edit", data, userId);
    }
    await logAdminAction("restaurant_city_fix", userId, "restaurant", String(restaurantId), data);
    showToast("City updated");
  };

  const renderField = (label, key, type = "text") => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>{label}</div>
      {type === "textarea" ? (
        <textarea value={editForm[key] || ""} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
      ) : (
        <input type={type} value={editForm[key] || ""} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
      )}
    </div>
  );

  const renderImportField = (label, key, type = "text") => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>{label}</div>
      <input type={type} value={importForm[key] || ""} onChange={e => setImportForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
    </div>
  );

  const sections = [
    { key: "search", label: "Search & Edit" },
    { key: "import", label: "Import" },
    { key: "bulk", label: "Bulk Import" },
    { key: "merge", label: "Merge" },
    { key: "missing", label: "Missing Data" },
    { key: "reservations", label: "Reservations" },
  ];

  return (
    <div>
      {toast && <Toast {...toast} />}
      {confirm && <ConfirmDialog {...confirm} />}

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {sections.map(s => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} style={{
            ...btnSmall, background: section === s.key ? C.terracotta : "transparent",
            color: section === s.key ? "#fff" : C.muted, border: section === s.key ? "none" : `1px solid ${C.border}`,
          }}>{s.label}</button>
        ))}
      </div>

      {/* Search & Edit */}
      {section === "search" && !editing && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Search restaurants by name, city, or ID..." />
          {filtered.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{r.cuisine} · {r.city} · ID: {r.id}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => startEdit(r)} style={btnSmall}>Edit</button>
                <button type="button" onClick={() => setConfirm({ message: `Remove "${r.name}"? This hides it from all users.`, onConfirm: () => handleRemove(r), onCancel: () => setConfirm(null) })} style={{ ...btnSmall, color: C.red, borderColor: C.red }}>Remove</button>
              </div>
            </div>
          ))}
          {search && filtered.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No restaurants found.</div>}
        </>
      )}

      {/* Edit form */}
      {section === "search" && editing && (
        <div>
          <div style={sectionHeader}>EDITING: {editing.name}</div>
          {renderField("Name", "name")}
          {renderField("City", "city")}
          {renderField("Cuisine", "cuisine")}
          {renderField("Neighborhood", "neighborhood")}
          {renderField("Price", "price")}
          {renderField("Rating", "rating", "number")}
          {renderField("Website", "website")}
          {renderField("Latitude", "lat", "number")}
          {renderField("Longitude", "lng", "number")}
          {renderField("Tags (comma-separated)", "tags")}
          {renderField("Description", "desc", "textarea")}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button type="button" onClick={() => setEditing(null)} style={btnOutline}>Cancel</button>
            <button type="button" onClick={saveEdit} style={btnPrimary}>Save Changes</button>
          </div>
        </div>
      )}

      {/* Import single */}
      {section === "import" && (
        <div>
          <div style={sectionHeader}>ADD A RESTAURANT</div>
          {renderImportField("Name *", "name")}
          {renderImportField("City *", "city")}
          {renderImportField("Cuisine", "cuisine")}
          {renderImportField("Neighborhood", "neighborhood")}
          {renderImportField("Price ($-$$$$)", "price")}
          {renderImportField("Rating (0-10)", "rating", "number")}
          {renderImportField("Description", "desc")}
          {renderImportField("Tags (comma-separated)", "tags")}
          {renderImportField("Latitude", "lat", "number")}
          {renderImportField("Longitude", "lng", "number")}
          <button type="button" onClick={handleImport} style={{ ...btnPrimary, width: "100%", marginTop: 8 }} disabled={!importForm.name.trim()}>
            Import Restaurant
          </button>
        </div>
      )}

      {/* Bulk import */}
      {section === "bulk" && (
        <div>
          <div style={sectionHeader}>BULK IMPORT (JSON)</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Paste a JSON array of restaurant objects.</div>
          <textarea value={bulkJson} onChange={e => setBulkJson(e.target.value)} placeholder='[{"name":"...","city":"...","cuisine":"..."}]' style={{ ...inputStyle, minHeight: 150, fontFamily: "'DM Mono', monospace", fontSize: 11, resize: "vertical" }} />
          <button type="button" onClick={handleBulkImport} style={{ ...btnPrimary, width: "100%", marginTop: 8 }} disabled={!bulkJson.trim()}>
            Import All
          </button>
        </div>
      )}

      {/* Merge */}
      {section === "merge" && (
        <div>
          <div style={sectionHeader}>MERGE DUPLICATES</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Transfer all loves and photos from one restaurant to another, then remove the source.</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>Source ID (will be removed)</div>
            <input type="text" value={mergeFrom} onChange={e => setMergeFrom(e.target.value)} style={inputStyle} placeholder="e.g. 1234" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontFamily: "'DM Mono', monospace" }}>Target ID (will keep)</div>
            <input type="text" value={mergeTo} onChange={e => setMergeTo(e.target.value)} style={inputStyle} placeholder="e.g. 5678" />
          </div>
          <button type="button" onClick={() => setConfirm({ message: `Merge restaurant ${mergeFrom} into ${mergeTo}? This transfers all loves and removes the source.`, onConfirm: () => { handleMerge(); setConfirm(null); }, onCancel: () => setConfirm(null) })} style={{ ...btnPrimary, width: "100%" }} disabled={!mergeFrom || !mergeTo}>
            Merge Restaurants
          </button>
        </div>
      )}

      {/* Missing data */}
      {section === "missing" && (
        <div>
          <div style={sectionHeader}>MISSING DATA ({missingData.length} restaurants)</div>
          {missingData.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {!r.website && <span style={{ color: C.red }}>no website </span>}
                  {!r.lat && <span style={{ color: C.red }}>no coords </span>}
                  {!r.desc && <span style={{ color: C.red }}>no description </span>}
                </div>
              </div>
              <button type="button" onClick={() => startEdit(r)} style={btnSmall}>Fix</button>
            </div>
          ))}
        </div>
      )}

      {/* Reservation links */}
      {section === "reservations" && (
        <div>
          <div style={sectionHeader}>MISSING RESERVATION LINKS ({missingReservations.length})</div>
          {missingReservations.map(r => (
            <div key={r.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: "bold" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{r.city} · {r.website ? "has website" : "no website"}</div>
              </div>
              <button type="button" onClick={() => startEdit(r)} style={btnSmall}>Add Link</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
