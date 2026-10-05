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
