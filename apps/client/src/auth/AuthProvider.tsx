import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createAuthService } from "./createAuthService";
import type { AuthService, AuthUser } from "./types";

type AuthStatus = "loading" | "signedIn" | "signedOut";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  service: AuthService;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => createAuthService(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    service
      .getUser()
      .then((current) => {
        if (!active) return;
        setUser(current);
        setStatus(current ? "signedIn" : "signedOut");
      })
      .catch(() => active && setStatus("signedOut"));

    const unsubscribe = service.onChange((next) => {
      setUser(next);
      setStatus(next ? "signedIn" : "signedOut");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  return <AuthContext.Provider value={{ status, user, service }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
