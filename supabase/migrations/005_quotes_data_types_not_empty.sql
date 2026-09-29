-- Quien Rompe, Paga — quotes.data_types must be non-empty
--
-- Bug found in live testing: a quote was saved with zero data types,
-- and the AI notice then refused to draft anything (nothing to tie the
-- five moves to). App-level validation now blocks this in the form and
-- in saveQuote() (see src/lib/dataTypes.ts), but this constraint closes
-- the gap for any other write path.
--
-- Uses cardinality(), not array_length(data_types, 1) — array_length
-- returns NULL (not 0) for an empty array, and a NULL result in a CHECK
-- constraint is treated as passing, not failing. cardinality() returns
-- 0 for an empty array, so the >= 1 comparison is FALSE and the row is
-- correctly rejected.
--
-- If this fails to apply because a row already has empty data_types
-- (the live bug that prompted this migration), fix or delete that row
-- first — e.g.:
--   select id from public.quotes where cardinality(data_types) = 0;
--
-- Run this manually in the Supabase SQL Editor, after 001-004.
-- Not applied automatically by the app.

alter table public.quotes
  add constraint quotes_data_types_not_empty
    check (cardinality(data_types) >= 1);
