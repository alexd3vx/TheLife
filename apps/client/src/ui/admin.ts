// Developer tools (the asset lab, showroom, performance tour, test switches) are for the owner only. The account's admin flag
// (`is_admin` in the Supabase `profiles` table, set by hand, never by the game) turns them on. While building, opening the page with
// ?admin=1 also works on a development build (and ?admin=0 turns it off again).
const KEY = "thelife.admin";
let accountAdmin = false;

/** Called when the signed-in account's profile is known. */
export function setAccountAdmin(value: boolean): void {
  accountAdmin = value;
}

export function isAdmin(): boolean {
  if (accountAdmin) return true;
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(window.location.search).get("admin");
    if (q === "1") localStorage.setItem(KEY, "1");
    if (q === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
