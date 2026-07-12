-- Acorn Patient Follow-Up — security migration.
-- Run this in the Supabase dashboard (SQL Editor) as described in
-- docs/SECURITY.md. It is idempotent — safe to run more than once.

-- ── New per-row tables (ciphertext only — encrypted client-side) ─────────
create table if not exists public.patients (
  id          bigint primary key,
  ciphertext  text not null,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now()
);

create table if not exists public.sedation_patients (
  id          bigint primary key,
  ciphertext  text not null,
  version     bigint not null default 1,
  updated_at  timestamptz not null default now()
);

-- The wrapped (password-encrypted) master data key. Contains no plaintext
-- key material — useless without the office password.
create table if not exists public.vault_meta (
  id          smallint primary key,
  kdf_salt    text not null,
  kdf_iters   integer not null,
  wrapped_key text not null,
  key_check   text not null,
  updated_at  timestamptz not null default now()
);

-- ── Row Level Security: signed-in staff only, anonymous gets nothing ─────
alter table public.patients          enable row level security;
alter table public.sedation_patients enable row level security;
alter table public.vault_meta        enable row level security;

drop policy if exists "staff full access" on public.patients;
create policy "staff full access" on public.patients
  for all to authenticated using (true) with check (true);

drop policy if exists "staff full access" on public.sedation_patients;
create policy "staff full access" on public.sedation_patients
  for all to authenticated using (true) with check (true);

drop policy if exists "staff full access" on public.vault_meta;
create policy "staff full access" on public.vault_meta
  for all to authenticated using (true) with check (true);

-- ── Lock down the legacy table ────────────────────────────────────────────
-- Enabling RLS immediately revokes the anonymous read/write access the old
-- app relied on (its anon key is public in the repository history).
-- Signed-in staff keep read access so the app can migrate the data once;
-- drop the table after migration (see docs/SECURITY.md).
alter table if exists public.tracker_data enable row level security;

drop policy if exists "staff read legacy" on public.tracker_data;
create policy "staff read legacy" on public.tracker_data
  for select to authenticated using (true);
