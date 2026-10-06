import { createDevService } from "./devService";
import { createSupabaseService } from "./supabaseService";
import type { AuthService } from "./types";

const unconfigured: AuthService = {
  mode: "unconfigured",
  getUser: async () => null,
  onChange: () => () => {},
  signIn: async () => ({ ok: false, message: "Sign-in isn't set up yet." }),
  signUp: async () => ({ ok: false, message: "Sign-up isn't set up yet." }),
  signOut: async () => {},
  getAccessToken: async () => null,
  getProfile: async () => null,
};

// The project's public address and public ("anon") key. Both are meant to be in every browser; they only let people sign up and
// log in, and what each account may touch is decided by the database rules. They are the fallback when the site's own settings are
// missing or damaged (a wrong key shows up as "Invalid API key").
const DEFAULT_URL = "https://vsifrgyomrnjjokgwviq.supabase.co";
const DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzaWZyZ3lvbXJuampva2d3dmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMzIyMTUsImV4cCI6MjEwNjgwODIxNX0.h_aixgbrS0MuPpBL0oxvi22zf2iwMwF6iOWCMpM43Oc";

/** Does this look like the anon key of the project at `url` (a signed token whose `ref` is the project)? */
function keyFits(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { ref?: string; role?: string };
    return payload.role === "anon" && new URL(url).hostname.split(".")[0] === payload.ref;
  } catch {
    return false;
  }
}

export function createAuthService(): AuthService {
  // Pasted settings often carry a stray space, new line or invisible character, which the browser refuses to send in a header.
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[^\x21-\x7e]/g, "") : undefined);
  const url = clean(import.meta.env.VITE_SUPABASE_URL)?.replace(/\/+$/, "");
  const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

  if (keyFits(url, anonKey)) return createSupabaseService(url!, anonKey!);
  if (!import.meta.env.DEV || !url) return createSupabaseService(DEFAULT_URL, DEFAULT_KEY);
  if (import.meta.env.DEV) return createDevService();
  return unconfigured;
}
