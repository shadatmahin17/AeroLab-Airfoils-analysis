-- AeroLab Supabase Schema & Row-Level Security Policies
-- Run this script in your Supabase Dashboard -> SQL Editor.

-- 1. Pilot User Profiles (owner-isolated)
create table if not exists public.user_profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'AeroLab Pilot' check (char_length(display_name) between 1 and 80),
  photo_url text not null default '' check (char_length(photo_url) <= 512),
  total_uploads integer not null default 0 check (total_uploads between 0 and 100000),
  total_runs integer not null default 0 check (total_runs between 0 and 100000),
  best_ld double precision not null default 0 check (best_ld between -100 and 300),
  best_airfoil text not null default '' check (char_length(best_airfoil) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile"
  on public.user_profiles
  for select
  using (auth.uid() = uid);

drop policy if exists "Users can create own profile" on public.user_profiles;
create policy "Users can create own profile"
  on public.user_profiles
  for insert
  with check (auth.uid() = uid);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles
  for update
  using (auth.uid() = uid)
  with check (auth.uid() = uid);

-- 2. Shared Community Airfoils
create table if not exists public.airfoils (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  name text not null check (char_length(name) between 1 and 80),
  filename text not null check (char_length(filename) between 1 and 100),
  coords_text text not null check (char_length(coords_text) between 20 and 40000),
  point_count integer not null check (point_count between 10 and 500),
  camber_pct double precision not null check (camber_pct between -30 and 30),
  thickness_pct double precision not null check (thickness_pct between 0.5 and 60),
  uploader_name text not null check (char_length(uploader_name) between 1 and 60),
  uploader_uid text not null default '' check (char_length(uploader_uid) <= 128),
  is_neutral_ref boolean not null default false,
  visibility text not null default 'public' check (visibility = 'public'),
  created_at timestamptz not null default now()
);

create index if not exists airfoils_visibility_created_idx
  on public.airfoils (visibility, created_at desc);

alter table public.airfoils enable row level security;

drop policy if exists "Public airfoils are readable by everyone" on public.airfoils;
create policy "Public airfoils are readable by everyone"
  on public.airfoils
  for select
  using (visibility = 'public');

drop policy if exists "Anyone or owner can publish public airfoils" on public.airfoils;
create policy "Anyone or owner can publish public airfoils"
  on public.airfoils
  for insert
  with check (
    visibility = 'public'
    and (
      (auth.uid() is null and uploader_uid = '')
      or (auth.uid() is not null and uploader_uid = auth.uid()::text)
    )
  );

drop policy if exists "Uploaders can delete own airfoils" on public.airfoils;
create policy "Uploaders can delete own airfoils"
  on public.airfoils
  for delete
  using (auth.uid() is not null and uploader_uid = auth.uid()::text);

-- 3. Simulation Benchmarks & Leaderboard
create table if not exists public.benchmarks (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  airfoil_name text not null check (char_length(airfoil_name) between 1 and 80),
  airfoil_id text not null default '' check (char_length(airfoil_id) <= 128),
  kind text not null check (kind in ('best_run', 'neutral_ref')),
  alpha double precision not null check (alpha between -30 and 30),
  reynolds double precision not null check (reynolds between 100 and 1000000),
  cl double precision not null check (cl between -10 and 10),
  cd double precision not null check (cd between 0 and 20),
  ld double precision not null check (ld between -100 and 300),
  separation_pct double precision not null check (separation_pct between 0 and 100),
  source_label text not null check (char_length(source_label) between 1 and 80),
  recorder_uid text not null default '' check (char_length(recorder_uid) <= 128),
  visibility text not null default 'public' check (visibility = 'public'),
  created_at timestamptz not null default now()
);

create index if not exists benchmarks_visibility_ld_idx
  on public.benchmarks (visibility, ld desc, created_at desc);

alter table public.benchmarks enable row level security;

drop policy if exists "Public benchmarks are readable by everyone" on public.benchmarks;
create policy "Public benchmarks are readable by everyone"
  on public.benchmarks
  for select
  using (visibility = 'public');

drop policy if exists "Anyone or owner can publish public benchmarks" on public.benchmarks;
create policy "Anyone or owner can publish public benchmarks"
  on public.benchmarks
  for insert
  with check (
    visibility = 'public'
    and (
      (auth.uid() is null and recorder_uid = '')
      or (auth.uid() is not null and recorder_uid = auth.uid()::text)
    )
  );

drop policy if exists "Recorders can delete own benchmarks" on public.benchmarks;
create policy "Recorders can delete own benchmarks"
  on public.benchmarks
  for delete
  using (auth.uid() is not null and recorder_uid = auth.uid()::text);

-- 4. Enable Realtime updates for live sync (idempotent)
do $$
declare
  tbl text;
begin
  foreach tbl in array array['user_profiles', 'airfoils', 'benchmarks'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end
$$;
