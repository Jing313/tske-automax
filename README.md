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

## Deploy it for free

Push this folder to a GitHub repo, then connect the repo on either:
- [Vercel](https://vercel.com) — auto-detects Vite, no config needed
- [Netlify](https://netlify.com) — build command `npm run build`, publish
  directory `dist`

Either one deploys for free and gives you a live URL.
