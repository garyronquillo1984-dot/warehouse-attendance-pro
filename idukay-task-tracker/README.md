# Tareas en Casa — free homework viewer for parents

Parents open a private link and see, in seconds, what their child has to do today: how many
assignments, which subjects, start and due dates, what is pending, completed or overdue, the
original instructions — and in which language the homework must be done.

**Free. Read-only for parents. No accounts, no payments.** Initial class: 4.º EGB — Paralelo A.
See **[ARCHITECTURE.md](ARCHITECTURE.md)** for roles, data model, lifecycle, language rules and security.

**Stack:** Supabase (PostgreSQL + RLS + Auth for the admin + Edge Function for sync) · React + TypeScript (Vite) · static hosting.

## Layout

| Path | What |
| --- | --- |
| `supabase/migrations/` | Schema, access rules, viewer/admin/sync functions, initial class 4.º EGB "A" with subjects and languages |
| `supabase/functions/sync-homework/` | Hourly sync through the `HomeworkSource` interface (Idukay adapter: `not_configured` until an authorized API exists) |
| `web/src/pages/viewer/` | Parent screens: Today, Last 2 Weeks, Archive, Detail |
| `web/src/pages/admin/` | Admin console: status & sync, homework (correct / withdraw / versions), paste from Idukay & CSV, students & links, subjects |
| `web/src/lib/parser/idukay.ts` | Paste parser (subjects, dates, start date, teacher, separate Spanish explanation) |
| `scripts/seed-demo.mjs` | Demo data (local/staging only) |

## Tests

```bash
npm install && (cd web && npm install)
npm run test:db      # 77 checks: link scope, read-only viewers, admin rules, no deletes, versioning, dedupe, sync
npm run test:unit    # 23 checks: paste parser, sync (not_configured, upsert, validation)
npm run test:e2e     # 58 checks in Chromium (iPhone 13 for parents, desktop for the admin)
```

The e2e run covers: free/no commercial content, admin login, honest "not configured" sync, adding a
student, creating links, pasting homework (language detection, separate Spanish explanation,
duplicates skipped), the parent link (token leaves the URL), Today counter and summary, language
badges, detail page with "answer in English", personal completion mark (no scroll jump, official
record unchanged), Last 2 Weeks, Archive (grouping, search, old items kept), two children never
mixed, another family isolated, link revocation, direct API attempts, and admin corrections.

## Run locally

```bash
./scripts/localstack/setup.sh && ./scripts/localstack/start.sh && ./scripts/localstack/web-env.sh
S=local-dev-only-jwt-secret-0123456789abcdef
SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=$(LS_JWT_SECRET=$S node scripts/localstack/keys.mjs service_role) \
  SUPABASE_ANON_KEY=$(LS_JWT_SECRET=$S node scripts/localstack/keys.mjs anon) node scripts/seed-demo.mjs   # prints the admin login and a parent link
cd web && npx vite --mode e2e            # http://localhost:5173
```

## Going live

1. New Supabase project → apply `supabase/migrations/` in order. Auth: **disable sign-ups**; create the
   administrator from Authentication → Users → Invite, then
   `insert into public.admins (user_id) select id from auth.users where email = 'you@…';`
2. Deploy `sync-homework` (optional until an authorized Idukay API exists). To run it hourly:
   `select cron.schedule('sync-homework', '0 * * * *', $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/sync-homework', headers := jsonb_build_object('Authorization', 'Bearer <service role key>')) $$);`
   (pg_cron + pg_net; keep the key in Vault).
3. Web: set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPPORT_EMAIL` (and optionally
   `VITE_APP_NAME`), `npm run build`, serve `web/dist` with SPA fallback (`web/public/_headers` sets CSP).
4. In the admin console: add the students of 4.º A (first names), create one link per family and send it
   privately (not in groups). Publish homework by pasting from Idukay.
5. Review the privacy notice with the school (see ARCHITECTURE.md).
