import { isAdmin } from "./ui/admin";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { AuthPage } from "./ui/AuthPage";
import { HomePlaceholder } from "./ui/HomePlaceholder";
import { LIFE_CHANGED, hasLife } from "./play/gameSession";

// The lab is a developer tool, so it only downloads when someone opens #/lab.
const LabPage = lazy(() => import("./lab/LabPage"));
const PlayPage = lazy(() => import("./play/PlayPage"));
const ShowroomPage = lazy(() => import("./play/ShowroomPage"));
const PhoneTestPage = lazy(() => import("./phone/PhoneTestPage"));
const MapPage = lazy(() => import("./map/MapPage"));
const CreatorPage = lazy(() => import("./creator/CreatorPage"));
const SettingsPanel = lazy(() => import("./settings/SettingsPanel"));

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/** Re-renders when a new life is started (the hash may not change: #/play stays #/play). */
function useLifeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(LIFE_CHANGED, bump);
    return () => window.removeEventListener(LIFE_CHANGED, bump);
  }, []);
  return tick;
}

export function App() {
  const { status } = useAuth();
  const hash = useHashRoute();
  useLifeTick();

  const admin = isAdmin();
  if (admin && hash.startsWith("#/lab")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <LabPage />
      </Suspense>
    );
  }
  if (import.meta.env.DEV && hash.startsWith("#/phonetest")) {
    return (
      <Suspense fallback={null}>
        <PhoneTestPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/settings")) {
    return (
      <Suspense fallback={null}>
        <SettingsPanel />
      </Suspense>
    );
  }
  if (hash.startsWith("#/map")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <MapPage />
      </Suspense>
    );
  }
  if (admin && hash.startsWith("#/showroom")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <ShowroomPage />
      </Suspense>
    );
  }
  // First time (or after "New game"): make a character and roll a background before playing.
  if (hash.startsWith("#/create") || (hash.startsWith("#/play") && !hasLife())) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <CreatorPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/play")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <PlayPage />
      </Suspense>
    );
  }
  if (status === "loading") {
    return <div className="splash" role="status" aria-label="Loading" />;
  }
  return status === "inGame" ? <HomePlaceholder /> : <AuthPage />;
}
