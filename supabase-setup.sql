-- ============================================================
-- TSKE Automax — Supabase setup
-- Run this once in your project's SQL Editor (Supabase dashboard
-- → SQL Editor → New query → paste all of this → Run)
-- ============================================================

-- 1) CARS TABLE ------------------------------------------------
create table if not exists cars (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  year int not null,
  price numeric not null,
  mileage int default 0,
  transmission text default 'Automatic',
  fuel_type text default 'Petrol',
  color text,
  description text,
  images text[] default '{}',
  status text default 'active',
  created_at timestamptz default now()
);

alter table cars enable row level security;

-- Anyone (customers browsing the site) can read listings
create policy "Public can read cars"
  on cars for select
  using (true);

-- Only a logged-in admin (Supabase Auth user) can add/edit/remove
create policy "Admins can insert cars"
  on cars for insert
  to authenticated
  with check (true);

create policy "Admins can update cars"
  on cars for update
  to authenticated
  using (true);

create policy "Admins can delete cars"
  on cars for delete
  to authenticated
  using (true);

-- 2) SETTINGS TABLE (single row: WhatsApp number, business name, etc.) ---
create table if not exists settings (
  id int primary key default 1,
  business_name text default 'TSKE Automax',
  whatsapp_number text default '60123456789',
  location text default 'Bayan Lepas, Penang',
  fb_url text default 'https://www.facebook.com/boon83boon'
);

insert into settings (id) values (1) on conflict (id) do nothing;

alter table settings enable row level security;

create policy "Public can read settings"
  on settings for select
  using (true);

create policy "Admins can update settings"
  on settings for update
  to authenticated
  using (true);

-- ============================================================
-- 3) STORAGE BUCKET (do this part in the dashboard, not SQL):
--    Storage → New bucket → name it exactly:  car-images
--    Toggle "Public bucket" ON → Create
-- ============================================================

-- Then run this so only a logged-in admin can upload/delete photos
-- (public visitors can still VIEW them, since the bucket is public):
create policy "Admins can upload car images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'car-images');

create policy "Admins can delete car images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'car-images');

-- ============================================================
-- 4) CREATE THE ADMIN LOGIN (do this in the dashboard, not SQL):
--    Authentication → Users → Add user
--    Enter your sister's email + a password she'll use to log in
--    as the site admin. This replaces the demo "tske2026" password.
-- ============================================================
