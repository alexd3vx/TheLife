# Technical Architecture

Status: **proposed** (awaiting approval). Update this file whenever an architectural decision changes.

## 1. Recommended stack

| Layer | Choice | Why | Rejected alternatives |
|-------|--------|-----|-----------------------|
| Language | **TypeScript** everywhere | One language across client, server and shared rules; strong typing helps AI-assisted development; shared types prevent client/server drift. | JS-only (no safety); Godot (excluded by brief). |
| UI shell | **Preact or React + Vite** (default: **React + Vite**) | Mature, fast HMR, best AI-tooling support. UI (phone, dashboard, menus) is DOM, not canvas, so it is responsive and accessible. | Next.js (SSR not needed for a game, adds complexity); Svelte (smaller ecosystem for AI help). |
| World renderer | **Three.js** (WebGL, true 3D) | Realistic lighting, shadows and PBR materials; skinned/rigged characters with glTF animation; proven on mobile when scenes are budgeted. Chosen over PixiJS (2D) after the owner asked for realistic, Sims-style 3D. | PixiJS/isometric sprites (flat look); Babylon.js (heavier); photorealistic engines (not viable in-browser on phones). |
| State (client) | **Zustand** (UI state) + a thin **client-side world mirror** | Small, readable. Server remains the source of truth. | Redux (more boilerplate). |
| Realtime | **WebSocket** via `ws` + a typed message protocol (Zod-validated) | Simple, debuggable, no framework lock-in. | Colyseus (nice rooms, but lock-in and we need custom authority/ledger rules); Socket.IO (extra overhead). |
| API | **Fastify** REST for non-realtime (auth callbacks, account, admin) | Fast, typed, plugin model. | Express (slower, less typed); tRPC (revisit later). |
| Game server | **Node.js** always-on process on Fly.io / Railway / Render | A game loop needs a persistent process; serverless functions cannot hold WebSockets or tick. | Cloudflare Durable Objects (strong fit later for lots, but different runtime and lock-in; revisit at scale). |
| Database | **Supabase Postgres** | Managed Postgres, backups, row-level security, SQL, JSONB for flexible content. | Mongo (weak for ledgers/relations). |
| Auth | **Supabase Auth** (email + OAuth) | Secure sessions, no custom crypto. JWT verified by the game server. | Rolling our own. |
| Live cache | **Redis (Upstash)** | Presence, rate limits, pub/sub between server instances, hot world state. Optional in the first slice (in-memory), required before multiple instances. | — |
| Storage / CDN | **Supabase Storage + Cloudflare (CDN)** | Cheap static asset delivery; long cache TTLs for versioned assets. | — |
| Validation | **Zod** | One schema → runtime validation + TS types for every action and content file. | Hand-written checks. |
| Tests | **Vitest** (unit) + **Playwright** (browser) | Fast, TS-native. | — |
| Package mgmt | **pnpm workspaces** monorepo | Shared packages without duplication. | npm/yarn (slower). |
| PWA | `vite-plugin-pwa` | Installable, offline app shell, push notifications. | — |

Dependencies are added only with a stated reason in `DEVELOPMENT_LOG.md`.

## 2. Major systems and how they communicate

```
 ┌──────────────────────────── BROWSER (PWA) ────────────────────────────┐
 │  UI (React)   ◄─ state ─►  Client World Mirror  ◄─ draws ─►  Renderer  │
 │  phone, HUD,               (interpolated copy                (Three.js  │
 │  dashboard                  of server state)                  3D scene) │
 └───────────────▲──────────────────────────┬─────────────────────────────┘
        snapshots/events (WS)        action requests (WS / REST)
 ┌───────────────┴──────────────────────────▼─────────────────────────────┐
 │                        GAME SERVER (Node, authoritative)               │
 │  Gateway ─► Action Pipeline ─► Systems ─► Ledger ─► Persistence        │
 │  (auth, rate   (validate →     (needs, jobs,  (double-  (Postgres      │
 │   limit)        authorise →     relationships, entry     writes, event  │
 │                 execute →       storylets,     money)    log)           │
 │                 commit)         economy, NPC)                          │
 │  Lot Instances (rooms)   World Clock   Scheduler (offline catch-up)    │
 └───────────────▲──────────────────────────┬─────────────────────────────┘
                 │ pub/sub, presence        │ SQL
            ┌────┴────┐              ┌──────▼───────┐        ┌─────────────┐
            │  Redis  │              │  Supabase    │        │ AI service  │
            └─────────┘              │  Postgres    │        │ (news/NPC)  │
                                     │  Auth/Storage│        └─────────────┘
                                     └──────────────┘
```

### Separation of concerns

| Concern | Lives in | Rule |
|---------|----------|------|
| Rules & types shared by both sides | `packages/shared` | Pure TS, no I/O. Used by server and client prediction. |
| Gameplay rules (needs, jobs, storylets, ledger) | `packages/game-core` | Pure functions over state; fully unit-testable without a network or DB. |
| Content (jobs, items, events, NPC templates) | `content/` (JSON/YAML + Zod schemas) | No content in code. Validated at build and at server start. |
| Server runtime (WS, auth, persistence) | `apps/server` | Calls game-core; owns I/O. |
| Client UI | `apps/client/src/ui` | DOM only. |
| Client rendering | `apps/client/src/render` | Canvas only. Knows nothing about React. |

## 3. Server authority & the action pipeline

Every state change goes through one pipeline. The client **never** sends results, only requests.

```
Client: { type: "action", id: "buy_item", payload: {...}, clientSeq: 42 }
Server:
  1. Authenticate (JWT → accountId → characterId)
  2. Rate-limit (Redis token bucket per character/action)
  3. Validate payload (Zod)
  4. Authorise (can this character do this here, now? locations, needs, funds, cooldowns)
  5. Execute in game-core (pure function: state + action → state delta + events)
  6. Commit in a single DB transaction (state delta + ledger entries + event log)
  7. Broadcast (to the actor, to the lot instance, to affected parties via pub/sub)
  8. Ack to client with result, or a typed error
```

- **Never trusted from the client:** money, inventory, property, business ownership, progression, trades, relationship changes, purchases, competitive results, time.
- **Client prediction** is limited to movement and cosmetic animation. Server reconciles.
- **Idempotency:** each action carries an id; replays are ignored.
- **Audit:** every state-changing action is appended to `event_log`.

### Money: double-entry ledger

- Money is never "set". Every movement is a ledger transaction with ≥2 balanced entries (e.g. `employer_account → player_wallet`).
- Accounts: player wallets, bank accounts, NPC/business accounts, a `SYSTEM_MINT` and `SYSTEM_SINK` account (so inflation is measurable).
- Daily audit job: sum of all balances must equal minted − sunk. Mismatch → alert and freeze affected accounts.
- A top-up (future) mints through `SYSTEM_MINT` with weekly caps per account.

## 4. Time

- **World clock** runs on the server in accelerated time (default: 1 real hour ≈ 1 game day; configurable per world). Stored as a single `world_time` value; clients derive display time from it.
- **Hybrid actions:** actions that "take time" (a work shift, sleeping) reserve game time and may be skipped forward when the player is alone, or run in parallel with other players when on a shared lot.
- **Offline catch-up:** on login the server runs `simulateAbsence(character, from, to)` — a cheap, deterministic, bounded function (needs decay with floors, scheduled rent/bills, queued storylets, NPC messages). It outputs a **"While you were away"** summary. Rails: no jail, no death, no repossession during absence beyond a grace window.

## 5. Rendering (real-time 3D, Sims-style)

Decision (Oct 2026): the world is **true 3D** rendered with Three.js, not 2D isometric sprites. Camera is a free orbit/follow camera in the style of The Sims.

- **Scene = Lot / street:** built from data (layouts) and reusable asset kits (buildings, props, vehicles, characters). Procedural variation fills in the detail.
- **Look:** ACES tone mapping, sun + hemisphere lighting with soft shadow maps, fog, textured PBR-style materials, emissive windows/lamps, sky dome. Goal: believable, not photoreal.
- **Characters:** a single shared humanoid skeleton so any animation can be retargeted; customisation by swapping head/face, hair, body and clothing parts and by morph targets for body/face shape.
- **Animation:** clip library (idle, walk, run, sit, sleep, eat, talk, gestures, work actions) driven by an animation state machine; interactions play clips from data.
- **Asset format:** glTF/GLB, Draco/meshopt compressed, KTX2 textures; per-lot lazy loading from the CDN.
- **Performance budgets (mid-range phone):** ≤ 150 draw calls, ≤ 300k triangles on screen, ≤ 40 MB GPU memory, 60 fps target / 30 fps floor, shadow map 1024 on phones, pixel ratio capped (1.5 phone, 2 desktop), auto-drop resolution if frames are slow, pause when the tab is hidden, respect reduced-motion.
- **Fallback:** if WebGL is unavailable, show a static illustrated scene.
- **Today:** `apps/client/src/world3d/` contains the procedural street scene (textures, buildings, props, vehicles, people, sky, layout) used behind the auth/home screens. It is lazy-loaded so the form is usable immediately.
- **Map screen:** a separate illustrated district map (DOM/SVG) for click-to-travel; not the same renderer scene.

## 5b. Offline-first (Oct 2026)

Decision: build and prove the **single-player offline game first**; add multiplayer afterward.

- The game rules live in `packages/game-core` as pure functions, so they run in the browser with no server. The same code later runs on the authoritative server.
- Saves are stored on the device (`apps/client/src/save`, versioned JSON; moves to IndexedDB when saves grow). "Play now" needs no account; an account is optional and later enables sync and multiplayer.
- To keep the later server-authoritative design cheap, all state changes already go through the action pipeline interface (validate → execute → commit), with the local "server" running in-process offline.
- Offline mode is trusted on the client by definition, so offline saves can never be imported into the online economy without server validation.

## 5c. Movement and interaction (tap to walk)

Sims-style control. The player never steers; they say *where*, and the character gets there.

- **Tap/click the floor:** a ray from the camera is cast onto the ground; the character walks there along a path around walls and furniture. Long trips switch from walk to jog.
- **Tap furniture:** the character walks to that item's approach point, then performs its action: stand actions (fridge, cooking) end on a timer; seat/lie actions (sofa, dining chair, desk, bed) move the character onto the seat or mattress and hold until the next tap, which makes them get up first. Several pieces can share one action (tapping the TV sends you to the sofa; tapping the desk, monitor or laptop starts work).
- **Camera:** drag to orbit, pinch/wheel to zoom, right-drag to pan; "Follow" keeps the character centred. Walls between the camera and the house fade out so you can always see in. Taps are told apart from drags by distance (< 9 px) and time (< 450 ms), and a second finger cancels a tap.
- **Pathfinding** lives in `packages/shared/src/nav.ts` (pure logic, unit-tested): grid A* with diagonal moves, no corner cutting, then string-pulling so routes are straight lines. The grid is 12.5 cm cells; walls and furniture are padded by the character's radius, and doorways are 1.4 m so they stay open after padding. The server will reuse the same code to check that a requested move is possible.
- **Data, not code:** the house (walls, doors, furniture, which action each piece triggers, where to stand, where to sit) is `apps/client/src/play/layout.ts`. A new room or lot is a new layout file.
- **Code map:** `play/controller.ts` (walk, turn, run, sit/lie tweens, action timers), `play/runtime.ts` (renderer, camera, picking, loop), `play/world.ts` (scene + nav grid), `play/PlayPage.tsx` (UI).
- **Look sharing:** the character built in the Lab is saved on the device and shows up in the prototype.

## 6. Multiplayer model

- **Lot instances:** the world is one logical world; each lot has one or more *instances* (rooms) capped at ~100 players. Players in the same instance see each other live.
- **Presence:** Redis tracks `characterId → {lotId, instanceId, server}`.
- **Tick rates:** instance sim tick 10 Hz (movement/interactions), world tick 1 Hz (needs, schedule triggers), slow tick every game-hour (economy, NPC schedules, storylet evaluation).
- **Interest management:** a client only receives entities in its instance; deltas, not full snapshots, after the first sync.
- **Protocol:** binary-friendly typed JSON messages (versioned). Client → server: `action`, `move`, `chat`. Server → client: `snapshot`, `delta`, `event`, `ack`, `error`, `notification`.
- **Async layer:** phone messages, trade offers, friend requests, job offers are stored in Postgres and pushed live if online; otherwise delivered on login and via PWA push.
- **Scaling path:** stateless API + sticky-routed game servers per world shard; instances are assigned to servers; Redis pub/sub bridges cross-instance messages (phone, news). Design for 5,000 concurrent; build/test for 200.

## 7. Simulation systems

- **Needs:** hunger, energy, hygiene, stress, fun, social, comfort. Decay slowly; effects are modifiers on other systems (e.g. low energy → work performance), never constant nagging.
- **Personality:** trait vector (ambitious, social, risk-taking, …) modifies storylet options/odds, NPC compatibility, job performance. Traits drift through repeated behaviour (tracked in `trait_drift` counters).
- **Skills:** gained by doing; each skill has a source action list in content data, with diminishing returns and decay.
- **Careers:** data-driven ladders with requirements (skills, reputation, education, relationships) and performance reviews.
- **Relationships:** a score per pair plus **memories** — typed records ("helped you when poor", "borrowed ₦20k", "attended wedding") that storylets and NPC dialogue query.
- **Storylet engine:** each storylet = `{ conditions, weight, choices[{requirements, outcomes}] , cooldown }`. A scheduler selects eligible storylets from world + personal + social state, so events feel caused, not random.
- **NPC LOD:** Level 0 (on a lot with a player): full schedule + dialogue. Level 1 (same district): schedule position only. Level 2 (elsewhere): aggregate statistics (employment, income, mood). NPCs are promoted/demoted as players move.
- **AI services:** news and NPC chat generated from structured world facts, **cached**, **cost-capped per day/player**, safety-filtered, with **template fallbacks** so the game works with AI disabled. AI never changes state; it only describes it.

## 8. Data model (core entities)

Postgres (Supabase). All content references are by stable string IDs. Flexible parts use JSONB.

```
accounts (id, supabase_user_id, created_at, flags)
characters (id, account_id, name, appearance_json, traits_json, background, born_at, age, alive, home_property_id, location_id, ...)
needs (character_id, hunger, energy, hygiene, stress, fun, social, comfort, updated_at)
skills (character_id, skill_id, level, xp)
careers (character_id, career_id, tier, performance, hired_at, employer_id)
wallets / ledger_accounts (id, owner_type, owner_id, kind, balance_cache)
ledger_transactions (id, created_at, reason, ref)
ledger_entries (id, transaction_id, account_id, amount, direction)
items (id, content_id, owner_type, owner_id, qty, condition)
properties (id, content_id, location_id, owner_type, owner_id, tenant_id, rent, upgrades_json)
vehicles (id, content_id, owner_id, condition, fuel, location_id)
businesses (id, content_id, owner_id, location_id, reputation, state_json)
employees (id, business_id, character_or_npc_id, role, wage)
relationships (a_id, b_id, type, score, updated_at)
relationship_memories (id, a_id, b_id, kind, data_json, weight, created_at)
npcs (id, template_id, name, job_id, home_id, schedule_id, lod, state_json)
goals (id, character_id, kind, target_json, progress, status)
storylet_state (character_id, storylet_id, last_fired_at, flags_json)
notifications (id, character_id, kind, payload_json, read, created_at)
messages (id, from_id, to_id, thread_id, body, created_at)
posts (id, author_id, body, media_ref, created_at)   -- social feed (later phase)
news_items (id, kind, facts_json, text, created_at)
world_state (world_id, game_time, weather, market_json, active_events_json)
event_log (id, created_at, actor_id, action, payload_json, result_json)   -- append-only
reports / bans (moderation)
```

**Content data** (not DB rows; versioned in repo, loaded at start): `jobs`, `careers`, `items`, `businesses`, `properties`, `storylets`, `npc_templates`, `schedules`, `skills`, `traits`, `locations`, `lot_layouts`.

Example job (data-driven):

```json
{
  "id": "mechanic_apprentice",
  "name": "Apprentice Mechanic",
  "career": "mechanic",
  "tier": 0,
  "wagePerShift": 4500,
  "requires": { "skills": { "mechanics": 5 }, "reputation": 0 },
  "locationTypes": ["garage", "workshop"],
  "skillGain": { "mechanics": 0.6, "negotiation": 0.1 },
  "needsCost": { "energy": 25, "hunger": 10, "hygiene": 12 },
  "promotion": { "to": "mechanic_junior", "requires": { "skills": { "mechanics": 20 }, "shiftsCompleted": 30 } }
}
```

## 9. World model & expansion

Hierarchy (every node is a data record with a stable id, parent, type, bounds and tags):

```
country → region → city → district → neighbourhood → street → building → lot (scene) → room/zone
```

- **Location-agnostic engine:** no code references "Lagos". The slice ships `content/world/ng/lagos-fictional/` as data.
- **Streaming unit:** a *district pack* (`districts/<id>.json` + atlas + lot layouts) loaded on demand; only the active district and adjacent map data are in memory. Cities are indexes of district packs.
- **Geographic data pipeline (future):** OpenStreetMap (ODbL, with attribution) → offline tool in `tools/geo` → abstracted district packs (road graph, zoning, building footprints simplified into archetypes) → procedural generation fills lot layouts from archetype kits. We never ship raw satellite imagery or proprietary map tiles.
- **Expansion path:** one district → one city → many cities → region → countries → continent. New places are new content packs plus (later) a travel system; the engine does not change.
- **Cross-city economy:** each city has local markets; goods, prices, and routes link them (Phase 6).

## 10. Asset strategy

| Category | Approach |
|----------|----------|
| **Hand-created** | Art direction/style guide, UI components and icons, key landmark lots, avatar base, logo/brand, writing (tone, Pidgin dialogue, storylets), sound identity. |
| **AI-generated + cleaned** | Props, textures, backgrounds, clothing variants — always passed through a cleanup step (palette lock, style guide, human review). Licence/ToS of each tool recorded in `docs/ASSET_PIPELINE.md` before shipping. |
| **Procedural** | Lot fill (props placement), NPC names/appearance, crowds, weather particles, signage text, minor building variation from archetype kits. |
| **Data-driven** | Jobs, items, businesses, storylets, NPC templates, schedules, locations, prices. |
| **Geographic data** | OSM-derived road/zone abstractions (future). |
| **Downloaded / streamed** | Initial bundle: app shell + UI + first lot. Everything else (other lots, avatar part packs, audio, district packs) lazy-loaded from CDN with content-hashed filenames and long cache. |

Asset pipeline: `assets-src/` (source files) → `tools/assets` (pack atlases, compress to WebP/AVIF, generate manifests) → `apps/client/public/assets/<hash>/` → manifest consumed by the loader.

## 11. Responsive strategy

One codebase and one set of accounts. UI is DOM; world is canvas. Layouts switch on container size, not device sniffing.

| Device | Layout |
|--------|--------|
| **Mobile (≤ 640px)** | Full-screen world; bottom nav (Home · World · Phone · Jobs · Inventory · Social); slide-up sheets; phone app is a full-screen overlay; thumb-reachable actions; pinch-zoom and drag-pan camera; condensed needs bar. |
| **Tablet (641–1024px)** | World + collapsible side panel; phone as a docked panel; bottom or side nav. |
| **Laptop/Desktop (≥ 1025px)** | World with persistent side panels (dashboard, goals, notifications), phone docked on the right, mini-map, hotkeys, hover tooltips. |

Rules: touch targets ≥ 44 px, no hover-only interactions, safe-area insets, reduced-motion setting, and render-quality tiers (low/medium/high) auto-selected by frame time.

## 12. Security & anti-cheat

- JWT (Supabase) verified on WS connect; short-lived; re-checked on reconnect.
- Postgres RLS on Supabase tables as a second defence; the game server uses a service role only server-side.
- All inputs validated with Zod; unknown fields rejected; message size limits.
- Rate limits per action, per character, per IP; velocity checks on movement.
- Ledger audit, anomaly alerts (earnings/hour thresholds), admin tools for freeze/rollback via event log.
- Chat: profanity filter, report/mute/block, admin review queue, rate limits.
- Privacy: minimal PII, 18+ attestation, data-export/delete flow (later).

## 13. Repository structure

```
TheLife/
├─ docs/                      # this documentation set
├─ apps/
│  ├─ client/                 # React + Vite PWA
│  │  └─ src/{ui,render,net,state,audio,i18n,pwa}
│  └─ server/                 # Fastify + WS game server
│     └─ src/{gateway,actions,systems,sim,persistence,ai,admin,jobs}
├─ packages/
│  ├─ shared/                 # types, Zod schemas, protocol, constants
│  ├─ game-core/              # pure gameplay logic (needs, jobs, storylets, ledger)
│  └─ content-schema/         # Zod schemas for content files + validator CLI
├─ content/
│  ├─ world/ng/lagos-fictional/   # country/city/district/lot data
│  ├─ jobs/  careers/  items/  businesses/  properties/
│  ├─ storylets/  npcs/  schedules/  skills/  traits/
│  └─ i18n/  (en, pcm)
├─ assets-src/                # source art (not shipped directly)
├─ tools/{assets,geo,content-validate,seed}
├─ supabase/{migrations,seed.sql}
├─ .github/workflows/         # CI: lint, typecheck, test, content-validate
└─ package.json  pnpm-workspace.yaml  tsconfig.base.json
```

### Coding conventions
- Readable over clever; small modules; no giant files/functions; clear names.
- `game-core` is pure and has no imports from `apps/*`.
- Every new action: Zod schema in `shared`, handler in `server/actions`, rule in `game-core`, test in `game-core`.
- Comments only where they add real value.
- Migrations are append-only; never edit applied ones.

## 14. Key risks & mitigations

| Risk | Mitigation |
|------|-----------|
| 3D art/rigging cost blows the plan | Asset lab first with a strict budget; one shared skeleton; parametric/kit parts; reuse CC0/licensed assets where possible; polish after fun is proven. |
| AI art inconsistent / licence uncertainty | Style guide + palette lock + cleanup pass; record licences; keep placeholders swappable via atlas manifests. |
| Economy exploits ("trillionaire" bugs) | Ledger + audits + server authority from commit one; rate limits; admin rollback. |
| Offline sim unfair or exploitable | Bounded catch-up, safety rails, summary screen. |
| Scope creep ("all and more") | Roadmap gates; each milestone must be fun before the next starts. |
| Mobile performance | Small lots, baked layers, quality tiers, perf budget checked in CI-ish manual device tests each milestone. |
| AI cost/safety | Per-day caps, caching, filters, template fallback; AI never mutates state. |
| Supabase as sole backend | Used for DB/Auth/Storage only; the live loop is a Node server (Supabase functions can't hold a game loop). |
