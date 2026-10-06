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

export function createAuthService(): AuthService {
  // Pasted settings often carry a stray space, new line or invisible character, which the browser refuses to send in a header.
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[^\x21-\x7e]/g, "") : undefined);
  const url = clean(import.meta.env.VITE_SUPABASE_URL)?.replace(/\/+$/, "");
  const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

  if (url && anonKey) return createSupabaseService(url, anonKey);
  if (import.meta.env.DEV) return createDevService();
  return unconfigured;
}
