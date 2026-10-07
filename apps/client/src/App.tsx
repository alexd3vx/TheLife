import { isAdmin } from "./ui/admin";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { useSettings } from "./settings/settings";
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
const CharTestPage = lazy(() => import("./iso/CharTestPage"));
const NetTestPage = lazy(() => import("./net/NetTestPage"));
const StatsPage = lazy(() => import("./net/StatsPage"));
const AnimEditorPage = lazy(() => import("./lab/AnimEditorPage"));
const BodyLabPage = lazy(() => import("./lab/BodyLabPage"));
const LiveTestPage = lazy(() => import("./iso/LiveTestPage"));
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
  const { homeView } = useSettings();

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
  if (import.meta.env.DEV && hash.startsWith("#/livetest")) {
    return (
      <Suspense fallback={null}>
        <LiveTestPage />
      </Suspense>
    );
  }
  if (import.meta.env.DEV && hash.startsWith("#/chartest")) {
    return (
      <Suspense fallback={null}>
        <CharTestPage />
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
  if ((import.meta.env.DEV || admin) && hash.startsWith("#/body")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <BodyLabPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/anim")) {
    return (
      <Suspense fallback={null}>
        <AnimEditorPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/stats")) {
    return (
      <Suspense fallback={null}>
        <StatsPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/nettest")) {
    return (
      <Suspense fallback={null}>
        <NetTestPage />
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
  // Home is the 3D house by default; the painted isometric room is an option (Settings, Display, Home view) and always at #/iso.
  if (hash.startsWith("#/play3d") || (hash.startsWith("#/play") && homeView === "3d")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <PlayPage />
      </Suspense>
    );
  }
  if (hash.startsWith("#/play") || hash.startsWith("#/iso")) {
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
