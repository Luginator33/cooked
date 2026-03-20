import { useEffect, useMemo, useRef, useState } from "react";

const C = {
  bg: "#0f0c09",
  bg2: "#1a1208",
  border: "#2e1f0e",
  text: "#f0ebe2",
  muted: "#5a3a20",
  dim: "#3d2a18",
  terracotta: "#c4603a",
};

const FLAME_PATH =
  "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

function FlameIcon({ size = 16, filled = true, color = C.terracotta }) {
  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 167 200"
      fill={filled ? color : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={filled ? 0 : 12}
      strokeLinecap="round"
    >
      <path d={FLAME_PATH} />
    </svg>
  );
}

function GraphCanvas({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = [
      { id: "you", x: 120, y: 26, r: 17, fill: C.terracotta, stroke: C.terracotta },
      { id: "NYC", x: 46, y: 76, r: 14, fill: C.bg2, stroke: C.terracotta },
      { id: "Bestia", x: 193, y: 78, r: 16, fill: C.bg2, stroke: C.terracotta },
      { id: "Madison", x: 72, y: 142, r: 15, fill: C.bg2, stroke: C.terracotta },
      { id: "London", x: 160, y: 144, r: 14, fill: C.bg2, stroke: C.terracotta },
      { id: "Nobu", x: 120, y: 184, r: 15, fill: C.bg2, stroke: C.terracotta },
    ];
    const edges = [
      ["you", "NYC"],
      ["you", "Bestia"],
      ["you", "Madison"],
      ["NYC", "Madison"],
      ["Bestia", "London"],
      ["London", "Nobu"],
      ["Madison", "Nobu"],
    ];
    const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
    let raf = 0;
    const start = performance.now();

    const draw = (t) => {
      const elapsed = (t - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      edges.forEach(([a, b], i) => {
        const na = nodeById[a];
        const nb = nodeById[b];
        const edgeAppear = 0.45 + i * 0.14;
        const prog = Math.max(0, Math.min(1, (elapsed - edgeAppear) / 0.42));
        if (prog <= 0) return;
        const x2 = na.x + (nb.x - na.x) * prog;
        const y2 = na.y + (nb.y - na.y) * prog;
        const linkedToYou = a === "you" || b === "you";
        const pulse = linkedToYou ? 0.55 + 0.35 * Math.sin(elapsed * 2.8) : 0.45;
        ctx.strokeStyle = linkedToYou ? C.terracotta : C.border;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = linkedToYou ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      nodes.forEach((n, i) => {
        const appear = i * 0.14;
        const p = Math.max(0, Math.min(1, (elapsed - appear) / 0.35));
        if (p <= 0) return;
        const eased = 1 - Math.pow(1 - p, 3);
        const pulse = n.id === "you" ? 1 + 0.07 * Math.sin(elapsed * 3.5) : 1;
        const scale = eased * pulse;
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.arc(0, 0, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.fill;
        ctx.fill();
        ctx.strokeStyle = n.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = n.id === "you" ? "#fff" : C.text;
        ctx.font = "500 8px 'DM Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.id, 0, 0.5);
        ctx.restore();
      });

      if (active) raf = requestAnimationFrame(draw);
    };

    if (active) raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={canvasRef} width={240} height={200} style={{ width: 240, height: 200, display: "block" }} />;
}

function Wordmark({ size = 22 }) {
  return (
    <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: size, fontWeight: 700, fontStyle: "italic", lineHeight: 1 }}>
      <span style={{ color: C.text }}>cook</span>
      <span style={{ color: C.terracotta }}>ed</span>
    </span>
  );
}

export default function Onboarding({ onComplete }) {
  const [slide, setSlide] = useState(0);
  const [visible, setVisible] = useState(false);
  const totalSlides = 5;

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 15);
    return () => clearTimeout(t);
  }, [slide]);

  const finish = () => {
    try {
      localStorage.setItem("cooked_onboarding_done", "true");
    } catch {}
    onComplete?.();
  };

  const buttonText = ["Let's go", "Next", "Next", "Next", "Start swiping"][slide];
  const progressIndex = Math.min(slide, 3);

  const content = useMemo(() => {
    if (slide === 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 40 }}>
          <Wordmark size={52} />
          <div style={{ marginTop: 14, fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: C.muted }}>your table is waiting</div>
          <div style={{ marginTop: 22, width: "100%", height: 1, background: C.border }} />
          <div style={{ marginTop: 22, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 18, color: C.text }}>The restaurant app for people who care.</div>
          <div style={{ marginTop: 10, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted }}>
            Not crowd-sourced. Not algorithmic. <span style={{ color: C.terracotta }}>Curated by taste.</span>
          </div>
        </div>
      );
    }
    if (slide === 1) {
      return (
        <div style={{ marginTop: 10 }}>
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 18, height: 360, position: "relative", overflow: "hidden" }}>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.15 }}>
              <circle cx="70" cy="70" r="42" fill="none" stroke={C.border} />
              <circle cx="230" cy="130" r="58" fill="none" stroke={C.border} />
            </svg>
            <div style={{ position: "absolute", top: 16, left: 16, background: `${C.terracotta}20`, border: `1px solid ${C.terracotta}`, borderRadius: 14, padding: "4px 8px", color: C.terracotta, fontFamily: "'DM Mono', monospace", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Eater LA
            </div>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(15,12,9,0.08) 35%, rgba(15,12,9,0.95) 100%)" }} />
            <div style={{ position: "absolute", bottom: 24, left: 18, right: 18 }}>
              <div style={{ color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>Japanese • Malibu</div>
              <div style={{ color: C.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: 32, lineHeight: 1 }}>Nobu Malibu</div>
              <div style={{ marginTop: 8, display: "flex", gap: 3 }}>
                {[0, 1, 2, 3, 4].map((i) => <FlameIcon key={i} size={14} filled={i < 4} color={i < 4 ? C.terracotta : C.dim} />)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", border: `1.5px solid ${C.border}`, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>✕</div>
              <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Pass</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", border: "1.5px solid #4a90d9", color: "#7ca8dc", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7ca8dc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Watch</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.terracotta, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <FlameIcon size={20} filled color="#fff" />
              </div>
              <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 9, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Heat</div>
            </div>
          </div>
          <div style={{ marginTop: 16, textAlign: "center", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontStyle: "italic", color: C.text }}>Swipe with conviction</div>
        </div>
      );
    }
    if (slide === 2) {
      return (
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 26, marginBottom: 12 }}>
            {["L", "M", "D"].map((k) => (
              <div key={k} style={{ position: "relative" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.terracotta}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.text, fontFamily: "'DM Mono', monospace", fontSize: 14, background: C.bg2 }}>{k}</div>
                <div style={{ position: "absolute", left: "50%", top: 44, width: 1, height: 28, background: C.border }} />
              </div>
            ))}
          </div>
          <div style={{ width: 250, margin: "0 auto", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>3 friends loved</div>
            <div style={{ color: C.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontStyle: "italic", fontWeight: 700 }}>Bestia</div>
          </div>
          <div style={{ marginTop: 22, color: C.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 30 }}>Follow friends. Trust their taste.</div>
          <div style={{ marginTop: 10, color: C.muted, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, lineHeight: 1.5 }}>
            See exactly where people you trust have been - and what they <span style={{ color: C.terracotta }}>actually thought</span>. Yelp reviews are a fever dream.
          </div>
        </div>
      );
    }
    if (slide === 3) {
      return (
        <div style={{ marginTop: 18, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <GraphCanvas active />
          </div>
          <div style={{ marginTop: 10, color: C.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 30 }}>The restaurant graph</div>
          <div style={{ marginTop: 8, color: C.muted, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, lineHeight: 1.5 }}>
            People, places, cities - all connected. Powers <span style={{ color: C.terracotta }}>friends who've been here</span>, <span style={{ color: C.terracotta }}>trending near you</span>, and eventually six degrees of any restaurant on earth.
          </div>
        </div>
      );
    }
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 18, height: 250, position: "relative", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(15,12,9,0.08) 35%, rgba(15,12,9,0.95) 100%)" }} />
          <div style={{ position: "absolute", bottom: 22, left: 18, right: 18 }}>
            <div style={{ color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>Japanese • Malibu</div>
            <div style={{ color: C.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: 30, lineHeight: 1 }}>Nobu Malibu</div>
          </div>
        </div>
        <div style={{ marginBottom: 8, color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase" }}>now build your taste</div>
        <div style={{ background: C.terracotta, borderRadius: 12, padding: "14px 14px 12px", color: "#fff", fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 13, lineHeight: 1.5 }}>
          <div>🔥 Heat - you've been or want to go</div>
          <div>👁 Watch - on your radar</div>
          <div>✕ Pass - not your thing</div>
          <div>↑ Swipe up - already been</div>
        </div>
      </div>
    );
  }, [slide]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, maxWidth: 480, margin: "0 auto", padding: "16px 18px 24px", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={22} />
        {slide < totalSlides - 1 ? (
          <button type="button" onClick={() => setSlide(totalSlides - 1)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase" }}>
            skip
          </button>
        ) : <div style={{ width: 34 }} />}
      </div>

      <div
        key={slide}
        style={{
          transition: "opacity 0.35s ease, transform 0.35s ease",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateX(0px)" : "translateX(30px)",
          minHeight: 510,
        }}
      >
        {content}
      </div>

      <div style={{ position: "absolute", left: 18, right: 18, bottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 14 }}>
          {Array.from({ length: 4 }).map((_, i) =>
            i === progressIndex ? (
              <div key={i} style={{ width: 20, height: 8, borderRadius: 999, background: C.terracotta }} />
            ) : (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.border }} />
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (slide === totalSlides - 1) finish();
            else setSlide((s) => Math.min(totalSlides - 1, s + 1));
          }}
          style={{ width: "100%", background: C.terracotta, color: "#fff", border: "none", borderRadius: 14, padding: "14px 16px", fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
