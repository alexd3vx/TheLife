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
};

export function createAuthService(): AuthService {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (url && anonKey) return createSupabaseService(url, anonKey);
  if (import.meta.env.DEV) return createDevService();
  return unconfigured;
}
