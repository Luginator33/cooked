import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#0a0a0f", bg2: "#12121a", bg3: "#1a1a24",
  text: "#f5f0eb", muted: "rgba(245,240,235,0.3)",
  terracotta: "#c4603a", border: "rgba(255,255,255,0.06)",
};

function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  if (isStandalone) return "PWA";
  if (isMobile) return "Mobile Web";
  return "Desktop Web";
}

export default function BugReportButton({ userId, userName, userEmail, currentTab, detailRestaurant, viewingUserId }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshotData, setScreenshotData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef(null);

  const captureScreenshot = async () => {
    setCapturing(true);
    try {
      // Hide the bug button itself during capture
      const btn = document.getElementById("bug-report-trigger");
      if (btn) btn.style.display = "none";

      const canvas = await html2canvas(document.body, {
        backgroundColor: "#0a0a0f",
        scale: 1,
        logging: false,
        useCORS: true,
        allowTaint: true,
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: 0,
        scrollY: 0,
      });

      if (btn) btn.style.display = "";
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setScreenshotData(dataUrl);
    } catch (e) {
      console.error("Screenshot failed:", e);
      // Still open the modal even if screenshot fails
    }
    setCapturing(false);
    setOpen(true);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setScreenshotData(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);

    try {
      // Upload screenshot to Supabase storage if available, otherwise store as data URL
      let screenshotUrl = null;
      if (screenshotData) {
        // Store as base64 in the table (simpler than setting up storage)
        screenshotUrl = screenshotData;
      }

      // Determine what page the user is on
      let page = currentTab || "unknown";
      let restaurantId = null;
      let restaurantName = null;

      if (detailRestaurant) {
        page = "restaurant_detail";
        restaurantId = String(detailRestaurant.id);
        restaurantName = detailRestaurant.name;
      }
      if (viewingUserId) {
        page = "user_profile";
      }

      const report = {
        user_id: userId || null,
        user_name: userName || null,
        user_email: userEmail || null,
        description: description.trim(),
        screenshot_url: screenshotUrl,
        page,
        tab: currentTab || null,
        url: window.location.href,
        platform: detectPlatform(),
        user_agent: navigator.userAgent,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
        restaurant_id: restaurantId,
        restaurant_name: restaurantName,
        viewing_user_id: viewingUserId || null,
        app_version: "v2-unified",
        status: "open",
      };

      const { error } = await supabase.from("bug_reports").insert(report);
      if (error) throw error;

      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setDescription("");
        setScreenshotData(null);
      }, 2000);
    } catch (e) {
      console.error("Bug report submit error:", e);
      alert("Failed to submit. Please try again.");
    }
    setSubmitting(false);
  };

  const close = () => {
    setOpen(false);
    setDescription("");
    setScreenshotData(null);
    setSubmitted(false);
  };

  return (
    <>
      {/* Floating bug report trigger button */}
      <button
        id="bug-report-trigger"
        type="button"
        onClick={captureScreenshot}
        style={{
          position: "fixed",
          bottom: 90,
          right: "max(16px, calc(50% - 224px))",
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(245,240,235,0.4)",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          transition: "opacity 0.2s",
          opacity: capturing ? 0 : 0.6,
        }}
        title="Report an issue"
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>🆘</span>
      </button>

      {/* Bug report modal */}
      {open && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 999999,
            background: "rgba(0,0,0,0.8)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={close}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480,
              background: C.bg2,
              borderRadius: "20px 20px 0 0",
              padding: "20px 18px",
              paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            {submitted ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontSize: 20, color: C.text }}>
                  Bug reported!
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
                  Thanks — we'll look into it.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: C.text }}>
                    Report a Bug
                  </div>
                  <button type="button" onClick={close} style={{ background: "none", border: "none", color: C.muted, fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                </div>

                {/* Screenshot preview */}
                {screenshotData && (
                  <div style={{ marginBottom: 14, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <img src={screenshotData} alt="Screenshot" style={{ width: "100%", display: "block" }} />
                  </div>
                )}

                {/* Screenshot actions */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button type="button" onClick={captureScreenshot} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 10,
                    border: `1px solid ${C.border}`, background: C.bg3,
                    color: C.text, fontSize: 12, cursor: "pointer",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                  }}>
                    📸 {screenshotData ? "Retake" : "Capture"} Screenshot
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 10,
                    border: `1px solid ${C.border}`, background: C.bg3,
                    color: C.text, fontSize: 12, cursor: "pointer",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                  }}>
                    📎 Upload Image
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileUpload} />
                </div>

                {/* Description */}
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What went wrong? Be as specific as possible..."
                  rows={4}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 12,
                    border: `1px solid ${C.border}`, background: C.bg3,
                    color: C.text, fontSize: 14, resize: "vertical",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    outline: "none",
                  }}
                />

                {/* Context info (shown to user so they know what's captured) */}
                <div style={{ marginTop: 10, fontSize: 11, color: C.muted, fontFamily: "'Inter', -apple-system, sans-serif", lineHeight: 1.6 }}>
                  Auto-captured: {detectPlatform()} · {currentTab || "—"} tab
                  {detailRestaurant ? ` · ${detailRestaurant.name}` : ""}
                  {viewingUserId ? ` · viewing user profile` : ""}
                  · {window.innerWidth}×{window.innerHeight}
                </div>

                {/* Submit */}
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !description.trim()}
                  style={{
                    width: "100%", marginTop: 14, padding: "14px",
                    borderRadius: 14, border: "none",
                    background: description.trim() ? C.terracotta : C.bg3,
                    color: description.trim() ? "#fff" : C.muted,
                    fontSize: 15, fontWeight: 600, cursor: submitting ? "default" : "pointer",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "Submitting..." : "Submit Bug Report"}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
