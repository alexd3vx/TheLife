// The game connection needs the account's login token, which lives in the auth service (React). The provider hands it over here.
let provider: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: (() => Promise<string | null>) | null): void {
  provider = fn;
}

export async function getToken(): Promise<string | null> {
  try {
    return provider ? await provider() : null;
  } catch {
    return null;
  }
}
