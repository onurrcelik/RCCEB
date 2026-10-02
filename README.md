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

The full flow, with every email, is in `DEVELOPER_GUIDE.md` (section 4). In short:

1. They apply at **rcceb.org/join**. The site writes its Google Sheet, emails the RC clerks, and
   forwards the application to this portal (`POST /api/applications`, `Authorization: Bearer
   {APPLICATIONS_INTAKE_SECRET}`, body carries `externalId` = the sheet's User ID). It appears
   under **Admin → Applications** as **Sent to RC**, and `NOTIFICATION_EMAIL` is alerted.
2. An RC clerk clicks **Approve** in the reviewer email. The site updates the sheet and calls
   `POST /api/applications/rc-decision`; the portal marks the application **RC Verified +
   Accepted**, creates the member and emails "Welcome to the Bond" with a 30-day onboarding link.
   Reject marks it **Declined**.
3. They finish their profile (a ChatGPT prompt can draft it) and appear in the directory.

Admins can still do it by hand: Admission → **Accepted**, or **Invite / Resend**, or add a member
on the Members page.

## 1-on-1 matching

Rounds are monthly, opt-in, and run by hand from **Admin → Matches**; nothing is scheduled.
**Create Round** opens an empty round and emails every onboarded member an invitation with a
one-click "Count me in" (members can also choose "join every month" and skip the invitation).
**Remind Members** re-sends only to people who haven't answered. **Run Match** pairs only the
people who joined, without emailing, and **Send Intro Emails** tells each pair who they got and
who reaches out first. Only one round can be open at a time.

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
