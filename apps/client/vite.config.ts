import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // VITE_BASE=./ makes a build that works from any folder or hosted page (used for the playtest build).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: { host: true, port: 5173 },
});
