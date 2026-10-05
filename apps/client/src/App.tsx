import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthProvider";
import { AuthPage } from "./ui/AuthPage";
import { HomePlaceholder } from "./ui/HomePlaceholder";

// The lab is a developer tool, so it only downloads when someone opens #/lab.
const LabPage = lazy(() => import("./lab/LabPage"));
const PlayPage = lazy(() => import("./play/PlayPage"));

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

  if (hash.startsWith("#/lab")) {
    return (
      <Suspense fallback={<div className="splash" role="status" aria-label="Loading" />}>
        <LabPage />
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
