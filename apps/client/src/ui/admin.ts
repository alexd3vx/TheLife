// Developer tools (the asset lab, showroom, performance tour, test switches) are for the owner only. They turn on when the page is
// opened once with ?admin=1 (remembered on this device) and off again with ?admin=0. Later the account's admin flag decides.
const KEY = "thelife.admin";

export function isAdmin(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("admin");
    if (q === "1") localStorage.setItem(KEY, "1");
    if (q === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
