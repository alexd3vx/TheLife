export interface AuthUser {
  id: string;
  email: string;
}

export type AuthResult =
  | { ok: true; user: AuthUser | null; needsEmailConfirmation?: boolean }
  | { ok: false; message: string };

export type AuthMode = "supabase" | "dev" | "unconfigured";

export interface AuthService {
  mode: AuthMode;
  getUser(): Promise<AuthUser | null>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}
