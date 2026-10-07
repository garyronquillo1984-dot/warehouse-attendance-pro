# Warehouse Attendance Pro

Multi-company attendance tracking for warehouses and staffing teams.
Each customer company's data is fully isolated by the database itself.

**Stack:** Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions) · React + TypeScript (Vite) · Cloudflare Workers (static assets, see `wrangler.jsonc`).

## Status

| Block | Scope | State |
| --- | --- | --- |
| 1. Foundations | Schema, row-level security, server functions, Hotmart license logic, isolation tests | Done |
| 2. Accounts & onboarding | Sign up, login, password reset, company → warehouse → shifts wizard | Done |
| 3. Employees | List, filters, add/edit/deactivate, CSV/Excel import | Done |
| 4. Attendance | Fast capture screen (no scroll jumps), badge scan, bulk present | Done |
| 5. Dashboard & reports | KPIs, 7 reports, CSV/Excel/PDF | Done |
| 6. Licensing & Hotmart | Webhook edge function, inactive page, super admin | Done (needs the Hotmart token as a secret) |
| 7. Demo & launch | Demo mode, legal pages, production deploy | |

## Database

Migrations live in `supabase/migrations/` and run in file-name order. Their names and
versions match the history of the Supabase project `warehouse-attendance-dev`
(`sduevxvdqlxclpjabkru`, region us-east-1):

| File | Contents | Applied to Supabase |
| --- | --- | --- |
| `20261007143250_schema.sql` | Tables, constraints, indexes | Yes |
| `20261007143354_security.sql` | Grants, access functions, triggers, RLS policies | Yes |
| `20261007143457_plans.sql` | Plan catalogue | Yes |
| `20261007143703_functions_read_helpers.sql` | `my_organizations`, `my_license` | Yes |
| `20261007143729_functions_claim_and_invitations.sql` | `claim_license`, invitations | Yes |
| `20261007143757_functions_admin_and_billing.sql` | Super admin, Hotmart billing | Yes |
| `20261007143827_functions_profiles_on_signup.sql` | Profile created on sign up | Yes |
| `20261007150000_functions_team.sql` | Change role, remove member, transfer ownership | Yes (applied from the SQL Editor on 2026-10-07, so it is not in Supabase's migration list) |
| `20261007165553_functions_employees_attendance.sql` | Employee import, attendance capture | Yes |
| `20261007171108_functions_reports.sql` | Report grid (records + scheduled days with no record) | Yes |
| `20261007171509_report_grid_since.sql` | No Record counts from the later of hire date and date added | Yes |
| `20261007220000_functions_team_admin_webhook.sql` | Team list, cancel invitation, admin extras, webhook entry point | Yes |
| `20261007221000_schedule_license_expiry.sql` | Daily license expiry (pg_cron, 05:15 UTC) | Yes |

The last file contains `DELETE` statements inside functions, so Supabase requires a human
confirmation; it was run by hand from Supabase → SQL Editor.

### Security model (summary)

- Every customer table carries `organization_id`; composite foreign keys stop rows of one company or warehouse from pointing at another.
- RLS is on for every table. Access is decided by `app.has_role`, `app.license_ok` (may write), `app.license_readable` (may read) and `app.in_warehouse`.
- The browser never decides company, warehouse or author of an attendance record — a trigger sets them from the employee.
- Roles, memberships and licenses can only change through server functions that check the caller.
- `licenses`, `billing_events` and `platform_admins` are unreachable from the app; Hotmart events are applied by `billing.apply_hotmart_event`, callable only by the service role.

### Run the isolation tests locally

Requires a local PostgreSQL 15+ listening on `/tmp:54329` (see `reset_local_db.sh`).

```bash
npm install
npm run test:db
```

`tests/supabase_shim.sql` recreates the Supabase pieces the migrations need (roles, `auth.uid()`, default grants) **for local testing only — never run it on a real project.**

The suite impersonates real users (Owner, Admin, Supervisor of two companies, an outsider, an unconfirmed user, anonymous, the platform owner) and checks that every cross-company read, write, delete, privilege escalation and license bypass is blocked, and that legitimate work succeeds.

## Web app (`web/`)

React + TypeScript, built with Vite. It talks to Supabase only with the publishable key;
every permission is enforced by the database.

```bash
cd web
npm install
npm run dev      # http://localhost:5173 against the Supabase project in .env.development
npm run build    # output in web/dist (what Cloudflare serves)
```

### Full browser test (`tests/e2e/`)

`tests/e2e/run.sh` starts a local copy of Supabase Auth and the REST API over our migrations
(`scripts/localstack/`), serves the app, and drives a real browser through: a Hotmart purchase
arriving, sign up and email confirmation, the setup wizard, settings, changing and resetting the
password, someone signing up without a purchase, inviting a supervisor, and a refund locking
access. Emails are captured to `~/.wap-localstack/mail`. Screenshots go to `tests/e2e/screenshots/`.

## Hotmart webhook (`supabase/functions/hotmart-webhook`)

Deployed as the Edge Function `hotmart-webhook` (JWT check off: Hotmart authenticates with its own token).

URL to paste in Hotmart → Tools → Webhook (version 2.0.0):
`https://sduevxvdqlxclpjabkru.supabase.co/functions/v1/hotmart-webhook`

Secrets (Supabase → Edge Functions → Secrets — never in the repo or chat):

| Name | Required | What |
| --- | --- | --- |
| `HOTMART_HOTTOK` | Yes | The token Hotmart shows on the webhook screen. Until it is set, every call is refused. |
| `HOTMART_PRODUCT_IDS` | Recommended | This product's Hotmart id(s), comma-separated; events for other products are ignored. |
| `HOTMART_PLAN_MAP` | No | JSON, offer code / plan name → `starter`, `professional` or `business`. |
| `HOTMART_DEFAULT_PLAN` | No | Plan for purchases not in the map. Default `professional`. |

Payload reading is tested with `node --experimental-strip-types tests/webhook/parse.test.mts`.
