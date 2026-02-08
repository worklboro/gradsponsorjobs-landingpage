# Gradsponsor Jobs

Production-ready static landing page for gradsponsorjobs.com (waitlist version), with a Cloudflare Worker proxy for secure waitlist submissions.

## Files

- `index.html`
- `privacy.html`
- `terms.html`
- `assets/css/main.css`
- `assets/js/main.js`
- `cloudflare/worker/worker.js`
- `cloudflare/worker/wrangler.toml`

## Architecture (Phase 1)

- GitHub Pages hosts the static site.
- Frontend submits waitlist data to `POST /api/waitlist` (same-origin).
- Cloudflare Worker intercepts `/api/*` and handles `/api/waitlist`.
- Worker validates/sanitises the payload and forwards it to SheetDB using a secret env var.
- The SheetDB endpoint never appears in client-side JavaScript.

## Environment variables

Set this as a Cloudflare Worker secret:

- `SHEETDB_ENDPOINT`
  - Full URL, for example: `https://sheetdb.io/api/v1/xxxxx`
  - Set with: `wrangler secret put SHEETDB_ENDPOINT`

## Local development

Static site:

- Open `index.html` directly, or run a simple static server from repo root:
  - `python3 -m http.server 8080`

Worker:

1. Install Wrangler (once):
   - `npm i -g wrangler`
2. From `cloudflare/worker/`, run:
   - `wrangler dev`

To test the API endpoint directly:

```bash
curl -i -X POST http://localhost:8787/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{
    "full_name":"Alex Khan",
    "email":"alex@example.com",
    "current_status":"Graduate",
    "target_role_category":"Software / IT",
    "preferred_location":"London",
    "sponsorship_need":"Yes — I need sponsorship",
    "notes":"Looking for graduate software roles.",
    "consent":true,
    "website":""
  }'
```

## Deploy (GitHub Pages + Cloudflare Worker)

### 1) GitHub Pages (static site)

This repo is a plain static site. Enable GitHub Pages on the repository and point it at your default branch/root as desired.

### 2) Cloudflare (DNS + Worker routes)

Cloudflare must be authoritative DNS for your zone (nameservers set to Cloudflare).

#### DNS records for GitHub Pages

Create these DNS records (GitHub Pages):

- `A` record for `@` → `185.199.108.153` (DNS only)
- `A` record for `@` → `185.199.109.153` (DNS only)
- `A` record for `@` → `185.199.110.153` (DNS only)
- `A` record for `@` → `185.199.111.153` (DNS only)
- `CNAME` for `www` → `<your-github-username>.github.io` (DNS only)

Note: Worker routes only run on traffic that passes through Cloudflare (proxied/orange-cloud). If requests bypass Cloudflare, `/api/*` will 404 from GitHub Pages.

#### Worker routes (map to the Worker)

In Cloudflare Dashboard → Workers & Pages → Workers → Routes, add:

- `gradsponsorjobs.com/api/*`
- `www.gradsponsorjobs.com/api/*`

### 3) Deploy the Worker

From `cloudflare/worker/`:

1. `wrangler login`
2. `wrangler secret put SHEETDB_ENDPOINT`
3. `wrangler deploy`

See `cloudflare/worker/README.md` for the full Worker setup and testing commands.

## Healthcheck

If Cloudflare routing is correct, this should return JSON from the Worker:

- `GET https://gradsponsorjobs.com/api/test`

## API behaviour (`POST /api/waitlist`)

- Validates required fields and basic email format.
- Sanitises inputs (trim whitespace, remove `<`/`>`, apply max lengths).
- Honeypot (`website`) submissions return `204 No Content`.
- On upstream timeout or failure, returns `502` with a friendly message (fail closed).

## Security headers

Vercel-style security headers are archived in `archive/vercel/vercel.json`.

If you want equivalent headers on Cloudflare, use:

- Cloudflare Dashboard → Rules → Transform Rules → **HTTP Response Header Modification**

Recommended header set:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

HSTS should only be served over HTTPS in production.

## Legal pages

- Privacy Policy: `/privacy.html`
- Terms of Use: `/terms.html`

Consent text on the waitlist form links to both pages.

## Contributing / Security

- `CONTRIBUTING.md`
- `SECURITY.md`

## Legacy (Vercel)

Previous Vercel serverless implementation is archived under `archive/vercel/` for reference only.
