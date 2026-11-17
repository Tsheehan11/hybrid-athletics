-- Hybrid Athletics: one row per document per account.
-- Documents are "program" (profile, workouts, settings) and "m-YYYY-MM" (one month of logs).
-- Run this once in the Supabase SQL editor.

create table if not exists public.docs (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  id         text   not null,
  data       jsonb  not null,
  updated_ms bigint not null,
  primary key (user_id, id)
);

alter table public.docs enable row level security;

drop policy if exists "people read and write their own docs" on public.docs;
create policy "people read and write their own docs" on public.docs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
