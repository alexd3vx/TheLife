import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((l) => l());

/** Registers the service worker (live site only) and catches the browser's "install" offer. */
export function startPwa(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    ping();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    ping();
  });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export type InstallState = "installed" | "ready" | "ios" | "unavailable";

export function useInstall(): { state: InstallState; install(): Promise<void> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const state: InstallState = isInstalled() ? "installed" : deferred ? "ready" : isIos() ? "ios" : "unavailable";
  return {
    state,
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      ping();
    },
  };
}

export const canFullscreen = () => !!document.documentElement.requestFullscreen;
export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
}
