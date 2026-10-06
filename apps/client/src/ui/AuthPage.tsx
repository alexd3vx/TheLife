import { useState, type FormEvent } from "react";
import { validateLogin, validateSignUp } from "@thelife/shared";
import { useAuth } from "../auth/AuthProvider";
import { LagosScene } from "./LagosScene";

type Tab = "login" | "signup";

interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
  isAdult: boolean;
}

const EMPTY_FORM: FormState = { email: "", password: "", confirmPassword: "", isAdult: false };

export function AuthPage() {
  const { service, save, playOffline, startOver } = useAuth();
  const [tab, setTab] = useState<Tab>("signup");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function switchTab(next: Tab) {
    setTab(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    setNotice(null);

    const found = tab === "login" ? validateLogin(form.email, form.password) : validateSignUp(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const email = form.email.trim();
      const result =
        tab === "login" ? await service.signIn(email, form.password) : await service.signUp(email, form.password);
      if (!result.ok) {
        setFormError(result.message);
      } else if (result.needsEmailConfirmation) {
        switchTab("login");
        setSentTo(email);
      }
    } catch {
      setFormError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const isSignUp = tab === "signup";

  return (
    <main className="auth cine">
      <LagosScene />
      <section className="auth-tagline">
        <div className="brand-line">
          <span className="brand-mark" aria-hidden="true" />
          Alexion Studios presents
        </div>
        <h1>TheLife</h1>
        <p>Lagos, for real. Build a person, find your feet and share one living city with real people.</p>
      </section>

      <section className="auth-panel">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">TheLife</span>
        </div>

        <h1 className="auth-title">Your life in Lagos starts here.</h1>
        <p className="auth-sub">
          Build your person, chase your goals, and share a living world with real people. Every choice leaves a mark.
        </p>

        {service.mode !== "supabase" && (
          <>
            <div className="play-now">
              <button className="btn btn-primary btn-wide" onClick={playOffline}>
                {save ? "Continue my life" : "Play now (this device only)"}
              </button>
              {save && (
                <button className="link-button" onClick={startOver}>
                  Start a new life instead
                </button>
              )}
            </div>
            <p className="divider">
              <span>or use an account</span>
            </p>
          </>
        )}

        {sentTo ? (
          <div className="auth-done" role="status">
            <div className="auth-done-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="64" height="64"><rect x="8" y="16" width="48" height="34" rx="5" fill="#ffd98a" /><path d="M10 20l22 18 22-18" fill="none" stroke="#7a4a12" strokeWidth="3" strokeLinejoin="round" /></svg>
            </div>
            <h2>Check your inbox</h2>
            <p>
              We sent a link to <strong>{sentTo}</strong>. Open it to confirm your email, then come back here and log in. (If it is not there, look in spam.)
            </p>
            <button className="btn btn-primary" onClick={() => setSentTo(null)}>
              I've confirmed, log me in
            </button>
            <button className="link-button" onClick={() => { setSentTo(null); switchTab("signup"); }}>
              Use a different email
            </button>
          </div>
        ) : (
        <>
        <div className="tabs" role="tablist" aria-label="Account">
          <button role="tab" aria-selected={!isSignUp} className="tab" onClick={() => switchTab("login")}>
            Log in
          </button>
          <button role="tab" aria-selected={isSignUp} className="tab" onClick={() => switchTab("signup")}>
            Create account
          </button>
        </div>

        {service.mode === "dev" && (
          <p className="banner banner-dev">
            Dev mode: accounts are stored only in this browser. Add Supabase keys to use real sign-in.
          </p>
        )}
        {service.mode === "unconfigured" && (
          <p className="banner banner-warn">Sign-in isn't available yet. Please check back soon.</p>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <Field label="Email" error={errors.email}>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={!!errors.email}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" error={errors.password}>
            <input
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              aria-invalid={!!errors.password}
              placeholder={isSignUp ? "At least 8 characters, with a number" : "Your password"}
            />
          </Field>

          {isSignUp && (
            <>
              <Field label="Confirm password" error={errors.confirmPassword}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  aria-invalid={!!errors.confirmPassword}
                />
              </Field>

              <label className="check">
                <input
                  type="checkbox"
                  checked={form.isAdult}
                  onChange={(e) => update("isAdult", e.target.checked)}
                />
                <span>I confirm I am 18 or older.</span>
              </label>
              {errors.isAdult && <p className="field-error">{errors.isAdult}</p>}
            </>
          )}

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy || service.mode === "unconfigured"}>
            {busy ? "One moment…" : isSignUp ? "Create account" : "Log in"}
          </button>
        </form>

        </>
        )}

        <p className="fine">
          This game is for adults and includes mature themes. By continuing you agree to play fair and respect other
          players.
        </p>
      </section>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
