# Next steps after the walkable interiors (draft 1, 7 Oct 2026)

Written after the owner's long list of wishes. It builds on `MASTER_PLAN.md` (the 40 answered questions there still stand: real OSM Lagos, server authority, real-time clock, Zomboid-style survival, realistic characters, ads for revenue) and `ROADMAP.md` (old stage history); it only adds what is new. It is a plan to argue with, not a promise. Anything marked **ASK** waits for the owner's answer (questions are asked four at a time; answers are recorded in the last section).

## 1. Honest opinion

1. **The vision is big and good, and it is more than one person-year of work if everything is "real".** Real cars with interiors, real hair and clothes, a believable Lagos with bridges and water, voice calls, banking, survival mechanics and social media each cost months if built to a high standard. Doing all of them at 70% quality gives a game nobody loves. Doing five of them at 95% gives a game people tell friends about.
2. **Pick one slice that proves the feeling, then widen.** The slice I suggest: *one neighbourhood (Yaba or Lekki), 15 enterable places, one home, one bank, one vehicle ride, ten real people online at once, a full day of life that feels like Lagos.* Everything on this page is ordered to reach that slice first.
3. **"Real" and "game-like" fight each other.** (The master plan says "realistic but optimised"; the owner now points at a colourful low-poly reference for the map, so this needs one clear answer.) The reference game (lagoslife.app) is deliberately low-poly and colourful and runs on a phone. Our characters are realistic, which makes any mismatch (a flat box building next to a real person) look worse, not better. Decide the visual rule once: *realistic people on stylised, colourful, believable buildings* is the combination that works and stays fast. This is the first question below.
4. **Stay on the web for now.** Moving to Godot (my earlier advice) still does not pay: the work that is missing is art, content and rules, not the engine. The two things that would justify a move later are native mobile builds and a bigger world; neither is blocking.
5. **The biggest risk is assets, not code.** Every building exterior, interior, vehicle and hairstyle needs a model. Free CC0 packs (Kenney, Quaternius, Poly Pizza, KayKit) cover generic things; Lagos-specific things (danfo, keke, molue, Eko Bridge, market stalls, gele, Ankara) will need to be made or commissioned. Budget for a modeller, or plan to build a small kit of modular pieces we can recombine.
6. **Money features (send money, bank, accounts, PIN) are game rules, not real money.** Keep it that way; it keeps the game legal and the economy under our control. Real-money top-ups, if ever wanted, are a separate decision with legal weight.

## 2. What lagoslife.app does (researched 7 Oct 2026)

Public pages, plus a throw-away account (name, username, password; email was optional and not used).

- Low-poly isometric world, bright colours, 3D buildings with an emoji pin per place; billboards everywhere (₦250k per 7 days ad slots are the business model). Counters for "online" and "visits".
- Sign-up in one screen; **5-step creator**: Look (body, hair, outfit, fabric, colours), Personality (pick 2 traits), Dream, Birth lottery (LAPO baby etc.), Home (student hostel, Mushin face-me-I-face-you, etc.).
- Top bar: time, mood, sound, money with "+" ; side chips: gov news ("NEPA cuts shorter by Governor…"), daily gem hunt, "clean screen" toggle; bottom: needs row (6 icons), nav Home / Buy / Map / Phone.
- Home is a small isometric room with the character; **Buy mode** with a category catalogue and prices (₦500 chair to ₦650,000 air conditioner).
- Map: chips Moving / Ads / Homes / Sea / Gov / Walk; city tabs Lagos / Port Harcourt / Abuja; pins with icons and "1000+" shop badges.
- Phone: Jobs, Messages (Chats, Updates, Groups), Contacts, Ride, Chowdeck (food), Bank, Boutique, Forbes, Houses, Cars, Invite, Health, Invest, LagosBet, Family, Staff, Hustle, Bus Co., Company, Shops, Lagos Gist, Lagos Gov, Police, My Ads, Settings.
- Chat actions with a friend: Invite over, Visit them, Send money, Request money, Buy food, Companies, Block, Report.
- Things they do that we do not: ad billboards, city tabs, gov events, family and staff, companies, betting and investing, group chats.
- Things we do that they do not: realistic characters, real-clock Lagos, a server-run economy with a ledger, real OSM streets, walkable interiors with people.

## 3. Known problems (from the owner's list) and what to do

| # | Problem | Cause (found or suspected) | Plan |
|---|---|---|---|
| 1 | New-player cutscene is 2D and not nice | `arrival/filmCanvas.ts` draws it on a 2D canvas | Rebuild as a real 3D scene with the player's own character (Phase 1) |
| 2 | Character in the street differs from home | Street used the look saved on the device; home used the look kept with the life | **Fixed 7 Oct:** street now uses the life's look |
| 3 | Room and toilet are small; player can reach them only by going outside and through walls; no collision | Home layout and wall collision | Redo home plans with proper door gaps and bigger rooms, add wall collision to the 3D home (Phase 1) |
| 4 | Leaving an interior puts you at the front of the building | Exit reuses the street position | Put you on the doorstep facing out, with a door-open/close transition and camera hand-off (Phase 2) |
| 5 | LifeGram and the social apps do not work | Stubs | Real social stack (Phase 3) |
| 6 | Hair and clothes do not look real | Asset quality | Asset pass: hair cards/meshes, cloth materials, fit (Phase 5) |
| 7 | Map is flat, water has no depth, bridge looks wrong | City map is drawn flat; terrain and water shader are basic | Map overhaul: extruded buildings, water shader with depth and foam, real bridges (Phase 2) |
| 8 | Bank UI should be realistic (account opening, form, ATM card and PIN, real ATM screen) | Current sheet is a simple menu | Bank rework (Phase 4) |
| 9 | LifePay too strong, bank too weak | Phone banking does almost everything | Nerf LifePay (limits, fees, no loans), buff the bank (accounts, cards, transfers, loans, savings plans) (Phase 4) |
| 10 | Phone numbers, voice calls, send money | Not built | Phase 3 |
| 11 | No Project-Zomboid-style mechanics | Not designed | Design first (Phase 6): moodles, injuries, illness, nutrition, weather, noise, skills, crafting |
| 12 | Vehicles with real interiors | Not built; waiting on a model | After Phases 1-4 (Phase 7) |

## 4. Phases (in order)

**Phase 0: Stabilise (this week).** Fix the small things above (#2 done). Keep the development log current. Deploy checklist for the VPS. Basic automated smoke test: sign in, walk, enter a place, leave.

**Phase 1: A home and a start that feel real.** Real 3D new-player film; bigger homes with real doors and collision; character creator that matches the world exactly; hair and outfit shown correctly everywhere; first-day tutorial through play.

**Phase 2: A believable Lagos.** Map overhaul (3D buildings with height and colour, water with depth, real bridges: Third Mainland, Eko, Carter, Ikoyi Link, Lekki-Ikoyi cable-stayed), landmark set (the real ones, game-styled), exterior-to-interior continuity (door transitions), time-of-day and weather, performance budget per device class.

**Phase 3: Social.** Player numbers and a contacts list, friend requests, chat with presence, LifeGram (posts, likes, stories, comments), voice calls over WebRTC with the server only doing signalling, invite friends home, visit them, in-app money transfer, groups.

**Phase 4: Money.** Bank rework (open an account with a form and ID, debit card, PIN, ATM screen like a real ATM, statements, transfers, loans, savings plans, fees), LifePay nerf, ledger audit tools for the owner.

**Phase 5: Assets.** One art direction, then: exteriors and interiors per place kind (kit of modular pieces), characters (hair, clothes, shoes), props, sound. Free packs first, commissioned Lagos pieces second.

**Phase 6: Survival and life depth.** Moodles (stress, boredom, hunger, thirst, illness), injuries and treatment at the hospital, weather and clothes, skills with real progression, crafting, noise and neighbours, crime and police response, NEPA outages and generators. Designed against the economy so it adds choice, not chores.

**Phase 7: Vehicles.** Danfo, keke, okada, taxi, own car: 3D exterior and interior, driving or ride-along, traffic. Only after the world and the money work.

## 5. Question backlog (asked four at a time)

Batch 1 (asked 7 Oct): visual rule, first slice, social priority, survival depth.

Drafted for later batches (not asked yet): camera (first/third person/isometric) per place; device targets and minimum phone; offline or always-online; one city or several; how many players per room; voice call quality and cost; moderation and reporting; age rating; whether real brands appear (GTBank, Total) or invented ones; ads and monetisation; accounts and ID verification; death and permadeath; time speed; crime; jobs list and promotions; companies owned by players; property ownership and rent between players; land and building by players; weather and seasons; religion events (Sunday service, Friday prayers, Ramadan); holidays; languages (Pidgin, Yoruba, Igbo, Hausa); music and radio; phone apps that should be real vs decorative; photography; sports; betting; education path; health and illness; pets; relationships, marriage and kids; ageing; inheritance; achievements; leaderboard; owner tools and live events; anti-cheat; save portability; data and privacy.

## 6. Decisions recorded

(Fill in as the owner answers.)
