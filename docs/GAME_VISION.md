# Game Vision & Locked Decisions

**Working title:** TheLife — a persistent multiplayer life simulator set in a living, expanding Nigeria (and later Africa).

**Fantasy:** Create a person. Build a life. Make choices. Experience consequences. Create your own story.

**Core loop:** NEED / GOAL → DECISION → ACTION → RESULT → CONSEQUENCE → NEW OPPORTUNITY → PROGRESSION → NEW GOAL.

**North-star metric:** "Does the player want to keep living this life?" — not feature count.

This is an original game. It is inspired by the *genre* (life sims, e.g. The Sims; browser life sims such as Lagos Life) but copies no assets, text, maps, or systems from any of them.

## Locked decisions (from the planning Q&A)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Differentiator | Long-term: systemic economy, relationship memory, expanding real-world map, deep life stories, player society. The vertical slice proves **economy + memory** first. |
| 2 | Audience | Nigeria + diaspora. English with Pidgin flavour. Culture is **Nigeria-wide** (Yoruba, Igbo, Hausa, etc.), Lagos is only the first district. |
| 3 | Age rating | 18+ at launch. |
| 4 | First district | Fully **fictional**, Lagos-inspired, mixed-zone (poor / middle / rich pockets). Data model supports real geography later. |
| 5 | View | Sims-style **isometric 2.5D** lots, click-to-move avatars, stylised vector art. District map for click-to-travel between lots. |
| 6 | Start | Character creator + **random starting background** (poor / medium / rich — "lapo" / "nepo") that shapes money, housing, contacts and responsibilities. A poor roll must always have viable paths. |
| 7 | Time | Hybrid: world clock runs in accelerated time; actions (work, sleep) can skip time. |
| 8 | Offline | Cheap offline simulation + "while you were away" summary. Safety rails: no permanent loss while offline. |
| 9 | Aging | Modelled in the data, **disabled** in the slice. |
| 10 | Events | Data-driven **storylets** (conditions → choices → consequences). |
| 11 | AI | AI-written news and NPC chat, behind a cost cap, cache, safety filter and template fallback. |
| 12 | Scale | Design for 5,000 concurrent, build/test for 200. |
| 13 | World | One logical world/economy, **instanced lots** (~100 players per instance). |
| 14 | Interaction | Real-time presence and chat on the same lot + asynchronous phone messaging/offers/trades. |
| 15 | Moderation | Report, block, mute, word filter, admin panel from day one. |
| 16 | Player-run systems | Late. NPC-run businesses/government first; open to players once the economy is stable. |
| 17 | Currency | Naira only. Double-entry ledger. |
| 18 | Monetisation | None in the prototype. Later: in-game billboard ads, cosmetics, and **capped** top-up (weekly caps, always worse value than earning). Never unlimited pay-to-win. |
| 19 | Platform | Browser-first installable PWA; desktop, tablet and mobile designed together. |
| 20 | Art | Stylised vector 2.5D. AI-generated assets with human cleanup, kit-based placeholders first. Licences checked before shipping. |
| 21 | Hosting | Managed platform (no VPS administration): Supabase (Postgres/Auth/Storage) + an always-on Node game server on Fly.io/Railway/Render. |
| 22 | Success (slice) | 30 testers, ≥10 return on day 3, median session >15 min. |
| 23 | Timeline | 6–8 weeks to a playable slice. |

## Design principles

1. **Choice → consequence.** Never "press work, get money" as the whole game; those are inputs to systems.
2. **Systems talk to each other.** Low sleep → worse work → fewer shifts → rent stress → events.
3. **The world moves without you.** Every login should answer "what happened while I was away?".
4. **No single correct life.** Multiple lifestyles must be viable from any starting background.
5. **Server is the truth.** Clients request; the server validates and commits.
6. **Content is data.** Jobs, items, businesses, events, NPCs, cities are data files, not code.
7. **Smallest thing that proves it's fun.** Build that, then expand.
8. **Ethical retention.** Players return because they want to see what happens, not because of manipulation.
