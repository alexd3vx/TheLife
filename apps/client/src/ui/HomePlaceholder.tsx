import { isAdmin } from "./admin";
import { lazy, Suspense } from "react";
import { useAuth } from "../auth/AuthProvider";

const HeroCanvas = lazy(() => import("../world3d/HeroCanvas"));

const linkStyle = { textAlign: "center", textDecoration: "none", display: "grid", placeItems: "center" } as const;

// Temporary in-game screen. Replaced by the character creator and the world in later milestones.
export function HomePlaceholder() {
  const { user, save, leave } = useAuth();

  return (
    <main className="home">
      <div className="home-scene" aria-hidden="true">
        <Suspense fallback={null}>
          <HeroCanvas />
        </Suspense>
      </div>
      <section className="home-card">
        <h1>You're in.</h1>
        {user ? (
          <p>
            Signed in as <strong>{user.email}</strong>.
          </p>
        ) : (
          <p>
            Your life is saved on this device.
          </p>
        )}
        {save && <p className="muted">Save started {new Date(save.createdAt).toLocaleDateString()}</p>}
        <a className="btn btn-primary" href="#/map" style={linkStyle}>
          Play: Lagos Island
        </a>
        <a className="btn btn-ghost" href="#/settings" style={linkStyle}>
          Settings
        </a>
        {isAdmin() && (
          <>
            <a className="btn btn-ghost" href="#/play" style={linkStyle}>
              House (test)
            </a>
            <a className="btn btn-ghost" href="#/showroom" style={linkStyle}>
              Furniture showroom (test)
            </a>
            <a className="btn btn-ghost" href="#/lab" style={linkStyle}>
              Character and asset lab (test)
            </a>
          </>
        )}
        <button className="btn btn-ghost" onClick={() => void leave()}>
          {user ? "Log out" : "Back to start"}
        </button>
      </section>
    </main>
  );
}
