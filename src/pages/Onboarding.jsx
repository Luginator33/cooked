import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { loadSharedPhotos } from "../lib/supabase";

// 21 curated restaurant IDs for the onboarding mosaic
const MOSAIC_IDS = [18014,18016,22001,22014,25001,8,21007,203,24003,18003,37099,7013,23005,7011,30012,29001,17001,4,1,502,37016,901,106,1503,7001];

function shuffleAndPick(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

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

function FlameIcon({ size = 14, filled = true, color = C.terracotta }) {
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

function Wordmark({ size = 22 }) {
  return (
    <span
      style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontStyle: "italic",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <span style={{ color: "#f0ebe2" }}>cook</span>
      <span style={{ color: "#c4603a" }}>ed</span>
    </span>
  );
}

function GraphCanvas({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const center = { id: "Bestia", x: 120, y: 96, r: 20, fill: C.terracotta, stroke: C.terracotta };
    const others = [
      { id: "you", x: 120, y: 28, r: 15 },
      { id: "NYC", x: 44, y: 74, r: 13 },
      { id: "Madison", x: 60, y: 164, r: 14 },
      { id: "London", x: 184, y: 154, r: 14 },
      { id: "Nobu", x: 196, y: 74, r: 13 },
    ];
    let raf = 0;
    const start = performance.now();

    const draw = (now) => {
      const elapsed = (now - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerScale = Math.min(1, elapsed / 0.3);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.scale(centerScale, centerScale);
      ctx.beginPath();
      ctx.arc(0, 0, center.r * (1 + 0.04 * Math.sin(elapsed * 3.2)), 0, Math.PI * 2);
      ctx.fillStyle = center.fill;
      ctx.fill();
      ctx.strokeStyle = center.stroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "400 8px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(center.id, 0, 0.5);
      ctx.restore();

      others.forEach((n, i) => {
        const delay = 0.2 + i * 0.12;
        const p = Math.max(0, Math.min(1, (elapsed - delay) / 0.45));
        if (p <= 0) return;
        const eased = 1 - Math.pow(1 - p, 3);
        const sx = center.x + (n.x - center.x) * eased;
        const sy = center.y + (n.y - center.y) * eased;

        const edgeProg = Math.max(0, Math.min(1, (elapsed - delay + 0.08) / 0.38));
        const ex = center.x + (sx - center.x) * edgeProg;
        const ey = center.y + (sy - center.y) * edgeProg;
        ctx.strokeStyle = C.terracotta;
        ctx.globalAlpha = 0.45 + 0.3 * Math.sin(elapsed * 2.7 + i);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(eased, eased);
        ctx.beginPath();
        ctx.arc(0, 0, n.r, 0, Math.PI * 2);
        ctx.fillStyle = C.bg2;
        ctx.fill();
        ctx.strokeStyle = C.terracotta;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.font = "400 8px 'DM Mono', monospace";
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

function SwipeDemoCard() {
  const [step, setStep] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const restaurants = [
    {
      name: "Nobu Malibu",
      meta: "JAPANESE · MALIBU",
      img: "https://lh3.googleusercontent.com/places/ANXAkqFb-Sy4KjQqFn41w9FdRk-qRwiVdsQSfio9Z0Sr_KpSJCHF030lxrOklxmAQydwGy0IOjiULp5y2zmD0Jwqb6h1UleMeWS2xK8=s4800-w800",
    },
    {
      name: "Bestia",
      meta: "ITALIAN · ARTS DISTRICT",
      img: "https://lh3.googleusercontent.com/places/ANXAkqGq6FcrvIKJMmHXJxLDnBwWQU_iNRUbBAT5yWuaf-H_h86pHW4SVUUJtVQn9HI0iPxrYshTvxMBmbNvI54Sl5W1RM_7JXI18JA=s4800-w800",
    },
    {
      name: "République",
      meta: "FRENCH · MID-CITY",
      img: "https://lh3.googleusercontent.com/places/ANXAkqG32fnvcCWL3_hHS5Pt4ea_BiMQSovPUdJ2p27xeEz97H0vI4NNBfrQPLLlxRdVgZaUItE3UcRnqsBqOaOkgAjfIfRsAQOJ9o0=s4800-w800",
    },
    {
      name: "Sqirl",
      meta: "CALIFORNIA · SILVER LAKE",
      img: "https://lh3.googleusercontent.com/places/ANXAkqEYbgJ0fDVWQIfNZr0XHjQ8Te5Se0NOdDSiIM53H_1hGJbpUvStJrHyn_SS1kXU47CyBNKMh69LD9RAf8ndqenu5Q_SV3XLtA8=s4800-w800",
    },
    {
      name: "Kismet",
      meta: "MIDDLE EASTERN · LOS FELIZ",
      img: "https://lh3.googleusercontent.com/place-photos/AL8-SNEXP-2aYXQk0qbqjdR1aeSsC6I5zWAuCUad2i1kx-poWpcCgJkxOJMZriMC3XnjtTKoR6oybgqsN_v_p_pg5ojS7yvDrzya2pINSDSxN6ED0EWxkudD4DfyN5nRcBckmJCpBJxaU1A21_rVcg=s4800-w800",
    },
    {
      name: "Guelaguetza",
      meta: "OAXACAN · MID-CITY",
      img: "https://lh3.googleusercontent.com/place-photos/AL8-SNFEolRLj9P0lhEbfgemsDrLr5h6SNsR1r3FkVfcMOy7qT835X1uXrIZWBcPg7naQkJoYjgSCgXo3G1LCRw5mpXTgzf_AtCkIOJKrAlUHOmRH-qNI3AEQNZ-tcWyOmOKMTF54HCGg8uX0l-l1-1ZUawj=s4800-w800",
    },
  ];

  useEffect(() => {
    const durations = [2000, 600, 600, 2000, 600, 600, 2000, 600, 600];
    const timer = setTimeout(() => {
      if (step === 1 || step === 4 || step === 7) {
        setCardIndex((i) => (i + 1) % restaurants.length);
      }
      setStep((s) => (s + 1) % durations.length);
    }, durations[step]);
    return () => clearTimeout(timer);
  }, [step, restaurants.length]);

  const animPhase = step;
  const cardStyle = {
    transform:
      animPhase === 1
        ? "translateX(120%) rotate(8deg)"
        : animPhase === 4
          ? "translateX(-120%) rotate(-8deg)"
          : animPhase === 7
            ? "translateY(-120%)"
            : "translateX(0) translateY(0) rotate(0deg)",
    transition: animPhase === 2 || animPhase === 5 || animPhase === 8 ? "none" : "transform 0.6s ease",
  };
  const idx = cardIndex % restaurants.length;
  const labelOpacity = (a, b) => (animPhase === a || animPhase === b ? 1 : 0);

  return (
    <div style={{ position: "relative", height: "55%" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 20,
          background: C.bg2,
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          ...cardStyle,
        }}
      >
        <img
          src={restaurants[idx].img}
          alt={restaurants[idx].name}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.16 }}>
          <circle cx="62" cy="72" r="44" fill="none" stroke={C.border} />
          <circle cx="232" cy="128" r="58" fill="none" stroke={C.border} />
        </svg>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(14,8,4,0.95) 0%, rgba(14,8,4,0.3) 60%, transparent 100%)" }} />
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            borderRadius: 14,
            padding: "4px 8px",
            border: `1px solid ${C.terracotta}`,
            background: `${C.terracotta}1f`,
            color: C.terracotta,
            fontFamily: "'DM Mono', monospace",
            fontSize: 8,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Eater LA
        </div>

        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(196,96,58,0.25)",
            border: "2px solid #c4603a",
            borderRadius: 20,
            padding: "8px 18px",
            opacity: labelOpacity(1, 2),
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        >
          <FlameIcon size={16} filled color="#c4603a" />
          <span style={{ color: "#c4603a", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>HEAT</span>
        </div>
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 2,
            background: "rgba(90,58,32,0.3)",
            border: "2px solid #5a3a20",
            color: "#5a3a20",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 18px",
            borderRadius: 20,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: labelOpacity(4, 5),
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        >
          PASS
        </div>
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2,
            background: "rgba(74,122,171,0.3)",
            border: "2px solid #4a7aab",
            color: "#4a7aab",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 18px",
            borderRadius: 20,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: labelOpacity(7, 8),
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        >
          BEEN HERE
        </div>

        <div style={{ position: "absolute", bottom: 20, left: 18, right: 18 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", color: C.muted, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase" }}>{restaurants[idx].meta}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, color: C.text, fontSize: 28, lineHeight: 1 }}>
            {restaurants[idx].name}
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
            {[0, 1, 2, 3, 4].map((i) => <FlameIcon key={i} size={12} filled={i < 4} color={i < 4 ? C.terracotta : C.dim} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwipeDemo() {
  const restaurants = [
    { name: "Nobu Malibu", meta: "Japanese · Malibu", rating: 4, img: "https://lh3.googleusercontent.com/places/ANXAkqFb-Sy4KjQqFn41w9FdRk-qRwiVdsQSfio9Z0Sr_KpSJCHF030lxrOklxmAQydwGy0IOjiULp5y2zmD0Jwqb6h1UleMeWS2xK8=s4800-w800" },
    { name: "Bestia", meta: "Italian · Arts District", rating: 5, img: "https://lh3.googleusercontent.com/places/ANXAkqGq6FcrvIKJMmHXJxLDnBwWQU_iNRUbBAT5yWuaf-H_h86pHW4SVUUJtVQn9HI0iPxrYshTvxMBmbNvI54Sl5W1RM_7JXI18JA=s4800-w800" },
    { name: "République", meta: "French · Mid-City", rating: 4, img: "https://lh3.googleusercontent.com/places/ANXAkqG32fnvcCWL3_hHS5Pt4ea_BiMQSovPUdJ2p27xeEz97H0vI4NNBfrQPLLlxRdVgZaUItE3UcRnqsBqOaOkgAjfIfRsAQOJ9o0=s4800-w800" },
  ];
  const swipeActions = ["right", "left", "up"];
  const [cardIdx, setCardIdx] = useState(0);
  const [swipeDir, setSwipeDir] = useState(null);

  useEffect(() => {
    if (swipeDir) {
      const timer = setTimeout(() => {
        setSwipeDir(null);
        setCardIdx(i => (i + 1) % restaurants.length);
      }, 550);
      return () => clearTimeout(timer);
    } else {
      const action = swipeActions[cardIdx % swipeActions.length];
      const timer = setTimeout(() => setSwipeDir(action), 1300);
      return () => clearTimeout(timer);
    }
  }, [swipeDir, cardIdx]);

  const r = restaurants[cardIdx % restaurants.length];
  const nextR = restaurants[(cardIdx + 1) % restaurants.length];

  const topTransform = swipeDir === "right"
    ? "translateX(130%) rotate(18deg)"
    : swipeDir === "left"
      ? "translateX(-130%) rotate(-18deg)"
      : swipeDir === "up"
        ? "translateY(-140%)"
        : "translateX(0) rotate(0deg)";

  const renderCard = (rest) => (
    <>
      <img src={rest.img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,6,3,0.95) 0%, rgba(10,6,3,0.4) 40%, transparent 100%)" }} />
      <div style={{ position: "absolute", bottom: 20, left: 20, right: 20, textAlign: "left" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: "rgba(240,235,226,0.5)", textTransform: "uppercase" }}>{rest.meta}</div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text, lineHeight: 1, marginTop: 5 }}>{rest.name}</div>
        <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
          {[0,1,2,3,4].map(n => <FlameIcon key={n} size={12} filled={n < rest.rating} color={n < rest.rating ? C.terracotta : C.dim} />)}
        </div>
      </div>
    </>
  );

  const stampStyle = (visible, rotation) => ({
    position: "absolute", top: "50%", left: "50%",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    zIndex: 5, pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transition: visible ? "opacity 0.1s ease" : "none",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
      {/* Card stack — overflow hidden clips swiped cards */}
      <div style={{ position: "relative", width: "86%", aspectRatio: "3/4", maxHeight: "55%", margin: "0 auto", overflow: "hidden", borderRadius: 20 }}>

        {/* Back card — static underneath */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden",
          zIndex: 1, background: C.bg2,
        }}>
          {renderCard(nextR)}
        </div>

        {/* Top card — swipes away */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden",
          zIndex: 2, background: C.bg2,
          transform: topTransform,
          transition: swipeDir ? "transform 0.5s cubic-bezier(0.32, 0, 0.67, 0)" : "none",
        }}>
          {renderCard(r)}

          {/* HEAT stamp */}
          <div style={stampStyle(swipeDir === "right", -16)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(196,96,58,0.2)", border: "3px solid #c4603a", borderRadius: 14, padding: "12px 28px" }}>
              <FlameIcon size={22} filled color="#c4603a" />
              <span style={{ color: "#c4603a", fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, letterSpacing: "0.12em" }}>HEAT</span>
            </div>
          </div>

          {/* PASS stamp */}
          <div style={stampStyle(swipeDir === "left", 16)}>
            <div style={{ border: "3px solid #5a3a20", background: "rgba(90,58,32,0.2)", borderRadius: 14, padding: "12px 28px" }}>
              <span style={{ color: "#5a3a20", fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, letterSpacing: "0.12em" }}>PASS</span>
            </div>
          </div>

          {/* BEEN HERE stamp */}
          <div style={stampStyle(swipeDir === "up", 0)}>
            <div style={{ border: "3px solid #4a7aab", background: "rgba(74,122,171,0.2)", borderRadius: 14, padding: "12px 24px", whiteSpace: "nowrap" }}>
              <span style={{ color: "#4a7aab", fontFamily: "'DM Mono', monospace", fontSize: 24, fontWeight: 700, letterSpacing: "0.12em" }}>BEEN HERE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 20, marginTop: 14, justifyContent: "center" }}>
        {[
          { label: "PASS", borderColor: C.border, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg> },
          { label: "WATCH", borderColor: "#4a7aab", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a7aab" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> },
          { label: "HEAT", borderColor: C.terracotta, bg: C.terracotta, icon: <FlameIcon size={14} filled color="#fff" /> },
        ].map(a => (
          <div key={a.label} style={{ textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              border: `1.5px solid ${a.borderColor}`,
              background: a.bg || "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto",
            }}>
              {a.icon}
            </div>
            <div style={{ marginTop: 4, color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.1em" }}>{a.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
        Swipe to build your taste
      </div>
      <div style={{ marginTop: 6, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
        We serve you restaurants one by one. <span style={{ color: C.terracotta }}>Heat</span> it, pass it, or mark it as been — your taste profile builds with every swipe.
      </div>
    </div>
  );
}

function DiscoveryDemo() {
  const items = [
    {
      label: "YOU'D LOVE THIS", desc: "Nobu Malibu, Bestia, and 4 more", sub: "Based on 8 taste matches",
      img: "https://lh3.googleusercontent.com/places/ANXAkqFb-Sy4KjQqFn41w9FdRk-qRwiVdsQSfio9Z0Sr_KpSJCHF030lxrOklxmAQydwGy0IOjiULp5y2zmD0Jwqb6h1UleMeWS2xK8=s4800-w800",
    },
    {
      label: "RISING", desc: "Sqirl just got 5 loves this week", sub: "Trending in the last 30 days",
      img: "https://lh3.googleusercontent.com/places/ANXAkqEYbgJ0fDVWQIfNZr0XHjQ8Te5Se0NOdDSiIM53H_1hGJbpUvStJrHyn_SS1kXU47CyBNKMh69LD9RAf8ndqenu5Q_SV3XLtA8=s4800-w800",
    },
    {
      label: "HIDDEN GEM", desc: "Shunji — rated 9.4, only 2 loves", sub: "High rated, under the radar",
      img: "https://lh3.googleusercontent.com/places/ANXAkqG32fnvcCWL3_hHS5Pt4ea_BiMQSovPUdJ2p27xeEz97H0vI4NNBfrQPLLlxRdVgZaUItE3UcRnqsBqOaOkgAjfIfRsAQOJ9o0=s4800-w800",
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 4 }}>
        {items.map((f, i) => (
          <div
            key={f.label}
            style={{
              background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: "12px 14px", textAlign: "left", display: "flex", gap: 12, alignItems: "center",
              animation: "avatarPop 0.5s ease forwards", animationDelay: `${i * 150}ms`,
              opacity: 0, transform: "scale(0)",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, overflow: "hidden", border: `1.5px solid ${C.border}` }}>
              <img src={f.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: C.terracotta, textTransform: "uppercase" }}>{f.label}</div>
              <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 15, color: C.text, marginTop: 2 }}>{f.desc}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
        Discovery, not search
      </div>
      <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
        We learn your taste and surface restaurants you'll love — <span style={{ color: C.terracotta }}>before you search for them</span>.
      </div>
    </div>
  );
}

function SocialDemo() {
  const overlapPhotos = [
    "https://lh3.googleusercontent.com/places/ANXAkqFb-Sy4KjQqFn41w9FdRk-qRwiVdsQSfio9Z0Sr_KpSJCHF030lxrOklxmAQydwGy0IOjiULp5y2zmD0Jwqb6h1UleMeWS2xK8=s4800-w800",
    "https://lh3.googleusercontent.com/places/ANXAkqGq6FcrvIKJMmHXJxLDnBwWQU_iNRUbBAT5yWuaf-H_h86pHW4SVUUJtVQn9HI0iPxrYshTvxMBmbNvI54Sl5W1RM_7JXI18JA=s4800-w800",
    "https://lh3.googleusercontent.com/places/ANXAkqEYbgJ0fDVWQIfNZr0XHjQ8Te5Se0NOdDSiIM53H_1hGJbpUvStJrHyn_SS1kXU47CyBNKMh69LD9RAf8ndqenu5Q_SV3XLtA8=s4800-w800",
  ];
  const chainNodes = [
    { type: "r", label: "Nobu", img: overlapPhotos[0] },
    { type: "u", label: "S" },
    { type: "r", label: "Lucali", img: "https://lh3.googleusercontent.com/places/ANXAkqG32fnvcCWL3_hHS5Pt4ea_BiMQSovPUdJ2p27xeEz97H0vI4NNBfrQPLLlxRdVgZaUItE3UcRnqsBqOaOkgAjfIfRsAQOJ9o0=s4800-w800" },
    { type: "u", label: "J" },
    { type: "r", label: "Atomix", img: "https://lh3.googleusercontent.com/place-photos/AL8-SNFEolRLj9P0lhEbfgemsDrLr5h6SNsR1r3FkVfcMOy7qT835X1uXrIZWBcPg7naQkJoYjgSCgXo3G1LCRw5mpXTgzf_AtCkIOJKrAlUHOmRH-qNI3AEQNZ-tcWyOmOKMTF54HCGg8uX0l-l1-1ZUawj=s4800-w800" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {/* Overlap */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", textAlign: "left",
          animation: "avatarPop 0.5s ease forwards", opacity: 0, transform: "scale(0)",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: C.terracotta, textTransform: "uppercase", marginBottom: 8 }}>RESTAURANTS IN COMMON</div>
          <div style={{ display: "flex", gap: 8 }}>
            {overlapPhotos.map((src, i) => (
              <div key={i} style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${C.border}`, flexShrink: 0 }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
            <div style={{ width: 56, height: 56, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>+4</div>
          </div>
        </div>

        {/* Friends who loved */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", textAlign: "left",
          display: "flex", alignItems: "center", gap: 12,
          animation: "avatarPop 0.5s ease forwards", animationDelay: "150ms", opacity: 0, transform: "scale(0)",
        }}>
          <div style={{ display: "flex", marginRight: -4 }}>
            {[
              { initial: "L", bg: "#c4603a" },
              { initial: "M", bg: "#8b5e3c" },
              { initial: "D", bg: "#a05238" },
            ].map((u, i) => (
              <div key={u.initial} style={{
                width: 34, height: 34, borderRadius: "50%", border: `2px solid ${C.terracotta}`,
                background: u.bg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: "#fff", fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold",
                marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i,
              }}>
                {u.initial}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 14, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>3 friends loved Bestia</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>See who's been where</div>
          </div>
        </div>

        {/* 6 Degrees */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", textAlign: "left",
          animation: "avatarPop 0.5s ease forwards", animationDelay: "300ms", opacity: 0, transform: "scale(0)",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: C.terracotta, textTransform: "uppercase", marginBottom: 8 }}>THE CHAIN</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {chainNodes.map((node, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: node.type === "r" ? 8 : "50%", flexShrink: 0, overflow: "hidden",
                  background: node.type === "u" ? C.terracotta : C.bg,
                  border: node.type === "r" ? `1.5px solid ${C.border}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: "#fff", fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold",
                }}>
                  {node.img ? <img src={node.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : node.label}
                </div>
                {i < chainNodes.length - 1 && <div style={{ width: 6, height: 1.5, background: C.dim, flexShrink: 0 }} />}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>2 degrees of separation</div>
        </div>
      </div>

      <div style={{ marginTop: 20, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
        Your people, your places
      </div>
      <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
        See where your friends eat, find restaurants in common, and trace the <span style={{ color: C.terracotta }}>chain between any two spots on earth</span>.
      </div>
    </div>
  );
}

function JourneyDemo() {
  const pct = 42;
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {/* Cooked Score */}
        <div style={{
          background: "radial-gradient(ellipse 120% 100% at 50% 30%, #2a1810 0%, #120c08 45%, #0a0806 100%)",
          border: `1px solid ${C.border}`, borderRadius: 18, padding: "20px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          animation: "avatarPop 0.5s ease forwards", opacity: 0, transform: "scale(0)",
        }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: C.muted, textTransform: "uppercase" }}>COOKED SCORE</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 600, fontSize: 52, color: C.terracotta, lineHeight: 1 }}>247</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Based on 34 loves across 8 cities</div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: `radial-gradient(circle at 40% 38%, #ff9a4a 0%, #c4603a 45%, #8b2a12 100%)`,
            boxShadow: "0 0 20px 6px rgba(196,96,58,0.3)",
          }} />
        </div>

        {/* City Readiness */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px",
          animation: "avatarPop 0.5s ease forwards", animationDelay: "150ms", opacity: 0, transform: "scale(0)",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: C.terracotta, textTransform: "uppercase", marginBottom: 10 }}>CITY READINESS</div>
          <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
            {[
              { city: "LA", pct: 42 },
              { city: "NYC", pct: 28 },
              { city: "London", pct: 15 },
            ].map(c => {
              const circ = 2 * Math.PI * 18;
              const off = circ - (c.pct / 100) * circ;
              return (
                <div key={c.city} style={{ textAlign: "center" }}>
                  <svg width="44" height="44" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="18" fill="none" stroke={C.border} strokeWidth="3" />
                    <circle cx="22" cy="22" r="18" fill="none" stroke={C.terracotta} strokeWidth="3"
                      strokeDasharray={circ} strokeDashoffset={off}
                      strokeLinecap="round" transform="rotate(-90 22 22)" />
                    <text x="22" y="24" textAnchor="middle" fill={C.text} fontSize="11" fontFamily="Georgia,serif" fontWeight="bold">{c.pct}%</text>
                  </svg>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{c.city}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Track how explored each city is</div>
        </div>

        {/* Taste Profile teaser */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", textAlign: "left",
          animation: "avatarPop 0.5s ease forwards", animationDelay: "300ms", opacity: 0, transform: "scale(0)",
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.14em", color: C.terracotta, textTransform: "uppercase", marginBottom: 8 }}>YOUR TASTE DNA</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Italian", "Japanese", "Mexican", "Bakery", "French"].map((t, i) => (
              <span key={t} style={{
                padding: "4px 10px", borderRadius: 12, fontSize: 11,
                background: i === 0 ? C.terracotta : "transparent",
                color: i === 0 ? "#fff" : C.muted,
                border: i === 0 ? "none" : `1px solid ${C.border}`,
              }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
        Your eating journey
      </div>
      <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
        Build your Cooked Score, track your cities, and watch your <span style={{ color: C.terracotta }}>taste profile evolve</span> with every restaurant you love.
      </div>
    </div>
  );
}

function ConciergeDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {/* Chat mockup */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px",
          animation: "avatarPop 0.5s ease forwards", opacity: 0, transform: "scale(0)",
        }}>
          {/* User message */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <div style={{ background: C.terracotta, borderRadius: "14px 14px 4px 14px", padding: "8px 12px", maxWidth: "75%", fontSize: 13, color: "#fff", fontFamily: "-apple-system, sans-serif" }}>
              Date night tonight — somewhere moody with great pasta
            </div>
          </div>
          {/* Bot response */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg, ${C.terracotta}, #c9973f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>🍽</div>
            <div style={{ background: C.bg, borderRadius: "14px 14px 14px 4px", padding: "8px 12px", fontSize: 13, color: C.text, fontFamily: "-apple-system, sans-serif", lineHeight: 1.45 }}>
              <em style={{ fontWeight: 600 }}>Rezdôra</em>. Stefano Secchi's tortellini in brodo is the most comforting bowl in Manhattan. Candlelit, intimate, perfect for tonight.
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        {[
          { icon: "✦", text: "Knows your taste — recommends based on what you love" },
          { icon: "👥", text: "Knows your friends — 'Sarah loved this place last week'" },
          { icon: "🔗", text: "Connects dots — same chef, same group, same energy" },
        ].map((f, i) => (
          <div key={i} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", textAlign: "left",
            animation: "avatarPop 0.4s ease forwards", animationDelay: `${200 + i * 120}ms`, opacity: 0, transform: "scale(0)",
          }}>
            <span style={{ fontSize: 16 }}>{f.icon}</span>
            <span style={{ fontSize: 12, color: C.text, fontFamily: "-apple-system, sans-serif" }}>{f.text}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
        Your personal concierge
      </div>
      <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
        Ask anything — a vibe, a craving, a neighborhood. It knows <span style={{ color: C.terracotta }}>your taste, your friends, and every restaurant</span>.
      </div>
    </div>
  );
}

function AddFriendsDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {/* Friend cards */}
        {[
          { name: "Sarah M.", initial: "S", bg: "#c4603a", loved: 42, cities: 5, mutual: "Nobu, Bestia" },
          { name: "James K.", initial: "J", bg: "#8b5e3c", loved: 28, cities: 3, mutual: "Lucali, Atomix" },
          { name: "Diana R.", initial: "D", bg: "#a05238", loved: 35, cities: 7, mutual: "Dishoom, Noma" },
        ].map((f, i) => (
          <div key={i} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            animation: "avatarPop 0.5s ease forwards", animationDelay: `${i * 150}ms`, opacity: 0, transform: "scale(0)",
          }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold", flexShrink: 0 }}>
              {f.initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, color: C.text, fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: "bold" }}>{f.name}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                {f.loved} loved · {f.cities} cities
              </div>
              <div style={{ fontSize: 10, color: C.terracotta, marginTop: 1 }}>
                You both love: {f.mutual}
              </div>
            </div>
            <div style={{
              padding: "6px 14px", borderRadius: 20, background: C.terracotta,
              color: "#fff", fontSize: 12, fontFamily: "-apple-system, sans-serif", fontWeight: 500, flexShrink: 0,
            }}>
              Follow
            </div>
          </div>
        ))}

        {/* Benefits */}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: "12px 14px", textAlign: "left",
          animation: "avatarPop 0.5s ease forwards", animationDelay: "450ms", opacity: 0, transform: "scale(0)",
        }}>
          <div style={{ fontSize: 10, color: C.terracotta, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", marginBottom: 6 }}>WHEN YOU FOLLOW FRIENDS</div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, fontFamily: "-apple-system, sans-serif" }}>
            See where they eat. Get notified when they find a new spot. Discover restaurants in common. Trust real taste, not strangers.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
        Better with friends
      </div>
      <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
        Follow the people whose taste you trust. Their discoveries <span style={{ color: C.terracotta }}>become yours</span>.
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete }) {
  const [slide, setSlide] = useState(0);
  const [phase, setPhase] = useState("in");
  const [fontsReady, setFontsReady] = useState(false);
  const [mosaicPhotos, setMosaicPhotos] = useState([]);
  const totalSlides = 7;

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
    const t = setTimeout(() => setFontsReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Load photos from Supabase and pick 6 random ones from our curated list
  useEffect(() => {
    loadSharedPhotos().then(photoMap => {
      const available = MOSAIC_IDS
        .map(id => photoMap[String(id)] || photoMap[id])
        .filter(Boolean);
      if (available.length >= 6) {
        setMosaicPhotos(shuffleAndPick(available, 6));
      } else {
        // Fallback to whatever we have
        setMosaicPhotos(available.length > 0 ? available.slice(0, 6) : []);
      }
    });
  }, []);

  const finish = () => {
    try {
      localStorage.setItem("cooked_onboarding_done", "1");
    } catch {}
    onComplete?.();
  };

  const goTo = (next) => {
    setPhase("out");
    setTimeout(() => {
      setSlide(next);
      setPhase("in");
    }, 180);
  };

  const buttonText = ["Let's go", "Next", "Next", "Next", "Next", "Next", "Start swiping"][slide];
  const content = useMemo(() => {
    if (slide === 0) {
      const photos = mosaicPhotos;
      if (photos.length === 0) {
        // Still loading — show minimal splash
        return (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div style={{ fontSize: 72, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, lineHeight: 1 }}>
              <span style={{ color: "#f0ebe2" }}>cook</span><span style={{ color: "#c4603a" }}>ed</span>
            </div>
          </div>
        );
      }
      return (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
          {/* Photo mosaic background */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 3, height: "55%", padding: 3 }}>
              {photos.map((src, i) => (
                <div key={i} style={{
                  borderRadius: i === 0 ? "16px 4px 4px 4px" : i === 2 ? "4px 16px 4px 4px" : i === 3 ? "4px 4px 4px 16px" : i === 5 ? "4px 4px 16px 4px" : 4,
                  overflow: "hidden",
                  animation: "avatarPop 0.6s ease forwards",
                  animationDelay: `${i * 80}ms`,
                  opacity: 0, transform: "scale(0)",
                }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
            {/* Gradient overlay fading photos into background */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(15,12,9,0) 0%, rgba(15,12,9,0.3) 35%, rgba(15,12,9,0.85) 50%, rgba(15,12,9,1) 60%)" }} />
          </div>

          {/* Content over gradient */}
          <div style={{
            position: "absolute", bottom: 130, left: 0, right: 0,
            display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 36px",
          }}>
            <div style={{
              fontSize: 72, fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic", fontWeight: 700, lineHeight: 1,
            }}>
              <span style={{ color: "#f0ebe2" }}>cook</span>
              <span style={{ color: "#c4603a" }}>ed</span>
            </div>
            <div style={{ width: "80%", height: "1px", background: "linear-gradient(to right, transparent, #3d2a18 50%, transparent)", margin: "14px 0" }} />
            <p style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700,
              fontSize: 22, lineHeight: 1.35, color: "#f0ebe2", margin: 0, maxWidth: 300,
            }}>
              Your personal concierge
            </p>
            <div style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: C.muted, lineHeight: 1.6, marginTop: 10 }}>
              Not crowd-sourced. Not algorithmic. <span style={{ color: C.terracotta }}>Curated by taste.</span>
            </div>
          </div>
        </div>
      );
    }

    if (slide === 1) {
      return <SwipeDemo />;
    }

    if (slide === 2) return <DiscoveryDemo />;
    if (slide === 3) return <SocialDemo />;
    if (slide === 4) return <ConciergeDemo />;
    if (slide === 5) return <AddFriendsDemo />;
    if (slide === 6) return <JourneyDemo />;
    return null;
  }, [slide, mosaicPhotos]);

  return (
    <div style={{ opacity: fontsReady ? 1 : 0, transition: "opacity 0.3s ease" }}>
      <div style={{ width: "100%", minHeight: "100vh", background: C.bg, color: C.text }}>
        <style>{`
        @keyframes avatarPop {
          0% { opacity: 0; transform: scale(0) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
        <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 20, left: 28, right: 28, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
          <Wordmark size={22} />
          {slide < totalSlides - 1 ? (
            <button
              type="button"
              className="dm-mono"
              onClick={() => goTo(totalSlides - 1)}
              style={{ border: "1px solid #2e1f0e", borderRadius: 8, padding: "6px 14px", background: "none", color: "#3d2a18", fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}
            >
              skip
            </button>
          ) : (
            <div style={{ width: 30 }} />
          )}
        </div>

        <div
          key={slide}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            padding: "70px 28px 120px",
            transition: "transform 0.35s ease, opacity 0.35s ease",
            opacity: phase === "in" ? 1 : 0,
            transform: phase === "in" ? "translateX(0px)" : "translateX(-30px)",
          }}
        >
          {content}
        </div>

        <div style={{ position: "absolute", left: 28, right: 28, bottom: 34, zIndex: 6 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
            {Array.from({ length: totalSlides }).map((_, i) =>
              i === slide ? (
                <div key={i} style={{ width: 20, height: 8, borderRadius: 999, background: C.terracotta }} />
              ) : (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.border, fontFamily: "'DM Mono', monospace" }} />
              )
            )}
          </div>
          <button
            type="button"
            className="dm-sans"
            onClick={() => {
              if (slide === totalSlides - 1) finish();
              else goTo(slide + 1);
            }}
            style={{
              width: "100%",
              background: "#c4603a",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "16px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            {buttonText}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
