import { APP_INFO, STORE_APPS, appInfo, storeAppById, type AnyAppId } from "@thelife/game-core";
import type { IconName } from "./icons";

/** What the phone's screens can show: every installed app, plus the power screen that is part of the phone itself. */
export type ClientApp = AnyAppId | "battery" | "social";

export interface AppLook {
  icon: IconName;
  from: string;
  to: string;
}

const CORE: Record<string, AppLook> = {
  chat: { icon: "chat", from: "#5b9bff", to: "#5b9bff" },
  pay: { icon: "pay", from: "#ffb347", to: "#e8761f" },
  shop: { icon: "shop", from: "#ff7a7a", to: "#d93a5b" },
  jobs: { icon: "jobs", from: "#6aa5ff", to: "#3558e0" },
  news: { icon: "news", from: "#b57cf0", to: "#7a3fc4" },
  maps: { icon: "maps", from: "#3fd0b8", to: "#0f8f9a" },
  settings: { icon: "settings", from: "#8a94a6", to: "#4a5568" },
  store: { icon: "store", from: "#4dabf7", to: "#1c4fd8" },
  social: { icon: "chat", from: "#43b0ff", to: "#2f55d8" },
  battery: { icon: "power", from: "#6b7a90", to: "#38455a" },
};

const STORE: Record<string, AppLook> = Object.fromEntries(STORE_APPS.map((a) => [a.id, { icon: a.icon as IconName, from: a.from, to: a.to }]));

export const styleOf = (app: ClientApp): AppLook => CORE[app] ?? STORE[app] ?? CORE.chat!;
export const nameOf = (app: ClientApp): string => (app === "battery" ? "Power" : app === "social" ? "Social" : appInfo(app).name);
export const isStoreApp = (app: string): boolean => !!storeAppById(app) && !(app in APP_INFO);
