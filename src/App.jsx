import React, { useState } from "react";
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
            background: "#0f0c09",
            color: "#f0ebe2",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "-apple-system, sans-serif",
            padding: 24,
          }}
        >
          <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontWeight: "bold", fontSize: 28 }}>
            <span style={{ color: "#f0ebe2" }}>cook</span>
            <span style={{ color: "#c4603a" }}>ed</span>
          </span>
          <p style={{ marginTop: 16, color: "#5a3a20", fontSize: 14, textAlign: "center" }}>
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
              background: "#c4603a",
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

export default function App() {
  const [screen, setScreen] = useState("onboarding"); // onboarding | discover
  const [tasteProfile, setTasteProfile] = useState(null);

  const handleOnboardingComplete = (profile) => {
    setTasteProfile(profile);
    setScreen("discover");
  };

  return (
    <>
      {screen === "onboarding" && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      {screen === "discover" && (
        <Discover tasteProfile={tasteProfile} />
      )}
    </>
  );
}