# IMPLEMENTATION_PROMPT — Quien Rompe, Paga (QRP)

Build plan derived from `docs/PACKET.md`. This document is the execution
contract: build features in this order, each one small and independently
testable, each gated by the Security Floor and Scope Cut below before moving
to the next. No feature is "done" until its acceptance criteria pass.

---

## 0. Non-negotiable constraints (apply to every feature below)

**Security Floor** (packet §10–11) — re-check on every commit that touches
data or secrets:
- Secrets (Supabase keys, LLM API key) live only in Vercel env vars. Never
  committed, never in client bundles except the Supabase anon/public key.
- No route or component renders personal data (breach profile, case, victim
  info) before the requesting user has an active Google-authenticated
  session.
- Every table holding user-scoped data (`companies`, `quotes`, `cases`) has
  RLS enabled with a policy restricting rows to the owning company.
- Server validates every input: `records_affected` integer in
  `[1, 200_000_000]`; text fields length-capped; nothing user-supplied goes
  raw into an LLM prompt (must pass through a template/escape step).
- All breach/victim data is invented and labeled `SIMULATED` in the UI.

**Scope cut** (packet §8) — building any of these is out of scope; flag it
if a feature below seems to require one:
- No real breach data, scraping, or dark-web sourcing.
- No real identity verification (partner login / INE check are SIMULATED
  buttons, visibly labeled).
- No real WhatsApp/SMS/voice sending, no real payments — invoice is a
  computed number, never a charge.
- No case-management workflow beyond `open → resolved (+ evidence note)`.
- No password-strength checking, no antivirus/malware scanning.
- No legal advice — fine figures are statutory ceilings shown with a
  "verify with a lawyer" disclaimer, always.

---

## 1. Feature sequence

### F1 — Project scaffold & empty deploy
**Build:** Next.js app on Vercel, Supabase project wired (env vars only,
no schema yet), a single placeholder landing route. No auth, no data.

**Acceptance criteria:**
- `npm run build` succeeds locally.
- App is live at a Vercel URL and renders the placeholder page.
- `.env` values are not committed (verify `.gitignore`); Vercel project has
  the Supabase URL/anon key set in its dashboard, not in code.

---

### F2 — Google sign-in gate
**Build:** Supabase Auth, Google provider only. All routes except the
sign-in page redirect unauthenticated users to sign-in. A signed-in user
lands on an empty "company dashboard" shell with no data yet.

**Acceptance criteria:**
- Visiting any app route while signed out redirects to sign-in; no HTML
  containing company/case data is ever served pre-auth (check network tab,
  not just UI).
- Signing in with a Google account creates/loads a `companies` row tied to
  that user's auth id.
- Signing out clears the session and re-triggers the redirect.

---

### F3 — Database schema + RLS
**Build:** Supabase Postgres tables — `companies`, `quotes`, `cases`,
`breach_index` — with RLS enabled on all four. Policies scope `quotes` and
`cases` to `company_id = auth.uid()`'s company. `breach_index` holds only
salted hashes, never raw identifiers, per the packet's shadow clause.

**Acceptance criteria:** (packet test #3)
- With two separate Google test accounts (Company A, Company B), Company B
  cannot `select` Company A's quotes or cases via the app or via a direct
  Supabase client call using B's session token.
- Inspecting `breach_index` shows no column capable of holding a raw CURP —
  hash columns only.
- RLS is ON (not just policies present but disabled) on all four tables —
  confirm via Supabase dashboard.

**→ Deploy checkpoint 1:** ship F1–F3 to production. This is the first of
the two required deploys — an authenticated, empty, RLS-protected shell is
live before any business logic exists.

---

### F4 — Breach profile form + validation
**Build:** Form (records affected, data types incl. CURP/INE/teléfono/datos
financieros, sensitive-data toggle) that writes a draft breach profile
scoped to the signed-in company. Server-side validation only — client
validation is UX sugar, not the enforcement point.

**Acceptance criteria:** (packet test #2)
- Valid submission (e.g. 500,000 records, sensitive = yes) persists and
  proceeds to quoting.
- Rejected with a clear error, no row written: negative number, zero, a
  text string, and `10^12`.
- `records_affected` is stored as an integer; no path allows a float or
  string to reach the DB column.

---

### F5 — Pricing engine
**Build:** Pure, server-side function implementing packet §9's formulas:
`fine_ceiling = 320,000 × UMA × (2 if sensitive else 1)`;
`quote = setup + (records × activation_rate × fee_per_resolved_case) + surge_reserve`.
UMA value, activation rate, setup fee, fee per case are config constants
(illustrative, per packet table), not hardcoded magic numbers inline.

**Acceptance criteria:** (packet test #1)
- Given 500,000 records + sensitive = yes, the function's fine ceiling and
  plan output match a hand calculation using the packet's default constants
  (documented in the test itself so the expected numbers are explicit).
- Function has no side effects and no network/DB calls — testable in
  isolation.
- Changing a config constant (e.g. UMA value) changes output without code
  changes elsewhere.

---

### F6 — Quote screen + save-only-on-submit
**Build:** UI showing the two cards (red = fine ceiling, green = recovery
plan) and the ratio, matching the mockup layout. Submitting the breach
profile always saves a `quotes` row (status `draft`) — no charge is
associated with viewing a quote. Includes the mandatory honest note: "el
ratio compara contra el techo legal; con aplicación débil, el motor real es
el riesgo reputacional" and a "verify with a lawyer" disclaimer near the
fine figure.

**Acceptance criteria:**
- Submitting a valid profile shows both cards and the ratio within one
  render cycle (no extra confirmation step needed to *see* the quote).
- A `quotes` row exists after viewing, with `status = 'draft'`, and no
  invoice/charge field is populated.
- Honest-note and lawyer-disclaimer text is present and visible, not
  hidden in a tooltip only.

---

### F7 — Accept / decline the plan
**Build:** Two actions on the quote screen. Decline sets `status =
'declined'` and stops the flow ("Quote saved, no charge" per flowchart node
Z). Accept sets `status = 'accepted'` and unlocks F8.

**Acceptance criteria:**
- Declining leaves the `quotes` row queryable but advances no further state
  — no case, no notice draft is created.
- Accepting is the only path that unlocks the notice-drafting step; it does
  not itself create any billable line.
- Re-visiting a declined quote does not silently re-offer acceptance
  without an explicit user action.

---

### F8 — LLM notice drafting + human approval gate
**Build:** Server route calls the LLM (Claude or Gemini, key in Vercel env
only) with a templated prompt built from the accepted quote's structured
fields — never raw user free-text concatenated unescaped. Output: a notice
+ five moves, each move citing the exposed data type, rendered with a
visible `AI-GENERATED` badge. A human (the compliance user) must explicitly
approve the text before it can be published; rejecting sends it back to
drafting (flowchart J loop).

**Acceptance criteria:** (packet test #8)
- Drafted text is visually labeled `AI-GENERATED` everywhere it appears,
  including any screen the victim will eventually see it on.
- There is no code path from "LLM returns text" to "partner link is live"
  that skips an explicit approval click by an authenticated company user.
- Prompt-construction code is inspectable and shows only templated,
  escaped/structured fields going in — no raw form-field concatenation.
- Re-drafting (approve = No) produces a new draft without losing the
  ability to approve on a later attempt.

---

### F9 — Partner publish (simulated link)
**Build:** Approving the notice generates a single "official" simulated
link (a normal app route, not a real distribution channel) representing
the trusted-partner publication step. Clearly labeled `SIMULATED — no real
publication`.

**Acceptance criteria:**
- No outbound email/SMS/WhatsApp/API call fires — grep the diff for any
  external notification client; there must be none.
- The generated link is unique per approved notice and resolves to the
  victim-facing route from F11.
- UI states, in visible text, that publication is simulated.

---

### F10 — k-anonymity hashed lookup
**Build:** Client hashes the victim's identifier (SHA-256 via Web Crypto)
and sends only the first 5 hex chars to the server; server returns the
bucket of matching `breach_index` hash entries; the exact-match check
happens client-side against the returned bucket, per packet §10.

**Acceptance criteria:** (packet test #6)
- Network tab shows only a 5-character hex prefix leaving the browser —
  never the full hash, never a raw identifier.
- `breach_index` table contains no raw CURP/identifier at rest (re-confirm
  from F3, now with real invented data loaded).
- Server logs (or lack thereof) show lookup responses are not persisted —
  no logging line writes bucket contents or prefixes to durable storage.

---

### F11 — Victim verification (simulated) + victim screen
**Build:** Partner-link landing page shows a single `SIMULATED —
verificación de identidad` button (no real INE check). Passing it reveals
the victim screen: yes/no (was I affected) + the five moves from the
approved notice. Nothing else on this route requires or reveals company
identity, case counts, or other victims' data.

**Acceptance criteria:** (packet test #7)
- Before clicking the SIMULATED verification button, the route renders no
  yes/no result and no five-moves content — verify via view-source/network,
  not just hidden CSS.
- After verification, the screen shows exactly yes/no + five moves, each
  citing its exposed data type, with the `AI-GENERATED` badge still
  visible.
- The verification button is visibly labeled SIMULATED.

---

### F12 — Case lifecycle (open → resolved with evidence)
**Build:** A verified "yes" victim view opens a `cases` row
(`status = 'open'`) scoped to the company. A case-manager UI (still
company-authenticated) lists open cases and can mark one `resolved` only
if an evidence note (non-empty, length-capped text) is provided.

**Acceptance criteria:**
- Every "yes" verification creates exactly one case; repeated visits by the
  same victim do not create duplicate open cases (idempotent on the hashed
  identifier).
- Attempting to mark a case resolved with an empty/whitespace-only evidence
  note is rejected server-side.
- A resolved case retains its evidence note and a resolution timestamp.

---

### F13 — Billing rule enforcement (invoice + surge)
**Build:** Invoice total is computed strictly as `setup + Σ(resolved cases
× fee_per_case × 1.3 if that case landed in surge)`, per packet §9. Surge
applies to cases resolved or opened above contracted capacity within the
first 72 hours of publication (define precisely: use case *open* timestamp
vs. publish timestamp, since surge is about incoming volume, not
resolution speed). Sending/publishing a notice never changes the invoice.

**Acceptance criteria:** (packet tests #4, #5)
- Publishing a notice (F9) leaves the invoice total unchanged (+MX$0).
- Resolving one case adds exactly one `fee_per_resolved_case` line; a
  second resolution adds exactly one more — no double-counting, no line
  added on the `open` transition.
- A case opened within 72h of publish, once resolved, is billed at
  `fee_per_case × 1.3` once contracted capacity for that window is
  exceeded; cases within capacity are billed at the base fee.
- Invoice total recomputes correctly from the `cases` table alone (i.e. it
  is derived, not a separately mutable counter that can drift).

---

### F14 — RLS & security-floor hardening pass
**Build:** No new user-facing feature. Re-run the full Security Floor
checklist against the now-complete schema and routes; add any missing
policy, validation, or label found. This is a dedicated audit step, not a
"trust F1–F13 got it right" assumption.

**Acceptance criteria:**
- Every table added since F3 (if any) has RLS enabled and a scoping policy.
- A full grep of the codebase for the LLM API key / Supabase service-role
  key finds zero matches outside `.env`-style files excluded from git.
- Every screen showing invented breach or victim data carries a visible
  `SIMULATED` or `AI-GENERATED` label as applicable.
- Re-run the F3 two-account isolation test end-to-end against the full app
  (not just the DB) — Company B cannot reach Company A's quotes, cases, or
  invoice via any route, including by guessing URLs/IDs.

---

### F15 — Persona walkthrough & polish
**Build:** Run the packet's persona test (packet §11): synthetic
"Lic. Andrea" walks profile → quote → accept → approve notice → publish;
synthetic "Lupita" walks partner link → simulated verification → victim
screen. Fix the single worst hesitation point found in each walkthrough —
do not open-ended redesign.

**Acceptance criteria:**
- Both full walkthroughs complete without a dead end, console error, or
  unlabeled real-looking data.
- The one fix made per persona is documented in the commit message with
  the hesitation it addresses.
- Mockup image (`docs/mockup.png`) generated and referenced from
  `PACKET.md` renders correctly (packet §4 is not left as a dead link).

**→ Deploy checkpoint 2:** ship F4–F15 to production. This is the second
required deploy — the full end-to-end flow is live.

---

## 2. Commit plan

Minimum 5 commits, 2 deploys — actual plan below is finer-grained
(one commit per feature keeps each commit reviewable and revertible
independently).

| # | Commit | Features | Deploy? |
|---|--------|----------|---------|
| 1 | `scaffold: Next.js app + Supabase project wiring` | F1 | — |
| 2 | `auth: Google sign-in gate, no data before session` | F2 | — |
| 3 | `db: schema + RLS for companies/quotes/cases/breach_index` | F3 | **Deploy 1** |
| 4 | `feat: breach profile form with server-side validation` | F4 | — |
| 5 | `feat: pricing engine (fine ceiling + recovery plan)` | F5 | — |
| 6 | `feat: quote screen with honest-note and lawyer disclaimer` | F6 | — |
| 7 | `feat: quote accept/decline flow` | F7 | — |
| 8 | `feat: LLM notice drafting with human-approval gate` | F8 | — |
| 9 | `feat: simulated partner publish link` | F9 | — |
| 10 | `feat: k-anonymity hashed victim lookup` | F10 | — |
| 11 | `feat: simulated victim verification + victim screen` | F11 | — |
| 12 | `feat: case lifecycle, open to resolved with evidence` | F12 | — |
| 13 | `feat: invoice billing rule + surge pricing` | F13 | — |
| 14 | `chore: security-floor and RLS hardening audit` | F14 | — |
| 15 | `polish: persona walkthrough fixes + mockup` | F15 | **Deploy 2** |

Each commit should only be made after its feature's acceptance criteria
pass locally. Deploy 1 (after commit 3) proves the auth+RLS skeleton in
production before business logic is layered on; Deploy 2 (after commit 15)
ships the complete flow. Additional intermediate deploys are fine but not
required.
