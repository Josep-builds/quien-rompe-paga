# TESTLOG

Bugs found in live testing, their fixes, and the tests that cover them.
Newest entry first.

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
