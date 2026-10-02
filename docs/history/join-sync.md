# Archive: joining rcceb.org/join to the portal (2 October 2026)

> **Historical.** This is how the connection was worked out, including the DigitalOcean dead end. The current flow is in [../developer-guide.md](../developer-guide.md) section 4. The "Later: make RC approval automatic" plan below has since been built (`/api/applications/rc-decision`).

## STATUS: DONE (2 Oct 2026)

- **New applications:** rcceb.org/join (repo `rcceb/landingpage`, commit 0d7fcd6, live on www.rcceb.org since 12:42 UTC) forwards every submission to the portal's `POST /api/applications`. `PORTAL_APPLICATIONS_URL` and `PORTAL_INTAKE_SECRET` are set on Vercel project `project-uu3bm`. The landing project is now Git-connected: a push to `main` deploys to production. Commits there must be authored as `rcceb` (Hobby plan).
- **Duplicates:** `applications.external_id` (the sheet's User ID) with a partial unique index. The intake returns `duplicate: true` on a repeat. Portal commit 2efebc6 is live; checked against prod (201, then 200 duplicate, 401 on a wrong secret).
- **Old applications:** all 59 sheet rows (19 May – 29 Sep 2026) were imported straight into Aurora with their original dates. Approved → admission `accepted` (53), Rejected → `declined` (2), Pending → blank (4). The sheet's reviewer and date are in `notes`. No emails were sent, and none of these people are invited yet. One applicant appears twice (applied twice).
- The Google Sheet + Gmail approve/reject flow on the landing site still runs alongside. The portal reads only Aurora.
- Everything below is history.

Goal: people who apply on rcceb.org/join should show up in the portal automatically. Then, when Onur invites them, onboarding opens with what they already typed (name, phone, LinkedIn, RC year, pathway).

## What the portal already has (no work needed)

- The `applications` table (`db/schema.sql`) holds join submissions: name, email, phone, LinkedIn, graduation year, pathway (`categories`), consent flags, source, status.
- `POST /api/applications` (`app/api/applications/route.ts`) is the intake endpoint. It needs `Authorization: Bearer <APPLICATIONS_INTAKE_SECRET>`, validates the JSON with `normalizeApplicationInput` (`app/lib/applications.ts`) using `requireAgreements: true`, inserts with source `rcceb.org`, and emails `NOTIFICATION_EMAIL`. Email only works once Resend is connected; see `../email.md`.
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

## Update 2 Oct: we have the landing site's code (this replaces the Apps Script plan)

- rcceb.org source code: https://github.com/rcceb/landingpage, local copy at `~/Desktop/rcceb-landing`. Downloaded from Yasemin's Vercel project `project-uu3bm` (account `admin-66535438s-projects`, deploys with the CLI, no Git). Next.js 16.1.6, React 19, Tailwind 4, pnpm.
- `/api/join` writes to the Google Sheet with a service account (`GOOGLE_SHEET_ID`, `GOOGLE_SA_*`) and sends Gmail SMTP mail (`GMAIL_USER`, `GMAIL_APP_PASSWORD`) with HMAC approve/reject links (`REVIEW_SECRET`). `/api/review` writes the decision back to the sheet and sends welcome/rejection emails.
- Decision: **don't merge the repos yet.** The portal is on React 18 + Tailwind 3 (with zinc remapped to navy), and its `proxy.ts` makes everything members-only.
- Forwarding replaces the Apps Script:
  - Branch `forward-to-portal` in rcceb-landing (not committed or pushed): after the sheet write, `/api/join` POSTs to the portal. It's best-effort, sends `externalId` = the sheet's User ID, and needs the env vars `PORTAL_APPLICATIONS_URL` + `PORTAL_INTAKE_SECRET`. Without them it does nothing.
  - Portal (uncommitted): new column `applications.external_id` with a partial unique index. `insertApplication` does `ON CONFLICT DO NOTHING`, and the intake returns `{ duplicate: true }` with no second email.
  - **Deploy order matters:** run `npm run db:setup` before deploying the portal, because `APPLICATION_SELECT` now reads `external_id`.
- Still to do: backfill the existing sheet rows (use the User ID column as `externalId`).

## Earlier plan: the Google Sheet (superseded by the section above)

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

## Later: make RC approval → onboarding fully automatic (not started)

Onur's goal (2 Oct): once an applicant is in the portal, nobody should have to click anything. Robert College staff check that the applicant is a real RC graduate. Their approval is recorded in a database automatically. The portal should pick that up and send the onboarding email by itself. Onur will do this later, not now.

**How it works today (manual, in the uncommitted 2 Oct changes):**
1. The application lands in Admin → Applications (status **Submitted**).
2. An admin sets the status to **Sent to RC**, then **RC Verified**, by hand.
3. The admin sets Admission to **Accepted** and confirms. That creates the member and emails "Welcome to RCCEB" with a 30-day onboarding link right away (`changeAdmission` in `app/admin/(dashboard)/applications/page.tsx` → `POST /api/admin/members/invite`). **Resend** / **Invite** send it again.

**What "automatic" means:**
- RC approves → the application becomes **RC Verified** + **Accepted** → the member is created → the welcome email is sent. No admin step.
- RC rejects → Admission **Declined**, no email.
- Admins can still do every step by hand, for edge cases.

**Open questions for Onur (answer before building):**
1. Where does RC record the approval? The Google Sheet (a column), their own database, or something else? Who owns it, and can we get read access or a webhook?
2. How is the applicant matched? By email is the simplest. A row id or application id is safer if one exists on both sides.
3. Should an approval send the email instantly, or should an admin get a short window (e.g. a daily digest) to stop it?
4. What does a rejection look like on their side, if anything?

**Likely build, depending on the answers:**
- Move the member-creation + welcome-email code out of `app/api/admin/members/invite/route.ts` into a shared helper (e.g. `inviteApplication(applicationId, baseUrl)` in `app/lib/`). Then the admin button and the automatic path send the exact same email.
- Add a secret-protected endpoint (like `/api/applications`, which uses `APPLICATIONS_INTAKE_SECRET`), e.g. `POST /api/applications/rc-decision` with `{ email | external_id, decision: 'approved' | 'rejected' }`. On approved: set status `rc verified`, admission `accepted`, call the helper. On rejected: admission `declined`.
- Make it idempotent: if the application already has a `member_id`, don't email again. A repeated or late webhook must never send a second welcome email.
- How RC's decision reaches the endpoint:
  - If it's a sheet column: an Apps Script `onEdit`/`onChange` trigger on that column POSTs to the endpoint (same pattern as section 1 above).
  - If it's a database we can read: a scheduled job (Vercel cron) that polls for new decisions. Note: the weekly match cron was deliberately removed. A new cron is fine for this, but only this.
- Log every automatic decision somewhere visible (e.g. the application's notes, or a small `application_events` table), so admins can see "accepted automatically on <date> from RC".
- Test with a fake applicant against the live portal before turning it on, then delete the test rows.

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
