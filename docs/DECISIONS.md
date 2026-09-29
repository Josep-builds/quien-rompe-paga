# DECISIONS

Log of notable decisions and operational events for Quien Rompe, Paga.
Newest entry first. For bug/fix detail, see `docs/TESTLOG.md`; this file
is the higher-level "what happened and why" record.

---

## 2026-09-29

- **Anthropic API key rotated after accidental exposure in a screenshot.**
  The key had appeared visible in a screenshot taken during testing.
  Rotated immediately in the Anthropic console; the old key was revoked.
  Reinforces the existing rule (Security Floor, `docs/PACKET.md` §10):
  secrets belong only in Vercel/`.env.local` env vars, never visible in
  UI, logs, or anything that gets screenshotted.

- **Rotating `ANTHROPIC_API_KEY` required a redeploy to take effect.**
  Updating the env var value in Vercel's dashboard alone did not update
  the already-running serverless functions — a new deploy was needed to
  pick up the new key. Worth remembering for any future secret rotation
  on this project: change the env var, then trigger a redeploy, not
  just save-and-assume.

- **AI hallucinations in the breach-notice draft caught by the human
  approval step, then fixed at the source.** Live testing surfaced the
  model asserting facts never given as input — "la vulnerabilidad ya fue
  cerrada", "hemos notificado a las autoridades", a fabricated "bloqueo
  de CURP ante RENAPO" procedure. The mandatory human-approval gate
  (nothing saves until "Aprobar texto") did its job and caught this
  before anything could be published. Fixed properly at the prompt level
  rather than relying on the approval gate alone: `src/lib/noticePrompt.ts`
  now explicitly forbids asserting cause/fix-status/authority-notification
  and inventing specific procedures, instructing `[CAMPO — por
  confirmar]` placeholders instead of guessing. See `docs/TESTLOG.md` →
  "AI notice invented facts not in the input" for the full writeup and
  live verification.

- **Zero-data-types validation added, plus cleanup of the invalid old
  quote before running migration 005.** A quote had been saved earlier
  with an empty `data_types` array (nothing blocked it at the time),
  which then broke notice drafting. Validation now blocks this at every
  layer — form, `saveQuote()`, `draftNotice()` — and
  `supabase/migrations/005_quotes_data_types_not_empty.sql` adds a DB
  `CHECK` constraint closing the gap for any other write path. Since
  `ALTER TABLE ADD CONSTRAINT` validates existing rows, the old invalid
  quote had to be fixed or deleted before that migration could apply
  cleanly — done as part of applying 005. See `docs/TESTLOG.md` →
  "Quote saved with zero data types broke notice drafting".

### Next steps

- Persona test (packet §11): walk Lic. Andrea's flow (profile → quote →
  accept → approve notice → publish) and Lupita's flow (partner link →
  simulated verification → victim screen); log the worst hesitation in
  each and fix it.
- Demo video.
- Deliverable PDFs.
