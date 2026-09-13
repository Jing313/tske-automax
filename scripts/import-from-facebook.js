// ============================================================
// Import car listings from the TSKE Automax Facebook Page into
// Supabase, using Facebook's official Graph API (not scraping).
//
// Setup:
//   1. Copy scripts/config.example.js to scripts/config.local.js
//   2. Fill in your real FB_PAGE_ID, FB_PAGE_TOKEN, and
//      SUPABASE_SERVICE_KEY in that file
//
// Run:
//   node scripts/import-from-facebook.js
//
// What it does:
//   - Reads recent posts from the Page (message + photos)
//   - Uploads each photo to the car-images Supabase bucket
//   - Creates a car listing per post with status "inactive" (draft)
//   - It does NOT auto-publish anything — open the admin panel
//     afterwards, review each imported draft, fill in price / year /
//     mileage / brand properly, then mark it Active.
//
// Title/year/price are guessed from the post text where possible;
// always double-check them before activating a listing.
// ============================================================

import config from "./config.local.js";

const { FB_PAGE_ID, FB_PAGE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;

function requireConfig() {
  const missing = Object.entries(config).filter(([, v]) => !v || v.startsWith("YOUR_"));
  if (missing.length) {
    console.error("Missing/unfilled config values:", missing.map(([k]) => k).join(", "));
    console.error("Fill these in scripts/config.local.js before running.");
    process.exit(1);
  }
}

async function fetchPosts() {
  const url =
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/posts` +
    `?fields=message,created_time,attachments{media,subattachments{media}}` +
    `&limit=50&access_token=${FB_PAGE_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Facebook API error: ${data.error.message}`);
  return data.data || [];
}

function extractImageUrls(post) {
  const urls = [];
  const att = post.attachments?.data?.[0];
  if (!att) return urls;
  if (att.subattachments?.data?.length) {
    for (const sub of att.subattachments.data) {
      if (sub.media?.image?.src) urls.push(sub.media.image.src);
    }
  } else if (att.media?.image?.src) {
    urls.push(att.media.image.src);
  }
  return urls;
}

function guessYear(text) {
  const m = text?.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : new Date().getFullYear();
}
function guessPrice(text) {
  const m = text?.match(/RM\s?([\d,]{4,})/i);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}
function guessTitle(text) {
  const firstLine = (text || "").split("\n")[0].trim();
  return firstLine ? firstLine.slice(0, 90) : "Untitled listing (needs a title)";
}

async function uploadImageToSupabase(imageUrl, index) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Couldn't download source image (${imgRes.status})`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const path = `import-${Date.now()}-${index}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/car-images/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "image/jpeg",
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/car-images/${path}`;
}

async function insertDraftCar(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cars`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  requireConfig();
  console.log("Fetching posts from Facebook…");
  const posts = await fetchPosts();
  console.log(`Found ${posts.length} posts.`);

  let imported = 0;
  for (const post of posts) {
    const images = extractImageUrls(post);
    if (!post.message || images.length === 0) continue; // skip text-only / photo-less posts

    console.log(`\nPost from ${post.created_time}: "${(post.message || "").slice(0, 60)}…"`);
    const uploaded = [];
    for (let i = 0; i < images.length; i++) {
      try {
        uploaded.push(await uploadImageToSupabase(images[i], i));
        process.stdout.write(".");
      } catch (e) {
        console.warn(`\n  photo ${i} failed, skipping: ${e.message}`);
      }
    }
    if (uploaded.length === 0) {
      console.warn("  no photos uploaded successfully, skipping this post");
      continue;
    }

    await insertDraftCar({
      title: guessTitle(post.message),
      brand: "",
      year: guessYear(post.message),
      price: guessPrice(post.message),
      mileage: 0,
      transmission: "Automatic",
      fuel_type: "Petrol",
      color: "",
      description: post.message,
      images: uploaded,
      status: "inactive", // draft — reviewed manually before going live
    });
    imported++;
    console.log(`\n  saved as draft (${uploaded.length} photos)`);
  }

  console.log(`\nDone — imported ${imported} draft listing(s).`);
  console.log("Open the admin panel, review each one, fill in the details, then mark it Active.");
}

main().catch((e) => {
  console.error("\nImport failed:", e.message);
  process.exit(1);
});
