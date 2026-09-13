# TSKE Automax

Car dealership website: public inventory + WhatsApp appointment booking,
and an admin panel for managing listings. Data lives in Supabase.

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL it prints (usually http://localhost:5173).

## Before it works

Make sure, in your Supabase project (`tske-automax`):
1. `supabase-setup.sql` has been run in the SQL Editor
2. A **Storage** bucket named `car-images` exists and is set to **Public**
3. At least one admin user exists under **Authentication → Users** — that's
   the email/password your sister logs in with on the site

The Supabase Project URL and anon key are already filled in at the top of
`src/App.jsx`.

## Import existing listings from Facebook

If you've already got car posts on the TSKE Automax Facebook Page, there's
a one-off script that pulls them in via Facebook's official Graph API
(not scraping) and creates each as a **draft** listing for you to review.

1. Copy `scripts/config.example.js` to `scripts/config.local.js`
2. Fill in `FB_PAGE_ID`, `FB_PAGE_TOKEN` (see chat for how to get these),
   and `SUPABASE_SERVICE_KEY` (Settings → API → Secret keys — keep this
   one private, never commit it)
3. Run:
   ```bash
   node scripts/import-from-facebook.js
   ```
4. Open the admin panel, review each imported draft (price/year/mileage
   are only guessed from the post text), fix them up, then mark it Active.

## Deploy it for free

Push this folder to a GitHub repo, then connect the repo on either:
- [Vercel](https://vercel.com) — auto-detects Vite, no config needed
- [Netlify](https://netlify.com) — build command `npm run build`, publish
  directory `dist`

Either one deploys for free and gives you a live URL.
