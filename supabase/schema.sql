-- TheLife: accounts and cloud saves. Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.

-- One row per player, created automatically when someone signs up.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 20),
  is_admin boolean not null default false,          -- turns on the developer tools in the game (set by hand, never by the client)
  created_at timestamptz not null default now()
);

-- Cloud saves: one JSON save per player per slot (the game validates it when it loads).
create table if not exists public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null default 1 check (slot between 1 and 3),
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint saves_size check (pg_column_size(state) < 400000)
);

alter table public.profiles enable row level security;
alter table public.saves enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles: update own name" on public.profiles;
create policy "profiles: update own name" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()));

drop policy if exists "saves: read own" on public.saves;
create policy "saves: read own" on public.saves for select using (auth.uid() = user_id);
drop policy if exists "saves: insert own" on public.saves;
create policy "saves: insert own" on public.saves for insert with check (auth.uid() = user_id);
drop policy if exists "saves: update own" on public.saves;
create policy "saves: update own" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "saves: delete own" on public.saves;
create policy "saves: delete own" on public.saves for delete using (auth.uid() = user_id);

-- Keep updated_at honest.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before update on public.saves for each row execute function public.touch_updated_at();

-- Create the profile row when a user signs up.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Player'), 20))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Make yourself an admin (after you have signed up once), replacing the email:
--   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
