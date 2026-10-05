# Development Log

Chronological record of decisions and changes. Newest first.

## 2026-10-05 — M0 (part 1): foundation + auth page
- Added pnpm monorepo (`apps/client`, `packages/shared`), strict TypeScript, Vitest.
- Client: React + Vite. Original auth page (log in / create account, 18+ confirmation, validation, responsive layout, animated isometric hero in SVG).
- Auth: `AuthService` interface with a Supabase implementation, plus a dev-only localStorage implementation used when no keys are set (disabled in production builds, which show "not available" instead).
- Validation rules live in `packages/shared` (unit-tested) so the server can reuse them.
- Dependencies added: react, react-dom, vite, @vitejs/plugin-react, @supabase/supabase-js (auth), typescript, vitest.
- Verified in a real browser (desktop + phone widths): validation, sign-up, reload persistence, log out, wrong password, log in. Production bundle ≈ 49 KB gzipped.
- Not done yet: Supabase project hookup, game server, CI, PWA manifest, isometric lot renderer (rest of M0).

## 2026-10-05 — Phase 0: planning and architecture
- Ran a 30-question planning Q&A with the project owner; results recorded in `GAME_VISION.md`.
- Reviewed the reference game (Lagos Life) via public sources only: browser multiplayer life sim, one shared city, weekly rent, jobs, dating, businesses, weekly governor election, wallet top-ups. Used for high-level inspiration only; nothing is copied.
- Wrote `TECH_ARCHITECTURE.md` (stack, systems, data model, multiplayer, world model, assets, responsive strategy, repo layout, risks) and `ROADMAP.md` (slice milestones M0–M7 and later phases).
- Key decisions: isometric 2.5D with PixiJS; React + Vite PWA; Node + Fastify + WebSocket authoritative server; Supabase for Postgres/Auth/Storage; double-entry ledger; instanced lots; storylet engine; AI text with cost caps and fallbacks.
- No game code written yet. Next: M0 — Foundation, after architecture approval.
