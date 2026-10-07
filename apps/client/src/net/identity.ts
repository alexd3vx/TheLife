// The private key that unlocks this browser's life on the server. It lives in local storage; "New game" makes a new one, so the
// new character starts fresh. (Accounts will tie a key to a sign-in later.)
const KEY = "thelife.key";

function makeKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40);
}

let memory: string | null = null;

export function playerKey(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const fresh = makeKey();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return (memory ??= makeKey()); // storage blocked: this visit still works, it just can't be found again
  }
}

export function rotateKey(): void {
  memory = null;
  try {
    localStorage.setItem(KEY, makeKey());
  } catch {
    /* ignore */
  }
}

/** The id of the signed-in account (set by the auth provider), if there is one. */
let accountId: string | null = null;
export function setAccountId(id: string | null): void {
  accountId = id;
}

/**
 * Your player ID, worked out here the same way the server does (a short fingerprint of the account, or of this device's key for a
 * guest). The server sends it too; this is what shows while the server is still an older version, or has not answered yet.
 */
export async function computeUid(): Promise<string> {
  const key = accountId ? `acct-${accountId}` : playerKey();
  const bytes = new TextEncoder().encode(`thelife:${key}`);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}
