export interface AuthUser {
  id: string;
  email: string;
}

export type AuthResult =
  | { ok: true; user: AuthUser | null; needsEmailConfirmation?: boolean }
  | { ok: false; message: string };

/** What the account's profile row says (from the `profiles` table). */
export interface AccountProfile {
  displayName: string;
  isAdmin: boolean;
}

export type AuthMode = "supabase" | "dev" | "unconfigured";

export interface AuthService {
  mode: AuthMode;
  getUser(): Promise<AuthUser | null>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, username: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** A fresh access token for the game server, or null when there is no real account. */
  getAccessToken(): Promise<string | null>;
  getProfile(): Promise<AccountProfile | null>;
}
