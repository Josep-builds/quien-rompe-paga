-- Quien Rompe, Paga — approved breach notice text (Dragon Stack / LLM feature)
--
-- Stores only the human-approved notice text. The AI draft itself is never
-- persisted server-side — it lives in the browser only until a human edits
-- and approves it, at which point this is what gets saved. No RLS changes
-- needed - the existing companies_own policies on public.quotes already
-- cover these new columns.
--
-- Run this manually in the Supabase SQL Editor, after 001-003.
-- Not applied automatically by the app.

alter table public.quotes
  add column notice_approved_text text,
  add column notice_approved_at timestamptz;

alter table public.quotes
  add constraint quotes_notice_approval_consistent
    check ((notice_approved_text is null) = (notice_approved_at is null));
