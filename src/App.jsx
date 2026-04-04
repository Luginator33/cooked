import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthenticateWithRedirectCallback, useUser } from "@clerk/clerk-react";
import { loadUserData } from "./lib/supabase";
import Onboarding from "./pages/Onboarding";
import Discover from "./pages/Discover";

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: "#0a0a0f",
            color: "#f5f0eb",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Inter', -apple-system, sans-serif",
            padding: 24,
          }}
        >
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontWeight: "bold", fontSize: 28 }}>
            <span style={{ color: "#f5f0eb" }}>cook</span>
            <span style={{ color: "#ff9632" }}>ed</span>
          </span>
          <p style={{ marginTop: 16, color: "rgba(245,240,235,0.3)", fontSize: 14, textAlign: "center" }}>
            Something went wrong. Tap below to reset.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("cooked_photos");
              localStorage.removeItem("cooked_photos_preview");
              localStorage.removeItem("cooked_photos_lru");
              window.location.reload();
            }}
            style={{
              marginTop: 20,
              background: "#ff9632",
              color: "#fff",
              border: "none",
              borderRadius: 20,
              padding: "10px 24px",
              fontSize: 14,
            }}
          >
            Clear cache &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Capture ?returning=1 or ?google_signup=1 BEFORE Clerk rewrites the URL
// Store in sessionStorage so it survives the __clerk_handshake redirect
(function captureRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("returning") === "1") {
    sessionStorage.setItem("cooked_returning", "1");
  }
  if (params.get("google_signup") === "1") {
    sessionStorage.setItem("cooked_google_signup", "1");
  }
})();

/** Inner app wrapped by BrowserRouter — can use useNavigate/useLocation */
function AppRoutes() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [tasteProfile, setTasteProfile] = useState(null);
  const [initialTab, setInitialTab] = useState(null);
  const [googleSignup, setGoogleSignup] = useState(false);

  const [screen, setScreen] = useState(() => {
    if (localStorage.getItem("cooked_onboarding_v3") === "1") return "discover";
    return "loading";
  });

  // Once Clerk is loaded, determine where to go
  useEffect(() => {
    if (!isLoaded) return;
    if (screen === "discover") return;

    const isReturning = sessionStorage.getItem("cooked_returning") === "1";
    const isGoogleSignup = sessionStorage.getItem("cooked_google_signup") === "1";
    sessionStorage.removeItem("cooked_returning");
    sessionStorage.removeItem("cooked_google_signup");

    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!user?.id) {
      setScreen("onboarding");
      return;
    }

    if (isReturning) {
      localStorage.setItem("cooked_onboarding_v3", "1");
      localStorage.setItem("cooked_onboarding_done", "1");
      setInitialTab("home");
      setScreen("discover");
      return;
    }

    if (isGoogleSignup) {
      setGoogleSignup(true);
      setScreen("onboarding");
      return;
    }

    (async () => {
      try {
        const profile = await loadUserData(user.id);
        if (profile && profile.profile_name) {
          localStorage.setItem("cooked_onboarding_v3", "1");
          localStorage.setItem("cooked_onboarding_done", "1");
          setInitialTab("home");
          setScreen("discover");
        } else {
          setScreen("onboarding");
        }
      } catch (e) {
        console.warn("Could not check returning user:", e);
        setScreen("onboarding");
      }
    })();
  }, [isLoaded, user?.id]);

  const handleOnboardingComplete = (profile) => {
    setTasteProfile(profile);
    setInitialTab("heat");
    setScreen("discover");
    navigate("/heat", { replace: true });
  };

  if (screen === "loading") {
    return <div style={{ background: "#0a0a0f", height: "100vh" }} />;
  }

  if (screen === "onboarding") {
    return <Onboarding onComplete={handleOnboardingComplete} isGoogleSignup={googleSignup} />;
  }

  // screen === "discover" — render Discover for all routes
  return <Discover tasteProfile={tasteProfile} initialTab={initialTab} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Clerk SSO callback */}
        <Route
          path="/sso-callback"
          element={
            <div style={{ background: "#0a0a0f", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AuthenticateWithRedirectCallback
                signInForceRedirectUrl={window.location.origin + "?returning=1"}
                signUpForceRedirectUrl={window.location.origin + "?google_signup=1"}
              />
            </div>
          }
        />
        {/* All other routes handled by AppRoutes */}
        <Route path="*" element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
