# Tareas en Casa — Free parent homework viewer

> "A simple window into my child's homework."

**Free for parents.** No subscription, no payments, no trial, no paywall.
Initial scope: **Cuarto Grado de Educación General Básica — Paralelo A**.

## 1. Roles

| Role | Who | How they get in | Can |
| --- | --- | --- | --- |
| **VIEWER** | Parents, guardians, representatives | A private link `/v/<token>` created by the admin. No account, no password. | View today, the last 14 days (+ upcoming), details and the archive. **Read-only.** |
| **ADMIN** | The person who manages the class data | Email + password (Supabase Auth), listed in `public.admins` | Publish and correct homework, add students, create/revoke links, configure subjects, review sync status |

Parents cannot create, edit, delete or re-date homework, change its language, or modify anything
imported from Idukay. This is enforced by the database, not only by hidden buttons:
the public key has **no** access to any table; parents can only call the `viewer_*` functions,
which are read-only and return just what the link allows.

```
School / authorized source ─┐
Administrator (paste / form) ┴─► Homework database ─► viewer_* functions ─► Parent app (READ ONLY)
```

## 2. Data model

| Table | Purpose |
| --- | --- |
| `classes` | Grade + parallel (+ school year, time zone, last sync, last change) |
| `subjects` | Per class, with the **language the homework is done in** (`en` / `es` / `other`) and an emoji |
| `students` | First name + class only (no surnames, IDs or contact data) |
| `viewer_links` / `viewer_link_students` | A link = SHA-256 of a random 192-bit token + the students it covers. The token is shown once and never stored. Revocable. |
| `homework` | Subject, title, **original instructions**, optional **parent explanation**, **language**, **start date**, **due date**, teacher, notes, attachments, source, revision |
| `homework_revisions` | Previous version of every correction |
| `sync_runs` | Every synchronization or bulk entry: added / updated / unchanged / not configured / error |
| `admins`, `audit_logs` | Admin role; who created/revoked links, withdrew homework |

Homework belongs to the **class**: every family of 4.º A sees exactly the same record. A link never
reveals the class roster or other families.

## 3. Lifecycle and archive

```
NEW (added in the last 24 h) → ACTIVE (start ≤ today ≤ due) → ARCHIVED (due < today)
                    UPCOMING (start > today) ─┘
```

* The lifecycle is **computed from the dates** at read time, so archiving is automatic and never
  writes to — let alone deletes — the record.
* **Homework is never deleted.** Nobody has DELETE permission (not even the admin). A mistaken entry
  is *withdrawn* (hidden from parents, kept in the database, restorable).
* Corrections bump `revision` and keep the previous version in `homework_revisions`; parents see a
  "corrected by the administrator" note.

**Completed** is a *personal viewing mark*, stored only on the parent's device (localStorage). It
never changes the official homework. From it the app derives, for that parent:
🟢 completed · 🟡 pending · 🔴 overdue (due date passed, not marked) · 🔵 upcoming · 📁 archived.
Today's view brings back unmarked homework due in the last 3 days (Friday → Monday); older
unmarked homework shows as overdue in "Last 2 weeks" and lives in the archive.

## 4. Homework language

* `homework.language` is the language the **student must use**, taken from the subject by default
  (Language Arts, English, Science, Spelling → English; Matemática, Lengua y Literatura, Estudios
  Sociales, Educación Cultural… → Spanish). The admin can override it per homework.
* `instructions` is the original text and the authority. `parent_explanation` (e.g. a Spanish
  translation for parents) is stored and shown **separately**; it never replaces the original.
* The app never machine-translates homework. Badges: 🇺🇸 ENGLISH · 🇪🇸 ESPAÑOL · 🌐 OTHER. For English
  homework the detail page says: "Your child must do this homework IN ENGLISH. The Spanish
  explanation is only to help you understand it."
* The paste parser keeps "Traducción: …" / "En español: …" blocks as the parent explanation.

## 5. Parent screens

`🏠 Today` · `📅 Last 2 Weeks` · `📁 Archive` (+ a detail page). Nothing else.

* **Today:** child, grade and parallel; big counter (N assignments · completed · pending · overdue);
  one-sentence summary; 🆕 new-homework banner; homework cards; This week (Mon–Fri counts);
  Upcoming (next 7 days, collapsed); last updated.
* **Last 2 weeks:** this week Mon–Fri and the previous 14 days, each with its count; tap a day.
* **Archive:** year → month → week; filters by month, subject, date and text; read-only details.
* Several children on one link: chips to switch; lists are never mixed.

## 6. Sources and synchronization

| Source | State |
| --- | --- |
| Admin form (one by one) | Built |
| Paste from Idukay (admin reviews before publishing) | Built — duplicates are skipped |
| CSV file | Built |
| Authorized Idukay API | **Not available.** `supabase/functions/sync-homework` runs the `HomeworkSource` interface every hour (when scheduled); the Idukay adapter reports `not_configured` until an authorized API and credentials exist. It never pretends to sync. |

The sync upserts by the source's `external_id` (no duplicates), records changed homework as a new
revision, and stores the result in `sync_runs`. Parents see "Last updated: <date — time>" and, if the
data is older than 2 hours, "Homework information was last updated 3 hours ago."

Never: Idukay passwords, scraping, or exposing other classes.

## 7. Security summary

* Public key: zero table privileges; only `viewer_*` (read-only, token-scoped) functions.
* Tokens: 192-bit random, stored as SHA-256, revocable, never logged; removed from the address bar
  after opening (kept on the device only).
* Admin: RLS on every table (`app.is_admin()`), no DELETE on homework, class/source of homework
  immutable, versioned corrections, audit log. Public sign-up disabled.
* No personal data about parents at all; students are first names only.

## 8. Future (not built, architecture ready)

More grades/parallels/schools (already multi-class), other platforms (new `HomeworkSource`), email
or push reminders, calendar, progress reports, AI explanations for parents (would fill
`parent_explanation`, clearly labelled), multiple caregivers (already: one link per family member).

## Items that need review before sharing with families

1. **Data protection (Ecuador LOPDP):** students' first names + class are children's data. Get the
   school's consent/authorization, name a data controller, and publish the final privacy notice
   (the in-app texts are drafts).
2. **Using Idukay content:** copying homework from Idukay for other parents should be authorized
   by the school; the app says it is not affiliated with Idukay.
3. **Name:** the app is called "Tareas en Casa" by default (`VITE_APP_NAME`) to avoid using the
   Idukay brand.
