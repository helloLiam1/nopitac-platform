-- ============================================================
-- NOPITAC Supabase Schema & Row Level Security (RLS)
-- Paste and run this once in Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. User Profiles (1 row per registered user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  composition text not null default 'circle',
  accent_color text default '#6a76ff',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly viewable"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  raw_username text;
  raw_name text;
begin
  raw_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  raw_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', raw_name)));
  insert into public.profiles (id, username, display_name)
  values (new.id, raw_username, raw_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Custom Domains per user
create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.domains enable row level security;

create policy "Domains are publicly viewable"
  on public.domains for select
  using (true);

create policy "Owners can manage their domains"
  on public.domains for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 3. People on a user's composition board
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  domain text not null default 'artists',
  domain_color text default '#27ff83',
  place text default '',
  birth_year text default '',
  description text default '',
  links text default '',
  photo_url text default '',
  photo_settings jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.people enable row level security;

create policy "Board people are publicly viewable"
  on public.people for select
  using (true);

create policy "Board owners can manage their people"
  on public.people for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 4. Saved Boards (Community bookmarks)
create table if not exists public.saved_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_username text not null,
  created_at timestamptz not null default now(),
  unique (user_id, saved_username)
);

alter table public.saved_boards enable row level security;

create policy "Users can view their own saved boards"
  on public.saved_boards for select
  using (auth.uid() = user_id);

create policy "Users can manage their own saved boards"
  on public.saved_boards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Storage Bucket for portrait photos
insert into storage.buckets (id, name, public)
values ('portraits', 'portraits', true)
on conflict (id) do nothing;

create policy "Portrait images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'portraits');

create policy "Authenticated users can upload their own portraits"
  on storage.objects for insert
  with check (
    bucket_id = 'portraits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Authenticated users can update their own portraits"
  on storage.objects for update
  using (
    bucket_id = 'portraits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
