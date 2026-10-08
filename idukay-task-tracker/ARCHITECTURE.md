# Idukay Task Tracker — Architecture

> "Open the app and know exactly what your child needs to do today."

This document answers the ten questions asked before building (section 36 of the brief).
It describes what is **built in this folder** and marks what still has to be connected
(Hotmart credentials, production email, hosting) before launch.

---

## 0. What we kept from the reference Artifact

The reference dashboard (Gael & Edric) was analyzed and these ideas carry over:

| Reference idea | Where it lives now |
| --- | --- |
| Warm "family office" look (Fraunces + Public Sans, cream background, one colour per child) | `web/src/styles.css` design tokens; each child gets a colour |
| Today stat tiles (due today, overdue, completed today, pending) | Dashboard "Today" card + per-child summary |
| Per-child cards with a count pill | Dashboard child cards, child switcher |
| Priority pills computed from the due date (urgent / soon / scheduled / calm) | `web/src/lib/dates.ts → urgencyOf()` |
| Task detail sheet: description, teacher, notes, flag, status history timeline | `TaskSheet` component + `task_status_history` table |
| Completed grouped by completion day | Completed page |
| History search with filters | Completed / Overdue pages + search |
| Calendar with a dot per child | Calendar page (dots are coloured by status as the brief asks) |
| "English task" banner, original snapshot | Kept as optional `notes`; the full snapshot/versioning is a later feature |

What we deliberately **did not** keep: all tasks in one JSON blob inside the page, the
hard-coded children (`['Gael','Edric']`), and re-rendering whole lists with `innerHTML`
(the cause of the "jump to top" problem). Lists are now React lists with stable keys, the
tick is optimistic, and a completed task stays where it is until the page is reloaded.

---

## 1. Product architecture

```
 Browser (React SPA, mobile-first)                         Hotmart
 ─────────────────────────────────                         ───────
  Landing · Sign up · Onboarding                         checkout page
  Dashboard · Today · Week · Calendar                      │   ▲
  Children · Add task (manual / paste / CSV)               │   │ sck = checkout token
  Completed · Overdue · Settings · Subscription            │   │
  Admin (product owner only)                               ▼   │
        │  publishable key + user JWT                webhook POST (hottok header)
        ▼                                                  │
 ┌──────────────────────────── Supabase ──────────────────┼──────────────┐
 │ Auth (email + password, hashed with bcrypt)            ▼              │
 │ PostgREST API ──► PostgreSQL with Row Level Security   Edge Functions │
 │                    public.*  (user data, RLS)           • billing     │
 │                    app.*     (access rules, private)      createCheckout
 │                    billing.* (Hotmart state machine)      verifySubscription
 │                    pg_cron: reminders, expiry             getSubscriptionStatus
 │                                                           cancelSubscription
 │                                                         • hotmart-webhook
 │                                                           processWebhook
 └───────────────────────────────────────────────────────────────────────┘
 Static hosting: Cloudflare Workers assets (or any static host / CDN)
```

* **Frontend** — a static single-page app. It holds no secrets: the only key it has is
  Supabase's *publishable* key, which grants nothing by itself.
* **Backend** — PostgreSQL is the security boundary. Every table has Row Level Security,
  so even a bug in the frontend (or a hand-crafted API call) cannot read another family's
  rows. Business rules that must not be bypassed (trial, subscription, status history,
  analytics) run inside the database or in Edge Functions with the service role.
* **Payments** — Hotmart owns checkout, cards, receipts, renewals and cancellations. We
  only receive events and keep a subscription *status*.
* The four layers (static frontend, API/auth, database, payment provider) are separable:
  the SPA can move to another host, Edge Functions can move to any Deno/Node runtime
  (the handlers are plain `Request → Response` functions), and the payment provider sits
  behind an interface.

## 2. Database schema

All user tables live in `public` and carry `user_id` (the owner). Private helpers live in
`app` and `billing`, which the API does not expose.

| Table | Purpose | Client access |
| --- | --- | --- |
| `profiles` | Parent name, phone, country, locale, timezone | own row: read, update name/phone/country/locale/timezone |
| `schools` | Schools the parent typed (per user, never shared) | own rows: CRUD |
| `children` | Name, grade, school, classroom, teacher, colour, active | own rows: CRUD (writes need access) |
| `subjects` | The family's subject list (auto-filled from tasks) | own rows: read, update colour |
| `tasks` | Subject, title, description, due date, priority, status, estimate, teacher, notes, source | own rows: CRUD (writes need access) |
| `task_status_history` | Every status change (who, when, from → to) | own rows: read only; written by trigger |
| `trial_periods` | Trial start / end | own row: read only |
| `subscriptions` | `TRIAL / ACTIVE / PAYMENT_PENDING / PAYMENT_FAILED / CANCELLED / EXPIRED`, period end | own row: read only |
| `billing_events` | Every Hotmart event, deduplicated by event id | none |
| `checkout_sessions` | Opaque token sent to Hotmart as `sck`, to match the payment back to the user | none |
| `notifications` | In-app reminders (channel column ready for email/push) | own rows: read, mark read |
| `user_settings` | Reminder times, theme, language | own row: read, update |
| `audit_logs` | Security-relevant actions (sign-up, deletion, billing) | none |
| `analytics_events` | Product funnel events, no personal data in properties | none (written by triggers/functions) |
| `used_trials` | SHA-256 of e-mails that already had a trial (no plain e-mail kept) | none |
| `platform_admins` | Who can open the admin dashboard | none |

Relationships: `user → children → tasks → task_status_history`, `user → subscription`,
`user → trial_period`, `user → user_settings`, `user → notifications`.

Integrity rules enforced by the database:
* Composite foreign keys (`tasks(child_id, user_id) → children(id, user_id)`) make it
  impossible for a task to point at another family's child, even with a forged id.
* `user_id` is filled from the session (`default auth.uid()`) and a trigger refuses any
  other value; clients are never allowed to update it.
* Status `OVERDUE` is **derived** (pending/in progress and due date before today), never
  stored, so it can never be stale.

## 3. Authentication architecture

* Supabase Auth (GoTrue): e-mail + password, passwords hashed with bcrypt, never stored
  or logged by our code. Minimum length 10; enable "leaked password protection" in the
  Supabase dashboard.
* E-mail confirmation is required before the first sign-in. Password reset by e-mail.
* Sessions are short-lived JWTs (1 h) refreshed automatically; the JWT carries only the
  user id. Every request is evaluated by RLS with `auth.uid()`.
* Sign-up metadata (name, phone, country, first child) is copied by a database trigger into
  `profiles` / `children`, with length checks. We never ask for, store, or transmit an
  Idukay username or password.
* Admin access is a row in `platform_admins` (not a JWT claim the user could influence).

## 4. Trial architecture

* On sign-up a trigger creates `trial_periods(started_at = now(), ends_at = now() + 7 days)`
  and `subscriptions(status = 'TRIAL')`.
* `app.access_state(user)` returns `trial | active | grace | locked` and is the single
  source of truth. RLS uses it: **writes to children, tasks and subjects require access**;
  reads of your own data are always allowed, so nothing is lost and the parent can still
  export or delete their data after the trial.
* The UI shows "Free Trial: X days remaining" (7 → "Enjoy your free access", 3 → "ends in 3
  days", 1 → "ends tomorrow"), and on expiry a full-screen "Your 7-day free trial has ended
  — Continue for $2.99/month" with **Continue with Premium**.
* Abuse guard: when a trial is created we store `sha256(lower(email))` in `used_trials`.
  If the same e-mail signs up again after deleting the account, the new trial starts
  already ended. No plain e-mail is kept after deletion.
* A daily job records `trial_expired` analytics events.

## 5. Hotmart integration architecture

```
Parent clicks "Continue with Premium"
  → billing.createCheckout()  (Edge Function, signed-in)
       creates checkout_sessions(token) and returns
       HOTMART_CHECKOUT_URL?sck=<token>&email=<email>&name=<name>
  → parent pays on Hotmart (we never see card data)
  → Hotmart POSTs the webhook  ──►  hotmart-webhook  (processWebhook)
       1. checks X-HOTMART-HOTTOK against HOTMART_WEBHOOK_SECRET (constant-time)
       2. ignores other products (HOTMART_PRODUCT_ID)
       3. billing.apply_hotmart_event(): dedupe by event id, find the user by the
          sck token, else by subscriber code, else by buyer e-mail; unmatched events are
          kept and claimed automatically when that e-mail signs up
       4. moves the subscription state machine
```

| Hotmart event | Subscription status | Access |
| --- | --- | --- |
| `PURCHASE_APPROVED`, `PURCHASE_COMPLETE` | `ACTIVE`, period end = next charge date | yes |
| `PURCHASE_BILLET_PRINTED`, `WAITING_PAYMENT` | `PAYMENT_PENDING` | keeps whatever access existed (trial or paid period) |
| `PURCHASE_DELAYED` (renewal failed) | `PAYMENT_FAILED` | until period end + 3 days grace |
| `SUBSCRIPTION_CANCELLATION` | `CANCELLED` | until the paid period ends ("eventually inactive") |
| `PURCHASE_CANCELED`, `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`, `PURCHASE_PROTEST` | `CANCELLED`, period ends now | no |
| `PURCHASE_EXPIRED` | `EXPIRED` | no |
| (daily job) cancelled/failed and period over | `EXPIRED` | no |

The payment layer is an interface (`supabase/functions/_shared/payments/provider.ts`):

```ts
interface PaymentProvider {
  createCheckout(user): Promise<{ url }>
  verifySubscription(user): Promise<VerifyResult>   // asks Hotmart's API, then applies the result
  processWebhook(request): Promise<Response>
  getSubscriptionStatus(user): Promise<SubscriptionView>
  cancelSubscription(user): Promise<CancelResult>
}
```

Configuration (Supabase → Edge Functions → Secrets, **never** in the frontend or the repo):

| Variable | Used for |
| --- | --- |
| `HOTMART_PRODUCT_ID` | Ignore events of your other products |
| `HOTMART_CHECKOUT_URL` | The product's pay link, e.g. `https://pay.hotmart.com/XXXXXXXX?off=yyyy` |
| `HOTMART_WEBHOOK_SECRET` | The "hottok" shown in Hotmart → Tools → Webhook |
| `HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET`, `HOTMART_BASIC` | Hotmart developer API credentials (verify / cancel) |

**What is real and what is not yet connected.** The webhook, the state machine, the
checkout link and the access rules are implemented and tested with simulated Hotmart
payloads. No call to Hotmart's live API has been made from this environment (there are no
credentials). Until the secrets are set: the webhook refuses every call (fails closed),
"Continue with Premium" says checkout is not configured, and verify/cancel answer
`not_configured`. **Nothing ever marks a user as paid without a verified Hotmart event.**

## 6. User / data isolation strategy

1. **Database-enforced**: RLS on every table, `using (user_id = auth.uid())` and the same in
   `with check`. Default Supabase grants are revoked; each table gets explicit
   column-level grants.
2. **No trust in client ids**: changing an id in the URL returns nothing (RLS filters it);
   composite foreign keys stop cross-family links; `user_id` cannot be set or changed.
3. **Private schemas** (`app`, `billing`) are not exposed through the API. Security-definer
   functions pin `search_path` and check the caller.
4. **Tested**: `tests/isolation.test.mjs` impersonates several parents, an anonymous
   visitor and the admin, and proves every cross-family read/write/delete is blocked
   (including test 1 of the brief: Maria and her math homework are invisible to User B).
5. **Admin dashboard sees aggregates only** (counts, rates, revenue) — never task text or
   children's names.

## 7. Idukay input strategy

The app never logs into Idukay, never scrapes it, and never asks for Idukay credentials.

| Option | State |
| --- | --- |
| A. Manual entry | Built |
| B. Copy / paste ("Add Tasks from Idukay") | Built — `web/src/lib/parser/` turns pasted text into rows the parent reviews and edits before saving. Runs in the browser, so the pasted text never leaves the device until saved. |
| C. Import | CSV built (same review screen). PDF/document import: the `TaskSource` interface (`web/src/lib/sources.ts`) is ready; a PDF adapter would extract text and reuse the parser. |
| D. Authorized API | `tasks.source` + `tasks.external_id` (unique per user and source) make a future, *authorized* integration idempotent: it upserts by external id. A server-side adapter would implement the same `TaskSource` contract. |

Wording in the app: "Idukay is your school's source of information. This app is your
simplified personal organizer." Footer: "Not affiliated with or endorsed by Idukay."

## 8. Technology stack (and why)

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 + TypeScript + Vite, React Router | Fast static build, runs on any CDN, same stack you already operate |
| API + Auth | Supabase (GoTrue + PostgREST) | Managed, audited auth; API generated from the schema |
| Database | PostgreSQL (Supabase) with RLS | Isolation enforced by the database itself, as the brief requires |
| Server logic | Supabase Edge Functions (Deno) | Holds Hotmart secrets; handlers are portable `Request → Response` |
| Jobs | pg_cron | Reminders, trial/subscription expiry |
| Hosting | Cloudflare Workers static assets | Global CDN, free tier, already configured in this repo |
| Payments | Hotmart | Required by the business model |

**Why not Next.js?** Next.js would also work, but it puts a Node server in the request path
that has to enforce authorization in application code. Here the authorization lives in
PostgreSQL, where one mistake in a route cannot leak data; the frontend becomes a static
site that costs almost nothing to host. It also matches the stack already running for
Warehouse Attendance Pro (same Supabase account, same Hotmart webhook pattern, same test
harness), so there is one way of doing things to maintain. Scale: a family produces a few
hundred tasks a year; 10,000 families is ~5M rows, well within a small Supabase instance
with the indexes defined here (`tasks(user_id, due_date)`, etc.).

## 9. Security strategy

* RLS everywhere, least-privilege grants, private schemas, `search_path` pinned.
* No secrets in the frontend; Hotmart secrets only in Edge Function secrets.
* Webhook: shared-token check in constant time, 256 KB body limit, idempotent by event id,
  fails closed when not configured, unknown products ignored.
* Audit log for sign-up, account deletion, data wipe and every billing change.
* HTTP headers: CSP, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy.
* Children's data: minimal fields, never in URLs (ids only), never in analytics, never
  sent to third parties; no ads, no trackers, fonts self-hosted.
* Account deletion removes every row (cascade from `auth.users`); data wipe keeps the
  account but removes children, tasks and history; JSON export of everything we hold.
* Local storage only for UI preferences (selected child, theme, language).

## 10. Development roadmap

| Phase | Scope | State in this folder |
| --- | --- | --- |
| 1 | UX/UI: landing, auth, onboarding, dashboard, today, week, calendar, children, tasks, subscription | Built |
| 2 | Auth + database with isolated data | Built, tested locally |
| 3 | 7-day trial | Built, tested |
| 4 | Hotmart-ready subscriptions | Built, tested with simulated events; needs your credentials |
| 5 | Idukay paste parser | Built, unit-tested |
| 6 | Admin dashboard | Built (aggregates only) |
| 7 | Security & production readiness | Tests in `tests/`; launch checklist in README |
| Later | E-mail/push reminders, multiple caregivers per family, PDF import, AI assistance, task versioning | Schema hooks in place (notification `channel`, `source/external_id`) |

**Multiple caregivers (later):** today ownership is per user. The path is a `families`
table plus `family_members`, then RLS switches from `user_id = auth.uid()` to
`app.is_family_member(family_id)` — the same pattern Warehouse Attendance Pro uses for
organizations.

---

## Legal / privacy items that need a qualified attorney before launch

1. **The name "Idukay"** is another company's brand. Using it in the product name
   ("Idukay Task Tracker") may be trademark infringement or imply affiliation even with a
   disclaimer. Strongly consider a neutral brand (the app name is one setting:
   `VITE_APP_NAME`) and describing compatibility in text ("works with information you
   copy from your school platform").
2. **Ecuador — LOPDP** (Ley Orgánica de Protección de Datos Personales, 2021): children's
   data is specially protected; you need a lawful basis (parental consent), a privacy
   notice, a data controller contact, possibly registration with the authority, and
   international-transfer terms (Supabase/Cloudflare servers are outside Ecuador).
3. **Other markets:** GDPR (EU), LGPD (Brazil — Hotmart's home market), COPPA (US; the
   service is for parents, not directed at children, but confirm), and local consumer law
   on auto-renewing subscriptions (clear price, renewal and cancellation terms).
4. **Hotmart terms**: product approval, refund window (Hotmart's guarantee period),
   who is merchant of record and tax handling.
5. The Privacy Policy and Terms in the app are **drafts** written for this prototype; have
   them reviewed and completed (company name, address, jurisdiction) before launch.
