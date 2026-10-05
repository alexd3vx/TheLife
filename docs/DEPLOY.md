# Deploying: Vercel (website), Fly.io (game server), Supabase (accounts)

## 1. Supabase (accounts)
Already created. In the project: **Authentication → URL Configuration**: set *Site URL* to your Vercel address (for example
`https://thelife.vercel.app`) and add it under *Redirect URLs*. For a quick first test, turn off **Authentication → Providers → Email → Confirm email**
so sign-up works without waiting for a mail. The URL and the **anon** key are public by design; never put the service-role key in the client.

## 2. Fly.io (game server)
From the repository root, with flyctl installed and logged in (`fly auth login`):

```
fly launch --no-deploy --copy-config --name thelife-server   # keeps fly.toml
fly deploy
curl https://thelife-server.fly.dev/health                   # {"ok":true,...}
```
Then set `ALLOWED_ORIGINS` in `fly.toml` to your Vercel address(es), comma separated, and `fly deploy` again.

## 3. Vercel (website)
Import the GitHub repository in Vercel (the repo's `vercel.json` already sets the build). Add these **Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | the Supabase anon key |
| `VITE_SERVER_URL` | `wss://thelife-server.fly.dev` |

Redeploy after changing variables (they are baked in at build time). Open `https://<your-site>.vercel.app/#/map`, press **Go online**, and share the link.

## 4. Test with friends
Everyone opens the same Vercel link, goes to `#/map`, taps **Go online**, picks a name. Up to 50 players per room. Check `/health` on the game server for the player count.

## Free / cheap alternatives to Fly.io (Fly needs a card)
- **Render (free, no card)**: dashboard -> New -> Blueprint -> pick this repo (`render.yaml`). The address is `wss://thelife-server-xxxx.onrender.com`.
  The free service sleeps when idle; the first connection after a while takes about a minute.
- **Your own VPS (LemeHost etc.)**: as root on Ubuntu/Debian run `curl -fsSL https://raw.githubusercontent.com/alexd3vx/TheLife/claude/hopeful-lovelace-20wkdq/deploy/vps-setup.sh | bash`.
  It prints the `wss://<ip>.sslip.io` address (free HTTPS). Open ports 80 and 443 in the VPS firewall.
- **Your own computer, today, free**: `pnpm --filter @thelife/server start`, then `cloudflared tunnel --url http://localhost:8787` prints an `https://....trycloudflare.com` address;
  use `wss://....trycloudflare.com` in "Go online". Works while your computer is on.
In every case, type the address into **Go online -> Server** (it is remembered), or set `VITE_SERVER_URL` in Vercel and redeploy.
