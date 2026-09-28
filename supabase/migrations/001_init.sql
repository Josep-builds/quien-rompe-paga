-- Quien Rompe, Paga — initial schema
--
-- Tables: companies, quotes, cases. Row Level Security is ON for all
-- three, scoped so each authenticated user only ever sees their own
-- company's rows. All figures stored here are illustrative/simulated
-- per docs/PACKET.md — no real breach or victim data.
--
-- Run this manually in the Supabase SQL Editor. Not applied by the app.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

create policy "companies_select_own"
  on public.companies for select
  using (user_id = auth.uid());

create policy "companies_insert_own"
  on public.companies for insert
  with check (user_id = auth.uid());

create policy "companies_update_own"
  on public.companies for update
  using (user_id = auth.uid());

-- Auto-create a company row the moment a user first signs in, so the app
-- never has to race to create one before saving a quote.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.companies (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,

  records_affected integer not null
    check (records_affected between 1 and 200000000),
  sensitive_data boolean not null default false,
  data_types text[] not null default '{}',
  contracted_capacity integer not null default 500
    check (contracted_capacity >= 0),

  -- Computed by src/lib/pricing.ts at save time; stored for the record,
  -- never recomputed from these columns.
  fine_ceiling numeric not null check (fine_ceiling >= 0),
  expected_cases integer not null check (expected_cases >= 0),
  setup_fee numeric not null check (setup_fee >= 0),
  cases_cost numeric not null check (cases_cost >= 0),
  surge_reserve numeric not null check (surge_reserve >= 0),
  plan_total numeric not null check (plan_total >= 0),

  status text not null default 'draft'
    check (status in ('draft', 'accepted', 'declined')),

  created_at timestamptz not null default now()
);

create index quotes_company_id_idx on public.quotes (company_id);

alter table public.quotes enable row level security;

create policy "quotes_select_own"
  on public.quotes for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = quotes.company_id and c.user_id = auth.uid()
    )
  );

create policy "quotes_insert_own"
  on public.quotes for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = quotes.company_id and c.user_id = auth.uid()
    )
  );

create policy "quotes_update_own"
  on public.quotes for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = quotes.company_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,

  status text not null default 'open'
    check (status in ('open', 'resolved')),
  evidence_note text,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),

  -- A case cannot be marked resolved without a non-empty evidence note.
  constraint cases_resolved_requires_evidence check (
    status <> 'resolved'
    or (evidence_note is not null and length(trim(evidence_note)) > 0)
  )
);

create index cases_company_id_idx on public.cases (company_id);

-- Keep resolved_at consistent with status regardless of what the app
-- sends: set it on the resolved transition, clear it if reopened.
create function public.set_case_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger cases_set_resolved_at
  before insert or update on public.cases
  for each row execute function public.set_case_resolved_at();

alter table public.cases enable row level security;

create policy "cases_select_own"
  on public.cases for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = cases.company_id and c.user_id = auth.uid()
    )
  );

create policy "cases_insert_own"
  on public.cases for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = cases.company_id and c.user_id = auth.uid()
    )
  );

create policy "cases_update_own"
  on public.cases for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = cases.company_id and c.user_id = auth.uid()
    )
  );
