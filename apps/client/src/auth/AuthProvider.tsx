import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createSave, deleteSave, loadSave, touchSave, type GameSave } from "../save/localSave";
import { createAuthService } from "./createAuthService";
import { setAccountAdmin } from "../ui/admin";
import { setTokenProvider } from "../net/tokenBridge";
import type { AccountProfile, AuthService, AuthUser } from "./types";

type AppStatus = "loading" | "inGame" | "signedOut";

interface AuthContextValue {
  status: AppStatus;
  /** Signed-in account, if any. Playing offline needs no account. */
  user: AuthUser | null;
  service: AuthService;
  /** What the account's profile says (admin flag, display name), once loaded. */
  profile: AccountProfile | null;
  /** The on-device save, if one exists. */
  save: GameSave | null;
  playOffline(): void;
  startOver(): void;
  leave(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => createAuthService(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [save, setSave] = useState<GameSave | null>(() => loadSave());
  const [inGame, setInGame] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  useEffect(() => {
    let active = true;
    service
      .getUser()
      .then((current) => {
        if (!active) return;
        setUser(current);
        setInGame(!!current);
      })
      .catch(() => undefined)
      .finally(() => active && setAuthReady(true));

    const unsubscribe = service.onChange((next) => {
      setUser(next);
      if (next) setInGame(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  // The game server needs a fresh login token each time it connects; the profile row says whether this account is an admin.
  useEffect(() => {
    setTokenProvider(() => service.getAccessToken());
    return () => setTokenProvider(null);
  }, [service]);
  useEffect(() => {
    let active = true;
    if (!user) {
      setProfile(null);
      setAccountAdmin(false);
      return;
    }
    service
      .getProfile()
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setAccountAdmin(p?.isAdmin === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [service, user]);

  // Accounts get a save too, so the same game works with or without a login.
  useEffect(() => {
    if (user && !save) setSave(createSave());
  }, [user, save]);

  const playOffline = useCallback(() => {
    setSave((current) => (current ? touchSave(current) : createSave()));
    setInGame(true);
  }, []);

  const startOver = useCallback(() => {
    deleteSave();
    setSave(createSave());
    setInGame(true);
  }, []);

  const leave = useCallback(async () => {
    setInGame(false);
    if (user) await service.signOut();
  }, [service, user]);

  const status: AppStatus = !authReady ? "loading" : inGame || user ? "inGame" : "signedOut";

  return (
    <AuthContext.Provider value={{ status, user, service, profile, save, playOffline, startOver, leave }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
