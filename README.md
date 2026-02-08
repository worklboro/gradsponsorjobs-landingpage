# Gradsponsor Jobs

Production-ready static landing page for gradsponsorjobs.com (waitlist version), now with a Vercel serverless proxy for secure submissions.

## Files

- `index.html`
- `privacy.html`
- `terms.html`
- `assets/css/main.css`
- `assets/js/main.js`
- `api/waitlist.js`
- `vercel.json`

## Architecture (Phase 1)

- Frontend submits waitlist data to `POST /api/waitlist`.
- Serverless function validates, sanitises, rate limits, and applies duplicate cooldown checks.
- Function forwards valid payloads to SheetDB using a server-side environment variable.
- SheetDB endpoint is no longer exposed in client-side JavaScript.

## Environment variables

Set this in Vercel Project Settings (Environment Variables):

- `SHEETDB_ENDPOINT`
  - Full URL, for example: `https://sheetdb.io/api/v1/xxxxx`

## Local development

1. Install Vercel CLI (once):
   - `npm i -g vercel`
2. From project root, start local dev:
   - `vercel dev`
3. Open the local URL shown by Vercel CLI.

To test the API endpoint directly:

```bash
curl -i -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{
    "full_name":"Alex Khan",
    "email":"alex@example.com",
    "current_status":"International student (currently in the UK)",
    "target_role_category":"Software / IT",
    "preferred_location":"London",
    "sponsorship_need":"Yes — I need sponsorship",
    "notes":"Looking for graduate software roles.",
    "consent":true,
    "website":""
  }'
```

## Deploy to Vercel

1. Import this repository into Vercel.
2. Add `SHEETDB_ENDPOINT` in project environment variables.
3. Deploy.

## API behaviour (`POST /api/waitlist`)

- Validates required fields and allowed option values.
- Sanitises inputs (strip HTML tags, trim whitespace, apply max lengths).
- Honeypot (`website`) submissions return `204 No Content`.
- Rate limit: 10 requests per 10 minutes per IP (best effort).
- Duplicate cooldown: same email blocked for 24 hours (best effort).
- On SheetDB timeout or failure, returns `502` with a friendly message.

## Phase 1 limitations

The rate limiter and duplicate cooldown use in-memory Maps in the serverless runtime. This is intentionally lightweight and best effort:

- State is not guaranteed across cold starts.
- State is not shared globally across all regions/instances.

Recommended Phase 2: move rate-limit and duplicate state to durable storage (for example Upstash Redis or Vercel KV).

## Security headers

Configured in `vercel.json`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Content-Security-Policy` with Google Fonts support and `frame-ancestors 'none'`
- `Strict-Transport-Security`

HSTS should only be served over HTTPS in production. Vercel production deployments are HTTPS by default.

## Legal pages

- Privacy Policy: `/privacy.html`
- Terms of Use: `/terms.html`

Consent text on the waitlist form links to both pages.

## Contributing / Security

- `CONTRIBUTING.md`
- `SECURITY.md`
