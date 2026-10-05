# @thelife/server

The authoritative multiplayer server. One process holds one shared world (a `Room`); clients connect over WebSockets
(`packages/shared/src/net.ts` is the protocol) and only send what they want to do. The server checks everything.

## Run it locally

```
pnpm --filter @thelife/server start          # port 8787
curl localhost:8787/health
```

In the game open `#/map`, press **Go online**, enter a name and `ws://localhost:8787`.

## Deploy to Fly.io (one cheap machine)

1. Install flyctl and `fly auth login`.
2. From the repository root: `fly launch --no-deploy --copy-config` (keeps `fly.toml`), then `fly deploy`.
3. Set `ALLOWED_ORIGINS` in `fly.toml` to your website address, for example `https://thelife.vercel.app`, and redeploy.
4. In Vercel add the environment variable `VITE_SERVER_URL=wss://thelife-server.fly.dev` and redeploy the website.

## What the server enforces

- Names are cleaned and made unique; at most 50 players per room.
- Moves: inside the map, no faster than a running player, never into walls on the ground floor, no big jumps up or down.
  Anything else snaps the player back (`correct`).
- Money lives in the double-entry ledger (`@thelife/game-core`); payments cannot overdraft or be sent to yourself.
- Rate limits per player on chat, payments, moves and voice signalling.
