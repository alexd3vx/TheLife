// Update check: every build stamps a version id into the app and into version.json next to it. While the game is open it
// compares the two; when they differ a newer build has been published and the player is offered a reload. No maintenance
// window, nobody is kicked out mid-game.

declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

const CHECK_EVERY_MS = 5 * 60_000;

export async function latestBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { build?: unknown };
    return typeof data.build === "string" ? data.build : null;
  } catch {
    return null;
  }
}

/** True when `latest` is a different, real build id from the one running. */
export function isNewer(current: string, latest: string | null): boolean {
  return latest !== null && current !== "dev" && latest !== current;
}

/** Calls `onUpdate` once when a newer build is published. Returns a stop function. */
export function watchForUpdates(onUpdate: () => void): () => void {
  if (BUILD_ID === "dev") return () => {};
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    if (isNewer(BUILD_ID, await latestBuildId())) {
      stopped = true;
      onUpdate();
    }
  };
  const timer = window.setInterval(check, CHECK_EVERY_MS);
  const onVisible = () => {
    if (!document.hidden) void check();
  };
  document.addEventListener("visibilitychange", onVisible);
  void check();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
