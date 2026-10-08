-- TheLife: EVERYTHING the game needs in Supabase, in one paste (accounts, cloud saves, player IDs, private messages).
-- Supabase -> SQL Editor -> New query -> paste all of this -> Run. Safe to run again any time.

-- ===== 1. Accounts and cloud saves =====

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


-- ===== 2. Player IDs and private messages (touched only by the game server) =====

create table if not exists public.players (
  uid        text primary key,                    -- the player's ID that people share (10 hex characters)
  name       text not null,                       -- their character's name
  seen_at    timestamptz not null default now()   -- last time they played
);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  from_uid   text not null,
  to_uid     text not null,
  body       text not null check (char_length(body) between 1 and 400),
  sent_at    timestamptz not null default now()
);

create index if not exists messages_to_idx   on public.messages (to_uid, sent_at desc);
create index if not exists messages_from_idx on public.messages (from_uid, sent_at desc);
create index if not exists messages_sent_idx on public.messages (sent_at desc);

-- Nobody can read or write these from the website: there are no policies, so only the game server (service role) touches them.
alter table public.players  enable row level security;
alter table public.messages enable row level security;
revoke all on public.players, public.messages from anon, authenticated;


-- ===== 3. Handy while testing (run one at a time, change the email) =====
-- Make yourself an admin (turns on the developer tools after you have signed up once):
--   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
-- See who has signed up:
--   select u.email, p.display_name, p.is_admin, u.created_at, u.email_confirmed_at from auth.users u join public.profiles p on p.id = u.id order by u.created_at desc;
-- Start a test account over (deletes its cloud save, keeps the login):
--   delete from public.saves where user_id = (select id from auth.users where email = 'you@example.com');
-- Confirm an email by hand if the confirmation mail never arrives:
--   update auth.users set email_confirmed_at = now() where email = 'you@example.com';
-- Delete a test account completely (its profile and saves go with it):
--   delete from auth.users where email = 'you@example.com';
