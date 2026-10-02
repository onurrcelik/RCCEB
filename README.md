# RCCEB Portal

Member portal and admin dashboard for the **Robert College Community Entrepreneurs Bond**.
Next.js (App Router) + AWS Aurora PostgreSQL (data, sign-in sessions) + AWS S3 (uploaded images) + Resend (email).

Adapted from the Exposure portal, without payments, Overexposed, YouTube, rejections,
AI Academy, talent pool, newsletter, email templates, Welcome Summer, the mobile app
or Community Brain.

## What's in it

**Member portal** (`/members`): Directory (search, and filters for pathway, class year, expertise and location),
Companies (which companies members can open a door to), Job Board, Asks & Offers, Perks,
monthly 1-on-1 Match, Links, Events, Refer a Friend and Profile. Members sign in with a
magic link or a one-time code. Membership is free, so onboarding is two steps: profile,
then referrals. Name, phone, LinkedIn, location, class year and pathway are copied from the
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

## How it works

The membership flow (apply → RC approval → onboarding), the monthly 1-on-1s, email, and how
this portal ships together with the public site are documented in **[`docs/`](docs/README.md)**.
Start with [`docs/developer-guide.md`](docs/developer-guide.md).

## Layout

| Path | What's in it |
| --- | --- |
| `proxy.ts` | Auth gate for `/admin`, `/api/admin`, `/members` and `/api/members`. Most route handlers rely on it. |
| `app/members/` | Member portal pages (dashboard, onboarding, login, invite). |
| `app/admin/` | Admin dashboard pages. |
| `app/api/` | Route handlers. `applications` (intake and RC decisions), `match-confirm`, `match-join` and `unsubscribe` are public and do their own signed or secret checks. |
| `app/lib/` | Server helpers: database, auth, email, matching, onboarding, categories, brand. |
| `app/components/` | Shared UI (profile editors, icons, logo). |
| `db/schema.sql` | The whole database schema (`npm run db:setup` applies it). |
| `scripts/` | `db-setup.mjs`. |
| `docs/` | All documentation. |
| `brand/` | The full-resolution seal (not served). |

## Deploy

Pushing to `main` deploys to production on Vercel, and the portal is served at
www.rcceb.org/members and /admin through the public site's rewrites. **Read
[`docs/deployment.md`](docs/deployment.md) before shipping.**

`Dockerfile` also builds a standalone Node image with Tesseract installed (attendance OCR needs
it), for any other Node host. Pass `APP_URL`, `NEXT_PUBLIC_BASE_URL`, `S3_BUCKET` and
`AWS_REGION` as build args, and the secrets as runtime env. The server's IP must be allowed
on port 5432 in the database's security group.
