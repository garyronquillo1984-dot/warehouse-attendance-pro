# Idukay Task Tracker

*Your child's school tasks, simplified.* A multi-user SaaS for parents: register, get a 7-day
free trial, add children, paste tasks copied from Idukay, and see what is due today, this week
and what is overdue. After the trial, $2.99/month through Hotmart.

Read **[ARCHITECTURE.md](ARCHITECTURE.md)** first: product architecture, database schema,
authentication, trial, Hotmart integration, data isolation, Idukay input strategy, stack,
security and roadmap, plus the legal items that need an attorney before launch.

**Stack:** Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions) · React + TypeScript (Vite) · static hosting (Cloudflare or any CDN) · Hotmart.

## Layout

| Path | What |
| --- | --- |
| `supabase/migrations/` | Schema, RLS, sign-up/trial trigger, billing state machine, app functions, jobs |
| `supabase/functions/_shared/payments/` | `PaymentProvider` interface + Hotmart implementation (`createCheckout`, `verifySubscription`, `processWebhook`, `getSubscriptionStatus`, `cancelSubscription`) |
| `supabase/functions/billing/` | Edge Function the app calls (checkout / status / verify / cancel) |
| `supabase/functions/hotmart-webhook/` | Edge Function Hotmart calls |
| `web/` | The web app (landing, auth, onboarding, dashboard, today, week, calendar, children, add tasks, completed, overdue, settings, subscription, admin) |
| `web/src/lib/parser/idukay.ts` | "Add Tasks from Idukay" paste parser |
| `tests/` | Isolation/billing tests (SQL level), unit tests, browser end-to-end tests |
| `scripts/localstack/` | Local Supabase-like stack for development and e2e |
| `scripts/seed-demo.mjs` | Demo family (Gary, Gael, Edric) for local/staging only |

## Tests

```bash
npm install && (cd web && npm install)
npm run test:db      # 117 checks: isolation between families, trial, Hotmart events, deletion (needs local PostgreSQL on /tmp:54329)
npm run test:unit    # 39 checks: Hotmart parsing/webhook/checkout/verify/cancel, paste parser
tests/e2e/run.sh     # 65 checks in Chromium emulating an iPhone 13 — the 7 critical tests of the brief
```

The e2e run starts real Supabase Auth + PostgREST over these migrations, runs our Edge Function
handlers in Node, and plays Hotmart's part by sending signed webhooks. Screenshots land in
`tests/e2e/screenshots/`.

| Brief test | Where it is proven |
| --- | --- |
| 1. User B never sees User A's Maria or task | `isolation.test.mjs` (40+ attacks) and e2e (UI pages + direct API calls with B's token) |
| 2. Trial expires → premium locked | both: paywall in the UI, writes refused by the database, data kept |
| 3. Purchase → ACTIVE only after verified payment | both: checkout link with token, forged webhook refused, signed webhook activates |
| 4. Cancellation → inactive when the paid period ends | both: still usable until period end, then locked and `EXPIRED` |
| 5. Two children, switching shows only that child | both |
| 6. Ticking task #15 keeps the scroll position | e2e measures `scrollY` and the row's position before/after (and after opening/closing the task) |
| 7. Usable on iPhone | e2e on iPhone 13 emulation: no sideways scroll on any page, 44 px touch targets, pinned bottom nav |

## Run locally

```bash
./scripts/localstack/setup.sh && ./scripts/localstack/start.sh && ./scripts/localstack/web-env.sh
cd web && npx vite --mode e2e          # http://localhost:5173 ; sign-up e-mails land in ~/.itt-localstack/mail
```

## Going live — checklist

1. **Supabase project** (new, separate from Warehouse Attendance Pro): apply `supabase/migrations/` in order.
   Auth: require e-mail confirmation, minimum password 10, leaked-password protection on, site URL = your domain,
   redirect URLs `https://yourdomain/welcome` and `/reset-password`. Custom SMTP with your own domain.
2. Make yourself admin: `insert into platform_admins (user_id) select id from auth.users where email = 'you@…';`
3. **Edge Functions**: deploy `billing` (JWT on) and `hotmart-webhook` (JWT off, see `supabase/config.toml`).
   Secrets: `HOTMART_PRODUCT_ID`, `HOTMART_CHECKOUT_URL`, `HOTMART_WEBHOOK_SECRET` (the hottok),
   `HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET`, `HOTMART_BASIC`, `APP_ORIGIN`.
4. **Hotmart**: create the $2.99/month subscription product; webhook (v2.0.0) URL
   `https://<project>.supabase.co/functions/v1/hotmart-webhook`; enable purchase, cancellation, delay,
   refund, chargeback and charge-date events. Test in Hotmart's sandbox — the developer-API calls
   (verify/cancel) have not been run against Hotmart yet.
5. **Web**: `web/.env.production` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_NAME`,
   `VITE_SUPPORT_EMAIL`; `npm run build`; serve `web/dist` with SPA fallback; `web/public/_headers` sets CSP.
6. **Legal**: replace the draft Privacy/Terms and resolve the naming question (see ARCHITECTURE.md).

Until step 3–4 are done, the app says payments are not connected; it never grants paid access on its own.
