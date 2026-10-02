# RCCEB Portal

Member portal and admin dashboard for the **Robert College Community Entrepreneurs Bond**.
Next.js (App Router) + AWS Aurora PostgreSQL (data, sign-in sessions) + AWS S3 (uploaded images) + Resend (email).

Adapted from the Exposure portal, without payments, Overexposed, YouTube, rejections,
AI Academy, talent pool, newsletter, email templates, Welcome Summer, the mobile app
or Community Brain.

## What's in it

**Member portal** (`/members`): Directory (filter by pathway, search by class year),
Companies (which companies members can open a door to), Job Board, Asks & Offers, Perks,
monthly 1-on-1 Match, Links, Events, Refer a Friend and Profile. Members sign in with a
magic link or a one-time code. Membership is free, so onboarding is two steps: profile,
then referrals. Name, phone, LinkedIn, class year and pathway are copied from the
application on rcceb.org/join.

**Admin dashboard** (`/admin`): Applications, Members, Attendance, Matches, Events,
Links, Perks and Settings, plus Companies and Analytics under "Other".

Members are grouped by RCCEB's four pathways (`app/lib/categories.ts`): RC Young
Entrepreneur, RC Experienced Entrepreneur, RC Executive and RC Investor. Each member also
has their RC graduation year. Brand tokens (navy, cream, gold, Playfair Display + Inter)
are in `tailwind.config.ts`.

## Setup

1. **Database.** Create an Aurora PostgreSQL cluster: Serverless v2 with a minimum of
   0 ACU so it pauses when idle, publicly accessible, and port 5432 open to your IP in
   its security group. Put the writer endpoint in `DATABASE_URL`.
2. **Uploads.** Create an S3 bucket whose `avatars/*` and `events/*` paths are publicly
   readable, plus an IAM user that can only `s3:PutObject` into that bucket. Put the
   bucket name and the user's access keys in `.env.local`.
3. `cp .env.example .env.local` and fill it in. Generate each secret with
   `openssl rand -base64 32`.
4. Run:

```bash
npm install
npm run db:setup   # creates/updates every table from db/schema.sql (safe to re-run)
npm run dev
```

Sign-in is built in (`app/lib/auth.ts`): an emailed link plus a 6-digit code, with
sessions stored in Aurora. In development the sign-in endpoints skip email and redirect
you straight through, so you can log in without Resend. Sign in at `/admin/login` with an
`ADMIN_EMAILS` address.

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
2. Robert College checks the applicant really graduated. Track it with the Application
   status: **Sent to RC**, then **RC Verified**.
3. Set Admission to **Accepted**, then click **Portal**. This creates the member, copying
   their name, phone, LinkedIn, class year and pathway from the application, and emails
   them a 30-day onboarding link.
4. They finish their profile and appear in the directory.

You can also add members directly on the Members page and re-send their invite from there.

## 1-on-1 matching

Rounds are monthly and run by hand from **Admin → Matches**. Nothing is scheduled:
**Create Round** puts every onboarded member in, **Notify All Members** emails them with a
way to sit the month out, **Run Match** makes the pairs without emailing anyone, and
**Send Intro Emails** tells each pair who they got. Only one round can be open at a time.

## Layout

| Path | What's in it |
| --- | --- |
| `proxy.ts` | Auth gate for `/admin`, `/api/admin`, `/members` and `/api/members`. Most route handlers rely on it. |
| `app/members/` | Member portal pages. |
| `app/admin/` | Admin dashboard pages. |
| `app/api/` | Route handlers. `applications`, `match-confirm` and `unsubscribe` are public and do their own checks. |
| `app/lib/` | Server helpers: DB, auth, email, categories, brand. |
| `db/schema.sql` | The whole database schema (`npm run db:setup` applies it). |
| `brand/` | The full-resolution seal (not served). |

## Deploy

`Dockerfile` builds a standalone Node image with Tesseract installed, which attendance
OCR needs. Any Node host works. Pass `APP_URL`, `NEXT_PUBLIC_BASE_URL`, `S3_BUCKET` and
`AWS_REGION` as build args, and the secrets as runtime env. The server's IP must be
allowed on port 5432 in the database's security group.
