import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   TSKE AUTOMAX — inventory + appointment site, with admin panel
   ------------------------------------------------------------
   Design tokens
   Color:  bg #170F16 · surface #221822 · surface-raised #2B1F2B
           border #3A2C3A · text #F5EEF3 · text-dim #B6A3B2
           accent (pink) #D1069E · accent-hover (light pink) #EF6B9E
           chrome (olive green, used sparingly as a spark of contrast) #BBC21A
   Type:   Headlines — "Barlow Condensed" (dashboard/plate feel)
           Body      — "Inter"
   ============================================================ */

const FONT_LINK_ID = "tske-fonts";
function ensureFonts() {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

/* ============================================================
   SUPABASE CONFIG — fill these in from your project's
   Settings → API page. These two values are meant to live in
   front-end code (not secrets like a password); row-level
   security policies (see supabase-setup.sql) are what actually
   keep writes locked to a logged-in admin.
   ============================================================ */
const SUPABASE_URL = "https://diahuhduggvoqfsfdunn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpYWh1aGR1Z2d2b3Fmc2ZkdW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyODExNTEsImV4cCI6MjEwNDg1NzE1MX0.a3rWSrrFr4h4tqC4-hyG3wIPELflH5oCOMJRuCycySw";

const DEFAULT_SETTINGS = {
  businessName: "TSKE Automax",
  whatsappNumber: "60123456789", // country code + number, digits only
  location: "Bayan Lepas, Penang",
  fbUrl: "https://www.facebook.com/boon83boon",
};

/* ---------------- Supabase REST helpers (no SDK needed) ---------------- */
function sbHeaders(token) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
}

async function sbSelect(table, query = "select=*&order=created_at.desc") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Failed to load ${table}`);
  return res.json();
}
async function sbInsert(table, row, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...sbHeaders(token), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Couldn't save to ${table}`);
  return res.json();
}
async function sbUpdate(table, id, row, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders(token), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Couldn't update ${table}`);
  return res.json();
}
async function sbDelete(table, id, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: sbHeaders(token),
  });
  if (!res.ok) throw new Error(`Couldn't delete from ${table}`);
}

/* row <-> app-model mapping (DB uses snake_case) */
function carFromRow(r) {
  return {
    id: r.id, title: r.title, brand: r.brand, year: r.year, price: r.price,
    mileage: r.mileage, transmission: r.transmission, fuelType: r.fuel_type,
    color: r.color, description: r.description, images: r.images || [],
    status: r.status, createdAt: r.created_at,
  };
}
function carToRow(c) {
  return {
    title: c.title, brand: c.brand, year: c.year, price: c.price, mileage: c.mileage,
    transmission: c.transmission, fuel_type: c.fuelType, color: c.color,
    description: c.description, images: c.images, status: c.status,
  };
}
function settingsFromRow(r) {
  return { businessName: r.business_name, whatsappNumber: r.whatsapp_number, location: r.location, fbUrl: r.fb_url };
}
function settingsToRow(s) {
  return { business_name: s.businessName, whatsapp_number: s.whatsappNumber, location: s.location, fb_url: s.fbUrl };
}

async function loadCars() {
  try {
    const rows = await sbSelect("cars");
    return rows.map(carFromRow);
  } catch (e) {
    console.error(e);
    return [];
  }
}
async function loadSettings() {
  try {
    const rows = await sbSelect("settings", "id=eq.1&select=*");
    return rows[0] ? settingsFromRow(rows[0]) : DEFAULT_SETTINGS;
  } catch (e) {
    console.error(e);
    return DEFAULT_SETTINGS;
  }
}

/* ---------------- Supabase Auth (admin login) ---------------- */
async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Incorrect email or password.");
  const data = await res.json();
  return { accessToken: data.access_token, email: data.user?.email };
}

/* ---------------- Supabase Storage (car photos) ---------------- */
async function uploadCarImage(file, token) {
  const dataUrl = await compressImage(file);
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/car-images/${path}`, {
    method: "POST",
    headers: { ...sbHeaders(token), "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!res.ok) throw new Error("Photo upload failed.");
  return `${SUPABASE_URL}/storage/v1/object/public/car-images/${path}`;
}

/* ---------------- utils ---------------- */
function formatPrice(n) {
  return "RM " + Number(n || 0).toLocaleString("en-MY");
}
function formatMileage(n) {
  return Number(n || 0).toLocaleString("en-MY") + " km";
}
function whatsappUrl(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
function compressImage(file, maxDim = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ================= ICONS (inline svg, stroke-based) ================= */
const Icon = {
  whatsapp: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="currentColor"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.44 1.32 4.94L2 22l5.24-1.37a9.9 9.9 0 0 0 4.8 1.23h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm0 18.2h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.55 3.71-8.26 8.27-8.26 2.21 0 4.28.86 5.85 2.42a8.2 8.2 0 0 1 2.42 5.85c0 4.56-3.71 8.23-8.29 8.23Zm4.53-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.4-.12-.56.13-.17.25-.65.81-.8.97-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.98-1.21-.73-.65-1.23-1.45-1.37-1.7-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42-.14 0-.31-.02-.48-.02s-.43.06-.66.31c-.23.25-.86.85-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z"/></svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  ),
  close: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  chevL: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||20} height={p.size||20} fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
  ),
  chevR: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||20} height={p.size||20} fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
  ),
  gauge: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 12l4-3M4 15a8 8 0 1 1 16 0"/></svg>
  ),
  gear: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="9" width="16" height="6" rx="1"/><path d="M8 9V6M12 9V6M16 9V6"/></svg>
  ),
  fuel: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 20V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14M6 20h8M16 10l2 2v5a1.5 1.5 0 0 0 3 0v-6l-2-2"/></svg>
  ),
  plus: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||18} height={p.size||18} fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
  ),
  photo: (p) => (
    <svg viewBox="0 0 24 24" width={p.size||34} height={p.size||34} fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.5"/><path d="M21 16l-5-5-9 9"/></svg>
  ),
};

/* Original geometric "T" badge — a fresh mark for TSKE Automax, not a
   reproduction of any existing signage/logo. Pink badge outline + a
   single green accent stroke for a spark of contrast. */
function LogoMark({ size = 30 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="36" height="36" rx="9" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M11 13h18M20 13v16" stroke="var(--accent)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M6 32l9-9" stroke="var(--chrome)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ================= SHARED STYLE ================= */
const CSS = `
  .tske { --bg:#170F16; --surface:#221822; --surface2:#2B1F2B; --border:#3A2C3A;
    --text:#F5EEF3; --dim:#B6A3B2; --accent:#D1069E; --accent-hi:#EF6B9E; --chrome:#BBC21A;
    background:var(--bg); color:var(--text); font-family:'Inter',sans-serif; min-height:100%;
    width:100%; box-sizing:border-box; }
  .tske *{box-sizing:border-box;}
  .tske h1,.tske h2,.tske h3,.tske .headline{ font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:0.01em; }
  .tske button{ font-family:'Inter',sans-serif; cursor:pointer; }
  .tske a{ color:inherit; }
  .tske ::selection{ background:var(--accent); color:#fff; }
  .tske button:focus-visible, .tske input:focus-visible, .tske textarea:focus-visible, .tske a:focus-visible {
    outline:2px solid var(--chrome); outline-offset:2px; }

  .t-header{ display:flex; align-items:center; justify-content:space-between; padding:18px 28px;
    border-bottom:1px solid var(--border); position:sticky; top:0; background:rgba(20,23,26,0.92);
    backdrop-filter:blur(6px); z-index:20; }
  .t-logo{ display:flex; align-items:center; gap:10px; }
  .t-logo .word{ font-size:22px; line-height:1; }
  .t-logo .sub{ font-size:11px; color:var(--dim); letter-spacing:0.08em; }
  .t-nav{ display:flex; align-items:center; gap:22px; font-size:14px; color:var(--dim); }
  .t-nav a{ text-decoration:none; }
  .t-nav a:hover{ color:var(--text); }
  .t-nav .dealer-link{ font-size:12px; border:1px solid var(--border); padding:6px 12px; border-radius:3px; }
  .t-nav .dealer-link:hover{ border-color:var(--chrome); }

  .t-hero{ display:grid; grid-template-columns:1.1fr 0.9fr; gap:40px; align-items:center;
    padding:64px 28px; max-width:1180px; margin:0 auto; }
  @media (max-width:820px){ .t-hero{ grid-template-columns:1fr; padding:40px 20px; } }
  .t-hero h1{ font-size:56px; line-height:0.98; margin:0 0 18px; }
  @media (max-width:820px){ .t-hero h1{ font-size:40px; } }
  .t-hero p{ color:var(--dim); font-size:16px; max-width:46ch; line-height:1.6; margin:0 0 26px; }
  .t-stats{ display:flex; gap:32px; margin-top:34px; }
  .t-stat b{ display:block; font-family:'Barlow Condensed'; font-size:30px; }
  .t-stat span{ font-size:12px; color:var(--dim); }
  .t-cta{ display:inline-flex; align-items:center; gap:8px; background:var(--accent); color:#fff; border:none;
    padding:12px 22px; font-size:14px; font-weight:600; border-radius:3px; }
  .t-cta:hover{ background:var(--accent-hi); }
  .t-cta.ghost{ background:transparent; border:1px solid var(--border); color:var(--text); }
  .t-cta.ghost:hover{ border-color:var(--chrome); }

  .t-heroart{ position:relative; height:280px; }
  .t-heroart svg{ width:100%; height:100%; }

  .t-section{ max-width:1180px; margin:0 auto; padding:10px 28px 80px; }
  .t-sectionhead{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:22px;
    flex-wrap:wrap; }
  .t-sectionhead h2{ font-size:30px; margin:0; }
  .t-search{ display:flex; align-items:center; gap:8px; border:1px solid var(--border); border-radius:3px;
    padding:8px 12px; background:var(--surface); min-width:220px; }
  .t-search input{ background:none; border:none; color:var(--text); font-size:14px; width:100%; outline:none; }
  .t-search svg{ color:var(--dim); flex-shrink:0; }

  .t-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
  @media (max-width:920px){ .t-grid{ grid-template-columns:repeat(2,1fr);} }
  @media (max-width:620px){ .t-grid{ grid-template-columns:1fr;} }

  .t-card{ background:var(--surface); border:1px solid var(--border); border-radius:4px; overflow:hidden;
    display:flex; flex-direction:column; transition:border-color .15s; }
  .t-card:hover{ border-color:#3a4046; }
  .t-cardimg{ height:180px; background:var(--surface2); display:flex; align-items:center; justify-content:center;
    color:#454b52; position:relative; overflow:hidden; }
  .t-cardimg img{ width:100%; height:100%; object-fit:cover; }
  .t-badge{ position:absolute; top:10px; left:10px; font-size:11px; letter-spacing:.04em; padding:4px 9px;
    border-radius:2px; background:rgba(20,23,26,0.85); border:1px solid var(--border); }
  .t-badge.sold{ color:var(--accent); border-color:var(--accent); }
  .t-cardbody{ padding:16px 16px 18px; display:flex; flex-direction:column; gap:8px; flex:1; }
  .t-cardbody h3{ font-size:20px; margin:0; line-height:1.15; }
  .t-price{ font-family:'Barlow Condensed'; font-size:22px; color:var(--chrome); }
  .t-specs{ display:flex; gap:14px; color:var(--dim); font-size:12.5px; flex-wrap:wrap; }
  .t-specs span{ display:flex; align-items:center; gap:5px; }
  .t-cardfoot{ margin-top:auto; padding-top:10px; }
  .t-viewbtn{ width:100%; background:transparent; border:1px solid var(--border); color:var(--text);
    padding:9px; border-radius:3px; font-size:13px; }
  .t-viewbtn:hover{ border-color:var(--chrome); }

  .t-empty{ text-align:center; padding:60px 20px; color:var(--dim); border:1px dashed var(--border); border-radius:6px; }

  .t-footer{ border-top:1px solid var(--border); padding:26px 28px; display:flex; justify-content:space-between;
    align-items:center; color:var(--dim); font-size:13px; flex-wrap:wrap; gap:10px; max-width:1180px; margin:0 auto; }

  /* modal */
  .t-overlay{ position:fixed; inset:0; background:rgba(10,11,13,0.75); z-index:100; display:flex;
    align-items:flex-start; justify-content:center; padding:36px 16px; overflow:auto; }
  .t-modal{ background:var(--surface); border:1px solid var(--border); border-radius:6px; width:100%;
    max-width:760px; overflow:hidden; }
  .t-modalhead{ display:flex; justify-content:space-between; align-items:center; padding:14px 18px;
    border-bottom:1px solid var(--border); }
  .t-modalhead h3{ font-size:20px; margin:0; }
  .t-iconbtn{ background:none; border:none; color:var(--dim); padding:6px; display:flex; }
  .t-iconbtn:hover{ color:var(--text); }
  .t-modalbody{ padding:20px; }
  .t-gallery{ position:relative; height:280px; background:var(--surface2); border-radius:4px; overflow:hidden;
    display:flex; align-items:center; justify-content:center; color:#454b52; margin-bottom:18px; }
  .t-gallery img{ width:100%; height:100%; object-fit:cover; }
  .t-galnav{ position:absolute; top:50%; transform:translateY(-50%); background:rgba(20,23,26,0.7);
    border:1px solid var(--border); color:#fff; border-radius:50%; width:34px; height:34px; display:flex;
    align-items:center; justify-content:center; }
  .t-galnav.l{ left:10px; } .t-galnav.r{ right:10px; }
  .t-dots{ position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center; gap:6px; }
  .t-dots span{ width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.3); }
  .t-dots span.on{ background:#fff; }
  .t-detailgrid{ display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; margin:14px 0 18px; font-size:14px; }
  .t-detailgrid div{ display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding:7px 0; color:var(--dim); }
  .t-detailgrid div b{ color:var(--text); font-weight:500; }
  .t-desc{ font-size:14px; line-height:1.6; color:var(--dim); margin-bottom:20px; }
  .t-desc-heading{ font-family:'Barlow Condensed'; font-weight:700; font-size:15px; letter-spacing:.04em;
    color:var(--chrome); margin:16px 0 6px; }
  .t-desc-heading:first-child{ margin-top:0; }
  .t-desc-bullet{ padding-left:14px; position:relative; margin-bottom:4px; }
  .t-desc-bullet::before{ content:"–"; position:absolute; left:0; color:var(--accent); }
  .t-desc-line{ margin-bottom:4px; }
  .t-desc a{ color:var(--accent-hi); text-decoration:underline; text-underline-offset:2px; }
  .t-actionrow{ display:flex; gap:10px; flex-wrap:wrap; }

  /* forms */
  .t-field{ margin-bottom:14px; }
  .t-field label{ display:block; font-size:12.5px; color:var(--dim); margin-bottom:6px; }
  .t-field input, .t-field select, .t-field textarea{ width:100%; background:var(--surface2); border:1px solid var(--border);
    color:var(--text); padding:10px 11px; border-radius:3px; font-size:14px; font-family:inherit; }
  .t-field textarea{ resize:vertical; min-height:90px; }
  .t-row2{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:520px){ .t-row2{ grid-template-columns:1fr; } }
  .t-errtext{ color:var(--accent); font-size:12.5px; margin-top:-8px; margin-bottom:12px; }

  /* admin */
  .t-adminwrap{ display:flex; min-height:100vh; }
  .t-sidebar{ width:210px; border-right:1px solid var(--border); padding:22px 14px; flex-shrink:0; }
  @media (max-width:720px){ .t-sidebar{ width:64px; padding:22px 8px; } .t-sidebar .lbl{ display:none; } }
  .t-sidebar .t-logo{ padding:0 8px 22px; }
  .t-navitem{ display:flex; align-items:center; gap:10px; padding:10px 10px; border-radius:4px; color:var(--dim);
    font-size:14px; margin-bottom:4px; background:none; border:none; width:100%; text-align:left; }
  .t-navitem.on, .t-navitem:hover{ background:var(--surface); color:var(--text); }
  .t-main{ flex:1; padding:26px 30px; max-width:1100px; }
  .t-adminhead{ display:flex; justify-content:space-between; align-items:center; margin-bottom:22px; flex-wrap:wrap; gap:12px; }
  .t-table{ width:100%; border-collapse:collapse; font-size:14px; }
  .t-table th{ text-align:left; color:var(--dim); font-weight:500; font-size:12px; letter-spacing:.03em;
    padding:10px 12px; border-bottom:1px solid var(--border); }
  .t-table td{ padding:12px; border-bottom:1px solid var(--border); vertical-align:middle; }
  .t-thumb{ width:52px; height:38px; border-radius:3px; background:var(--surface2); object-fit:cover; display:block; }
  .t-pill{ font-size:11px; padding:3px 9px; border-radius:20px; border:1px solid var(--border); }
  .t-pill.active{ color:#7cc98a; border-color:#2c4a30; background:#1a2a1c; }
  .t-pill.inactive{ color:#c99a4a; border-color:#4a3c20; background:#2a2318; }
  .t-linkbtn{ background:none; border:none; color:var(--chrome); font-size:13px; padding:4px 6px; }
  .t-linkbtn:hover{ text-decoration:underline; }
  .t-linkbtn.danger{ color:var(--accent); }
  .t-loginwrap{ min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
  .t-loginbox{ width:100%; max-width:340px; border:1px solid var(--border); background:var(--surface);
    border-radius:6px; padding:28px; }
  .t-imgpicker{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
  .t-imgpicker .ph{ width:74px; height:56px; border-radius:3px; object-fit:cover; border:1px solid var(--border); display:block;
    pointer-events:none; }
  .t-imgpicker .rm{ position:relative; cursor:grab; transition:opacity .12s; padding-bottom:16px; }
  .t-imgpicker .rm:active{ cursor:grabbing; }
  .t-imgpicker .rm.dragging{ opacity:0.35; }
  .t-imgpicker .rm.dragover .ph{ border-color:var(--accent-hi); border-width:2px; }
  .t-imgpicker .rm.cover .ph{ border:2px solid var(--chrome); }
  .t-imgpicker .rm button.x{ position:absolute; top:-6px; right:-6px; background:var(--accent); color:#fff; border:none;
    border-radius:50%; width:18px; height:18px; font-size:11px; line-height:1; display:flex; align-items:center; justify-content:center;
    cursor:pointer; z-index:2; }
  .t-imgpicker .coverbadge{ position:absolute; top:-6px; left:-6px; background:var(--chrome); color:#14170A;
    font-size:8.5px; font-weight:700; letter-spacing:.03em; padding:1px 6px; border-radius:8px; pointer-events:none; z-index:1; }
  .t-imgpicker .movebar{ position:absolute; bottom:0; left:0; right:0; display:flex; background:var(--surface2);
    border:1px solid var(--border); border-top:none; border-radius:0 0 3px 3px; overflow:hidden; }
  .t-imgpicker .movebar button{ flex:1; background:none; border:none; color:var(--text); font-size:12px; padding:2px 0;
    cursor:pointer; line-height:1.2; }
  .t-imgpicker .movebar button:disabled{ opacity:0.25; cursor:default; }
  .t-imgpicker .movebar button:not(:disabled):hover{ background:var(--border); }
  .t-uploadbtn{ border:1px dashed var(--border); color:var(--dim); background:none; border-radius:3px;
    padding:8px 14px; font-size:12.5px; }
  .t-uploadbtn:hover{ border-color:var(--chrome); color:var(--text); }
  .t-toast{ position:fixed; bottom:20px; right:20px; background:var(--surface); border:1px solid var(--border);
    padding:12px 18px; border-radius:4px; font-size:13px; z-index:200; }
`;

/* ================= CAR CARD ================= */
function CarCard({ car, onView }) {
  return (
    <div className="t-card">
      <div className="t-cardimg">
        {car.status === "inactive" && <span className="t-badge sold">SOLD</span>}
        {car.images && car.images[0] ? <img src={car.images[0]} alt={car.title} /> : <Icon.photo />}
      </div>
      <div className="t-cardbody">
        <h3>{car.title}</h3>
        <div className="t-price">{formatPrice(car.price)}</div>
        <div className="t-specs">
          <span><Icon.gauge />{car.year}</span>
          <span><Icon.gear />{car.transmission}</span>
          <span><Icon.fuel />{formatMileage(car.mileage)}</span>
        </div>
        <div className="t-cardfoot">
          <button className="t-viewbtn" onClick={() => onView(car)}>View details</button>
        </div>
      </div>
    </div>
  );
}

/* ================= CAR DETAIL MODAL ================= */
/* Renders a raw pasted caption (Facebook-style, with ***** headings and
   - / ~ bullet lines) as properly structured, readable HTML instead of
   one wrapped block — and makes Malaysian phone numbers tappable. */
function linkifyPhones(text) {
  const parts = text.split(/(01\d[-\s]?\d{3,4}[-\s]?\d{3,4})/g);
  return parts.map((part, i) =>
    /^01\d[-\s]?\d{3,4}[-\s]?\d{3,4}$/.test(part)
      ? <a key={i} href={`tel:${part.replace(/[-\s]/g, "")}`}>{part}</a>
      : part
  );
}
function DescriptionBlock({ text }) {
  const lines = (text || "").split("\n").map((l) => l.trim());
  return (
    <div className="t-desc">
      {lines.map((line, i) => {
        if (!line) return null;
        const bare = line.replace(/[*=~]/g, "").trim();
        const isHeading = /^[*=~]{2,}.+[*=~]{2,}$/.test(line) || (bare.length > 2 && bare === bare.toUpperCase() && /[A-Z]/.test(bare) && bare.length < 40 && !/^[-–~•]/.test(line));
        const isBullet = /^[-–~•]\s?/.test(line);
        if (isHeading) return <div key={i} className="t-desc-heading">{bare}</div>;
        if (isBullet) return <div key={i} className="t-desc-bullet">{linkifyPhones(line.replace(/^[-–~•]\s?/, ""))}</div>;
        return <div key={i} className="t-desc-line">{linkifyPhones(line)}</div>;
      })}
    </div>
  );
}

function CarModal({ car, settings, onClose, onBook }) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = car.images && car.images.length ? car.images : [null];

  const chatMessage = `Hi ${settings.businessName}, I'm interested in the ${car.year} ${car.title} (${formatPrice(car.price)}) listed on your website. Could you share more details?`;

  return (
    <div className="t-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="t-modal">
        <div className="t-modalhead">
          <h3>{car.title}</h3>
          <button className="t-iconbtn" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </div>
        <div className="t-modalbody">
          <div className="t-gallery">
            {images[imgIdx] ? <img src={images[imgIdx]} alt="" /> : <Icon.photo size={44} />}
            {images.length > 1 && (
              <>
                <button className="t-galnav l" onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}><Icon.chevL /></button>
                <button className="t-galnav r" onClick={() => setImgIdx((i) => (i + 1) % images.length)}><Icon.chevR /></button>
                <div className="t-dots">{images.map((_, i) => <span key={i} className={i === imgIdx ? "on" : ""} />)}</div>
              </>
            )}
          </div>
          <div className="t-price" style={{ fontSize: 26, marginBottom: 10 }}>{formatPrice(car.price)}</div>
          <div className="t-detailgrid">
            <div>Year <b>{car.year}</b></div>
            <div>Mileage <b>{formatMileage(car.mileage)}</b></div>
            <div>Transmission <b>{car.transmission}</b></div>
            <div>Fuel type <b>{car.fuelType}</b></div>
            <div>Colour <b>{car.color || "—"}</b></div>
            <div>Status <b>{car.status === "active" ? "Available" : "Sold"}</b></div>
          </div>
          <DescriptionBlock text={car.description} />
          {car.status === "active" ? (
            <div className="t-actionrow">
              <button className="t-cta" onClick={() => onBook(car)}>Book an appointment</button>
              <a className="t-cta ghost" href={whatsappUrl(settings.whatsappNumber, chatMessage)} target="_blank" rel="noreferrer">
                <Icon.whatsapp /> Chat for more details
              </a>
            </div>
          ) : (
            <div className="t-desc" style={{ color: "var(--accent)" }}>This car has been sold.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= APPOINTMENT FORM MODAL ================= */
function AppointmentModal({ car, settings, onClose }) {
  const [form, setForm] = useState({ name: "", phone: "", date: "", note: "" });
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setErr("Please fill in your name and phone number.");
      return;
    }
    const lines = [
      `Hi ${settings.businessName}, I'd like to book a viewing appointment.`,
      ``,
      `Car: ${car.year} ${car.title}`,
      `Price: ${formatPrice(car.price)}`,
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      form.date ? `Preferred date/time: ${form.date}` : null,
      form.note ? `Note: ${form.note}` : null,
    ].filter(Boolean);
    window.open(whatsappUrl(settings.whatsappNumber, lines.join("\n")), "_blank");
    onClose();
  }

  return (
    <div className="t-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="t-modal" style={{ maxWidth: 440 }}>
        <div className="t-modalhead">
          <h3>Book an appointment</h3>
          <button className="t-iconbtn" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </div>
        <form className="t-modalbody" onSubmit={submit}>
          <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 0 }}>
            For the {car.year} {car.title} — {formatPrice(car.price)}
          </p>
          <div className="t-field">
            <label>Your name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jing Chiam" />
          </div>
          <div className="t-field">
            <label>Phone number</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 012-345 6789" />
          </div>
          <div className="t-field">
            <label>Preferred date / time (optional)</label>
            <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="e.g. Sat 20 Sep, afternoon" />
          </div>
          <div className="t-field">
            <label>Note (optional)</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Anything else to mention" />
          </div>
          {err && <div className="t-errtext">{err}</div>}
          <button className="t-cta" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            <Icon.whatsapp /> Continue on WhatsApp
          </button>
        </form>
      </div>
    </div>
  );
}

/* ================= HERO ART (original SVG, no copyrighted imagery) ================= */
function HeroArt() {
  return (
    <svg viewBox="0 0 420 280" fill="none">
      <defs>
        <linearGradient id="hbeam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D1069E" stopOpacity="0.55" />
          <stop offset="1" stopColor="#D1069E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="420" height="280" fill="none" />
      <circle cx="330" cy="70" r="120" stroke="#3A2C3A" strokeWidth="1" />
      <circle cx="330" cy="70" r="90" stroke="#3A2C3A" strokeWidth="1" />
      <path d="M0 210 Q 90 150 210 178 T 420 150" stroke="#3A2C3A" strokeWidth="1.5" fill="none" />
      <path d="M-20 236h140" stroke="url(#hbeam)" strokeWidth="34" />
      <g transform="translate(40,190)">
        <path d="M0 46c0-8 8-14 20-16l24-26c6-6 15-9 24-9h58c11 0 21 5 27 13l16 22c14 2 24 8 24 16v14c0 5-4 9-9 9h-6c-2 12-12 21-25 21s-23-9-25-21H83c-2 12-12 21-25 21S35 92 33 80h-9c-13 0-24-9-24-19Z"
          fill="#221822" stroke="#BBC21A" strokeWidth="1.4" />
        <circle cx="58" cy="80" r="17" fill="#170F16" stroke="#BBC21A" strokeWidth="1.4" />
        <circle cx="58" cy="80" r="6" fill="#3A2C3A" />
        <circle cx="168" cy="80" r="17" fill="#170F16" stroke="#BBC21A" strokeWidth="1.4" />
        <circle cx="168" cy="80" r="6" fill="#3A2C3A" />
        <path d="M42 20l18-19h58l12 19" stroke="#BBC21A" strokeWidth="1.2" fill="none" opacity="0.6" />
        <rect x="200" y="26" width="18" height="9" rx="2" fill="#D1069E" />
      </g>
      <text x="330" y="76" textAnchor="middle" fontFamily="Barlow Condensed" fontSize="15" fill="#B6A3B2" letterSpacing="2">AMG</text>
    </svg>
  );
}

/* ================= PUBLIC SITE ================= */
function PublicSite({ cars, settings, onGoAdmin }) {
  const [query, setQuery] = useState("");
  const [viewCar, setViewCar] = useState(null);
  const [bookCar, setBookCar] = useState(null);

  const activeCars = cars.filter((c) => c.status === "active");
  const filtered = activeCars.filter((c) =>
    (c.title + " " + c.brand).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <header className="t-header">
        <div className="t-logo">
          <LogoMark size={34} />
          <span>
            <span className="word">TSKE AUTOMAX</span>
            <div className="sub">{settings.location}</div>
          </span>
        </div>
        <nav className="t-nav">
          <a href="#inventory">Inventory</a>
          <a href="#contact">Contact</a>
          <a className="dealer-link" href="#admin" onClick={(e) => { e.preventDefault(); onGoAdmin(); }}>Dealer login</a>
        </nav>
      </header>

      <section className="t-hero">
        <div>
          <h1>Quality used cars,<br />straight talk.</h1>
          <p>Every unit inspected, priced fairly, and ready to view in Bayan Lepas. Browse the current lineup and message us directly on WhatsApp to book a viewing.</p>
          <a className="t-cta" href="#inventory"><Icon.search size={15} /> Browse inventory</a>
          <div className="t-stats">
            <div className="t-stat"><b>{activeCars.length}</b><span>cars in stock</span></div>
            <div className="t-stat"><b>1:1</b><span>viewing by appointment</span></div>
          </div>
        </div>
        <div className="t-heroart"><HeroArt /></div>
      </section>

      <section className="t-section" id="inventory">
        <div className="t-sectionhead">
          <h2>Current inventory</h2>
          <div className="t-search">
            <Icon.search />
            <input placeholder="Search make or model…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="t-empty">No cars match your search right now.</div>
        ) : (
          <div className="t-grid">
            {filtered.map((c) => <CarCard key={c.id} car={c} onView={setViewCar} />)}
          </div>
        )}
      </section>

      <footer className="t-footer" id="contact">
        <span>© {new Date().getFullYear()} {settings.businessName} · {settings.location}</span>
        <a href={settings.fbUrl} target="_blank" rel="noreferrer">Visit our Facebook page →</a>
      </footer>

      {viewCar && (
        <CarModal
          car={viewCar}
          settings={settings}
          onClose={() => setViewCar(null)}
          onBook={(c) => { setBookCar(c); }}
        />
      )}
      {bookCar && (
        <AppointmentModal car={bookCar} settings={settings} onClose={() => setBookCar(null)} />
      )}
    </div>
  );
}

/* ================= ADMIN: CAR FORM ================= */
const emptyCarForm = {
  title: "", brand: "", year: new Date().getFullYear(), price: "", mileage: "",
  transmission: "Automatic", fuelType: "Petrol", color: "", description: "", images: [],
};

function CarForm({ initial, onCancel, onSave, token }) {
  const [form, setForm] = useState(initial || emptyCarForm);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const fileRef = useRef();

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => uploadCarImage(f, token)));
      setForm((f) => ({ ...f, images: [...f.images, ...uploaded] }));
    } catch {
      setErr("Couldn't upload one of the photos — check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function removeImage(i) {
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));
  }
  function reorderImages(from, to) {
    if (from === to || from == null || to == null) return;
    setForm((f) => {
      const imgs = [...f.images];
      const [moved] = imgs.splice(from, 1);
      imgs.splice(to, 0, moved);
      return { ...f, images: imgs };
    });
  }
  function moveImage(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= form.images.length) return;
    reorderImages(i, j);
  }

  function submit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.price || !form.year) {
      setErr("Title, year and price are required.");
      return;
    }
    onSave({
      ...form,
      price: Number(form.price),
      mileage: Number(form.mileage) || 0,
      year: Number(form.year),
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="t-field">
        <label>Listing title</label>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Mercedes-Benz C250 AMG Line" />
      </div>
      <div className="t-row2">
        <div className="t-field">
          <label>Brand</label>
          <input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Mercedes-Benz" />
        </div>
        <div className="t-field">
          <label>Year</label>
          <input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} />
        </div>
      </div>
      <div className="t-row2">
        <div className="t-field">
          <label>Price (RM)</label>
          <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. 98800" />
        </div>
        <div className="t-field">
          <label>Mileage (km)</label>
          <input type="number" value={form.mileage} onChange={(e) => set("mileage", e.target.value)} placeholder="e.g. 62000" />
        </div>
      </div>
      <div className="t-row2">
        <div className="t-field">
          <label>Transmission</label>
          <select value={form.transmission} onChange={(e) => set("transmission", e.target.value)}>
            <option>Automatic</option><option>Manual</option>
          </select>
        </div>
        <div className="t-field">
          <label>Fuel type</label>
          <select value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
            <option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option>
          </select>
        </div>
      </div>
      <div className="t-field">
        <label>Colour</label>
        <input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="e.g. Obsidian Black" />
      </div>
      <div className="t-field">
        <label>Description</label>
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Condition, service history, notable features…" />
      </div>
      <div className="t-field">
        <label>Photos</label>
        <div className="t-imgpicker">
          {form.images.map((src, i) => (
            <div
              key={src.slice(-24) + i}
              className={`rm ${i === 0 ? "cover" : ""} ${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== i ? "dragover" : ""}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
              onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
              onDrop={(e) => { e.preventDefault(); reorderImages(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            >
              <img className="ph" src={src} alt="" />
              <button type="button" className="x" onClick={() => removeImage(i)}>✕</button>
              {i === 0 && <span className="coverbadge">COVER</span>}
              <div className="movebar">
                <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Move left">‹</button>
                <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} aria-label="Move right">›</button>
              </div>
            </div>
          ))}
        </div>
        {form.images.length > 1 && (
          <p style={{ fontSize: 11.5, color: "var(--dim)", margin: "0 0 10px" }}>
            Drag to reorder on desktop, or tap ‹ › on a photo (works on phone too). First photo (COVER) shows on the inventory grid.
          </p>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
        <button type="button" className="t-uploadbtn" onClick={() => fileRef.current.click()} disabled={uploading}>
          {uploading ? "Processing…" : "+ Add photos"}
        </button>
      </div>
      {err && <div className="t-errtext">{err}</div>}
      <div className="t-actionrow" style={{ marginTop: 6 }}>
        <button type="submit" className="t-cta">Save listing</button>
        <button type="button" className="t-cta ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ================= ADMIN PANEL ================= */
function AdminPanel({ cars, setCars, settings, setSettings, onExit, token }) {
  const [tab, setTab] = useState("inventory"); // inventory | add | edit | settings
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState("");

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  async function addCar(data) {
    try {
      const [row] = await sbInsert("cars", carToRow({ ...data, status: "active" }), token);
      setCars([carFromRow(row), ...cars]);
      setTab("inventory"); flashToast("Listing added.");
    } catch (e) { flashToast(e.message); }
  }
  async function updateCar(id, data) {
    try {
      const [row] = await sbUpdate("cars", id, carToRow(data), token);
      setCars(cars.map((c) => (c.id === id ? carFromRow(row) : c)));
      setTab("inventory"); setEditingId(null); flashToast("Listing updated.");
    } catch (e) { flashToast(e.message); }
  }
  async function toggleStatus(car) {
    try {
      const [row] = await sbUpdate("cars", car.id, { status: car.status === "active" ? "inactive" : "active" }, token);
      setCars(cars.map((c) => (c.id === car.id ? carFromRow(row) : c)));
      flashToast("Status updated.");
    } catch (e) { flashToast(e.message); }
  }
  async function removeCar(id) {
    if (!window.confirm("Remove this listing permanently?")) return;
    try {
      await sbDelete("cars", id, token);
      setCars(cars.filter((c) => c.id !== id));
      flashToast("Listing removed.");
    } catch (e) { flashToast(e.message); }
  }
  async function saveSettingsForm(next) {
    try {
      const [row] = await sbUpdate("settings", 1, settingsToRow(next), token);
      setSettings(settingsFromRow(row));
      flashToast("Settings saved.");
    } catch (e) { flashToast(e.message); }
  }

  const editingCar = cars.find((c) => c.id === editingId);

  return (
    <div className="t-adminwrap">
      <aside className="t-sidebar">
        <div className="t-logo"><LogoMark size={26} /><span className="word" style={{ fontSize: 18 }}>TSKE</span></div>
        <button className={`t-navitem ${tab === "inventory" || tab === "add" || tab === "edit" ? "on" : ""}`} onClick={() => setTab("inventory")}>
          <span className="lbl">Inventory</span>
        </button>
        <button className={`t-navitem ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>
          <span className="lbl">Settings</span>
        </button>
        <button className="t-navitem" onClick={onExit} style={{ marginTop: 20 }}>
          <span className="lbl">View site ↗</span>
        </button>
      </aside>
      <main className="t-main">
        {tab === "inventory" && (
          <>
            <div className="t-adminhead">
              <h2 style={{ margin: 0, fontSize: 26 }}>Inventory</h2>
              <button className="t-cta" onClick={() => setTab("add")}><Icon.plus size={15} /> Add car</button>
            </div>
            <table className="t-table">
              <thead>
                <tr><th></th><th>Listing</th><th>Price</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {cars.map((c) => (
                  <tr key={c.id}>
                    <td>{c.images?.[0] ? <img className="t-thumb" src={c.images[0]} alt="" /> : <div className="t-thumb" />}</td>
                    <td>{c.title}<div style={{ color: "var(--dim)", fontSize: 12 }}>{c.year} · {formatMileage(c.mileage)}</div></td>
                    <td>{formatPrice(c.price)}</td>
                    <td><span className={`t-pill ${c.status}`}>{c.status === "active" ? "Active" : "Sold / inactive"}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="t-linkbtn" onClick={() => { setEditingId(c.id); setTab("edit"); }}>Edit</button>
                      <button className="t-linkbtn" onClick={() => toggleStatus(c)}>{c.status === "active" ? "Mark sold" : "Reactivate"}</button>
                      <button className="t-linkbtn danger" onClick={() => removeCar(c.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {cars.length === 0 && (
                  <tr><td colSpan={5}><div className="t-empty">No listings yet — add your first car.</div></td></tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === "add" && (
          <>
            <h2 style={{ fontSize: 26, marginTop: 0 }}>Add a car</h2>
            <CarForm onCancel={() => setTab("inventory")} onSave={addCar} token={token} />
          </>
        )}

        {tab === "edit" && editingCar && (
          <>
            <h2 style={{ fontSize: 26, marginTop: 0 }}>Edit listing</h2>
            <CarForm initial={editingCar} onCancel={() => { setTab("inventory"); setEditingId(null); }} onSave={(data) => updateCar(editingCar.id, data)} token={token} />
          </>
        )}

        {tab === "settings" && (
          <SettingsForm settings={settings} onSave={saveSettingsForm} />
        )}
      </main>
      {toast && <div className="t-toast">{toast}</div>}
    </div>
  );
}

function SettingsForm({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  return (
    <div style={{ maxWidth: 420 }}>
      <h2 style={{ fontSize: 26, marginTop: 0 }}>Settings</h2>
      <div className="t-field">
        <label>Business name</label>
        <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
      </div>
      <div className="t-field">
        <label>WhatsApp number (country code + number, digits only)</label>
        <input value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} placeholder="e.g. 60123456789" />
      </div>
      <div className="t-field">
        <label>Location</label>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      </div>
      <div className="t-field">
        <label>Facebook page URL</label>
        <input value={form.fbUrl} onChange={(e) => setForm({ ...form, fbUrl: e.target.value })} />
      </div>
      <button className="t-cta" onClick={() => onSave(form)}>Save settings</button>
    </div>
  );
}

/* ================= ADMIN LOGIN ================= */
function AdminLogin({ onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const session = await signIn(email, pw);
      onSuccess(session);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="t-loginwrap">
      <div className="t-loginbox">
        <div className="t-logo" style={{ marginBottom: 18 }}><LogoMark size={34} /><span className="word">TSKE AUTOMAX</span></div>
        <h3 style={{ marginTop: 0, fontSize: 20 }}>Dealer login</h3>
        <form onSubmit={submit}>
          <div className="t-field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="t-field">
            <label>Password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {err && <div className="t-errtext">{err}</div>}
          <button className="t-cta" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}>
            {busy ? "Logging in…" : "Log in"}
          </button>
          <button className="t-cta ghost" type="button" style={{ width: "100%", justifyContent: "center" }} onClick={onBack}>← Back to site</button>
        </form>
      </div>
    </div>
  );
}

/* ================= ROOT APP ================= */
export default function App() {
  const [route, setRoute] = useState("site"); // site | login | admin
  const [cars, setCars] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(null); // { accessToken, email } — in-memory only, lost on refresh

  useEffect(() => {
    ensureFonts();
    (async () => {
      const [c, s] = await Promise.all([loadCars(), loadSettings()]);
      setCars(c); setSettings(s); setLoaded(true);
    })();
  }, []);

  if (!loaded) {
    return <div className="tske" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#B6A3B2" }}>
      <style>{CSS}</style>Loading…
    </div>;
  }

  return (
    <div className="tske">
      <style>{CSS}</style>
      {route === "site" && (
        <PublicSite cars={cars} settings={settings} onGoAdmin={() => setRoute("login")} />
      )}
      {route === "login" && (
        <AdminLogin onSuccess={(s) => { setSession(s); setRoute("admin"); }} onBack={() => setRoute("site")} />
      )}
      {route === "admin" && session && (
        <AdminPanel
          cars={cars} setCars={setCars} settings={settings} setSettings={setSettings}
          token={session.accessToken}
          onExit={() => { setSession(null); setRoute("site"); }}
        />
      )}
    </div>
  );
}
