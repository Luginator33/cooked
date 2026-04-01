import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useClerk, useSignUp, useSignIn, useUser } from "@clerk/clerk-react";
import { loadSharedPhotos, saveUserData, followCity, followUser, getAllUsers, supabase } from "../lib/supabase";
import { syncFollow } from "../lib/neo4j";
import { AvatarIcon, STOCK_AVATARS } from "../components/AvatarIcon";

// Auto-follow the app owner on signup — UPDATE THIS with your Clerk user ID from the Clerk dashboard
const OWNER_CLERK_ID = "user_3B9bXI2JCTGmvdVl6lRtjQ276W3";

const FLAME_PATH =
  "M91.583336,1 C94.858902,4.038088 94.189636,6.998662 92.316727,10.376994 C86.895416,20.155888 85.394997,30.387159 91.844238,40.137669 C94.758018,44.542976 99.042587,48.235645 103.260361,51.543896 C111.956841,58.365055 117.641266,67.217140 120.816948,77.480293 C122.970314,84.439537 123.615982,91.865288 124.990936,99.383125 C125.884773,97.697456 127.039993,95.775894 127.944977,93.742935 C128.933945,91.521332 129.326263,88.947304 130.661072,86.992996 C131.803146,85.320847 133.925720,83.260689 135.585968,83.285553 C137.393021,83.312607 140.050140,85.157921 140.808014,86.882332 C144.849472,96.078102 149.743393,104.919754 151.119156,115.202736 C152.871628,128.301437 152.701294,141.175125 147.925400,153.556519 C139.636047,175.046417 124.719681,190.729568 102.956436,198.024307 C93.917976,201.053894 83.325455,199.328156 73.460648,200.051529 C66.457748,200.565033 60.038956,198.566650 54.104954,195.470612 C35.696693,185.866180 23.564285,170.592270 20.351917,150.306000 C17.271206,130.851151 16.262779,110.901123 26.722290,92.532166 C29.376348,87.871117 31.035656,82.643089 33.696789,77.986916 C34.711685,76.211151 37.195370,74.463982 39.125217,74.326584 C40.279823,74.244370 42.065300,77.132980 42.850647,78.989388 C44.449970,82.769890 45.564117,86.755646 47.322094,90.502388 C43.896488,53.348236 54.672562,22.806646 86.900139,1.333229 Z";

let _oFlameId = 0;
function FlameIcon({ size = 14, filled = true, color = "#ff9632" }) {
  const id = useMemo(() => `ofg${_oFlameId++}`, []);
  if (!filled) {
    return (
      <svg width={size} height={size * 1.2} viewBox="0 0 167 200" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round">
        <path d={FLAME_PATH} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 167 200" style={{ filter: "drop-shadow(0 2px 6px rgba(255,120,40,0.35)) drop-shadow(0 0 10px rgba(255,150,50,0.15))" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffcc44" />
          <stop offset="30%" stopColor="#ffaa30" />
          <stop offset="60%" stopColor="#f07830" />
          <stop offset="100%" stopColor="#c44828" />
        </linearGradient>
      </defs>
      <path d={FLAME_PATH} fill={`url(#${id})`} />
    </svg>
  );
}

// ─── Data ───

const HERO_PHOTOS = [
  "onboarding-photos/thumbs/1saddles-june19issue-june19-jacs.jpg",
  "onboarding-photos/thumbs/Liza-Beyrouth-restaurant-beirut-lebanon-conde-nast-traveller-05jan18-Marco-Pinarelli_1.jpg",
  "onboarding-photos/thumbs/2024-10-24.jpg",
  "onboarding-photos/thumbs/25178655.jpg",
  "onboarding-photos/thumbs/2flavour.jpg",
  "onboarding-photos/thumbs/2017_06_13_n_naka_047.jpg",
  "onboarding-photos/thumbs/51951496.jpg",
  "onboarding-photos/thumbs/El-Portalon-restaurant-dalt-vila-Ibiza-spain-conde-nast-traveller-05jan18-pr.jpg",
  "onboarding-photos/thumbs/ULU-CLIFF-HOUSE-uluwatu-bali-conde-nast-traveller-05jan18-thomas-antcliff.jpg",
  "onboarding-photos/thumbs/Au Cheval Interior_Hi Res.jpg",
  "onboarding-photos/thumbs/Chefs-prepare-each-round-of-bites-while-you-watch.-Photo-courtesy-of-Sushi-by-Scratch-Restaurants.jpg",
  "onboarding-photos/thumbs/divebar-hero-dark.jpg",
  "onboarding-photos/thumbs/el-moro-restaurant-colonia-cuauhtemoc-mexico-city-mexico-conde-nast-traveller-05jan18-moritz-bernoully.jpg",
  "onboarding-photos/thumbs/Oct-2021-Page-125.jpg",
  "onboarding-photos/thumbs/Leos-Oyster-bar-san-francisco-conde-nast-traveller-05jan18-pr.jpg",
  "onboarding-photos/thumbs/2klein.jpg",
  "onboarding-photos/thumbs/Rosetta-MexicoCity-Mexico-03.jpg",
  "onboarding-photos/thumbs/TAL-cocina-del-mar-RSTRNTVIEWS0723-f1e693ec25b44bdd96674d33320e0647.jpg",
  "onboarding-photos/thumbs/TAL-vertigo-RSTRNTVIEWS0723-3617e737079640a59f1e4e2cd7f268ee.jpg",
  "onboarding-photos/thumbs/2table-to-book-may-2021-issue-chris-schalkx.jpg",
  "onboarding-photos/thumbs/10 © Oliver Pilcher_Lighting by Adam Klimaszewski.jpg",
  "onboarding-photos/thumbs/soho-farmhouse-wonderflaw-places-3-1024x684.jpg",
  "onboarding-photos/thumbs/taqueria-cover.jpg",
];

const HOME_CITIES = [
  { name: "Los Angeles", img: "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=200&q=70" },
  { name: "New York", img: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=200&q=70" },
  { name: "London", img: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=200&q=70" },
  { name: "Paris", img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200&q=70" },
  { name: "Tokyo", img: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=200&q=70" },
  { name: "Miami", img: "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=200&q=70" },
  { name: "Chicago", img: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=200&q=70" },
  { name: "San Francisco", img: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=200&q=70" },
  { name: "Barcelona", img: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=200&q=70" },
  { name: "Mexico City", img: "https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=200&q=70" },
  { name: "Nashville", img: "https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?w=200&q=70" },
  { name: "Austin", img: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=200&q=70" },
];

const TRAVEL_CITIES = [
  { name: "Los Angeles", img: "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=200&q=70" },
  { name: "New York", img: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=200&q=70" },
  { name: "London", img: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=200&q=70" },
  { name: "Paris", img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200&q=70" },
  { name: "Tokyo", img: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=200&q=70" },
  { name: "Miami", img: "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=200&q=70" },
  { name: "Barcelona", img: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=200&q=70" },
  { name: "Mexico City", img: "https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=200&q=70" },
  { name: "Rome", img: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=200&q=70" },
  { name: "Copenhagen", img: "https://images.unsplash.com/photo-1538332576228-eb5b4c4de6f5?w=200&q=70" },
  { name: "Austin", img: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=200&q=70" },
  { name: "Seoul", img: "https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=200&q=70" },
  { name: "Chicago", img: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=200&q=70" },
  { name: "San Francisco", img: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=200&q=70" },
  { name: "Taormina", img: "https://images.unsplash.com/photo-1523365280197-f1783db9fe62?w=200&q=70" },
  { name: "Lisbon", img: "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=200&q=70" },
];

const CUISINES = [
  "Italian", "Japanese", "Mexican", "Chinese",
  "Steakhouse", "Seafood", "Pizza", "French",
  "Indian", "Korean", "Mediterranean", "American",
  "Thai", "Peruvian", "Fine Dining", "Brunch",
];

const VIBES = [
  "Date Night", "Late Night", "Group Dinner",
  "Chef's Table", "Hidden Gem", "Instagram Worthy",
  "Business Dinner", "Outdoor", "Casual Meal",
];

const BARS = [
  "Cocktail Bar", "Wine Bar", "Rooftop", "Live Music",
  "Karaoke", "Nightclub", "Dive Bar", "Hotel Bar",
];

const SWIPE_RESTAURANTS = [
  { name: "Nobu Malibu", meta: "Japanese · Malibu", rating: 4, img: "https://lh3.googleusercontent.com/places/ANXAkqFb-Sy4KjQqFn41w9FdRk-qRwiVdsQSfio9Z0Sr_KpSJCHF030lxrOklxmAQydwGy0IOjiULp5y2zmD0Jwqb6h1UleMeWS2xK8=s4800-w800" },
  { name: "Bestia", meta: "Italian · Arts District", rating: 5, img: "https://lh3.googleusercontent.com/places/ANXAkqGq6FcrvIKJMmHXJxLDnBwWQU_iNRUbBAT5yWuaf-H_h86pHW4SVUUJtVQn9HI0iPxrYshTvxMBmbNvI54Sl5W1RM_7JXI18JA=s4800-w800" },
  { name: "R\u00e9publique", meta: "French · Mid-City", rating: 4, img: "https://lh3.googleusercontent.com/places/ANXAkqG32fnvcCWL3_hHS5Pt4ea_BiMQSovPUdJ2p27xeEz97H0vI4NNBfrQPLLlxRdVgZaUItE3UcRnqsBqOaOkgAjfIfRsAQOJ9o0=s4800-w800" },
  { name: "Sqirl", meta: "California · Silver Lake", rating: 4, img: "https://lh3.googleusercontent.com/places/ANXAkqEYbgJ0fDVWQIfNZr0XHjQ8Te5Se0NOdDSiIM53H_1hGJbpUvStJrHyn_SS1kXU47CyBNKMh69LD9RAf8ndqenu5Q_SV3XLtA8=s4800-w800" },
  { name: "Kismet", meta: "Middle Eastern · Los Feliz", rating: 4, img: "https://lh3.googleusercontent.com/place-photos/AL8-SNEXP-2aYXQk0qbqjdR1aeSsC6I5zWAuCUad2i1kx-poWpcCgJkxOJMZriMC3XnjtTKoR6oybgqsN_v_p_pg5ojS7yvDrzya2pINSDSxN6ED0EWxkudD4DfyN5nRcBckmJCpBJxaU1A21_rVcg=s4800-w800" },
  { name: "Guelaguetza", meta: "Oaxacan · Mid-City", rating: 5, img: "https://lh3.googleusercontent.com/place-photos/AL8-SNFEolRLj9P0lhEbfgemsDrLr5h6SNsR1r3FkVfcMOy7qT835X1uXrIZWBcPg7naQkJoYjgSCgXo3G1LCRw5mpXTgzf_AtCkIOJKrAlUHOmRH-qNI3AEQNZ-tcWyOmOKMTF54HCGg8uX0l-l1-1ZUawj=s4800-w800" },
];

const FRIENDS = [
  { name: "Sarah Miller", initial: "S", bg: "#c4603a", loved: 42, cities: 5, mutual: "Loves Italian & Late Night spots" },
  { name: "James Kim", initial: "J", bg: "#8b5e3c", loved: 67, cities: 8, mutual: "Loves Japanese & Cocktail Bars" },
  { name: "Diana Rossi", initial: "D", bg: "#a05238", loved: 35, cities: 7, mutual: "Loves Mediterranean & Wine Bars" },
  { name: "Marco Torres", initial: "M", bg: "#6b4423", loved: 56, cities: 9, mutual: "Loves Mexican & Hidden Gems" },
];

const CHAT_CHIPS = [
  "Best pasta near me",
  "Late night spots",
  "Date night tonight",
  "Surprise me",
];

const BOT_RESPONSES = {
  "Best pasta near me":
    "Based on your love for Italian, I'd go with <em>Bestia</em> in the Arts District. Their cacio e pepe is legendary, and the vibe is exactly your speed \u2014 moody, buzzy, unforgettable pasta.",
  "Late night spots":
    "You're a late-night person \u2014 I see that. <em>Republique</em> has a killer late-night menu, and if you're feeling adventurous, <em>Guelaguetza</em> serves Oaxacan moles until midnight.",
  "Date night tonight":
    "Ok for date night I'd say <em>Kismet</em> in Los Feliz. Candlelit, Middle Eastern-Californian, gorgeous patio. You'll look like a genius for picking it.",
  "Surprise me":
    "Alright, wildcard: <em>Sqirl</em> in Silver Lake. Yes it's famous for brunch, but the evening pop-ups are where it gets interesting. Trust me on this one.",
};

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

// ─── Progress Dots ───

function ProgressDots({ step, total = 9 }) {
  return (
    <div className="ob-progress">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`ob-progress-dot${i < step ? " done" : ""}${i === step ? " active" : ""}`}
        />
      ))}
    </div>
  );
}

// ─── Slide 0: Card Fan ───

function CardFanSlide({ onNext, onSignIn }) {
  const [photosReady, setPhotosReady] = useState(false);
  const [showPage, setShowPage] = useState(false);
  useEffect(() => {
    let loaded = 0;
    const total = HERO_PHOTOS.length;
    const onAllLoaded = () => {
      // Extra buffer so browser has time to decode images
      setTimeout(() => { setPhotosReady(true); setShowPage(true); }, 400);
    };
    HERO_PHOTOS.forEach(src => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (loaded >= total) onAllLoaded();
      };
      img.src = src;
    });
    // Fallback — show after 4s even if some haven't loaded
    const t = setTimeout(() => { setPhotosReady(true); setShowPage(true); }, 4000);
    return () => clearTimeout(t);
  }, []);

  if (!showPage) {
    return (
      <div className="d-onboarding" style={{ justifyContent: "center", alignItems: "center" }}>
        <style>{`
          @keyframes flame-pulse {
            0%, 100% { filter: drop-shadow(0 0 12px rgba(255,140,50,0.4)) drop-shadow(0 0 30px rgba(255,100,40,0.2)); transform: scale(1); }
            50% { filter: drop-shadow(0 0 20px rgba(255,140,50,0.6)) drop-shadow(0 0 50px rgba(255,100,40,0.35)); transform: scale(1.05); }
          }
        `}</style>
        <svg width={64} height={77} viewBox="0 0 167 200" style={{ animation: "flame-pulse 2s ease-in-out infinite" }}>
          <defs>
            <linearGradient id="splash-flame" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%" stopColor="#ffcc44" />
              <stop offset="30%" stopColor="#ffaa30" />
              <stop offset="60%" stopColor="#f07830" />
              <stop offset="100%" stopColor="#c44828" />
            </linearGradient>
          </defs>
          <path d={FLAME_PATH} fill="url(#splash-flame)" />
        </svg>
      </div>
    );
  }

  return (
    <div className="d-onboarding">
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <div className="glow-orb glow-purple glow-3" />

      <div className="ob-hero-cards">
        {/* First child = glow div */}
        <div className="ob-hero-card" />
        {/* 24 photo cards — all preloaded before render */}
        {HERO_PHOTOS.map((src, i) => (
          <div
            key={i}
            className={`ob-hero-card ${i % 2 === 0 ? "from-left" : "from-right"}`}
          >
            <img src={src} alt="" loading="eager" />
          </div>
        ))}
      </div>

      <div className="logo-big">cooked</div>
      <div style={{ textAlign: "center", position: "relative", zIndex: 2, marginTop: 10 }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "#f5f0eb", marginBottom: 10 }}>Your personal concierge</div>
        <div style={{ fontSize: 14, color: "rgba(240,235,226,0.5)", fontFamily: "'Inter', -apple-system, sans-serif", letterSpacing: "0.02em" }}>
          Not crowd-sourced. Not algorithmic. <span style={{ color: "#ff9632" }}>Curated by taste.</span>
        </div>
      </div>

      <div className="d-dots">
        <div className="d-dot active" />
        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="d-dot" />)}
      </div>

      <button className="d-btn-gradient" onClick={onNext}>Let's Go</button>
      <button className="d-btn-ghost" onClick={onSignIn}>Already a member? <span style={{ color: "#ff9632" }}>Sign in</span></button>
    </div>
  );
}

// ─── Sign In Slide (for returning users) ───

function SignInSlide({ onSuccess }) {
  const { signIn, isLoaded } = useSignIn();
  const clerkObj = useClerk();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Sign out any stale session on mount so sign-in works fresh
  useEffect(() => {
    if (clerkObj.user) {
      clerkObj.signOut().catch(() => {});
    }
  }, []);

  const handleGoogle = async () => {
    if (!isLoaded) return;
    setError("");
    try {
      // Make sure signed out before attempting
      if (clerkObj.user) await clerkObj.signOut();
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: window.location.origin + "/sso-callback",
        redirectUrlComplete: window.location.origin + "?returning=1",
      });
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
      console.error("Google sign-in error:", err);
    }
  };

  const handleEmailSignIn = async () => {
    if (!isLoaded || !form.email.trim() || !form.password) return;
    setError("");
    setLoading(true);
    try {
      // Make sure signed out before attempting
      if (clerkObj.user) await clerkObj.signOut();
      const result = await signIn.create({
        identifier: form.email.trim(),
        password: form.password,
      });
      if (result.status === "complete") {
        await clerkObj.setActive({ session: result.createdSessionId });
        onSuccess();
      } else {
        setError("Sign in incomplete. Please try again.");
      }
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Invalid email or password.";
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <div className="d-onboarding d-ob-slide" style={{ paddingTop: 60 }}>
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <div className="ob-title">Welcome back</div>
      <div className="ob-desc">Sign in to your account</div>

      <div className="ob-signup-form">
        <button type="button" className="ob-signup-google" onClick={handleGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05"/>
            <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.19 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="ob-signup-divider">
          <span>or</span>
        </div>

        <input
          className="ob-signup-input"
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
          autoComplete="email"
        />
        <input
          className="ob-signup-input"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && handleEmailSignIn()}
          autoComplete="current-password"
        />

        {error && <div className="ob-signup-error">{error}</div>}

        <button
          className="d-btn-gradient"
          onClick={handleEmailSignIn}
          disabled={loading || !form.email.trim() || !form.password}
          style={(!form.email.trim() || !form.password || loading) ? { opacity: 0.3, pointerEvents: "none" } : undefined}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ─── Slide 1: Pick Home City ───

function PickHomeCitySlide({ onNext, onSelect }) {
  const [selected, setSelected] = useState(null);

  const handleSelect = (name) => {
    setSelected(name);
    onSelect?.(name);
  };

  return (
    <div className="d-onboarding d-ob-slide">
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={2} />
      <div className="ob-title">Where's home?</div>
      <div className="ob-desc">Pick the city where you spend the most time</div>

      <div className="ob-city-grid three-col">
        {HOME_CITIES.map(city => (
          <div
            key={city.name}
            className={`ob-city-tile${selected === city.name ? " selected" : ""}`}
            onClick={() => handleSelect(city.name)}
          >
            <img src={city.img} alt={city.name} />
            <div className="ob-city-shade" />
            <div className="ob-city-label">{city.name}</div>
          </div>
        ))}
      </div>

      <button
        className="d-btn-gradient"
        onClick={onNext}
        style={!selected ? { opacity: 0.3, pointerEvents: "none" } : undefined}
      >
        Next
      </button>
    </div>
  );
}

// ─── Slide 2: Cuisines & Vibes ───

function CuisinesVibesSlide({ onNext, onSelect }) {
  const [picks, setPicks] = useState(new Set());

  const toggle = (item) => {
    setPicks(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  useEffect(() => {
    onSelect?.([...picks]);
  }, [picks]);

  return (
    <div className="d-onboarding d-ob-slide" style={{ paddingTop: 40 }}>
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={3} />
      <div className="ob-title">What do you love?</div>
      <div className="ob-desc">Pick as many as you want. We'll find you new places before you <em style={{ color: "#ff9632", fontStyle: "normal" }}>search for them.</em></div>

      <div className="ob-picker-section">
        <div className="ob-picker-label">Cuisines</div>
        <div className="ob-picker-grid">
          {CUISINES.map(c => (
            <div
              key={c}
              className={`ob-pick${picks.has(c) ? " selected" : ""}`}
              onClick={() => toggle(c)}
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      <div className="ob-picker-section">
        <div className="ob-picker-label">Vibes & Moods</div>
        <div className="ob-picker-grid">
          {VIBES.map(v => (
            <div
              key={v}
              className={`ob-pick${picks.has(v) ? " selected" : ""}`}
              onClick={() => toggle(v)}
            >
              {v}
            </div>
          ))}
        </div>
      </div>

      <div className="ob-picker-section">
        <div className="ob-picker-label">Bars & Nightlife</div>
        <div className="ob-picker-grid">
          {BARS.map(b => (
            <div
              key={b}
              className={`ob-pick${picks.has(b) ? " selected" : ""}`}
              onClick={() => toggle(b)}
            >
              {b}
            </div>
          ))}
        </div>
      </div>

      <button
        className="d-btn-gradient"
        onClick={onNext}
        style={picks.size === 0 ? { opacity: 0.3, pointerEvents: "none" } : undefined}
      >
        Next
      </button>
    </div>
  );
}

// ─── Slide 3: Follow Cities ───

function FollowCitiesSlide({ onNext, onSelect }) {
  const [selected, setSelected] = useState(new Set());

  const toggle = (name) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  useEffect(() => {
    onSelect?.([...selected]);
  }, [selected]);

  return (
    <div className="d-onboarding d-ob-slide">
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={4} />
      <div className="ob-title">Where do you travel?</div>
      <div className="ob-desc">Plan your next weekend getaway or summer world tour.</div>

      <div className="ob-city-grid">
        {TRAVEL_CITIES.map(city => (
          <div
            key={city.name}
            className={`ob-city-tile${selected.has(city.name) ? " selected" : ""}`}
            onClick={() => toggle(city.name)}
          >
            <img src={city.img} alt={city.name} />
            <div className="ob-city-shade" />
            <div className="ob-city-label">{city.name}</div>
          </div>
        ))}
      </div>

      <button
        className="d-btn-gradient"
        onClick={onNext}
        style={selected.size === 0 ? { opacity: 0.3, pointerEvents: "none" } : undefined}
      >
        Next
      </button>
    </div>
  );
}

// ─── Slide 4: Swipe Game ───

function SwipeGameSlide({ onNext, onSwipeResult }) {
  const [cardIdx, setCardIdx] = useState(0);
  const [swipeCount, setSwipeCount] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showTasteLocked, setShowTasteLocked] = useState(false);
  const [flyDir, setFlyDir] = useState(null); // 'right' | 'left' | 'up' — current card flying out
  const [stampVisible, setStampVisible] = useState(null);
  const dragStart = useRef(null);
  const dragDeltaRef = useRef({ x: 0, y: 0 });
  const swipingRef = useRef(false);
  const lovedRef = useRef([]);
  const nopedRef = useRef([]);

  const doSwipe = useCallback((action) => {
    if (swipingRef.current) return;
    swipingRef.current = true;
    const dir = action === "heat" ? "right" : action === "pass" ? "left" : "up";
    const r = SWIPE_RESTAURANTS[cardIdx % SWIPE_RESTAURANTS.length];
    if (action === "heat") {
      lovedRef.current = [...lovedRef.current, r.name];
    } else if (action === "pass") {
      nopedRef.current = [...nopedRef.current, r.name];
    }
    onSwipeResult?.({ loved: lovedRef.current, noped: nopedRef.current });
    setStampVisible(action);
    setFlyDir(dir);
    setDragDelta({ x: 0, y: 0 });
    setIsDragging(false);
    dragStart.current = null;
    // After fly-out animation, advance to next card
    setTimeout(() => {
      const newCount = swipeCount + 1;
      setCardIdx(i => i + 1);
      setSwipeCount(newCount);
      setFlyDir(null);
      setStampVisible(null);
      swipingRef.current = false;
      if (newCount >= 5) {
        setShowTasteLocked(true);
      }
    }, 400);
  }, [swipeCount, cardIdx, onSwipeResult]);

  // Gesture handlers
  const handlePointerDown = useCallback((e) => {
    if (swipingRef.current || showOverlay) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const y = e.clientY ?? e.touches?.[0]?.clientY;
    dragStart.current = { x, y };
    dragDeltaRef.current = { x: 0, y: 0 };
    setIsDragging(true);
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
  }, [showOverlay]);

  const handlePointerMove = useCallback((e) => {
    if (!dragStart.current) return;
    if (e.cancelable) e.preventDefault();
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    const delta = { x: cx - dragStart.current.x, y: cy - dragStart.current.y };
    dragDeltaRef.current = delta;
    setDragDelta({ ...delta });
    // Show stamps based on drag direction
    if (delta.x > 40) setStampVisible("heat");
    else if (delta.x < -40) setStampVisible("pass");
    else if (delta.y < -40) setStampVisible("watch");
    else setStampVisible(null);
  }, []);

  const endGesture = useCallback(() => {
    if (!dragStart.current) return;
    const { x, y } = dragDeltaRef.current;
    dragStart.current = null;
    if (y < -60 && Math.abs(x) < 80) doSwipe("watch");
    else if (x > 80) doSwipe("heat");
    else if (x < -80) doSwipe("pass");
    else {
      setDragDelta({ x: 0, y: 0 });
      setStampVisible(null);
      setIsDragging(false);
    }
  }, [doSwipe]);

  const r = SWIPE_RESTAURANTS[cardIdx % SWIPE_RESTAURANTS.length];
  const nextR = SWIPE_RESTAURANTS[(cardIdx + 1) % SWIPE_RESTAURANTS.length];

  const rotation = dragDelta.x / 12;
  const topTransform = flyDir === "right"
    ? "translateX(500px) translateY(0px) rotate(18deg)"
    : flyDir === "left"
      ? "translateX(-500px) translateY(0px) rotate(-18deg)"
      : flyDir === "up"
        ? "translateX(0px) translateY(-700px) rotate(0deg)"
        : isDragging
          ? `translateX(${dragDelta.x}px) translateY(${dragDelta.y * 0.3}px) rotate(${rotation}deg)`
          : "translateX(0px) translateY(0px) rotate(0deg)";

  // "Taste Locked In" screen
  if (showTasteLocked) {
    return (
      <div className="d-onboarding d-ob-slide" style={{ paddingTop: 60 }}>
        <div className="glow-orb glow-amber glow-1" />
        <div className="glow-orb glow-rose glow-2" />
        <ProgressDots step={5} />
        <div style={{ textAlign: "center", position: "relative", zIndex: 2, marginTop: 60 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>&#x1f525;</div>
          <div className="ob-title" style={{ marginBottom: 8 }}>Taste Locked In</div>
          <div className="ob-desc" style={{ marginBottom: 8 }}>
            {swipeCount} restaurants swiped
          </div>
          <div style={{ fontSize: 13, color: "rgba(245,240,235,0.3)", fontFamily: "'Inter', sans-serif", marginBottom: 32 }}>
            Your taste profile is building. Keep swiping in the app to make it even smarter.
          </div>
        </div>
        <button className="d-btn-gradient" onClick={onNext}>
          Next
        </button>
      </div>
    );
  }

  const renderCard = (restaurant, rating) => (
    <>
      <img src={restaurant.img} alt={restaurant.name} style={{ pointerEvents: "none", userSelect: "none", WebkitUserDrag: "none" }} />
      <div className="ob-card-shade" />
      <div className="ob-card-info">
        <div className="ob-card-meta">{restaurant.meta}</div>
        <div className="ob-card-name">{restaurant.name}</div>
        <div className="ob-card-flames">
          {[0,1,2,3,4].map(n => (
            <FlameIcon key={n} size={12} filled={n < rating} color={n < rating ? "#ff9632" : "rgba(245,240,235,0.18)"} />
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="d-onboarding d-ob-slide">
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={5} />
      <div className="ob-title">Swipe to build your taste</div>
      <div className="ob-desc" style={{ marginBottom: 12 }}>We serve you places one by one. <em style={{ color: "#ff9632", fontStyle: "normal" }}>Heat it up</em>, pass on it or skip it — your taste profile builds with every swipe.</div>

      <div className="ob-card-stack">
        {/* Next card — static, full size, always behind, ready to be revealed */}
        <div className="ob-swipe-card" style={{ zIndex: 1 }}>
          {renderCard(nextR, nextR.rating)}
        </div>

        {/* Current/top card — draggable, flies out on swipe */}
        <div
          className="ob-swipe-card"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          style={{
            zIndex: 2,
            transform: topTransform,
            transition: flyDir ? "transform 0.4s cubic-bezier(0.32, 0, 0.67, 0)" : isDragging ? "none" : "transform 0.3s ease",
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
        >
          {renderCard(r, r.rating)}
          {/* Stamps */}
          <div className="ob-stamp ob-stamp-heat" style={{ opacity: stampVisible === "heat" ? 1 : 0 }}>
            <span>&#x1f525;</span> HEAT
          </div>
          <div className="ob-stamp ob-stamp-pass" style={{ opacity: stampVisible === "pass" ? 1 : 0, transform: "translate(-50%, -50%) rotate(12deg)" }}>
            PASS
          </div>
          <div className="ob-stamp ob-stamp-been" style={{ opacity: stampVisible === "watch" ? 1 : 0, transform: "translate(-50%, -50%) rotate(0deg)" }}>
            SKIP FOR NOW
          </div>
        </div>

        {showOverlay && (
          <div className="ob-swipe-overlay" onClick={() => setShowOverlay(false)} style={{ inset: -1 }}>
            <div className="ob-zone" style={{ gridColumn: "1 / -1" }}>
              <div className="ob-zone-hand">&#x1f446;</div>
              <div className="ob-zone-icon been-z">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4a7aab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" />
                  <path d="M2.5 11.5a10 10 0 0 1 16.5-5.7L21.5 8" />
                  <path d="M21.5 12.5a10 10 0 0 1-16.5 5.7L2.5 16" />
                </svg>
              </div>
              <div className="ob-zone-label been-l">SKIP FOR NOW</div>
              <div className="ob-zone-sub">Save for later</div>
            </div>
            <div className="ob-zone">
              <div className="ob-zone-hand">&#x1f448;</div>
              <div className="ob-zone-icon">&#x2715;</div>
              <div className="ob-zone-label pass-l">PASS</div>
              <div className="ob-zone-sub">Not for you</div>
            </div>
            <div className="ob-zone">
              <div className="ob-zone-hand">&#x1f449;</div>
              <div className="ob-zone-icon heat-z">
                <FlameIcon size={22} filled={true} />
              </div>
              <div className="ob-zone-label heat-l">HEAT</div>
              <div className="ob-zone-sub">You love this</div>
            </div>
            <div className="ob-overlay-dismiss">Tap anywhere to start</div>
          </div>
        )}
      </div>

      <div className="ob-swipe-counter"><span>{swipeCount}</span> / 5</div>

      <div className="ob-actions">
        <div className="ob-action-btn" onClick={() => doSwipe("pass")}>
          <div className="ob-action-circle pass">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(245,240,235,0.35)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </div>
          <div className="ob-action-label">PASS</div>
        </div>
        <div className="ob-action-btn" onClick={() => doSwipe("watch")}>
          <div className="ob-action-circle watch">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a7aab" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div className="ob-action-label">WATCH</div>
        </div>
        <div className="ob-action-btn" onClick={() => doSwipe("heat")}>
          <div className="ob-action-circle heat">&#x1f525;</div>
          <div className="ob-action-label">HEAT</div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 5: Find Friends ───

function FindFriendsSlide({ onNext, onFollowUser }) {
  const { user } = useUser();
  const [following, setFollowing] = useState(new Set());
  const [realUsers, setRealUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Load real users from the app
  useEffect(() => {
    (async () => {
      try {
        const users = await getAllUsers(50);
        // Filter out the current user and the owner (shown separately)
        const filtered = users.filter(u =>
          u.clerk_user_id !== user?.id &&
          u.clerk_user_id !== OWNER_CLERK_ID &&
          u.profile_name && u.profile_name !== "New Member"
        );
        setRealUsers(filtered);
      } catch (e) { console.warn("Failed to load users:", e); }
      setLoadingUsers(false);
    })();
  }, [user?.id]);

  // Use real users if we have 5+, otherwise show fake friends as placeholder
  const showUsers = realUsers.length >= 5 ? realUsers : [];
  const showFakes = realUsers.length < 5;

  const filteredUsers = searchQuery.trim()
    ? showUsers.filter(u =>
        (u.profile_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.profile_username || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : showUsers;

  const toggleFollow = (id) => {
    setFollowing(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Actually follow/unfollow in the backend
    if (user?.id && id) {
      if (following.has(id)) {
        // Already following — unfollow (toggle off)
      } else {
        followUser(user.id, id).catch(() => {});
        syncFollow(user.id, id).catch(() => {});
      }
    }
  };

  return (
    <div className="d-onboarding d-ob-slide" style={{ paddingTop: 40 }}>
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={6} />
      <div className="ob-title">Better with friends</div>
      <div className="ob-desc">Follow people whose taste you trust. Their hidden gems <em style={{ color: "#ff9632", fontStyle: "normal" }}>become yours.</em></div>

      <input
        className="ob-search-input"
        placeholder="Search by name or username..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        style={{ position: "relative", zIndex: 2 }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative", zIndex: 2, marginBottom: 16, maxHeight: 360, overflowY: "auto" }}>
        {/* Luga - always following */}
        <div className="ob-friend-card glass">
          <div className="ob-friend-av" style={{ background: "linear-gradient(135deg, #ff9632, #e07850, #c44060)" }}>L</div>
          <div className="ob-friend-info">
            <div className="ob-friend-name">Luga Podesta</div>
            <div className="ob-friend-meta">139 loved &middot; 14 cities &middot; Founder</div>
          </div>
          <button className="ob-follow-btn following" style={{ pointerEvents: "none", opacity: 0.7 }}>Following</button>
        </div>

        {/* Real users from the app */}
        {!loadingUsers && filteredUsers.map(u => (
          <div key={u.clerk_user_id} className="ob-friend-card glass">
            <div className="ob-friend-av" style={{ background: "#8b5e3c", overflow: "hidden" }}>
              {u.profile_photo ? (() => {
                try { const p = JSON.parse(u.profile_photo); return p.url ? <img src={p.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : (p.icon ? p.icon.charAt(0).toUpperCase() : (u.profile_name||"?").charAt(0)); } catch { return (u.profile_name||"?").charAt(0); }
              })() : (u.profile_name||"?").charAt(0)}
            </div>
            <div className="ob-friend-info">
              <div className="ob-friend-name">{u.profile_name}</div>
              <div className="ob-friend-meta">{u.profile_username ? `@${u.profile_username}` : ""}</div>
            </div>
            <button
              className={`ob-follow-btn${following.has(u.clerk_user_id) ? " following" : ""}`}
              onClick={() => toggleFollow(u.clerk_user_id)}
            >
              {following.has(u.clerk_user_id) ? "Following" : "Follow"}
            </button>
          </div>
        ))}

        {/* Fallback fake friends (only shown when < 5 real users exist) */}
        {showFakes && FRIENDS.map(f => (
          <div key={f.name} className="ob-friend-card glass">
            <div className="ob-friend-av" style={{ background: f.bg }}>{f.initial}</div>
            <div className="ob-friend-info">
              <div className="ob-friend-name">{f.name}</div>
              <div className="ob-friend-meta">{f.loved} loved &middot; {f.cities} cities</div>
              <div className="ob-friend-mutual">{f.mutual}</div>
            </div>
            <button
              className={`ob-follow-btn${following.has(f.name) ? " following" : ""}`}
              onClick={() => toggleFollow(f.name)}
            >
              {following.has(f.name) ? "Following" : "Follow"}
            </button>
          </div>
        ))}
      </div>

      <button className="d-btn-gradient" onClick={onNext}>Next</button>
      <button className="d-btn-ghost" onClick={onNext}>Skip for now</button>
    </div>
  );
}

// ─── Slide 6: Chat Concierge ───

function ChatConciergeSlide({ onNext }) {
  const [messages, setMessages] = useState([
    { type: "bot", text: "Ok so you're clearly into Italian and late-night spots. I can work with that. What are we thinking \u2014 pasta tonight? A new date spot? Or want me to throw you something you'd never find on your own?" },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [hasSent, setHasSent] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(true);
  const messagesRef = useRef(null);

  const sendMessage = useCallback((text) => {
    if (!text.trim()) return;
    setHasSent(true);
    setChipsVisible(false);
    const userMsg = { type: "user", text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputVal("");

    // Simulate bot response
    setTimeout(() => {
      const response = BOT_RESPONSES[text.trim()] ||
        "Great taste! I can see you know your way around a menu. Let me dig into my database and find you something special based on what you love.";
      setMessages(prev => [...prev, { type: "bot", text: response }]);
    }, 800);
  }, []);

  const handleChip = (chip) => {
    sendMessage(chip);
  };

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="d-onboarding d-ob-slide">
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={7} />
      <div className="ob-title">Meet, Taste Buddy</div>
      <div className="ob-chat-intro">
        Ask him anything — a vibe, a craving, a neighborhood. He knows your taste, your friends, and where to find the best martini in town.
      </div>

      <div className="ob-chat">
        <div className="ob-chat-messages" ref={messagesRef}>
          {messages.map((msg, i) =>
            msg.type === "bot" ? (
              <div key={i} className="ob-chat-bot-wrap visible">
                <div className="ob-chat-avatar">&#x1f37d;</div>
                <div className="ob-chat-bot" dangerouslySetInnerHTML={{ __html: msg.text }} />
              </div>
            ) : (
              <div key={i} className="ob-chat-user visible">{msg.text}</div>
            )
          )}
        </div>
      </div>

      {/* Quick suggestion chips */}
      {chipsVisible && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, position: "relative", zIndex: 2, marginBottom: 12, justifyContent: "center" }}>
          {CHAT_CHIPS.map(chip => (
            <div
              key={chip}
              className="ob-pick"
              style={{ cursor: "pointer" }}
              onClick={() => handleChip(chip)}
            >
              {chip}
            </div>
          ))}
        </div>
      )}

      {/* Chat input */}
      <div className="ob-chat-input-row">
        <input
          className="ob-chat-input"
          placeholder="Ask about restaurants..."
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendMessage(inputVal); }}
        />
        <button className="ob-chat-send" onClick={() => sendMessage(inputVal)}>
          <svg style={{ width: 22, height: 22, minWidth: 22 }} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      <button
        className="d-btn-gradient"
        onClick={onNext}
        style={!hasSent ? { opacity: 0.3, pointerEvents: "none" } : undefined}
      >
        Next
      </button>
    </div>
  );
}

// ─── Slide 7: Taste Reveal ───

function TasteRevealSlide({ onNext, cuisinesVibes = [], swipeResults = {} }) {
  // Dynamic score based on actual engagement
  const picks = cuisinesVibes.length || 0;
  const swipes = (swipeResults?.loved?.length || 0) + (swipeResults?.noped?.length || 0);
  const baseScore = 20 + Math.min(picks * 2, 20) + Math.min(swipes * 3, 15);
  // Add a little randomness so not everyone gets the same number
  const score = useMemo(() => baseScore + Math.floor(Math.random() * 8), [baseScore]);

  // Show the user's actual top picks (up to 5)
  const topPills = cuisinesVibes.slice(0, 5);
  const fallbackPills = ["Italian", "Late Night", "Japanese", "Date Night", "Cocktails"];
  const pills = topPills.length >= 3 ? topPills : fallbackPills;

  return (
    <div className="d-onboarding d-ob-slide" style={{ paddingTop: 60 }}>
      <div className="glow-orb glow-amber glow-1" style={{ opacity: 0.3 }} />
      <div className="glow-orb glow-rose glow-2" style={{ opacity: 0.3 }} />
      <ProgressDots step={8} />

      <div className="ob-reveal">
        <div className="logo-big" style={{ fontSize: 48, marginBottom: 20 }}>You're cookin'</div>
        <div className="ob-reveal-score">{score}</div>
        <div className="ob-reveal-label">Your starting cooked score</div>
      </div>

      <div className="ob-taste-pills">
        {pills.map((p, i) => (
          <div key={p} className={`ob-taste-pill ${i < 3 ? "top" : "other"}`}>{p}</div>
        ))}
      </div>

      <div className="ob-desc" style={{ marginTop: 20 }}>
        Your taste profile is just getting started. The more you swipe, the smarter it gets.
      </div>

      <button
        className="d-btn-gradient"
        onClick={onNext}
        style={{
          marginTop: 10,
          background: "linear-gradient(135deg, rgba(255,150,50,0.2), rgba(224,120,80,0.15), rgba(196,64,96,0.12))",
          border: "1px solid rgba(255,150,50,0.2)",
          color: "rgba(255,200,130,0.9)",
          fontSize: 16,
        }}
      >
        Let's explore
      </button>
    </div>
  );
}

// ─── Slide 1: Sign Up ───

function SignUpSlide({ onNext, onSignIn }) {
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const clerk = useClerk();
  const { user } = useUser();
  const [form, setForm] = useState({ firstName: "", lastName: "", username: "", email: "", password: "", dobMonth: "", dobDay: "", dobYear: "", gender: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [googleUser, setGoogleUser] = useState(false);
  const [googleCompleteProfile, setGoogleCompleteProfile] = useState(false);

  const update = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const canSubmit = googleUser
    ? form.username.trim() && form.dobMonth && form.dobDay && form.dobYear && form.gender
    : form.firstName.trim() && form.lastName.trim() && form.username.trim() &&
      form.email.trim() && form.password.length >= 8 && form.dobMonth && form.dobDay && form.dobYear && form.gender;

  const handleSignUp = async () => {
    if (!signUpLoaded || !canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // Check username uniqueness
      const { data: existing } = await supabase.from("user_data").select("clerk_user_id").eq("profile_username", form.username.trim()).limit(1);
      if (existing?.length > 0) {
        setError("That username is already taken. Please choose another.");
        setLoading(false);
        return;
      }
      await signUp.create({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        emailAddress: form.email.trim(),
        password: form.password,
        unsafeMetadata: {
          username: form.username.trim(),
          dateOfBirth: `${form.dobYear}-${form.dobMonth.padStart(2, "0")}-${form.dobDay.padStart(2, "0")}`,
          gender: form.gender,
        },
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      // Save username to localStorage as backup (unsafeMetadata may not be loaded when finishAndSave runs)
      try { localStorage.setItem("cooked_signup_username", form.username.trim()); } catch {}
      setVerifying(true);
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Something went wrong. Please try again.";
      setError(msg);
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!code.trim()) return;
    setError("");
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete") {
        await clerk.setActive({ session: result.createdSessionId });
        onNext();
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Invalid code. Please try again.";
      setError(msg);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    if (!signUpLoaded) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: window.location.origin + "/sso-callback",
        redirectUrlComplete: window.location.origin + "?google_signup=1",
      });
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
    }
  };

  // Check if user came back from Google OAuth OR is already signed in
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_signup") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setGoogleUser(true);
    setGoogleCompleteProfile(true);
    setForm(prev => ({
      ...prev,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.primaryEmailAddress?.emailAddress || "",
      username: user.username || "",
    }));
  }, [user]);

  const handleGoogleComplete = async () => {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // Check username uniqueness
      const { data: existing } = await supabase.from("user_data").select("clerk_user_id").eq("profile_username", form.username.trim()).limit(1);
      if (existing?.length > 0) {
        setError("That username is already taken. Please choose another.");
        setLoading(false);
        return;
      }
      await user.update({
        unsafeMetadata: {
          username: form.username.trim(),
          dateOfBirth: `${form.dobYear}-${form.dobMonth.padStart(2, "0")}-${form.dobDay.padStart(2, "0")}`,
          gender: form.gender,
        },
      });
      // Save username to localStorage as backup
      try { localStorage.setItem("cooked_signup_username", form.username.trim()); } catch {}
      onNext();
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || "Something went wrong. Please try again.";
      setError(msg);
    }
    setLoading(false);
  };

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => String(currentYear - 13 - i));

  // Google "Complete your profile" screen
  if (googleCompleteProfile) {
    return (
      <div className="d-onboarding d-ob-slide" style={{ paddingTop: 40 }}>
        <div className="glow-orb glow-amber glow-1" />
        <div className="glow-orb glow-rose glow-2" />
        <ProgressDots step={1} />
        <div className="ob-title">Complete your profile</div>
        <div className="ob-desc">Just a few more details</div>

        <div className="ob-signup-form">
          <input
            className="ob-signup-input"
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={e => update("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            autoComplete="username"
          />

          {/* Date of birth */}
          <div className="ob-signup-dob-label">Date of birth</div>
          <div className="ob-signup-row ob-signup-dob">
            <select className="ob-signup-select" value={form.dobMonth} onChange={e => update("dobMonth", e.target.value)}>
              <option value="">Month</option>
              {months.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
            <select className="ob-signup-select" value={form.dobDay} onChange={e => update("dobDay", e.target.value)}>
              <option value="">Day</option>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="ob-signup-select" value={form.dobYear} onChange={e => update("dobYear", e.target.value)}>
              <option value="">Year</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Gender */}
          <div className="ob-signup-dob-label">Gender</div>
          <div className="ob-picker-grid" style={{ marginBottom: 8 }}>
            {GENDER_OPTIONS.map(g => (
              <div
                key={g}
                className={`ob-pick${form.gender === g ? " selected" : ""}`}
                onClick={() => update("gender", g)}
              >
                {g}
              </div>
            ))}
          </div>

          {error && <div className="ob-signup-error">{error}</div>}

          <button
            className="d-btn-gradient"
            onClick={handleGoogleComplete}
            disabled={loading || !canSubmit}
            style={(!canSubmit || loading) ? { opacity: 0.3, pointerEvents: "none" } : undefined}
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  // Verification screen
  if (verifying) {
    return (
      <div className="d-onboarding d-ob-slide" style={{ paddingTop: 60 }}>
        <div className="glow-orb glow-amber glow-1" />
        <div className="glow-orb glow-rose glow-2" />
        <ProgressDots step={1} />
        <div className="ob-title">Check your email</div>
        <div className="ob-desc">We sent a verification code to {form.email}</div>

        <div className="ob-signup-form">
          <input
            className="ob-signup-input"
            type="text"
            placeholder="Enter verification code"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleVerify()}
            autoComplete="one-time-code"
            style={{ textAlign: "center", letterSpacing: "4px", fontSize: 18 }}
          />

          {error && <div className="ob-signup-error">{error}</div>}

          <button
            className="d-btn-gradient"
            onClick={handleVerify}
            disabled={loading || !code.trim()}
            style={(!code.trim() || loading) ? { opacity: 0.3, pointerEvents: "none" } : undefined}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-onboarding d-ob-slide" style={{ paddingTop: 40 }}>
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={1} />
      <div className="ob-title">Create your account</div>
      <div className="ob-desc">Join the community</div>

      <div className="ob-signup-form">
        {/* Google sign-in */}
        <button type="button" className="ob-signup-google" onClick={handleGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05"/>
            <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.19 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="ob-signup-divider">
          <span>or</span>
        </div>

        {/* Name row */}
        <div className="ob-signup-row">
          <input
            className="ob-signup-input"
            type="text"
            placeholder="First name"
            value={form.firstName}
            onChange={e => update("firstName", e.target.value)}
            autoComplete="given-name"
          />
          <input
            className="ob-signup-input"
            type="text"
            placeholder="Last name"
            value={form.lastName}
            onChange={e => update("lastName", e.target.value)}
            autoComplete="family-name"
          />
        </div>

        <input
          className="ob-signup-input"
          type="text"
          placeholder="Username"
          value={form.username}
          onChange={e => update("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          autoComplete="username"
        />

        <input
          className="ob-signup-input"
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={e => update("email", e.target.value)}
          autoComplete="email"
        />

        <input
          className="ob-signup-input"
          type="password"
          placeholder="Password (8+ characters)"
          value={form.password}
          onChange={e => update("password", e.target.value)}
          autoComplete="new-password"
        />

        {/* Date of birth */}
        <div className="ob-signup-dob-label">Date of birth</div>
        <div className="ob-signup-row ob-signup-dob">
          <select className="ob-signup-select" value={form.dobMonth} onChange={e => update("dobMonth", e.target.value)}>
            <option value="">Month</option>
            {months.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </select>
          <select className="ob-signup-select" value={form.dobDay} onChange={e => update("dobDay", e.target.value)}>
            <option value="">Day</option>
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="ob-signup-select" value={form.dobYear} onChange={e => update("dobYear", e.target.value)}>
            <option value="">Year</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Gender */}
        <div className="ob-signup-dob-label">Gender</div>
        <div className="ob-picker-grid" style={{ marginBottom: 8 }}>
          {GENDER_OPTIONS.map(g => (
            <div
              key={g}
              className={`ob-pick${form.gender === g ? " selected" : ""}`}
              onClick={() => update("gender", g)}
            >
              {g}
            </div>
          ))}
        </div>

        {error && <div className="ob-signup-error">{error}</div>}

        <button
          className="d-btn-gradient"
          onClick={handleSignUp}
          disabled={loading || !canSubmit}
          style={(!canSubmit || loading) ? { opacity: 0.3, pointerEvents: "none" } : undefined}
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>

        <div className="ob-signup-signin" onClick={onSignIn}>
          Already have an account? <span>Sign in</span>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 9: Profile Photo (final slide — saves ALL onboarding data) ───

function ProfilePhotoSlide({ onFinish, homeCity, cuisinesVibes, followCities, swipeResults }) {
  const { user } = useUser();
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleAvatarSelect = (avatar) => {
    setSelectedAvatar(avatar.id);
    setUploadedPhoto(null);
    try {
      localStorage.setItem("cooked_profile_photo", JSON.stringify({ type: "stock", id: avatar.id, icon: avatar.icon }));
    } catch {}
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setUploadedPhoto(dataUrl);
      setSelectedAvatar(null);
      try {
        localStorage.setItem("cooked_profile_photo", JSON.stringify({ type: "upload", url: dataUrl }));
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  const hasSelection = selectedAvatar || uploadedPhoto;

  const handleFinish = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    try {
      // Build profile data from Clerk user + form metadata
      const meta = user.unsafeMetadata || {};
      const dob = meta.dateOfBirth || "";
      const profileName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "New Member";
      const username = meta.username || user.username || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "";
      const email = user.primaryEmailAddress?.emailAddress || "";

      // Get the profile photo from localStorage (set during photo slide or earlier)
      let photoData;
      try {
        const saved = localStorage.getItem("cooked_profile_photo");
        photoData = saved || null;
      } catch {}

      // Save ALL onboarding data to Supabase in one call
      await saveUserData(user.id, {
        profile_name: profileName,
        profile_username: username,
        email: email,
        date_of_birth: dob || null,
        gender: meta.gender || null,
        home_city: homeCity || null,
        cuisines_vibes: cuisinesVibes || [],
        loved: swipeResults?.loved || [],
        noped: swipeResults?.noped || [],
        profile_photo: photoData || null,
      });

      // Follow selected cities
      if (followCities?.length > 0) {
        for (const city of followCities) {
          await followCity(user.id, city);
        }
      }

      // Auto-follow the app owner
      if (user.id !== OWNER_CLERK_ID) {
        try {
          await followUser(user.id, OWNER_CLERK_ID);
          syncFollow(user.id, OWNER_CLERK_ID);
        } catch (e) { console.warn("Auto-follow owner failed:", e); }
      }
    } catch (err) {
      console.error("Failed to save onboarding data:", err);
    }
    setSaving(false);
    onFinish();
  };

  return (
    <div className="d-onboarding d-ob-slide" style={{ paddingTop: 40 }}>
      <div className="glow-orb glow-amber glow-1" />
      <div className="glow-orb glow-rose glow-2" />
      <ProgressDots step={9} />
      <div className="ob-title">Add a profile photo</div>
      <div className="ob-desc">Pick one or upload your own</div>

      {/* Preview */}
      {uploadedPhoto && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, position: "relative", zIndex: 2 }}>
          <div className="ob-avatar-preview" style={{ backgroundImage: `url(${uploadedPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        </div>
      )}

      {/* Stock avatars grid */}
      <div className="ob-avatar-grid">
        {STOCK_AVATARS.map(av => (
          <div
            key={av.id}
            className={`ob-avatar-option${selectedAvatar === av.id ? " selected" : ""}`}
            onClick={() => handleAvatarSelect(av)}
          >
            <AvatarIcon type={av.icon} size={36} />
          </div>
        ))}
      </div>

      {/* Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      <button
        className="ob-avatar-upload"
        onClick={() => fileInputRef.current?.click()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Upload photo
      </button>

      <button
        className="d-btn-gradient"
        onClick={handleFinish}
        disabled={!hasSelection || saving}
        style={(!hasSelection || saving) ? { opacity: 0.3, pointerEvents: "none" } : { marginTop: 16 }}
      >
        {saving ? "Setting up..." : "Let's explore"}
      </button>
    </div>
  );
}

// ─── Main Onboarding Component ───

export default function Onboarding({ onComplete, isGoogleSignup = false }) {
  const [slide, setSlide] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const clerk = useClerk();
  const { user } = useUser();

  // Lifted onboarding state
  const [homeCity, setHomeCity] = useState(null);
  const [cuisinesVibes, setCuisinesVibes] = useState([]);
  const [followCitiesState, setFollowCitiesState] = useState([]);
  const [swipeResults, setSwipeResults] = useState({ loved: [], noped: [] });

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
    const t = setTimeout(() => setFontsReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const finishAndSave = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    try {
      // Build profile data from Clerk user
      const meta = user.unsafeMetadata || {};
      const dob = meta.dateOfBirth || "";
      const profileName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "New Member";
      // Read username from multiple sources: unsafeMetadata > Clerk username > localStorage fallback > email prefix
      const username = meta.username || user.username || localStorage.getItem("cooked_signup_username") || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "";
      const email = user.primaryEmailAddress?.emailAddress || "";
      // Save to localStorage so Profile picks it up immediately
      try {
        localStorage.setItem("cooked_profile_name", profileName);
        localStorage.setItem("cooked_profile_username", username);
      } catch {}

      // Assign a random avatar (or use one already selected during onboarding)
      let profilePhoto;
      try {
        const saved = localStorage.getItem("cooked_profile_photo");
        profilePhoto = saved ? JSON.parse(saved) : null;
      } catch {}
      if (!profilePhoto) {
        const randomAvatar = STOCK_AVATARS[Math.floor(Math.random() * STOCK_AVATARS.length)];
        profilePhoto = { type: "stock", id: randomAvatar.id, icon: randomAvatar.icon };
        try { localStorage.setItem("cooked_profile_photo", JSON.stringify(profilePhoto)); } catch {}
      }

      // Save ALL onboarding data to Supabase (including profile photo!)
      await saveUserData(user.id, {
        profile_name: profileName,
        profile_username: username,
        email: email,
        date_of_birth: dob || null,
        gender: meta.gender || null,
        home_city: homeCity || null,
        cuisines_vibes: cuisinesVibes || [],
        loved: swipeResults?.loved || [],
        noped: swipeResults?.noped || [],
        profile_photo: JSON.stringify(profilePhoto),
      });

      // Follow selected cities
      if (followCitiesState?.length > 0) {
        for (const city of followCitiesState) {
          await followCity(user.id, city);
        }
      }

      // Auto-follow the app owner
      if (user.id !== OWNER_CLERK_ID) {
        try {
          await followUser(user.id, OWNER_CLERK_ID);
          syncFollow(user.id, OWNER_CLERK_ID);
        } catch (e) { console.warn("Auto-follow owner failed:", e); }
      }
    } catch (err) {
      console.error("Failed to save onboarding data:", err);
    }

    try {
      localStorage.setItem("cooked_onboarding_done", "1");
      localStorage.setItem("cooked_onboarding_v3", "1");
    } catch {}
    setSaving(false);
    onComplete?.();
  };

  const goNext = () => setSlide(s => s + 1);

  const handleSignIn = () => {
    setShowSignIn(true);
  };

  const handleSignInSuccess = () => {
    // User signed in successfully — go straight to Discover
    localStorage.setItem("cooked_onboarding_v3", "1");
    localStorage.setItem("cooked_onboarding_done", "1");
    onComplete?.();
  };

  // If user returned from Google OAuth — go to slide 1 (SignUpSlide shows "Complete your profile")
  useEffect(() => {
    if (isGoogleSignup && slide === 0) {
      setSlide(1);
    }
  }, [isGoogleSignup]);

  // Show smooth transition screen while saving
  if (saving) {
    return (
      <div style={{
        background: "#0a0a0f",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.3s ease",
      }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 32 }}>
          <span style={{ color: "#f5f0eb" }}>cook</span>
          <span style={{ color: "#ff9632" }}>ed</span>
        </span>
        <p style={{ marginTop: 16, color: "rgba(245,240,235,0.4)", fontSize: 14 }}>Setting up your experience...</p>
      </div>
    );
  }

  return (
    <div style={{ opacity: fontsReady ? 1 : 0, transition: "opacity 0.3s ease" }}>
      {showSignIn && <SignInSlide onSuccess={handleSignInSuccess} />}
      {!showSignIn && slide === 0 && <CardFanSlide onNext={goNext} onSignIn={handleSignIn} />}
      {!showSignIn && slide === 1 && <SignUpSlide onNext={goNext} onSignIn={handleSignIn} />}
      {slide === 2 && <PickHomeCitySlide onNext={goNext} onSelect={(city) => setHomeCity(city)} />}
      {slide === 3 && <CuisinesVibesSlide onNext={goNext} onSelect={(picks) => setCuisinesVibes(picks)} />}
      {slide === 4 && <FollowCitiesSlide onNext={goNext} onSelect={(cities) => setFollowCitiesState(cities)} />}
      {slide === 5 && <SwipeGameSlide onNext={goNext} onSwipeResult={(results) => setSwipeResults(results)} />}
      {slide === 6 && <FindFriendsSlide onNext={goNext} />}
      {slide === 7 && <ChatConciergeSlide onNext={goNext} />}
      {slide === 8 && (
        <TasteRevealSlide onNext={() => { finishAndSave(); }} cuisinesVibes={cuisinesVibes} swipeResults={swipeResults} />
      )}
    </div>
  );
}
