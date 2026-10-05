import { createClient, type User } from "@supabase/supabase-js";
import type { AuthResult, AuthService, AuthUser } from "./types";

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

function friendlyMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) return "Wrong email or password.";
  if (lower.includes("already registered")) return "An account with this email already exists. Try logging in.";
  if (lower.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("email not confirmed")) return "Please confirm your email first — check your inbox.";
  return message;
}

export function createSupabaseService(url: string, anonKey: string): AuthService {
  const client = createClient(url, anonKey);

  return {
    mode: "supabase",

    async getUser() {
      const { data } = await client.auth.getSession();
      return toAuthUser(data.session?.user);
    },

    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toAuthUser(session?.user));
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password): Promise<AuthResult> {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, message: friendlyMessage(error.message) };
      return { ok: true, user: toAuthUser(data.user) };
    },

    async signUp(email, password): Promise<AuthResult> {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) return { ok: false, message: friendlyMessage(error.message) };
      // With email confirmation enabled Supabase returns a user but no session.
      return { ok: true, user: toAuthUser(data.session?.user), needsEmailConfirmation: !data.session };
    },

    async signOut() {
      await client.auth.signOut();
    },
  };
}
