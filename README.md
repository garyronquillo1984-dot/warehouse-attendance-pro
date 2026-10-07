# Warehouse Attendance Pro

Multi-company attendance tracking for warehouses and staffing teams.
Each customer company's data is fully isolated by the database itself.

**Stack:** Supabase (PostgreSQL + Auth + Row Level Security + Edge Functions) · React + TypeScript (Vite) · Cloudflare Pages.

## Status

| Block | Scope | State |
| --- | --- | --- |
| 1. Foundations | Schema, row-level security, server functions, Hotmart license logic, isolation tests | Done |
| 2. Accounts & onboarding | Sign up, login, password reset, company → warehouse → shifts wizard | Next |
| 3. Employees | List, filters, add/edit/deactivate, CSV/Excel import | |
| 4. Attendance | Fast capture screen (no scroll jumps) | |
| 5. Dashboard & reports | KPIs, 7 reports, CSV/Excel/PDF | |
| 6. Licensing & Hotmart | Webhook edge function, inactive page, super admin | |
| 7. Demo & launch | Demo mode, legal pages, production deploy | |

## Database

Migrations live in `supabase/migrations/` and run in file-name order:

1. `..._schema.sql` – tables, constraints, indexes
2. `..._security.sql` – grants, access functions, triggers, RLS policies
3. `..._functions.sql` – server functions (claim license, invitations, team, super admin, Hotmart billing)
4. `..._plans.sql` – plan catalogue (Starter / Professional / Business)

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
