import { createContext, useContext } from "react";

/** Is this app the one on screen? Apps stay alive in the background, so games use this to pause. */
export const AppActive = createContext(true);
export const useAppActive = () => useContext(AppActive);
