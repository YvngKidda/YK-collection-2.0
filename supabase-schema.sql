-- ════════════════════════════════════════════════════════════════
--  YK Collection — Supabase schema
--  Run the WHOLE file once in: Dashboard → SQL Editor → New query.
--  Safe to re-run (it drops and recreates the policies).
-- ════════════════════════════════════════════════════════════════

-- ── 1. ADMIN CHECK ──────────────────────────────────────────────
-- Only user ids listed in public.admins count as admin.
-- No policies on this table on purpose: the public API can't read or edit it.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ── 2. TABLES ───────────────────────────────────────────────────
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  title       text    not null check (char_length(btrim(title)) between 1 and 150),
  description text    not null default '',
  price       integer not null check (price >= 0),                 -- naira
  old_price   integer check (old_price is null or old_price >= 0),
  stock       integer not null default 1 check (stock >= 0),       -- 0 = sold out
  category    text    not null default 'clothing-male',
  badge       text    check (badge in ('new','sale','limited')),
  sizes       text[]  not null default '{}',
  color       text    not null default '',
  material    text    not null default '',
  emoji       text    not null default '👕',
  images      text[]  not null default '{}',                       -- public URLs, first = cover
  created_at  timestamptz not null default now()
);
create index if not exists products_created_idx on public.products (created_at desc);

create table if not exists public.reviews (
  id         bigint generated always as identity primary key,
  product_id bigint   not null references public.products(id) on delete cascade,
  user_name  text     not null check (char_length(btrim(user_name)) between 1 and 60),
  rating     smallint not null check (rating between 1 and 5),
  comment    text     not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists reviews_product_idx on public.reviews (product_id, created_at desc);

-- Complaints / suggestions / compliments / contact-form messages
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  type       text not null check (type in ('complaint','suggestion','compliment','contact')),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  email      text check (email is null or char_length(email) <= 120),
  message    text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Store-wide settings (the "Coming Soon" toggles) so they apply on every device
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value)
values ('categories',
        '{"comingSoonCats":{"jewelry-female":true},"comingSoonSpecial":{"newArrivals":false,"sale":false}}')
on conflict (key) do nothing;

-- Average rating + review count per product (used on the product grid)
create or replace view public.product_ratings
with (security_invoker = true) as
  select product_id,
         round(avg(rating)::numeric, 1) as avg_rating,
         count(*)::int                  as review_count
  from public.reviews
  group by product_id;

-- ── 3. ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.products enable row level security;
alter table public.reviews  enable row level security;
alter table public.feedback enable row level security;
alter table public.settings enable row level security;

-- products: everyone reads, only admin writes
drop policy if exists "products read"         on public.products;
drop policy if exists "products admin insert" on public.products;
drop policy if exists "products admin update" on public.products;
drop policy if exists "products admin delete" on public.products;
create policy "products read"         on public.products for select to anon, authenticated using (true);
create policy "products admin insert" on public.products for insert to authenticated with check ((select public.is_admin()));
create policy "products admin update" on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "products admin delete" on public.products for delete to authenticated using ((select public.is_admin()));

-- reviews: everyone reads and posts, only admin can delete (moderation)
drop policy if exists "reviews read"         on public.reviews;
drop policy if exists "reviews public post"  on public.reviews;
drop policy if exists "reviews admin delete" on public.reviews;
create policy "reviews read"         on public.reviews for select to anon, authenticated using (true);
create policy "reviews public post"  on public.reviews for insert to anon, authenticated with check (true);
create policy "reviews admin delete" on public.reviews for delete to authenticated using ((select public.is_admin()));

-- feedback: everyone can send, only admin can read / delete
drop policy if exists "feedback public send"  on public.feedback;
drop policy if exists "feedback admin read"   on public.feedback;
drop policy if exists "feedback admin delete" on public.feedback;
create policy "feedback public send"  on public.feedback for insert to anon, authenticated with check (true);
create policy "feedback admin read"   on public.feedback for select to authenticated using ((select public.is_admin()));
create policy "feedback admin delete" on public.feedback for delete to authenticated using ((select public.is_admin()));

-- settings: everyone reads, only admin writes
drop policy if exists "settings read"         on public.settings;
drop policy if exists "settings admin insert" on public.settings;
drop policy if exists "settings admin update" on public.settings;
create policy "settings read"         on public.settings for select to anon, authenticated using (true);
create policy "settings admin insert" on public.settings for insert to authenticated with check ((select public.is_admin()));
create policy "settings admin update" on public.settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Explicit table grants (RLS above still decides what each row allows)
grant select on public.products, public.reviews, public.settings, public.product_ratings to anon, authenticated;
grant insert on public.reviews, public.feedback to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant delete on public.reviews to authenticated;
grant select, delete on public.feedback to authenticated;
grant insert, update on public.settings to authenticated;

-- ── 4. STORAGE BUCKET: product-images ───────────────────────────
-- Public bucket = anyone can VIEW images by URL. Only the admin can upload/replace/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "product-images admin upload" on storage.objects;
drop policy if exists "product-images admin update" on storage.objects;
drop policy if exists "product-images admin delete" on storage.objects;
create policy "product-images admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- ── 5. MAKE YOURSELF ADMIN (run AFTER creating your user) ───────
-- Dashboard → Authentication → Users → Add user → (email + strong password, tick "Auto Confirm User")
-- Then run this in a NEW query, with your real email:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'YOUR_EMAIL_HERE';
