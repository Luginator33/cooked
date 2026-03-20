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
    const durations = [1000, 400, 100, 1000, 400, 100, 1000, 400, 100];
    const timer = setTimeout(() => {
      if (step === 1 || step === 4 || step === 7) {
        setCardIndex((i) => (i + 1) % restaurants.length);
      }
      setStep((s) => (s + 1) % durations.length);
    }, durations[step]);
    return () => clearTimeout(timer);
  }, [step, restaurants.length]);

  const phase = step;
  const cardStyle = {
    transform:
      phase === 1
        ? "translateX(120%) rotate(8deg)"
        : phase === 4
          ? "translateX(-120%) rotate(-8deg)"
          : phase === 7
            ? "translateY(-120%)"
            : "translateX(0) translateY(0) rotate(0deg)",
    transition: phase === 2 || phase === 5 || phase === 8 ? "none" : "transform 0.4s ease",
  };
  const idx = cardIndex % restaurants.length;
  const labelHeat = phase === 1;
  const labelPass = phase === 4;
  const labelBeen = phase === 7;
  const labelOpacity = phase === 1 || phase === 4 || phase === 7 ? 1 : 0;

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

        {labelHeat && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(196,96,58,0.15)",
              border: "1.5px solid #c4603a",
              borderRadius: 20,
              padding: "5px 14px",
              opacity: labelOpacity,
              transition: "opacity 0.2s ease",
            }}
          >
            <FlameIcon size={14} filled color="#c4603a" />
            <span style={{ color: "#c4603a", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>HEAT</span>
          </div>
        )}
        {labelPass && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(90,58,32,0.15)",
              border: "1.5px solid #5a3a20",
              borderRadius: 20,
              padding: "5px 14px",
              opacity: labelOpacity,
              transition: "opacity 0.2s ease",
            }}
          >
            <span style={{ color: "#5a3a20", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            PASS
            </span>
          </div>
        )}
        {labelBeen && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(74,122,171,0.15)",
              border: "1.5px solid #4a7aab",
              borderRadius: 20,
              padding: "5px 14px",
              opacity: labelOpacity,
              transition: "opacity 0.2s ease",
            }}
          >
            <span style={{ color: "#4a7aab", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              BEEN HERE
            </span>
          </div>
        )}

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

export default function Onboarding({ onComplete }) {
  const [slide, setSlide] = useState(0);
  const [phase, setPhase] = useState("in");
  const totalSlides = 4;

  const finish = () => {
    try {
      localStorage.setItem("cooked_onboarding_done", "true");
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

  const buttonText = ["Let's go", "Next", "Next", "Start swiping"][slide];
  const content = useMemo(() => {
    if (slide === 0) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 36px",
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#f0ebe2" }}>cook</span>
            <span style={{ color: "#c4603a" }}>ed</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#5a3a20" }}>
            YOUR TABLE IS WAITING
          </div>
          <span style={{ display: "block", width: 48, height: 2, background: "#c4603a", borderRadius: 2, margin: "22px auto" }} />
          <div style={{ fontSize: 22, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, color: "#f0ebe2", lineHeight: 1.3, marginBottom: 12 }}>
            The restaurant app for people who care.
          </div>
          <div style={{ fontSize: 14, fontFamily: "'DM Sans', -apple-system, sans-serif", color: "#5a3a20", lineHeight: 1.6 }}>
            Not crowd-sourced. Not algorithmic. <span style={{ color: "#c4603a" }}>Curated by taste.</span>
          </div>
        </div>
      );
    }

    if (slide === 1) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <SwipeDemoCard />
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", border: `1.5px solid ${C.border}`, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </div>
              <div style={{ marginTop: 6, color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>Pass</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", border: "1.5px solid #4a7aab", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a7aab" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </div>
              <div style={{ marginTop: 6, color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>Watch</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: C.terracotta, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                <FlameIcon size={18} filled color="#fff" />
              </div>
              <div style={{ marginTop: 6, color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" }}>Heat</div>
            </div>
          </div>
          <div style={{ marginTop: 14, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
            Swipe to build your taste
          </div>
          <div style={{ marginTop: 6, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
            Heat it, watch it, pass, or mark it as been. Your stack gets smarter every swipe.
          </div>
        </div>
      );
    }

    if (slide === 2) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
          <div style={{ position: "relative", width: 280, height: 210, marginTop: 10 }}>
            <div style={{ position: "absolute", left: "50%", top: 86, transform: "translateX(-50%)", width: 250, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", color: C.muted, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>BESTIA · ARTS DISTRICT</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, color: C.text, fontSize: 26, lineHeight: 1 }}>Bestia</div>
            </div>
            {[
              { k: "L", x: 46, y: 36, d: "0ms" },
              { k: "M", x: 138, y: 10, d: "150ms" },
              { k: "D", x: 228, y: 36, d: "300ms" },
            ].map((a) => (
              <div key={a.k}>
                <div style={{ position: "absolute", left: a.x, top: a.y + 44, width: 1, height: 38, background: C.border }} />
                <div
                  style={{
                    position: "absolute",
                    left: a.x - 22,
                    top: a.y - 22,
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    border: `1.5px solid ${C.terracotta}`,
                    background: C.bg2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.terracotta,
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 700,
                    fontSize: 18,
                    animation: `avatarPop 0.5s ease forwards`,
                    animationDelay: a.d,
                    opacity: 0,
                    transform: "scale(0)",
                  }}
                >
                  {a.k}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 4, background: `${C.terracotta}1f`, border: `1px solid ${C.terracotta}`, borderRadius: 999, padding: "4px 10px", color: C.terracotta, fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            3 friends loved this
          </div>
          <div style={{ marginTop: 16, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
            Follow friends. Trust their taste.
          </div>
          <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
            See exactly where people you trust have been - and what they <span style={{ color: C.terracotta }}>actually thought</span>. Yelp reviews are a fever dream.
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", textAlign: "center" }}>
        <GraphCanvas active />
        <div style={{ marginTop: 8, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 28, color: C.text }}>
          The restaurant graph
        </div>
        <div style={{ marginTop: 8, fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
          People, places, cities - all connected. Powers <span style={{ color: C.terracotta }}>friends who've been here</span>, <span style={{ color: C.terracotta }}>trending near you</span>, and six degrees of any restaurant on earth.
        </div>
      </div>
    );
  }, [slide]);

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: C.bg, color: C.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`}</style>
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
              onClick={() => goTo(totalSlides - 1)}
              style={{ background: "none", border: "none", outline: "none", boxShadow: "none", color: C.dim, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}
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
            {Array.from({ length: 4 }).map((_, i) =>
              i === slide ? (
                <div key={i} style={{ width: 20, height: 8, borderRadius: 999, background: C.terracotta }} />
              ) : (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.border, fontFamily: "'DM Mono', monospace" }} />
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (slide === totalSlides - 1) finish();
              else goTo(slide + 1);
            }}
            style={{
              width: "100%",
              background: C.terracotta,
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "14px 16px",
              fontFamily: "'DM Sans', -apple-system, sans-serif",
              fontWeight: 500,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
