# Gradsponsor Jobs

Production-ready static landing page for gradsponsorjobs.com (waitlist version).

## Files

- `index.html`
- `assets/css/main.css`
- `assets/js/main.js`

## SheetDB setup

This landing page submits the waitlist form to SheetDB via `fetch` (JSON).

1. Create a SheetDB API for your Google Sheet.
2. Open `assets/js/main.js` and replace:

```js
const SHEETDB_ENDPOINT = "https://sheetdb.io/api/v1/YOUR_SHEETDB_ID";
```

with your real endpoint ID.

### Payload format

The request payload is:

```json
{
  "data": [
    {
      "full_name": "Alex Khan",
      "email": "you@example.com",
      "university_or_status": "International student (currently in the UK)",
      "target_role_category": "Software / IT",
      "preferred_location": "London",
      "sponsorship_need": "Yes — I need sponsorship",
      "notes": "Optional text…",
      "consent": "yes",
      "submitted_at": "2026-01-25T12:34:56.000Z"
    }
  ]
}
```

## Anti-spam + consent

- Honeypot field: a hidden input named `website`. If it’s filled, the submission is ignored.
- Consent checkbox: required before submission.

## Edit the copy

All landing page copy lives in `index.html`.

## Hosting (static)

You can host this as a static site on:

- Netlify (drag-and-drop or git-based deploy)
- Vercel (static deploy)
- GitHub Pages (serve from `main`/`docs` depending on your setup)
- IIS (serve the folder as static content)

No build step is required—this is plain HTML/CSS/JS.

## Contributing / Security

- `CONTRIBUTING.md`
- `SECURITY.md`
