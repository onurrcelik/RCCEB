# How the portal works

Reference for the member & admin portal (this repo). For the big picture and who's who, start at [developer-guide.md](developer-guide.md); for shipping, [deployment.md](deployment.md).

## Stack

Next.js 16 App Router, React 18, Tailwind 3, `pg` against AWS Aurora PostgreSQL (`eu-central-1`), S3 for photos and PDFs, Resend for email. Local dev: `npm run dev` on http://localhost:3000 (`APP_URL` in `.env.local` should be `http://localhost:3000`). Node 24 on Vercel.

## Database

- Schema: `db/schema.sql`, idempotent. `npm run db:setup` applies it to the database in `DATABASE_URL`. Run it **before** pushing code that reads a new column.
- Every table enables row level security with **no** policies. The app reaches the database only from server code, so nothing is exposed to browsers. Keep it that way: add a table, enable RLS, stop.
- **Reachability:** Aurora cluster `rcceb-db`, writer `rcceb-db-instance-1`, security group `sg-0cedb2d495493f71b`. The group rules are on the **writer instance** (not the cluster page). Port 5432 is open to `0.0.0.0/0` **on purpose**, because Vercel Hobby has no fixed IP; the password is the gate. Don't remove that rule unless Vercel can still connect another way.
- Local dev talks to this **production** database.
- Leftovers kept on purpose (unused): `job_board_referrals`, `job_board_posts.share_token`, and the `external_*` / `referred_by_member_id` / `referrer_name` columns on `job_board_applications`. Leave them unless Onur asks.

## Auth

- **Member sign-in:** `POST /api/members/auth`, then `/auth/callback`. Only emails already in `members` get a link; past members are rejected. The callback page redeems the token with a script-driven POST (so mail scanners can't spend it) and removes it from the address bar.
- **Admin sign-in:** `POST /api/admin/auth`, then `/auth/admin/callback`. Only emails in `ADMIN_EMAILS`. Being an admin is **not** the same as being a member; deleting a member doesn't remove admin access.
- In development the auth routes return a `devLink` instead of sending mail.
- `proxy.ts` is the gate: `/` goes to the dashboard, incomplete members go to `/members/onboarding`, everyone else is blocked. Public exceptions include `/members/login`, `/members/invite` and `/api/members/auth`. Server-to-server routes (`/api/applications`, `/api/applications/rc-decision`) use the intake secret instead (`app/lib/intake-auth.ts`).
- Cookies: `rcceb_session` (members) and `rcceb_admin_session` (admins), separate, renewed on every visit for 30 days.
- **Onboarding invites:** 30-day personal link `GET /members/invite?token=…`, stored hashed in `member_invites`, reusable until onboarding completes (so mail scanners don't burn it).

## Membership, in code

Full flow with emails: [developer-guide.md](developer-guide.md) section 4. Where it lives:

| Step | Code |
| --- | --- |
| Application intake (from the landing site) | `app/api/applications/route.ts`, `app/lib/applications.ts` (dedupes on `external_id`) |
| RC clerk's Approve/Reject | `app/api/applications/rc-decision/route.ts` |
| Creating the member + the welcome email | `app/lib/onboarding-invite.ts` (shared with the admin buttons in `app/api/admin/members/invite/route.ts`) |
| Application statuses | `submitted → sent to rc → rc verified`; admission `'' / accepted / deferred / declined` |
| Pre-filling onboarding | `app/api/members/profile/route.ts` fills blanks from the application |

## Onboarding

`app/members/onboarding/page.tsx`. Required: photo, name, phone, LinkedIn, class year, **location**, bio, what I can help with, what I'm working on, at least one expertise tag, at least one company with a role **and a website**, education after RC, favorite read/video/person/source. Then a Refer a Friend step.

- **ChatGPT popup:** `ChatGptPromptDialog.tsx` appears 5 seconds after arrival (once per browser; again via the link under the title). The prompt is built in `app/lib/onboarding-prompt.ts` with the member's name, year, city and pathway. The pasted reply is sorted into the form by `app/lib/onboarding-paste.ts` (plain parsing, no AI call). The Turkish WhatsApp intro is saved to `members.whatsapp_intro` (admin-only). **Keep the prompt's numbered headings and the parser in step.**
- **Expertise tags** (15): Artificial Intelligence, Board Governance, Business Development, Community Building, Cybersecurity, Data Analytics, Finance, Fintech, Fundraising, International Growth, Legal, Marketing, Operations, Product Management, Sales (`EXPERTISE_OPTIONS` in `app/lib/categories.ts`).
- **Pathways** (separate from expertise): `young-entrepreneur`, `experienced-entrepreneur`, `executive`, `investor`.
- **Companies** are shared rows in `companies` keyed by a normalized name, with each person's role on `company_affiliations`; members who type the same company share one page. Blank website or LinkedIn must not wipe an existing value. `member_companies` still stores the first company name for the job board.

## Directory

`app/members/dashboard/DashboardClient.tsx` and `DirectoryFilters.tsx`: search plus pathway, class year, expertise and location filters (OR within a group, AND across). Cards show location with a pin.

## 1-on-1 matching

Opt-in each month, run by hand from **Admin → Matches**; nothing is scheduled.

- **Create Round** opens a round and emails every onboarded member an invitation (`notifyRoundMembers` in `app/lib/matching.ts`) with a signed one-click "Count me in" (`/api/match-join`, `app/lib/match-join.ts`; no sign-in).
- **Join every month** (`members.match_auto_opt_in`): put in when a round opens, skip the invitation. They can still sit out a month.
- **Remind Members** re-sends only to people who haven't answered. **Run Match** pairs only people who joined; **Send intro emails** tells each pair who they got, and who reaches out first (subject and body).
- "Did you meet?" links: `/api/match-confirm`, `app/lib/match-confirm.ts`. One round open at a time.

## Other member features

- **Job board** (members only; no referrals), **Asks & Offers** (`marketplace_listings.type` ask/offer, optional email subscriptions), **Perks**, **Links**, **Companies**, **Events**, **Refer a Friend**.
- **Pitch Decks:** tables `pitch_decks`, `pitch_deck_files`, `pitch_deck_views`. Onboarded members submit title, company, stage (Idea, Pre-seed, Seed, Growth), description and a PDF up to 4 MB. The PDF is served only through the member session; a view counts once per other member. Authors can edit or delete.

## UI conventions

- Brand: navy, cream, gold; Playfair Display headings, Inter text. Tailwind's `zinc` scale is **remapped to navy** (`zinc-950` is dark navy `#0a1628`, not black). On dark member surfaces use `text-white`; gold buttons keep dark text.
- Don't redesign desktop (`md` and up) unless asked; mobile-only fixes are fine. Mobile specifics already in place: 16px inputs below 768px (stops iOS zoom), `viewportFit: 'cover'` with safe-area padding, larger tap targets, and a `Bars3Icon` hamburger (don't go back to hand-drawn bars).
- Icons come from `@heroicons/react`; brand icons (LinkedIn, WhatsApp…) from `app/components/ui/BrandIcons.tsx`.

## Removed on purpose: don't add back

Stripe, Overexposed, YouTube; on the admin side rejections, payments, AI academy, talent pool, newsletter and email templates; the weekly 1-on-1 cron; the "Meet" email and its booking link; job-board referrals and the outside-friend share page. Don't automate 1-on-1 rounds on a schedule unless Onur asks.
