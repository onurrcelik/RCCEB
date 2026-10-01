# RCCEB Portal

Member portal and admin dashboard for the **Robert College Community Entrepreneurs Bond**.
Next.js (App Router) + Supabase (auth, Postgres, storage) + Resend (email).

Adapted from the Exposure portal, without payments, Overexposed, YouTube, rejections,
AI Academy, talent pool, newsletter, email templates, Welcome Summer, the mobile app
or Community Brain.

## What's in it

**Member portal** (`/members`): Directory (filter by pathway, search by class year),
Job Board, Marketplace, Perks, weekly 1-on-1 Match, Links, Events, Refer a Friend and
Profile. Members sign in with a magic link or a one-time code. Membership is free, so
onboarding is two steps: profile, then referrals.

**Admin dashboard** (`/admin`): Applications, Members, Attendance, Matches, Events,
Links, Perks and Settings, plus Companies and Analytics under "Other".

Members are grouped by RCCEB's four pathways (`app/lib/categories.ts`): RC Young
Entrepreneur, RC Experienced Entrepreneur, RC Executive and RC Investor. Each member also
has their RC graduation year. Brand tokens (navy, cream, gold, Playfair Display + Inter)
are in `tailwind.config.ts`.

## Setup

1. Create a Supabase project. Open the SQL editor and run `supabase/schema.sql` once.
   It creates every table and the `avatars` / `events` storage buckets.
2. In Supabase Auth → URL configuration, set the Site URL to your `APP_URL` and add
   `APP_URL/auth/callback` and `APP_URL/auth/admin/callback` as redirect URLs.
3. `cp .env.example .env.local` and fill it in. At minimum you need the Supabase keys,
   `DATABASE_URL`, `APP_URL` and `ADMIN_EMAILS`. Add `RESEND_API_KEY` to send real email.
4. Then run:

```bash
npm install
npm run dev
```

In development, the sign-in endpoints skip email and return the magic link directly, so
you can log in without Resend. Sign in at `/admin/login` with an `ADMIN_EMAILS` address.

## How someone becomes a member

1. They apply at **rcceb.org/join**. That site's own `/api/join` handler forwards the same
   JSON body to this portal:

   ```
   POST {APP_URL}/api/applications
   Authorization: Bearer {APPLICATIONS_INTAKE_SECRET}
   Content-Type: application/json

   { firstName, lastName, graduationYear, linkedIn, phone, email, contactConsent,
     memberTypes: ["young-entrepreneur" | "experienced-entrepreneur" | "executive" | "investor"],
     agreedToTerms, agreedToLetterOfIntent }
   ```

   The application appears under **Admin → Applications**, and `NOTIFICATION_EMAIL`
   receives an email about it.
2. Optional: click **Meet** to email them your booking link. You set the link in
   Settings.
3. Set Admission to **Accepted**, then click **Portal**. This creates the member, copying
   their name, phone, LinkedIn, class year and pathway from the application, and emails
   them a 30-day onboarding link.
4. They finish their profile and appear in the directory.

You can also add members directly on the Members page and re-send their invite from there.

## Scheduled job

`GET /api/cron/weekly-match-round` with `Authorization: Bearer $CRON_SECRET` opens the
week's 1-on-1 round and emails the pool. Schedule it for Sundays. Add `?dry_run=1` to
check the setup without sending anything. Running the match itself stays manual, under
Admin → Matches.

## Layout

| Path | What's in it |
| --- | --- |
| `proxy.ts` | Auth gate for `/admin`, `/api/admin`, `/members` and `/api/members`. Most route handlers rely on it. |
| `app/members/` | Member portal pages. |
| `app/admin/` | Admin dashboard pages. |
| `app/api/` | Route handlers. `applications`, `cron`, `jobs`, `match-confirm` and `unsubscribe` are public and do their own checks. |
| `app/lib/` | Server helpers: DB, auth, email, categories, brand. |
| `supabase/schema.sql` | The whole database schema. |
| `brand/` | The full-resolution seal (not served). |

## Deploy

`Dockerfile` builds a standalone Node image with Tesseract installed, which attendance
OCR needs. Any Node host works. Pass the `NEXT_PUBLIC_*` variables and `APP_URL` as
build args, and the secrets as runtime env.
