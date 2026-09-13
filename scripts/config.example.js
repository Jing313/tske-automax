// Copy this file to config.local.js (same folder) and fill in your real
// values there. config.local.js is gitignored — it will NOT be committed.
export default {
  FB_PAGE_ID: "YOUR_PAGE_ID",
  FB_PAGE_TOKEN: "YOUR_PAGE_ACCESS_TOKEN",
  SUPABASE_URL: "https://diahuhduggvoqfsfdunn.supabase.co",
  // Settings → API → "Secret keys" tab → the sb_secret_... key.
  // This key bypasses row-level security, which is fine for a script YOU
  // run locally once, but it must never end up in the website's own code
  // or in GitHub. Keep it only in this local, gitignored file.
  SUPABASE_SERVICE_KEY: "YOUR_SUPABASE_SECRET_KEY",
};
