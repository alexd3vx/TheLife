import { isAdmin } from "./ui/admin";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { AuthPage } from "./ui/AuthPage";
import { HomePlaceholder } from "./ui/HomePlaceholder";

// The lab is a developer tool, so it only downloads when someone opens #/lab.
const LabPage = lazy(() => import("./lab/LabPage"));
const PlayPage = lazy(() => import("./play/PlayPage"));
const ShowroomPage = lazy(() => import("./play/ShowroomPage"));
const PhoneTestPage = lazy(() => import("./phone/PhoneTestPage"));
const MapPage = lazy(() => import("./map/MapPage"));
const CreatorPage = lazy(() => import("./creator/CreatorPage"));
const ArrivalFilm = lazy(() => import("./arrival/ArrivalFilm"));
const BakePage = lazy(() => import("./iso/bake/BakePage"));
const IsoPage = lazy(() => import("./iso/IsoPage"));
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

export function App() {
  const { status } = useAuth();
  const hash = useHashRoute();

  const admin = isAdmin();
  if (admin && hash.startsWith("#/lab")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <LabPage />
      </Suspense>
    );
  }
  if (import.meta.env.DEV && hash.startsWith("#/iso")) {
    return (
      <Suspense fallback={null}>
        <IsoPage />
      </Suspense>
    );
  }
  if (import.meta.env.DEV && hash.startsWith("#/bake")) {
    return (
      <Suspense fallback={null}>
        <BakePage />
      </Suspense>
    );
  }
  if (import.meta.env.DEV && hash.startsWith("#/filmtest")) {
    const tier = (hash.split("tier=")[1] ?? "middle") as "lapo" | "middle" | "nepo";
    return (
      <Suspense fallback={null}>
        <ArrivalFilm tier={tier} onDone={() => (window.location.hash = "#/")} />
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
  // The game itself needs a signed-in account.
  const gameRoute = !import.meta.env.DEV && (hash.startsWith("#/map") || hash.startsWith("#/play") || hash.startsWith("#/iso") || hash.startsWith("#/create"));
  if (gameRoute && status === "loading") return <div className="splash" role="status" aria-label="Loading" />;
  if (gameRoute && status !== "inGame") return <AuthPage />;
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
  if (hash.startsWith("#/create")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <CreatorPage />
      </Suspense>
    );
  }
  // Home is the painted 2.5D room. (The old 3D house stays reachable for developers at #/play3d.)
  if (hash.startsWith("#/play3d") && admin) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <PlayPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/play")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <IsoPage />
      </Suspense>
    );
  }
  if (status === "loading") {
    return <div className="splash" role="status" aria-label="Loading" />;
  }
  return status === "inGame" ? <HomePlaceholder /> : <AuthPage />;
}
