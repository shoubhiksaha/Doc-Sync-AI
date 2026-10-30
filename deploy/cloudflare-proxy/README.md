# Cloudflare proxy for DocSync AI

`docsync.analogdigital.tech` and `docsync-staging.analogdigital.tech` are served by Cloud Run in
Mumbai. Cloud Run can't attach a custom domain in that region, so this Worker, on ADT's
Cloudflare account (where the domain's DNS already lives), forwards each request to the right
Cloud Run service. The Workers free plan covers 100,000 requests a day.

## One-time setup

1. Pick a long random secret and give it to both sides. Run each line yourself so the value
   never appears in a chat or log:
   ```bash
   openssl rand -hex 32 | pbcopy
   npx wrangler login                      # sign in to ADT's Cloudflare account
   npx wrangler secret put PROXY_SECRET    # paste
   ```
   Then add `PROXY_SECRET=<the same value>` to `.env.staging.local` and `.env.production.local`
   and upload both with `scripts/gcp/push-env.sh` (see docs/RELEASE_FLOW.md).
2. Once the first staging deploy has finished, publish the Worker from this folder:
   ```bash
   npx wrangler deploy
   ```
   Staging is live at https://docsync-staging.analogdigital.tech straight away.
3. **Production cut-over** happens the moment the Worker is published: the route takes over
   `docsync.analogdigital.tech` from Vercel. Publish only after the production service exists
   (the first approved production deploy), or production shows a 404 from Cloud Run until it does.
   To undo, remove the route in Cloudflare → Workers → docsync-proxy → Settings → Domains & Routes,
   and the old DNS record serves Vercel again.

Add each domain's sign-in callback to the Google OAuth client
(`https://<domain>/api/auth/callback/google`), and, if Notion is connected,
`https://<domain>/api/auth/notion/callback` to the Notion integration.

## Why the secret

The app limits how often each IP address can call the AI and sync endpoints. Behind this Worker
every request arrives from a Cloudflare address, so the Worker passes the real one as
`x-real-ip`. The secret proves the header came from the Worker: without it, anyone calling the
`run.app` address directly could claim a new IP on every request.
