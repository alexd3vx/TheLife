import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Every build gets an id. It is compiled into the app and written to version.json, so a running game can tell when a
// newer build has been published and offer a reload.
const buildId = process.env.BUILD_ID ?? Date.now().toString(36);

function versionFile(): Plugin {
  return {
    name: "thelife-version-file",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: buildId }) });
    },
  };
}

export default defineConfig({
  // VITE_BASE=./ makes a build that works from any folder or hosted page (used for the playtest build).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  server: { host: true, port: 5173 },
});
