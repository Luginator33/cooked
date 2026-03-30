export const C = {
  bg:        "#0a0a0f",
  bg2:       "#12121a",
  bg3:       "#1a1a24",
  border:    "rgba(255,255,255,0.04)",
  border2:   "rgba(255,255,255,0.06)",
  text:      "#f5f0eb",
  muted:     "rgba(245,240,235,0.3)",
  dim:       "rgba(245,240,235,0.18)",
  terracotta:"#ff9632",
  terra2:    "#e07850",
  rose:      "#c44060",
  cream:     "#f5f0eb",
  card:      "rgba(255,220,180,0.02)",
};

export const sectionHeader = {
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: C.muted,
  fontFamily: "'Inter', -apple-system, sans-serif",
  marginBottom: 10,
};

export const cardStyle = {
  background: C.bg2,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 10,
};

export const inputStyle = {
  width: "100%",
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  color: C.text,
  fontSize: 14,
  fontFamily: "'Inter', -apple-system, sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

export const btnPrimary = {
  background: C.terracotta,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontFamily: "'Inter', -apple-system, sans-serif",
  cursor: "pointer",
  fontWeight: 500,
};

export const btnSecondary = {
  background: "transparent",
  color: "#999",
  border: `1px solid #555`,
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontFamily: "'Inter', -apple-system, sans-serif",
  cursor: "pointer",
  fontWeight: 500,
};

export const btnOutline = {
  background: "transparent",
  color: C.terracotta,
  border: `1px solid ${C.terracotta}`,
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 13,
  fontFamily: "'Inter', -apple-system, sans-serif",
  cursor: "pointer",
};

export const btnDanger = {
  background: C.red,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "8px 14px",
  fontSize: 12,
  fontFamily: "'Inter', -apple-system, sans-serif",
  cursor: "pointer",
};

export const btnSmall = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 11,
  color: C.muted,
  fontFamily: "'Inter', -apple-system, sans-serif",
  cursor: "pointer",
};

export const badge = (color) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 10,
  fontFamily: "'Inter', -apple-system, sans-serif",
  letterSpacing: "0.06em",
  color: "#fff",
  background: color,
});

export function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100001, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 20px", maxWidth: 340, width: "90%", textAlign: "center" }}>
        <div style={{ color: C.text, fontSize: 15, fontFamily: "'Inter', -apple-system, sans-serif", lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button type="button" onClick={onCancel} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{ ...btnDanger, flex: 1, padding: "10px 18px" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ message, type = "success" }) {
  return (
    <div style={{
      position: "fixed", top: 76, left: "50%", transform: "translateX(-50%)",
      background: type === "error" ? C.red : type === "success" ? C.terracotta : C.blue,
      color: "#fff", borderRadius: 20, padding: "10px 20px", fontSize: 13, fontWeight: 600,
      zIndex: 100002, fontFamily: "'Inter', -apple-system, sans-serif", whiteSpace: "nowrap",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {message}
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder = "Search..." }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyle, marginBottom: 12 }}
    />
  );
}

export function StatCard({ label, value }) {
  return (
    <div style={{ ...cardStyle, textAlign: "center", flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 32, color: C.terracotta, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>{label}</div>
    </div>
  );
}
