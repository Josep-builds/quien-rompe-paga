-- Quien Rompe, Paga — simulated case generation + surge billing
--
-- Adds the columns the Casos dashboard needs: a labeled fake victim
-- name for each simulated case, and a flag marking whether that case
-- was opened above contracted capacity in the first 72h (drives the
-- x1.3 surge line in the invoice). No RLS changes needed - the
-- existing companies_own policies on public.cases already cover these
-- new columns.
--
-- Run this manually in the Supabase SQL Editor, after 001_init.sql.
-- Not applied automatically by the app.

alter table public.cases
  add column victim_alias text not null default '',
  add column is_surge boolean not null default false;

-- Every case in this app is invented; enforce the SIMULADO label in the
-- DB too, not just in the UI/app code.
alter table public.cases
  add constraint cases_victim_alias_labeled_simulado
    check (victim_alias = '' or victim_alias ~* 'simulado');
