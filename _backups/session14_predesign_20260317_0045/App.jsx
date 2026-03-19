import { useState } from "react";
import Onboarding from "./pages/Onboarding";
import Discover from "./pages/Discover";

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