import { isAdmin } from "./admin";
import { useAuth } from "../auth/AuthProvider";
import { LagosScene } from "./LagosScene";

const linkStyle = { textAlign: "center", textDecoration: "none", display: "grid", placeItems: "center" } as const;

/** The first screen after signing in: a warm welcome over the Lagos evening, and the way into the game. */
export function HomePlaceholder() {
  const { user, profile, leave } = useAuth();
  const name = profile?.displayName || user?.email?.split("@")[0] || "";

  return (
    <main className="auth cine home-cine">
      <LagosScene />
      <section className="auth-tagline">
        <div className="brand-line">
          <span className="brand-mark" aria-hidden="true" />
          Alexion Studios presents
        </div>
        <h1>{name ? `Welcome, ${name}.` : "Welcome."}</h1>
        <p>Your life in Lagos is waiting.</p>
      </section>
      <section className="auth-panel">
        <a className="btn btn-primary btn-wide" href="#/play" style={linkStyle}>
          Play
        </a>
        <a className="btn btn-ghost btn-wide" href="#/settings" style={linkStyle}>
          Settings
        </a>
        {isAdmin() && (
          <>
            <a className="btn btn-ghost" href="#/showroom" style={linkStyle}>
              Furniture showroom (admin)
            </a>
            <a className="btn btn-ghost" href="#/lab" style={linkStyle}>
              Character and asset lab (admin)
            </a>
          </>
        )}
        <button className="btn btn-ghost" onClick={() => void leave()}>
          {user ? "Log out" : "Back to start"}
        </button>
        {user && <p className="fine">Signed in as {user.email}</p>}
      </section>
    </main>
  );
}
