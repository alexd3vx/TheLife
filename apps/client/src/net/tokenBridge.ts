// The game connection needs the account's login token, which lives in the auth service (React). The provider hands it over here.
let provider: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: (() => Promise<string | null>) | null): void {
  provider = fn;
}

/** The login the auth library keeps in this browser, read directly: the way in when asking the library itself is slow or stuck. */
function storedToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { access_token?: string; expires_at?: number } | null;
      if (parsed?.access_token && (!parsed.expires_at || parsed.expires_at * 1000 > Date.now() - 60_000)) return parsed.access_token;
    }
  } catch {
    /* storage can be blocked */
  }
  return null;
}

export async function getToken(): Promise<string | null> {
  const asked = (async () => {
    try {
      return provider ? await provider() : null;
    } catch {
      return null;
    }
  })();
  // Never wait on the auth library for long: a stuck call here used to leave the game "connecting" forever.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
  return (await Promise.race([asked, timeout])) ?? storedToken();
}
