# Gameplay Systems

How the life simulation works. The rules live in `packages/game-core` (pure TypeScript, unit-tested, no rendering) so the same code runs offline in the browser now and on the authoritative server later. The play screen (`apps/client/src/play`) only draws the result and moves the character.

## The loop

NEED → DECISION (tap something) → ACTION (time passes, the body animates) → RESULT (needs, money, skills change) → CONSEQUENCE (warnings, rent, collapsing) → NEW OPPORTUNITY.

## Time

- One game minute passes per real second while walking around.
- Long activities skip time: sleeping runs at 40 game-minutes per second (a full night is about 10 real seconds), working at 8, a meal at 4. The numbers are data in `actions.ts`.
- The world clock drives the sun, the sky and the house lights (dusk at ~18:00, night from ~20:00).
- Time keeps passing while you're away (see "While you were away").

## Needs

Five needs, each 0-100 (100 is good):

| Need | Falls per hour | Restored by |
|------|----------------|-------------|
| Hunger | 4.2 | snack, cooked meal |
| Energy | 3.6 | sleep (decay stops while sleeping) |
| Hygiene | 2.2 | shower (full), brushing teeth (a little) |
| Bladder | 6.5 | toilet |
| Fun | 3.0 | TV, radio (dancing), reading |

**Mood** is a weighted average (energy 30%, hunger 25%, fun 20%, hygiene 15%, bladder 10%). **Performance** (0.5-1.2) is derived from mood, with extra penalties for being exhausted or starving, and multiplies work pay.

### Consequences

- A need below 25 triggers a warning once per dip.
- Energy under 30 or hunger under 10 slows walking; energy under 15 slows it more.
- Hunger at 0 drains energy faster.
- Bladder at 0: an accident (hygiene and fun drop, bladder resets).
- Energy at 0: the character collapses and sleeps where they stand for several hours.
- Work pay is lower when miserable; work refuses to start when too tired.

Actions refuse to start with a clear reason: "You're not hungry", "The fridge is empty. Order groceries first.", "You're not tired enough to sleep.", and so on.

## Activities (data in `packages/game-core/src/actions.ts`)

| Action | Where | Time | Effect |
|--------|-------|------|--------|
| Snack | fridge | 10 min | uses 1 portion, hunger +25 |
| Cook | stove | 30 min | uses 2 portions, makes 1 meal |
| Eat a meal | any dining chair or the table | 25 min | uses 1 meal, hunger +65 |
| Watch TV | sofa, armchair, TV | 60 min | fun +32 |
| Sit | any chair, stool, bench, ottoman | 30 min | energy +6, fun +2 |
| Dance to the radio | radio | 30 min | fun +16 |
| Read | bookshelf | 45 min | fun +20, knowledge skill |
| Work | desk, monitor, laptop, keyboard | 2 h | earns ₦1,200/h × performance × skill; energy -14, fun -10; computer skill |
| Sleep | bed, nightstands | until rested | energy to 100 |
| Toilet | toilet | 6 min | bladder full |
| Shower | shower | 15 min | hygiene full |
| Brush teeth | bathroom sink, mirror | 3 min | hygiene +8 |

Cancelling an activity keeps the effects so far (and the ingredients used), but a cooked meal is only made if you finish.

Skills grow by doing: computer skill raises work pay by 8% per level.

## Money

- **Double-entry ledger** (`ledger.ts`): every change is a transfer between two accounts (`player`, `mint`, `sink`). The sum of all accounts is always 0, the player can never go below ₦0, and a saved game whose ledger doesn't balance is rejected. This is the base for the audit and anti-cheat rules in `TECH_ARCHITECTURE.md`.
- New money enters only from the mint (starting grant, wages); spending goes to the sink (groceries, rent).
- Start: ₦12,000. Groceries ₦1,800 for 6 portions. **Rent ₦14,000 every 7th day at 08:00**, taken automatically when there is money. If you can't cover it: a ₦1,000 late fee, the debt stays, and two missed weeks bring an eviction warning.
- The starting money alone can't cover the first rent, so the first week requires working. A test checks that an ordinary week of work, food and sleep earns the rent.

## While you were away

On reopening the game, time catches up (1 real minute = 1 game minute, up to 12 hours). Needs fall at half speed and stop at a floor, nothing dramatic happens (no accidents, no collapsing), rent still falls due, and a "While you were away" panel summarises it.

## Saving

The whole `GameState` is saved on the device every few seconds and when the page is hidden. Loading validates everything: missing or out-of-range values fall back to defaults, and a ledger that doesn't sum to zero rejects the save.

## Adding content

- **New activity:** add an entry to `ACTIONS`, add a clip if needed, point a piece of furniture at it in `play/layout.ts`.
- **New furniture:** add the model (`tools/assets/sources.mjs` + asset build, or a builder in `furniture/procedural.ts`), add an entry to `packages/game-core/src/catalog.ts` (name, price, action), then place it in a layout. Open `#/showroom` and run the tests to check it works.

## How the body moves (animation director)

The controller (`play/controller.ts`) adds life on top of the clips:

- **Eased movement:** speed ramps up and down (no instant starts or stops), slows in time to stop exactly at the target, and the walk/jog clip speed follows the real ground speed. Turning mostly happens on the spot before setting off.
- **Head tracking:** the head turns toward where it is going (the next waypoint), toward the thing being used (the fridge, or the TV when watching from the sofa), and glances around now and then while standing or resting.
- **Blinking** every few seconds.
- **Body language from needs:** while standing idle the character yawns and stretches when tired, rubs their stomach when hungry, fidgets when they need the toilet.
- **Getting into bed:** walk to the side, sit on the edge with the real sitting clip, lie back; getting up reverses it.

## Furniture and prices

Every piece of furniture is a catalog item with a price in naira (a Plastic chair ₦6,500, a Two-seat leather sofa ₦185,000, a Refrigerator ₦290,000...). Players will buy and place them with the shop and home-building tools in a later stage; for now the test house and the showroom use the catalog directly. The catalog also decides what each piece lets you do (sofa and armchairs: watch TV; any chair: sit; bed: sleep; fridge: snack; stove: cook; toilet, basin, shower; boombox or radio: dance; bookshelf: read; desk or laptop: work).
