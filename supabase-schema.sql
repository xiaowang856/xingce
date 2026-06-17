create table if not exists public.study_profiles (
  sync_id text primary key,
  user_name text not null,
  salt text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_profiles enable row level security;

drop policy if exists "anon read" on public.study_profiles;
create policy "anon read"
on public.study_profiles
for select
to anon
using (true);

drop policy if exists "anon insert" on public.study_profiles;
create policy "anon insert"
on public.study_profiles
for insert
to anon
with check (true);

drop policy if exists "anon update" on public.study_profiles;
create policy "anon update"
on public.study_profiles
for update
to anon
using (true)
with check (true);

create index if not exists study_profiles_user_name_idx
on public.study_profiles (user_name);
