# Cloudflare Worker (API proxy)

This Worker handles `POST /api/waitlist` and forwards validated submissions to SheetDB using a **secret** environment variable. The SheetDB endpoint never appears in the client-side JavaScript.

## What it does

- Accepts `POST /api/waitlist` with JSON
- Honeypot: if `website` is present and non-empty, returns `204 No Content` (silent)
- Validates required fields and basic email format
- Sanitises strings (trim, remove `<`/`>`, max lengths)
- Adds `submitted_at` server-side
- Forwards to SheetDB using `SHEETDB_ENDPOINT` (Worker secret)

## Deploy

1. Install Wrangler:
   - `npm i -g wrangler`
2. Login:
   - `wrangler login`
3. From this directory (`cloudflare/worker/`), deploy:
   - `wrangler deploy`

## Secrets

Set the secret (run from `cloudflare/worker/`):

- `wrangler secret put SHEETDB_ENDPOINT`
  - Value: your SheetDB endpoint URL (for example `https://sheetdb.io/api/v1/XXXXX`)

## Cloudflare routing (critical)

Cloudflare must be authoritative DNS for your zone (nameservers set to Cloudflare).

### DNS records for GitHub Pages

Create these DNS records:

- `A` record for `@` → `185.199.108.153` (DNS only)
- `A` record for `@` → `185.199.109.153` (DNS only)
- `A` record for `@` → `185.199.110.153` (DNS only)
- `A` record for `@` → `185.199.111.153` (DNS only)
- `CNAME` for `www` → `<your-github-username>.github.io` (DNS only)

Note: Worker routes only run on traffic that passes through Cloudflare (proxied/orange-cloud). If requests bypass Cloudflare, `/api/*` will 404 from GitHub Pages.

### Worker routes

In Cloudflare Dashboard → Workers & Pages → Workers → Routes, add:

- `gradsponsorjobs.com/api/*`
- `www.gradsponsorjobs.com/api/*`

Map both routes to this Worker.

## Failure mode (fail closed)

- If the Worker is misconfigured (missing `SHEETDB_ENDPOINT`) or the upstream call fails/times out, the Worker returns `502` with a generic friendly message.
- Non-`POST` methods are rejected (`405`), and unknown `/api/*` paths return `404`.

## Testing

### Test via workers.dev (after deploy)

```bash
curl -i -X POST "https://<your-worker>.<your-subdomain>.workers.dev/api/waitlist" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name":"Alex Khan",
    "email":"alex@example.com",
    "current_status":"Graduate",
    "target_role_category":"Software / IT",
    "preferred_location":"London",
    "sponsorship_need":"Yes — I need sponsorship",
    "notes":"Looking for graduate roles.",
    "consent":true,
    "website":""
  }'
```

### Test via your domain (after routes are active)

```bash
curl -i -X POST "https://gradsponsorjobs.com/api/waitlist" \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test","email":"test@example.com","current_status":"Graduate","target_role_category":"Software / IT","preferred_location":"London","sponsorship_need":"Not sure","notes":"","consent":true,"website":""}'
```

## Security headers (optional)

If you want Vercel-like security headers on Cloudflare, use:

- Cloudflare Dashboard → Rules → Transform Rules → **HTTP Response Header Modification**

Recommended headers (from the legacy `vercel.json`):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
