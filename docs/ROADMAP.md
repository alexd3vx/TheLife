# Roadmap

Principle: **fun before feature count.** Each stage ends with something visible and a go/no-go check. Timeline assumes part-time solo work with AI assistance.

## Build order (revised Oct 2026)

Decided with the project owner: **offline single-player first, multiplayer later**, and **assets before gameplay** — models for faces, hair, bodies, clothing and props first, then animation and rigging so the Sims-style character layer is solid, then the map, then the main game.

**Risk to watch:** gameplay (and therefore "is it fun?") is now proven later. To contain that, every stage ends with a short playable demo moment, and stage 4 starts with the fun test before more content is added.

| Stage | Est. | Deliverable | Done when |
|-------|------|-------------|-----------|
| **0 — Foundation** (done) | — | Monorepo, auth page, offline "Play now" + device save, procedural 3D street scene (lighting, shadows, buildings, vehicles, people), docs. | Page runs on desktop and phone; offline and account flows work. |
| **1 — Asset Lab** | 2–3 wks | `/lab` viewer to inspect any asset (orbit, lighting presets, wireframe, stats). Asset spec + budgets. **Characters:** body base, ≥ 8 face shapes, skin tones, hair styles and colours, facial features, a first clothing set. **Props:** furniture and appliances, street furniture, vehicles, shop fixtures. Pipeline tool to validate/compress glTF against budgets. | A character can be assembled from parts and viewed from every angle; every asset passes the budget check. |
| **2 — Animation & Rigging** | 2 wks | One shared humanoid skeleton, clip library (idle, walk, run, sit, sleep, eat, talk, gestures, work actions), animation state machine, facial expressions via morph targets, clip retargeting. | A character walks to a chair, sits, eats, and talks in the lab, in any outfit/face combination. |
| **3 — The Map** | 2 wks | District layout data → 3D streets and lots, lot loader (interiors/exteriors), district map screen, click-to-travel, day/night cycle. | You can travel between 3–4 lots, and the world looks right at all times of day on a phone. |
| **4 — Main game (offline)** | 4–5 wks | Character creator + random starting background, needs, time, money ledger, 3 jobs, shops, home, vehicle, NPC schedules, storylets + relationship memories, notifications, phone, offline summary, AI news/NPC chat (capped). | **Fun test:** testers can play a full week of life and want to continue. |
| **5 — Multiplayer** | 3–4 wks | Supabase accounts + sync, authoritative server, lot instances, chat, friends, trade, moderation tools. Move the offline rules onto the server. | Two players meet, chat, trade, and one affects the other's day. |
| **6 — Playtest** | 1–2 wks | 30 invited testers, analytics (events only), bugfixes. | ≥ 10 of 30 return on day 3; median session > 15 min. |

Total estimate: roughly 14–18 weeks part-time; to be re-estimated at the end of stage 1, when asset cost is known.

### Asset sourcing plan (stage 1)
- Characters: parametric head/body/hair parts exported as glTF, using CC0 sources where licences allow (e.g. MakeHuman/Quaternius-style bases) plus our own authored variations for African features, hairstyles (braids, locs, afro, fade, wraps) and clothing (including Nigerian fashion).
- Props: modular kits authored in Blender or sourced from CC0 libraries, restyled to a common palette.
- Textures: procedural + AI-assisted, with cleanup and recorded licences.
- Every third-party asset is logged with its licence in `docs/ASSET_PIPELINE.md` before use.

### Stage exit decision
- **Success:** continue to the next stage.
- **Partial:** identify the loop that worked (economy? stories? social?) and double down; cut the rest.
- **Fail:** redesign the core loop before adding features.

### Progress snapshot (Oct 2026)
- **Stage 1 (Asset Lab):** done for a first version: CC0 bodies, hair, outfits, props, vehicles; procedural African hairstyles and modern clothing; budgets enforced. Gaps: skirts/long clothes, face variety, more realistic props/vehicles.
- **Stage 2 (Animation):** first pass done: 43 library clips + 8 everyday-life clips. Polish list in `ASSET_PIPELINE.md`.
- **Stage 3 (Map):** started with the **tap-to-walk prototype** (`#/play`): a small house with kitchen, dining, living, desk, bedroom and a yard; tap the floor to walk, tap furniture to cook, eat, sit, work or sleep. Next: a real district layout, lot loading, travel between lots, day/night.

## Later phases (from the project brief)

| Phase | Theme | Highlights |
|-------|-------|-----------|
| **2 — Social life** | Friends, relationships, messaging, social feed, reputation, groups, events, richer player interaction. |
| **3 — Economy** | Player/NPC businesses, banking, debt/loans/interest, markets with supply/demand, property market, investments, taxes. Player-run businesses open once the economy is stable. |
| **4 — World** | Larger city, multiple districts, travel modes (bus, taxi, okada, car), weather, traffic, power cuts, more NPC simulation, city events. Aging/death/generations switched on. |
| **5 — Society** | Organisations, politics (elections, governance), government policy affecting economy, news ecosystem, crime/law (investigation, courts, jail), large-scale events. |
| **6 — Regional expansion** | More Nigerian cities (real-geography district packs from open data), then other countries; cross-border travel and trade; multi-currency. |
| **7 — Continental** | Africa-scale content packs; the engine is unchanged. |
| **Monetisation (post-slice)** | In-game billboard ads, cosmetics, capped Naira top-up (weekly caps, worse value than earning). Never unlimited pay-to-win. |

## Ongoing tracks (every milestone)
- **Docs sync:** update `TECH_ARCHITECTURE.md`, `DATABASE.md`, `MULTIPLAYER.md`, `UI_SYSTEM.md`, `ASSET_PIPELINE.md`, `DEVELOPMENT_LOG.md` as decisions change.
- **Testing:** unit tests for game-core, schema validation for content, Playwright smoke tests.
- **Performance:** device checks on a mid-range Android phone each milestone.
- **Economy health:** ledger audit report each milestone.
- **Legal/safety:** AI art licence log, 18+ gate, moderation readiness, OSM attribution when geo data is used.

## Open items to resolve before M0
1. Final product name and domain.
2. Supabase project creation (you create the account/project; I provide the migrations and config).
3. Hosting account for the game server (Fly.io, Railway or Render).
4. AI art tool(s) you plan to use, so licences can be checked.
5. An LLM provider/API key for the AI features (needed by M6, not before).
