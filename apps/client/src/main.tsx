import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { Boot } from "./boot/Boot";
import { installCachedFetch } from "./boot/assetCache";
import { startPwa } from "./pwa/pwa";
import "./styles/global.css";
import "./styles/auth.css";

// Model and texture requests look on the device first (see boot/assetCache.ts).
installCachedFetch();
startPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Boot>
  </StrictMode>,
);
