import { startGameServer } from "./index.js";
import { supabaseVerifier } from "./accounts.js";

const port = Number(process.env.PORT ?? 8787);
const origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const server = await startGameServer({ port, room: process.env.ROOM ?? "lagos-test", origins, dataDir: process.env.DATA_DIR ?? "./data", verifyToken: supabaseVerifier(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY), allowGuests: process.env.ALLOW_GUESTS === "1" });
console.log(`TheLife game server on port ${server.port} (room ${server.room.name}${origins.length ? `, origins ${origins.join(", ")}` : ", any origin"})`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void server.close().then(() => process.exit(0)));
