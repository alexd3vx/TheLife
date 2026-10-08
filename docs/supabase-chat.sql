-- TheLife: player IDs and private messages in your Supabase database.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then give the game server the project's SERVICE ROLE key (a secret: it goes on the VPS only, never in the website):
--   sudo nano /opt/thelife/server.env      (add the line  SUPABASE_SERVICE_KEY=<the service_role key>)
--   sudo systemctl restart thelife
-- Without that key the server keeps messages in a file on the VPS instead, and everything still works.

create table if not exists public.players (
  uid        text primary key,                    -- the player's ID that people share (10 hex characters)
  name       text not null,                       -- their character's name
  seen_at    timestamptz not null default now()   -- last time they played
);

-- Phone numbers (in-game, always 0990 to 0999 followed by seven digits). Safe to run again; older databases get the column here.
alter table public.players add column if not exists phone text;
create unique index if not exists players_phone_idx on public.players (phone) where phone is not null;

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

-- Optional housekeeping: keep a year of messages.
-- delete from public.messages where sent_at < now() - interval '365 days';
