/**
 * Is this a device that should get the light version of the character stage (no shadow map, no clear coat or sheen on the skin, a lower
 * pixel count, 30 frames a second)? Phones and weak machines: a touch screen, or little memory, or few cores. `?lite=1` or `?lite=0` in the
 * address forces it either way, so the light version can be looked at on a computer.
 */
export function liteRender(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("lite");
    if (q === "1") return true;
    if (q === "0") return false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return touch || (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4;
  } catch {
    return false;
  }
}
