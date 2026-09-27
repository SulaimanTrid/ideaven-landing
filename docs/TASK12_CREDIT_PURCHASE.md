# TASK 12 — AI Credit Purchase Flow (Contextual Popup + Real Credit Ledger)

Status: **IMPLEMENTED & VERIFIED** (no payment provider yet — by design).
This document is the evidence sheet: architecture, wire contract, security
rules, tests, and browser verification.

## 1. What shipped

When an AI action is blocked by an empty/insufficient balance, IDEAVEN no
longer answers with a bare error. The server returns a structured 402 and
the client opens a contextual purchase modal in place — the user continues
the interrupted workflow instead of hunting for a pricing page.

```
USER CLICKS AI
      ↓
POST /api/ai/command  (server checks the derived ledger)
      ↓ balance available            ↓ balance < required
   RUN AI                      402 AI_INSUFFICIENT_CREDITS + safe metadata
                                      ↓
                        Contextual purchase modal opens automatically
                                      ↓
                        Select pack → checkout (when a provider exists)
                                      ↓
                        Verified webhook → credit_grants row → balance up
                                      ↓
                        [Continue with AI] → original request re-runs
```

## 2. Server (apps/api)

### Migration 022 (`022_credit_purchases.sql`)

- `credit_packages` — the single authoritative product definition:
  `id, name, credits, currency, price (minor units), tagline, popular,
  enabled, display_order`. Seeded with the packs the pricing page already
  described (Starter 100/$2, Builder 600/$10, Studio 2000/$30 — designed,
  not sold until a provider exists).
- `credit_purchases` — commerce records, NOT a second ledger:
  `purchase_id, user_id, package_id, provider, provider_intent_id,
  provider_transaction_id, currency, amount, credits, status, created_at,
  completed_at`. Status machine: `pending → succeeded | failed |
  cancelled`; `succeeded` is terminal.
- `credit_grants.source` gained `'purchase'` — paid top-ups ride the
  EXISTING grant ledger, same rows the operator CLI writes. No second
  balance, no fake purchase ledger.

### `internal/credits` package

- `PaymentProvider` boundary (`payment.go`): `CreateCheckout(intent)` +
  `Verify(raw, headers) → TransactionResult`. Verification happens inside
  the boundary — a payload that fails authentication can never produce a
  successful result.
- `Service` (`service.go`): packages listing, purchase intent creation,
  and `Settle`. The client contributes only `packageId` + a return path;
  price, currency, and credits are resolved server-side from
  `credit_packages`. Return paths are re-anchored to the server's own
  APP_URL origin.
- Exactly-once settlement, layered:
  1. `UNIQUE (provider, provider_transaction_id)` — a replayed webhook
     resolves to the settled purchase.
  2. `succeeded` is terminal — a second event for the same intent (or a
     late contradicting failure) is a no-op.
  3. The `credit_grants` insert and the status transition commit in ONE
     transaction behind `SELECT … FOR UPDATE`.
- `LoadPaymentProvider` (`PAYMENT_PROVIDER` env): returns nil today — no
  adapter ships. Purchases then answer 503 `PURCHASE_UNAVAILABLE` and the
  UI stays honestly "coming soon". Future adapters are one file.

### Routes (`internal/server`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/credits/packages` | public | pack list + `purchaseAvailable` |
| `POST /api/credits/purchases` | session | start purchase (server resolves price/credits) |
| `GET /api/credits/purchases/{id}` | session, owner | status polled after checkout |
| `POST /api/credits/webhook/{provider}` | provider-verified | settlement callback |

### Structured insufficient-credit response

`POST /api/ai/command` (and the extension fix endpoint, through
`ai.GateError`) now answers:

```json
HTTP 402
{"error": {"code": "AI_INSUFFICIENT_CREDITS",
           "message": "You're out of AI credits…",
           "data": {"remaining": 0, "required": 1, "packBalance": 0,
                    "freeRemaining": 0, "purchaseAvailable": false}}}
```

402 replaces the old 429 `AI_CREDITS_EXHAUSTED`: the situation is solvable
with payment — the response IS the offer, not a rate limit. The ledger
gate still fails open on counting errors (a counting problem must never
lock users out).

## 3. Web (apps/web)

- `CreditPurchaseModal` (`components/credits/`): contextual states —
  idle / checkout / processing / success / failed / cancelled /
  unavailable. Shows what the next action needs vs the current balance,
  the pack list (server data, per-credit price, `popular` only when the
  server says so), and — while no provider exists — disabled packs plus
  the honest banner. Success shows the new balance and **[Continue with
  AI]**; the interrupted request re-runs only on that explicit click
  (`ideaven:ai-retry` event from the panel, direct callback from the
  extension panel).
- A11y: `role=dialog`, `aria-modal`, labelled + described, focus trap,
  Escape, backdrop click (blocked while checkout is in flight), focus
  restore. Responsive: centered dialog on desktop, bottom sheet at mobile
  widths. Semantic tokens only — dark and light audited.
- Balance surfaces: the top-bar Ask AI button and the panel badge show the
  live derived balance (`ideaven:credits-updated` refresh after a verified
  purchase, and after every command). At zero the button reads "Credits
  empty" (rose) and stays clickable — it opens the modal directly.
- Hosted-checkout return: the provider sends the user back to
  `/builder/{id}?purchase=<id>`; the builder strips the query and the
  modal polls the owner-scoped purchase endpoint until the server-verified
  status lands (success / failed / cancelled / timeout — all honest).
- `pricing/page.tsx` renders the same `/api/credits/packages` definition —
  no duplicated pack data anywhere.
- i18n: every `credits.*` string exists in EN and ID. Package names and
  taglines are product data from the server and stay untranslated, like
  currency codes.

## 4. Security summary

Never trusted from the browser: price, credit amount, currency, package
existence (beyond the id), payment success. `POST /api/credits/purchases`
rejects any body that carries money-shaped fields (strict decoding). The
webhook authenticates inside the provider boundary; unknown provider paths
404; unverified payloads settle nothing. Credits are granted only by the
server's own ledger insert, once, inside the settle transaction.

## 5. Tests

Go (`go test ./...` — all 12 packages green):

- `internal/credits/credits_test.go`: package listing (server data),
  unavailable-without-provider (503), unknown package (404),
  client-supplied money rejected (400), server-controlled price/credits in
  the provider intent, checkout failure fails the row (no dangling
  pending), verified payment grants once, duplicate webhook no-op, second
  event for a settled intent no-op, failed/cancelled grant nothing, late
  failure after success changes nothing, unauthenticated webhook rejected,
  wrong provider path 404, owner-scoped purchase status.
- `internal/ai`: gate now expects 402 `AI_INSUFFICIENT_CREDITS` with the
  metadata payload (purchaseAvailable truthful by default).

Web: `tsc --noEmit` clean.

## 6. Browser verification (Chrome, dev stack on this machine)

- **FLOW A (sufficient credits)** — registered user, created a project,
  opened the builder: badge showed "20 credits"; Ask AI ran against the
  dev mock provider, the changeset applied as one undoable step; `ai_usage`
  gained exactly one `ok` row; badge refreshed to 19.
- **FLOW B (zero credits)** — allowance exhausted server-side: submitting
  a prompt produced the 402 and the modal opened automatically with
  "AI credits are empty", needs 1 / have 0, the three packs (disabled),
  the honest "coming soon" banner, View pricing + Close. The panel turn
  reads "Not enough AI credits — choose a pack to continue." The top-bar
  button switched to "Credits empty" and opened the modal directly.
  Post-state: `credit_purchases = 0`, purchase `credit_grants = 0` —
  **no fake credits**.
- **FLOW C** — not executable yet by design (no provider). The full
  checkout → webhook → grant path is covered by the Go suite with a mock
  provider, including duplicate/failed/cancelled events.
- Responsive + themes: 390px bottom sheet, light + dark screenshots.
- Localization: modal + button verified in Indonesian with `id` selected.

## 7. Honest limitations

- No payment provider is integrated; until one ships, checkout cannot
  start and the modal says so. Nothing in the UI fakes success.
- Package prices/currencies are operator data in `credit_packages`; there
  is no admin UI yet (SQL/CLI updates are the intended path).
- Webhook signature verification is the future adapter's responsibility
  (the boundary enforces `Verify`, but each provider defines its scheme).
