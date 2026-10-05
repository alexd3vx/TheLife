# TheLife

A persistent multiplayer life simulator for the browser, set in a living, expanding Nigeria. See `docs/` for the vision, architecture and roadmap.

## Run it

Requirements: Node 20+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm test
```

## Sign-in setup

- **No setup (dev mode):** with no Supabase keys, `pnpm dev` uses a browser-only fake account store so you can try the auth page. It is disabled in production builds.
- **Real sign-in (Supabase):**
  1. Create a project at supabase.com.
  2. Copy `apps/client/.env.example` to `apps/client/.env.local`.
  3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API). Use the anon key only, never the service-role key.
  4. In Supabase → Authentication, decide whether email confirmation is required (the UI handles both).

## Layout

```
apps/client      React + Vite app (auth page today; game world from M1)
packages/shared  Types and validation shared by client and server
docs/            Vision, architecture, roadmap, dev log
```
