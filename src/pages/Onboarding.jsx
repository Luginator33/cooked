import { useEffect } from "react";

export default function Onboarding({ onComplete }) {
  useEffect(() => {
    onComplete({ scores: {}, archetype: null, swipeData: null });
  }, []);
  return null;
}
