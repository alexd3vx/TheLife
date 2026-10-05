import { useAuth } from "../auth/AuthProvider";

// Temporary signed-in screen. Replaced by the character creator in M1.
export function HomePlaceholder() {
  const { user, service } = useAuth();

  return (
    <main className="home-placeholder">
      <h1>You're in.</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
      <p className="muted">Next up (M1): create your person and step into the district.</p>
      <button className="btn btn-ghost" onClick={() => void service.signOut()}>
        Log out
      </button>
    </main>
  );
}
