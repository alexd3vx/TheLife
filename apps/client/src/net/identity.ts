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
