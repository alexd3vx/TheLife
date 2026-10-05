# Roadmap

Principle: **fun before feature count.** Each milestone ends with something playable and a go/no-go check. Timeline assumes part-time solo work with AI assistance; adjust after Milestone 1.

## Vertical slice (target: 6–8 weeks)

**Goal:** prove that "living a life in this world is fun" with ~30 testers.
**Scope:** one fictional mixed-zone district with 3–4 isometric lots, a character creator, random starting background, needs, time, money (ledger), inventory, 3 jobs, a few shops/businesses (NPC-run), a home, one vehicle, basic relationships + memories, storylets, basic multiplayer + chat, phone (messages, bank, jobs, news), notifications, persistence, offline summary.

| Milestone | Weeks | Deliverable | Go/no-go check |
|-----------|-------|-------------|----------------|
| **M0 — Foundation** | 0–1 | Monorepo, CI, Supabase project + migrations, auth, WS gateway, shared protocol, content schemas + validator, Hello-world isometric lot rendering on desktop + phone. | A logged-in user sees a lot and a moving avatar on a phone at ≥30 fps. |
| **M1 — A person in a room** | 1–2 | Character creator (layered avatar), random background roll, one home lot, needs + time system, inventory, first interactions (eat, sleep, wash), persistence + reload. | Close tab, reopen, same life. Needs affect outcomes in a visible way. |
| **M2 — Money & work** | 2–3 | Ledger, wallet/bank, 3 data-driven jobs, shifts with skill gain, rent due, shops (buy/sell), first "what to do now?" dashboard + goals. | A poor-roll player can reach rent via ≥2 different routes (job / trade / ask for help). |
| **M3 — The district** | 3–4 | District map + click-to-travel, 3–4 lots (home, workplace, shop, hangout), NPCs with schedules (LOD 0/1), basic vehicle/commute. | Players move through a day naturally; NPCs feel present. |
| **M4 — Consequence engine** | 4–5 | Storylet engine + ~40 storylets, personality effects, relationship memories, notifications, offline catch-up + "While you were away". | Two playthroughs of the same background diverge noticeably; testers retell a moment. |
| **M5 — Other people** | 5–6 | Real-time multiplayer on lots (instances), chat, phone messaging, friend requests, simple trade/gift, moderation tools (report/block/mute/filter/admin). | Two players meet, chat, trade, and one affects the other's day. |
| **M6 — Polish & AI** | 6–7 | AI news + NPC chat (capped + fallback), onboarding/first-10-minutes pass, art cleanup, sound, PWA install + push, performance pass. | New tester completes first goal in <10 min without help. |
| **M7 — Playtest** | 7–8 | Invite 30 testers, analytics (events only, no PII), feedback loop, bugfix sprint. | ≥10 of 30 return on day 3; median session >15 min. |

### Slice exit decision
- **Success:** proceed to Phase 2 with learned priorities.
- **Partial:** identify the loop that worked (economy? stories? social?) and double down; cut the rest.
- **Fail:** redesign the core loop before adding any features.

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
