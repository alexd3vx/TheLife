import type { AuthResult, AuthService, AuthUser } from "./types";

// DEV ONLY: lets the UI be tried before a Supabase project exists.
// Passwords are stored in plain text in this browser's localStorage. It is
// never used in production builds (see createAuthService).
const USERS_KEY = "thelife.dev.users";
const SESSION_KEY = "thelife.dev.session";

type StoredUser = AuthUser & { password: string };

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function readSession(): AuthUser | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as AuthUser | null;
  } catch {
    return null;
  }
}

export function createDevService(): AuthService {
  const listeners = new Set<(user: AuthUser | null) => void>();
  const notify = (user: AuthUser | null) => listeners.forEach((listener) => listener(user));

  function startSession(user: StoredUser): AuthUser {
    const session = { id: user.id, email: user.email };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notify(session);
    return session;
  }

  return {
    mode: "dev",
    async getUser() {
      return readSession();
    },
    async getAccessToken() {
      return null;
    },
    async getProfile() {
      return null;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(email, password): Promise<AuthResult> {
      const user = readUsers().find((u) => u.email === email.trim().toLowerCase());
      if (!user || user.password !== password) return { ok: false, message: "Wrong email or password." };
      return { ok: true, user: startSession(user) };
    },
    async signUp(email, password, username): Promise<AuthResult> {
      void username;
      const normalized = email.trim().toLowerCase();
      const users = readUsers();
      if (users.some((u) => u.email === normalized)) {
        return { ok: false, message: "An account with this email already exists. Try logging in." };
      }
      const user: StoredUser = { id: crypto.randomUUID(), email: normalized, password };
      localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
      return { ok: true, user: startSession(user) };
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      notify(null);
    },
  };
}
