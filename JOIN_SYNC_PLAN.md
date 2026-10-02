# Join → portal sync plan — 2 October 2026

Goal: people who apply on rcceb.org/join should show up in the portal automatically. Then, when Onur invites them, onboarding opens with what they already typed (name, phone, LinkedIn, RC year, pathway).

Do not print secrets from `.env.local`. Do not commit this file unless Onur asks.

## What the portal already has (no work needed)

- The `applications` table (`db/schema.sql`) holds join submissions: name, email, phone, LinkedIn, graduation year, pathway (`categories`), consent flags, source, status.
- `POST /api/applications` (`app/api/applications/route.ts`) is the intake endpoint. It needs `Authorization: Bearer <APPLICATIONS_INTAKE_SECRET>`, validates the JSON with `normalizeApplicationInput` (`app/lib/applications.ts`) using `requireAgreements: true`, inserts with source `rcceb.org`, and emails `NOTIFICATION_EMAIL`. Email only works once Resend is connected; see `SESSION_HANDOFF.md`.
- Admin → Applications lists them.
- Admin invite (`app/api/admin/members/invite/route.ts`) copies the application onto a new member row.
- Profile GET (`app/api/members/profile/route.ts`) fills in any blank fields from the application, so onboarding opens pre-filled.

The only missing piece is getting join data **into** `applications`.

## What we tried: DigitalOcean databases (dead end for now)

Their team gave Onur DigitalOcean access (team "RCCEB", project "RCCEB Engineering"). There are two managed PostgreSQL 17 clusters in FRA1:

| Cluster | What's in it |
| --- | --- |
| `rcceb-preview-pg17` | Empty. `defaultdb` has no tables. |
| `rcceb-dev-pg17` | Database `rcceb_dev`. Their own full member portal (Drizzle + better-auth): `members` (145 rows), `user`, `session`, `organizations`, `events`, `decks`, `expertise_tags`, `member_types`, etc. No join/applications table. The data looks like test data (industries "Dev Industry A/B/C", tags "Retired Specialty", "Legacy Systems"). |

Useful mapping if we ever do use their database:
- `members` has `name`, `member_type`, `graduation_year`, `company_or_role`, `industry`, `bio`, `working_on`, `can_help_with`, `contact_email`, `imported_from`, `profile_completed_at`.
- Their `member_types` codes map to our pathways like this: `rc_young_entrepreneur` → `young-entrepreneur`, `rc_experience_entrepreneur` → `experienced-entrepreneur`, `rc_executive` → `executive`, `rc_investor` → `investor`. They also have `rc_friend`, which has no match in ours.
- Their first 15 expertise tags are identical to ours.

Network Access state:
- Onur's IP (`213.74.112.42`) was added to both clusters and then **removed from both**.
- Preview is back to having no trusted sources (open, password-gated).
- Dev keeps its original entries: the `192.0.2.1` "fail-closed sentinel" (do not delete) and the `rcceb-dev` app.
- Rule to remember: adding the first trusted source to a cluster locks out everyone else.

`.env.local` still has `JOIN_DB_PREVIEW_URL` and `JOIN_DB_DEV_URL` (doadmin credentials). They are not used by any code. Remove them, or replace them with a single `JOIN_DATABASE_URL` if their team gives us a production database.

Onur asked their team which database the **live** join form writes to. Their reply (2 Oct): `rcceb-dev-pg17` is the one to use, and preview is only for their test agents after development.

**Checked 2 Oct (read-only, with Onur's OK): dev holds test data, not applicants.**
- Every one of the 145 `members` rows has a fixture `imported_from`: `dev-fixture` 107, `notifications-fixture` 13, `identity-onboarding-fixture` 7, `identity-security-fixture` 7, `identity-invitations` 6, `console-add` 4, `ensure-dev-admin` 1.
- 140 of the 145 emails are `@example.invalid`. The other 5 are team/test accounts (2 gmail, rcceb.org, orques.ai, reflectstudio.com).
- Graduation years are spread evenly from 1960 on, and companies are placeholders like "Product leader".

**Decision: the Google Sheet is the source of truth.** Don't use the dev database.

**DigitalOcean is shelved.** The DigitalOcean contact said (2 Oct): "benim rcceb.org/join ile ilgili bir bilgim yok" ("I don't know anything about rcceb.org/join"). Those databases belong to a separate project. Onur will ask whoever built rcceb.org where the join form stores its data. Until then, ignore DigitalOcean.

## Chosen plan: the Google Sheet

Applications already land automatically in this sheet:
https://docs.google.com/spreadsheets/d/1te4bWypslsr2seqYHmja32EPp2VeeY2p61MeDDWxNnk/edit?gid=0#gid=0

### 1. New applications: Apps Script push (real time)

A Google Apps Script bound to the sheet sends each new row to `POST {APP_URL}/api/applications` with the intake secret.

- The portal needs no Google credentials. The existing endpoint and validation are reused.
- Store the secret in **Script properties** (Project Settings → Script properties), not in the script code.
- The trigger depends on how rows arrive:
  - Google Form feeding the sheet → `onFormSubmit` installable trigger.
  - rcceb.org writing rows through the Sheets API → `onChange` trigger. Track the last processed row (or a "synced" column) so rows aren't sent twice.
- The script must map the sheet's columns to the JSON that `normalizeApplicationInput` expects (first/last name or name, email, phone, linkedin, graduation year, categories, contact consent, terms, letter of intent). Pathway labels in the sheet must be converted to our ids: `young-entrepreneur`, `experienced-entrepreneur`, `executive`, `investor`.
- Log failures somewhere visible: a "sync status" column in the sheet, or Apps Script executions.

### 2. Existing applications: one-time import

- Import the rows already in the sheet once.
- Option A: an Apps Script function that walks every row and POSTs it.
- Option B: download a CSV and run a local import script against Aurora.
- Either way, **dedupe by lowercase email**. Today `/api/applications` always inserts, so a re-run would create duplicates. Before importing, either add a dedupe check (skip or update when the email already has an application) or add an `external_id` column (e.g. sheet row / form response id) with a unique index.

### Do not

- Do not "Publish to web" the sheet as CSV. That makes applicant emails and phone numbers public.
- Do not add Google API keys or a service account to the portal unless the Apps Script push turns out to be impossible.

## Next steps when Onur is back

0. Done: dev checked, it's fixtures, so we use the sheet. Remove Onur's IP from `rcceb-dev-pg17` again, and delete `JOIN_DB_PREVIEW_URL` / `JOIN_DB_DEV_URL` from `.env.local`.
0b. Onur: ask the rcceb.org builder where the join form saves submissions. Optional: the sheet already works as a source, so this doesn't block anything.
1. Onur: share the sheet's **column headers**. Either download the sheet as CSV (File → Download → .csv) and give the file name in Downloads, or connect Google Drive in Claude.
2. Onur: check whether the sheet is fed by a **Google Form** (a "Form responses 1" tab, or the form link under Tools/Extensions) or written by the website.
3. Claude: add dedupe to the intake (email and/or `external_id`, plus a schema migration in `db/schema.sql`, then `npm run db:setup`).
4. Claude: write the Apps Script (mapping, trigger, retries/status column) and the backfill function. Onur pastes it into Extensions → Apps Script, sets the `APPLICATIONS_INTAKE_SECRET` and `APP_URL` script properties, and authorizes the trigger.
5. Test with one fake application against the live portal, check it in Admin → Applications, invite it, and confirm onboarding is pre-filled. Then delete the test rows.
6. Run the backfill.
7. Commit, push, and redeploy only when Onur says so.
