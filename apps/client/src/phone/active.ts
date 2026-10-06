import { createContext, useContext, useEffect } from "react";

/** Is this app the one on screen? Apps stay alive in the background, so games use this to pause. */
export const AppActive = createContext(true);
export const useAppActive = () => useContext(AppActive);

/**
 * One back button per app. The phone's own back arrow (header, Android back key, edge swipe) first lets the app step back inside
 * itself (a chat to the chat list, a recipe to the recipe list); only when the app has nothing to step back from does it minimise.
 */
export const AppBack = createContext<(handler: (() => void) | null) => void>(() => {});

/** Registers what "back" does while `handler` is set (pass null when there is nothing to go back from). */
export function useBackHandler(handler: (() => void) | null): void {
  const set = useContext(AppBack);
  const has = handler !== null;
  useEffect(() => {
    set(handler);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has, set]);
}
