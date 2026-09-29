# TESTLOG

Bugs found in live testing, their fixes, and the tests that cover them.
Newest entry first.

---

## 2026-09-29 — Quote saved with zero data types broke notice drafting

**Bug:** A quote was saved with an empty `data_types` array — nothing
stopped it at any layer (the form let "Calcular cotización" and
"Guardar cotización" both run with no checkbox selected; `saveQuote()`
filtered the array against the allowlist but never checked the result
was non-empty). Later, clicking "Redactar aviso con IA" on that quote
sent the model zero data types and it correctly replied "no puedo
generar el aviso porque los tipos de datos no fueron especificados" —
a wasted API call surfacing a data problem as an AI failure.

**Fix:**
- `src/lib/dataTypes.ts` (new) — single source of truth for the
  allowed data types, replacing a duplicated local array in
  `QuoteCalculator.tsx` and a duplicated `Set` in `saveQuote()`.
  `validateDataTypes()` throws `DataTypesValidationError` on a
  non-array, an empty array, or an array that's empty after dropping
  unknown values — never silently returns `[]`.
- `src/components/QuoteCalculator.tsx` — `handleSubmit` now calls
  `validateDataTypes(dataTypes)` before `computeQuote()`, so
  "Calcular cotización" itself refuses to run with no data type
  selected (not just "Guardar cotización").
- `src/app/quotes/actions.ts` — `saveQuote()` uses the shared
  validator instead of its own inline filter, so the empty case is
  rejected server-side regardless of what the client sent.
- `src/app/quotes/[id]/actions.ts` — `draftNotice()` now checks
  `dataTypes.length === 0` immediately after loading the quote and
  returns a friendly Spanish message *before* constructing the
  Anthropic request — no API call is made for a quote with no data
  types.
- `supabase/migrations/005_quotes_data_types_not_empty.sql` (not
  applied yet) — `CHECK (cardinality(data_types) >= 1)` on
  `public.quotes`, closing the gap for any write path other than the
  app. Deliberately uses `cardinality()`, not
  `array_length(data_types, 1)` — the latter returns `NULL` (not `0`)
  for an empty array, and a `NULL` result in a Postgres `CHECK`
  constraint is treated as *passing*, not failing, which would have
  silently let the exact bug back in.

**Test:** `src/lib/dataTypes.test.ts`, 9 tests, all green — including
one asserting the literal empty-array case that caused the live bug,
one confirming unknown values are dropped rather than kept, and one
confirming an array that's all-unknown-values is rejected (empty after
filtering counts as empty). `draftNotice()`'s refusal check and the DB
constraint are both simple guards with no pure-function core to
unit-test — verified by code review and by re-running the full suite.

`npm test`: **49/49 passing** (17 pricing + 12 invoice + 11 curpHash +
9 dataTypes). `npm run build` and `npm run lint`: clean.

**Not yet live:** `supabase/migrations/005_quotes_data_types_not_empty.sql`
has not been run. Until it is, the DB itself still accepts an empty
`data_types` array — the app-level fixes above are what actually closes
the bug in the shipped product; the migration is defense in depth. If
the quote that triggered this bug still has `data_types = '{}'` in
production, either delete it or add data types to it (e.g. `update
quotes set data_types = array['CURP'] where id = '<id>'`) before
running the migration, or the `ALTER TABLE ADD CONSTRAINT` will fail
validating that row.

---

## 2026-09-29 — LLM notice drafting (Dragon Stack)

**Feature, not a bug fix.** "Redactar aviso con IA" on the Casos dashboard:
a server action calls the Anthropic API to draft a breach notice + five
moves, requires human approval before anything is saved, and never sends
victim-level data to the model.

**Built:**
- `supabase/migrations/004_notice_approval.sql` (not applied yet) —
  `quotes.notice_approved_text` + `notice_approved_at`, with a `CHECK`
  keeping the pair in sync. The AI draft itself is never persisted
  server-side — only human-approved text is written.
- `src/app/quotes/[id]/actions.ts` — `draftNotice(quoteId)` calls
  `claude-haiku-4-5` with only `data_types` and `records_affected` from
  the quote (no victim names/identifiers, nothing else in the input);
  `approveNotice(quoteId, text)` validates non-empty + ≤5000 chars and
  saves. Typed error handling: `AuthenticationError`,
  `RateLimitError`, `APIConnectionError` (checked before the base
  `APIError`, since it's a subclass in the TS SDK), and a generic
  `APIError` fallback — each mapped to a friendly Spanish message
  instead of a raw stack trace reaching the user.
- `src/components/CasosDashboard.tsx` — new "Aviso de brecha" panel:
  draft → visible "GENERADO POR IA — requiere aprobación humana" badge
  → editable textarea → "Aprobar texto". Nothing reaches the database
  until approval; re-drafting is available before or after approving.

**System prompt hardening (found live, fixed before commit):** the first
version instructed "texto plano" but the model still returned Markdown
headers/bullets and a "Querido cliente," salutation — that would have
shown literal `#`/`**` clutter in a plain `<textarea>`. Tightened the
prompt with explicit Markdown-forbidding and salutation-forbidding
rules; verified against the real API (script run locally, not
committed) that the corrected prompt produces clean plain-text output:
notice paragraph + "Cinco acciones recomendadas:" + a numbered list of
five, each tied to a data type (CURP → official-ID fraud check, teléfono
→ suspicious-call monitoring), no INAI mention anywhere, `stop_reason:
"end_turn"` well inside the 1024-token budget (471 output tokens used).

**Test:** no new unit tests — this feature is a live API call with no
pure-function core to unit-test (unlike pricing/invoice/curpHash). Manual
verification only, against the real Anthropic API: (1) prompt returns
plain text, no Markdown; (2) five actions, each linked to an exposed data
type; (3) no INAI mention; (4) `npm run build`/`lint`/`test` all clean
(40/40 existing tests unaffected); (5) `/quotes/[id]` still redirects
signed-out visitors (307, confirmed via curl).

**Not yet live:** `supabase/migrations/004_notice_approval.sql` has not
been run — "Aprobar texto" will fail against production until it is
(the two new columns don't exist yet). `draftNotice()` itself doesn't
depend on the migration and should work once `ANTHROPIC_API_KEY` is live
in Vercel.

---

## 2026-09-28 — Security tooling + shadow clause (Blueprint Condition #3): /verificar

**Feature, not a bug fix.** Implements the victim-facing k-anonymity CURP
check: partner-verification gate, client-side hashing, 5-char prefix
lookup, exact match on-device.

**Built:**
- `src/lib/curpHash.ts` — `computeCurpHash()` (Web Crypto SHA-256, salted,
  case/whitespace-normalized), `hashPrefix()`, `isValidHashPrefix()`.
- `supabase/migrations/003_breach_index.sql` (not applied yet — see
  below) — `breach_index` table, RLS ON with public SELECT (required for
  signed-out victims) and no write policy; seeds 3 demo CURPs + 47
  synthetic filler rows, all salted-hashed inline in SQL via pgcrypto's
  `digest()` so no raw CURP is ever written to a column.
- `src/app/api/lookup/route.ts` — POST-only (prefix never in a URL/query
  string), validates exactly 5 lowercase hex chars, queries
  `breach_index` by the generated `hash_prefix` column, returns the full
  bucket. Does not log the request body.
- `src/app/verificar/page.tsx` — public, no auth. Shows nothing but the
  "Verificación con socio (SIMULADA)" button until clicked; then a CURP
  input, 3 CURPs labeled "CURP de prueba — inventada", and yes/no + five
  moves in plain Mexican Spanish shown either way.

**Test:** `src/lib/curpHash.test.ts`, 11 tests, all green —
- Known-answer hashes for the 3 demo CURPs, cross-checked against Python
  `hashlib.sha256(salt + curp)` independently of this codebase, so a
  silent algorithm/salt drift between the client and the SQL seed would
  fail loudly here rather than surface as "verification never matches"
  in production.
- Case/whitespace normalization produces identical hashes; different
  CURPs produce different hashes; output is always 64 lowercase hex
  chars; prefix extraction and its validator (`isValidHashPrefix`) are
  covered directly, including the exact-length/lowercase/hex rules
  `/api/lookup` also enforces server-side.

`npm test`: **40/40 passing** (17 pricing + 12 invoice + 11 curpHash).
`npm run build` and `npm run lint`: clean.

**Manually verified against the running dev server** (not a live DB —
`breach_index` doesn't exist until migration 003 runs):
- `curl` confirms `/verificar`'s initial HTML contains the partner-gate
  button but *not* the CURP input or demo-CURP list — the gate isn't
  just CSS-hidden, the content isn't rendered until the button is
  clicked (client state).
- `/api/lookup` returns 400 for a too-short prefix, 400 for an uppercase
  prefix, 400 for malformed JSON, and — since the table doesn't exist in
  this environment yet — 500 for a well-formed prefix (expected until
  003 is applied).
- The dev server's access log for all of the above shows only method +
  path + status + timing, never the request body or prefix value.

**Not yet live:** `supabase/migrations/003_breach_index.sql` has not
been run. Until it is, every `/api/lookup` call 500s and `/verificar`
will always report "no encontramos tu CURP" regardless of what's typed
(confirmed above). The three demo CURPs on the page will only produce a
"sí" match once the seed is applied with the exact same salt.

---

## 2026-09-28 — Billing rule (Blueprint Condition #4): Casos dashboard + invoice

**Feature, not a bug fix.** Implements the "pay only for resolved victims"
billing rule end to end: a login-required Casos dashboard per saved quote,
120 invented SIMULADO-labeled victim cases, resolving a case only with a
mandatory evidence note, and an invoice panel that bills exactly what the
packet's formula says.

**Built:**
- `src/lib/invoice.ts` — pure `computeInvoice()`: `billableTotal = setupFee
  + Σ resolved-base × fee + Σ resolved-surge × fee × 1.3`. Recomputed from
  the full case list every call — never a separately mutable counter.
- `supabase/migrations/002_cases_simulation.sql` (not applied yet — see
  below) — adds `cases.victim_alias` (DB `CHECK` requires it contain
  "simulado", case-insensitive) and `cases.is_surge`.
- `src/app/quotes/[id]/actions.ts` — `generateSimulatedCases()` (120 fake
  name pairs, refuses to run twice per quote), `updateContractedCapacity()`
  (locked once cases exist, since `is_surge` is fixed at generation time),
  `resolveCase()` (rejects empty/over-2000-char evidence notes server-side,
  on top of the DB `CHECK` constraint from `001_init.sql`).
- `src/components/CasosDashboard.tsx` + `/quotes`, `/quotes/[id]` routes —
  both redirect signed-out visitors to `/`. Case list, per-row "Marcar
  resuelto" form (submit disabled client-side until the note is non-empty,
  matching the DB-level enforcement), and the invoice bar: "Casos: X
  abiertos · Y resueltos · Facturable: $Z" per `docs/mockup.png`.

**Test:** `src/lib/invoice.test.ts`, 12 tests, all green —
- Packet test plan **#4** (billing rule): generating cases (all `open`)
  bills MX$0 beyond setup; resolving one case adds exactly one fee;
  resolving a second adds exactly one more (no double counting).
- Packet test plan **#5** (surge): a resolved surge case bills at
  `fee × 1.3`; open surge cases don't bill until resolved; a 120-case,
  capacity-50 scenario (50 base + 70 surge, matching the mockup's case
  count) computes the exact expected total.
- Plus: pure-function determinism, negative-input validation, custom
  config, empty case list.

`npm test`: **29/29 passing** (17 from `pricing.test.ts` + 12 new).
`npm run build` and `npm run lint`: clean.

**Not yet live:** `supabase/migrations/002_cases_simulation.sql` has not
been run — pasted for the user to apply in the Supabase SQL Editor.
Until then, "Generar casos simulados" and case resolution will fail
against production (the `victim_alias`/`is_surge` columns don't exist).
Evidence-note enforcement was verified via the unit tests and the DB
`CHECK` constraint text, not against a live resolve (no rows exist yet).

---

## 2026-09-28 — Quote omitted the surge reserve

**Bug:** `computeQuote()` accepted an optional `surgeReserve` override that
defaulted to `0`. Nothing in the app ever computed a real surge reserve, so
every quote silently priced it at zero — violating the packet's pricing
formula (§9: "Quote = setup + (records × activation × fee per resolved
case) + **surge reserve**"), Blueprint Bet 3, and Honors Condition #5
(surge capacity pricing). Found during a live test of the quote screen.

**Fix:** `src/lib/pricing.ts`
- Added `contractedCapacity` as a `computeQuote()` input, defaulting to
  `PricingConfig.defaultContractedCapacity` (500 cases in the first 72h).
- Surge reserve is now derived, not passed in:
  `surgeReserve = max(0, expectedCases - contractedCapacity) × feePerResolvedCase × surgeRate`,
  with `surgeRate = 0.30` per the packet's "+30% on cases above contracted
  capacity in first 72h."
- `QuoteResult` now exposes the full breakdown (`setupFee`, `casesCost`,
  `surgeReserve`, `casesAboveCapacity`, `contractedCapacity`) instead of a
  single opaque `planTotal`.
- `src/app/page.tsx` — the green "Plan de recuperación" card now lists the
  three-line breakdown (setup / casos esperados × cuota / reserva de
  surge) instead of only the total.

**Effect on the reference numbers:** with the corrected 2026 UMA
(see below) and the default 500-case capacity, a 500,000-record sensitive
breach now quotes fine ceiling $75,078,400 and plan $10,430,000 (was
$8,150,000 before the surge reserve was wired in) — ratio ~7:1, not 9:1.
The mockup's original numbers predate this fix and are no longer the
source of truth; `pricing.test.ts` is.

**Test:** `src/lib/pricing.test.ts`
- `"matches the hand calculation for 500,000 sensitive records at default capacity"`
  — asserts the full breakdown above field by field.
- `"charges no surge reserve when expected cases stay within contracted capacity"`
  — 20,000 records → 400 expected cases, under the 500 default → surge
  reserve is exactly 0.
- `"accepts a custom contracted capacity and recomputes the surge reserve"`
  — capacity of 2,000 on the same 500,000-record input changes
  `casesAboveCapacity` and `surgeReserve` accordingly.
- `"rejects a negative contracted capacity"` / `"rejects a non-integer
  contracted capacity"` — input validation on the new field.

17/17 tests pass (`npm test`).

**UMA value verified for 2026:** MX$117.31/day, published by INEGI in the
DOF on 2026-01-09, effective 2026-02-01–2027-01-31 (source cited in
`DEFAULT_PRICING_CONFIG` in `src/lib/pricing.ts`). Previous default of
117 was an unverified placeholder; replaced with the official 2026 value.
