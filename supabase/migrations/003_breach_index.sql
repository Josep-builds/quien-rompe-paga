-- Quien Rompe, Paga — breach_index seed (Blueprint Condition #3, shadow clause)
--
-- Stores only salted SHA-256 hashes of INVENTED CURPs — never a raw
-- identifier, at rest or in a column. RLS is ON; SELECT is public by
-- design (k-anonymity lookup must work for unauthenticated victims —
-- see /api/lookup, which only ever forwards a 5-char prefix, never a
-- full hash or CURP, and does not log request bodies). No insert/
-- update/delete policy exists, so only a migration run as the DB owner
-- (this one) or the service role can write to this table.
--
-- Known weakness, stated honestly (docs/PACKET.md §10): CURPs are
-- guessable enough that hashing alone can be brute-forced. That is
-- exactly why Condition #3's partner-verification gate must run before
-- any lookup — the salt below is not a secret and is not the security
-- boundary. It MUST equal SIMULATED_SALT in src/lib/curpHash.ts
-- exactly, or client-computed hashes will never match a seeded row.
--
-- Run this manually in the Supabase SQL Editor, after 001 and 002.
-- Not applied automatically by the app.

create extension if not exists pgcrypto;

create table public.breach_index (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,
  hash_prefix text generated always as (substring(hash from 1 for 5)) stored,
  created_at timestamptz not null default now()
);

create index breach_index_hash_prefix_idx on public.breach_index (hash_prefix);

alter table public.breach_index enable row level security;

create policy "breach_index_select_all"
  on public.breach_index for select
  using (true);

-- Seed ~50 invented CURPs, salted-hashed inline so no raw CURP is ever
-- written to a table — only visible transiently here, in migration
-- source, as clearly-fake demo strings. The first 3 are the ones shown
-- on /verificar labeled "CURP de prueba — inventada"; the other 47 are
-- synthetic filler so the k-anonymity bucket isn't trivially small.
insert into public.breach_index (hash)
select encode(digest('qrp-simulado-salt-v1' || curp, 'sha256'), 'hex')
from (
  values
    ('SIML800101HDFRRL01'),
    ('GARC850315MDFRNL02'),
    ('HERZ920730HDFRRC09')
) as demo(curp)
union all
select encode(
  digest('qrp-simulado-salt-v1' || ('SIMULADO' || lpad(gs::text, 10, '0')), 'sha256'),
  'hex'
)
from generate_series(1, 47) as gs;
