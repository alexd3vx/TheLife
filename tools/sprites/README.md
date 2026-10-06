# Sprite baker

Turns the 3D models into painted isometric sprites for the 2.5D game.

1. `pnpm --filter @thelife/client dev` (dev server on :5173)
2. `PLAYWRIGHT_FROM=<a path that can resolve playwright-core> node tools/sprites/bake.mjs props [id,id]`  (furniture)
3. `node tools/sprites/bake.mjs char [clip,clip]`  (the character, 8 directions)
4. `cd tools/assets && cp ../sprites/to-webp.mjs ./x.mjs && node x.mjs && rm x.mjs`  (PNG to WebP, 85% smaller)
