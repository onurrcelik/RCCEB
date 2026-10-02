# RCCEB session handoff — updated 2 October 2026

> **Update, 2 October 2026 evening:** the portal now runs at **www.rcceb.org/members** and **/admin** (multi-zone behind the landing site), `APP_URL` is `https://www.rcceb.org`, and the landing site has its own repo. Where this file disagrees about URLs or deploying, **`DEPLOYMENT.md` is current.**

Handoff for the next person or model working in `/Users/onurcelik/Desktop/RCCEB`. This covers the member portal, admin portal, the production deploy, and the email setup. Do not print secrets from `.env.local` or from the Vercel project. Do not commit this file unless Onur asks.

The public marketing site is https://www.rcceb.org/. This repo is only the member and admin portals.

## What Onur wants

- Brand: navy, cream, and gold. Playfair Display for headings, Inter for text. Logo is already in the repo. Brand reference: https://rcceb.lovable.app/branding.
- Data lives in AWS Aurora PostgreSQL in Frankfurt (`eu-central-1`), not Supabase.
- Photos live in S3 bucket `rcceb-uploads` in Frankfurt, prefixes `avatars/` and `events/`.
- Do not change the desktop layout unless he asks. Mobile-only fixes are allowed.
- Do not commit unless he asks. Do not push unless he asks.
- For anything on Vercel, run it yourself instead of walking him through the dashboard. The Vercel CLI (`npx vercel@latest …`) is logged in as `onur5celik8-8068` on this Mac and this folder is linked to the `rcceb` project (`.vercel/`, gitignored).
- He does not want to pay for email. Resend's free plan is the sender, and it is connected (see **Email**).

## Repo and deploy

- Next.js 16 App Router, React 18, Tailwind. Local dev is `npm run dev` on http://localhost:3000. `APP_URL` in `.env.local` is `http://localhost:3000` (fixed 2 October).
- Git branch `main`. Vercel's Git integration deploys every push to `main` to production automatically. So "commit and push" means "ship to the live site".
- Production on 2 October is commit `d902f78` (`pitch decks`), which includes the mobile and menu fixes and Pitch Decks. It was redeployed once on 2 October so it picks up `RESEND_API_KEY`.
- Live URLs: https://rcceb-onur5celik8-8068s-projects.vercel.app and https://rcceb.vercel.app (both alias the current production deploy).
- Vercel project: `rcceb`, id `prj_i8J7Sfo6u1HocemmMdX7lkhMzPBq`, team account `team_YQNnvFe1EGiXcbBfmfZ6MaAi` (Hobby, scope `onur5celik8-8068s-projects`). Framework preset is Next.js. Node 24. Region `iad1`.
- Deployment Protection was turned **off** (Require Log In disabled) so a teammate can open the site without a Vercel account. Do not turn on "All Deployments" protection.

## People

| Person | Email | Access |
| --- | --- | --- |
| Onur Çelik | onur5celik8@gmail.com | Admin. Member row exists and onboarding is **Complete**, so he is visible in the directory. |
| Eray Erdoğan | eray@reflectstudio.com | Member. Onboarding was **Complete** by 2 October 2026. He is also on the admin allow-list. |

## Links already sent to Eray

Onur sent both links on 1 October 2026. Do not generate replacements unless he says a link failed. Do not put the raw tokens in git.

- Member link: `GET /members/invite?token=…` on the live host. It was tested after the database was opened and returned **307 to `/members/onboarding`**. The invite is reusable until onboarding is complete (mail scanners do not burn it). It lasts 30 days. Stored as a hash in `member_invites`.
- Admin link: `GET /auth/admin/callback?token=…` on the live host. Single-use. Expires about 7 days after it was created (around 8 October 2026), which is longer than the normal 15-minute code. Stored as a hash in `auth_codes` with `kind = 'admin'`. If Eray lands on the admin login page instead of the dashboard, the token was already used or expired. Issue a new one. Do not curl that URL yourself or you will consume it.

Email works now, so Eray can also request a sign-in link himself from the live login pages if these links fail.

## Why the first Vercel deploy showed "This page doesn't exist"

That page was Vercel's own `x-vercel-error: NOT_FOUND`, not the Next.js 404. The app never ran.

What fixed it, in order:

1. Deployment Protection was locking the real host behind a Vercel login. Onur turned **Require Log In** off.
2. The project had been created before the Next.js app existed, so the framework preset was not Next.js. A Ready deploy then served nothing. He set **Framework Preset** to Next.js. Changing the setting does not rebuild. A new deployment had to be created. Later deploys build with framework `nextjs`.
3. `rcceb.vercel.app` was not the working host at first. The working host is `rcceb-onur5celik8-8068s-projects.vercel.app`.

## Production environment

These variables are set on Vercel for **production** and **preview**. Values are the same as `.env.local` except the two URLs, which point at the live site instead of localhost.

Set: `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_BASE_URL`, `ADMIN_EMAILS`, `RESEND_API_KEY` (sensitive, added 2 October), `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NOTIFICATION_EMAIL`, `APPLICATIONS_INTAKE_SECRET`, `CRON_SECRET`, `APP_SECRET`, `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

Changing a variable on Vercel does not affect the running site. Redeploy afterwards (`npx vercel@latest redeploy <current production url> --target production`). To add a secret without printing it, pipe it from `.env.local` into `vercel env add NAME production --sensitive`.

`vercel link` also added `VERCEL_OIDC_TOKEN` to `.env.local`. The app does not use it.

`APP_URL` and `NEXT_PUBLIC_BASE_URL` on Vercel are `https://rcceb-onur5celik8-8068s-projects.vercel.app`.

`ADMIN_EMAILS` is `onur5celik8@gmail.com,eray@reflectstudio.com` both in `.env.local` and on Vercel. Admin access is this allow-list only. It is not the same as being a member. A new admin must be added here and the site redeployed. Local `next dev` only reads `.env.local` at startup, so restart the dev server after changing it.

`EMAIL_FROM` is `RCCEB <hello@rcceb.org>`. `EMAIL_REPLY_TO` is `hello@rcceb.org`.

## Database reachability

Aurora cluster `rcceb-db` in `eu-central-1`. Writer instance `rcceb-db-instance-1`. Security group `sg-0cedb2d495493f71b` (`default`).

The cluster page's Connectivity tab does **not** show the security group. It is on the writer instance, in **Security group rules**. Onur added an inbound rule: PostgreSQL, port 5432, source `0.0.0.0/0`, and saved it. The older inbound rule only allowed his laptop (`213.74.112.42/32`), which is why Vercel got a ~30s timeout and HTTP 500 before that rule existed.

Opening 5432 to the world was a deliberate choice so Vercel (no fixed IP on Hobby) can connect. The database password still gates login. Do not remove that rule unless you replace it with a working path from Vercel.

## Email (connected 2 October 2026)

Resend, free plan (3,000 emails/month, 100/day, no card). Do not add another email provider.

- Resend account: log in as `admin@rcceb.org`. Team name `rcceb`. Free plan, no payment method, invoices go to `admin@rcceb.org`.
- Domain `rcceb.org` was already **verified** in that account (around 24 September, by the developer of the previous member portal). No DNS work is needed.
- API key for this portal: a sending-only key restricted to `rcceb.org`, created by Onur on 2 October. It is in `.env.local` and on Vercel (production and preview) as `RESEND_API_KEY`. Never print it.
- Verified on 2 October: a direct API send and a real member sign-in email from the live site both reached Onur's Gmail inbox, not spam.

The previous developer's portal still exists and uses its own Resend key in the same account (**MagicLink Mails**, full access). The logs show it sending sign-in emails through 1 October with `resend-node`. This portal never uses that library. It calls `https://api.resend.com/emails` with `fetch`. Onur decided on 2 October **not** to revoke that key or remove the previous developer's access. Do not do it unless he asks.

How sending works in code:

- Most mail goes through `sendResendEmail` in `app/lib/member-auth.ts`. Job board notifications use their own sender in `app/lib/job-board-notify.ts`. Perk-interest notifications use `app/api/members/perks/send-notification.ts`. Asks & Offers notifications are in `app/lib/marketplace-notify.ts`.
- `NOTIFICATION_EMAIL` ("the team" for new-application and perk-interest alerts) is `onur5celik8@gmail.com,eray@reflectstudio.com,oz.silahtar@gmail.com`, locally and on Vercel (set and redeployed 2 October). Vercel now stores it as sensitive, so `vercel env pull` shows `[SENSITIVE]`.
- `sendResendEmail` takes `category: 'transactional' | 'marketing'`. Only match emails (`app/lib/matching.ts`, `app/api/admin/matches/route.ts`) and Asks & Offers notifications are `marketing`. Only those get the Unsubscribe footer and `List-Unsubscribe` headers and are skipped for unsubscribed people. Transactional mail (sign-in, invites, email change, new-application alerts) has no unsubscribe link and always sends. All mail from `sendResendEmail` sets `reply_to` to `EMAIL_REPLY_TO`. Committed in `ad80c04` (`resend`), not pushed yet on 2 October.
- Sign-in emails: the button is navy `#213b6d` with white text. Gmail dark mode recolors it light purple. That is the mail client, not a bug.
- Local dev does not send sign-in emails. The auth routes return `devLink` instead whenever `NODE_ENV` is not `production`.
- `sendSignInEmail` throws if `RESEND_API_KEY` is missing, and the login routes then return 500. Unknown member emails and non-admin emails return `{ ok: true }` and send nothing, on purpose. So `{ ok: true }` alone does not prove an email went out. Check the inbox or Resend's Emails page.

## Product behavior already shipped in `13d9265`

Onboarding asks for a photo, name, phone, LinkedIn, RC graduation year, bio, what I can help with, what I'm working on, expertise tags, companies (name, role, website, company LinkedIn), education after RC, and a favorite read/video/person/source. Join-form answers are copied onto the member at invite time and backfilled on profile GET when blank. Location is not required. At least one expertise tag and one company with a role are required.

Expertise tags, in order: Artificial Intelligence, Board Governance, Business Development, Community Building, Cybersecurity, Data Analytics, Finance, Fintech, Fundraising, International Growth, Legal, Marketing, Operations, Product Management, Sales.

Companies are shared rows in `companies`, keyed by a normalized name, with the person's role on `company_affiliations`. Two members who type the same company name share one directory card. Blank website or LinkedIn must not wipe an existing value. `member_companies` still stores the first company name for the job board.

Pathways (separate from expertise): `young-entrepreneur`, `experienced-entrepreneur`, `executive`, `investor`.

Removed earlier from this portal: Stripe, Overexposed, YouTube, and on the admin side rejections, payments, AI academy, talent pool, newsletter, and email templates. Do not add them back.

ChatGPT-paste of onboarding answers was explicitly postponed. Do not build it.

Tailwind's zinc scale is remapped to navy. `zinc-950` is dark navy `#0a1628`, not black text. On dark member surfaces use `text-white`. Gold buttons keep dark text.

## Mobile fixes (live since `0c07ffe`)

Desktop layout at `md` and up was meant to stay the same.

- `app/globals.css` — below 768px, inputs, selects, and textareas are 16px so iOS does not zoom on focus.
- `app/layout.tsx` — `viewportFit: 'cover'` so safe-area insets work.
- `app/members/onboarding/page.tsx` — referral cards are one column below `md` and two columns from `md` up. Tighter mobile padding. Phone field is `type="tel"`. Camera badge stays visible on touch after a photo is set. Safe-area padding.
- `app/members/dashboard/DashboardClient.tsx` — mobile header, menu button, safe area, filter chips, email row stacking, close buttons, and readable text on dark fields. The hamburger is `Bars3Icon`. The previous version was three `div` bars inside `display: flex` (a row), so they sat side by side and got clipped. Do not go back to hand-drawn bars.
- `app/components/profile/CompanyFields.tsx` and `ExpertisePicker.tsx` — larger tap targets below `sm` / `md` only.
- Job board and marketplace inputs that used `text-zinc-950` on dark backgrounds now use `text-white`, so typed text is visible. That change is visible on desktop too. It was a contrast bug, not a layout change.

## Changes made on 2 October

Onur committed the email footer fix and `.gitignore` as `ad80c04` (`resend`). It is one commit ahead of `origin/main`, so it is not live yet. Everything else below is uncommitted. Do not commit or push unless Onur asks. Pushing to `main` deploys. All of it passes `next build` and was tested against the live database on a local dev server. Onur's to-do list for Claude is `TODO.md`.

- **Email footer** (in `ad80c04`). `app/lib/member-auth.ts` — unsubscribe footer and headers only on marketing mail, `reply_to` on every email (see **Email**).
- **30-day sign-in.** `proxy.ts` + `refreshSessionCookie` in `app/lib/auth.ts` re-issue the session cookie on every authorized member and admin request, so it expires 30 days after the last visit instead of 30 days after sign-in. The `auth_sessions` row already rolled forward. Only the cookie didn't.
- **Applications.** The "Meet" button, `/api/admin/send-invite`, the booking-link setting and `app/lib/admin-config.ts` are gone. RCCEB's approval is: Robert College staff check the applicant is an RC graduate, then the admin accepts and clicks **Portal** ("Welcome to RCCEB" onboarding email). Application status values are now `submitted | sent to rc | rc verified` (was `meeting invited | meeting done`). Admin → Settings only has the system status check now. Choosing Admission **Accepted** on an application that has no member yet now confirms, then creates the member and sends "Welcome to RCCEB" (`changeAdmission` in the applications page calls the existing `/api/admin/members/invite`). The old **Portal** button is now **Invite** / **Resend**.
- **1-on-1s are monthly and manual.** `/api/cron/weekly-match-round` is deleted, so nothing is scheduled and there is no cron to set up. `nextMonday()` became `roundDate()` (the day the round is opened). The `match_rounds.week_of` column keeps its name and is displayed as a month. All copy and email subjects say "this month" / "last month". `create_round` now refuses while another round is open.
- **Asks & Offers.** The member **Marketplace** is now **Asks & Offers** (section id still `marketplace`, table still `marketplace_listings`). Each post has `type` `ask | offer`. Members can opt in to emails for new asks and/or offers (`marketplace_subscriptions`, `/api/members/marketplace/notifications`). The Job Board was deliberately left as is, at Onur's request.
- **Job board referrals removed.** Refer panel, `/api/members/job-board/[id]/refer`, the outside-friend share page `/jobs/[token]` and `/api/jobs/[token]`, the referral email, and referral attribution on applications. Only members apply now. The separate member-portal **Refer a Friend** section (suggest people to join) is unrelated and untouched.
- **Database.** `npm run db:setup` was run on 2 October with only additive changes: `marketplace_listings.type` and the `marketplace_subscriptions` table. The old referral pieces are still in the database and in `db/schema.sql` but unused: `job_board_referrals`, `job_board_posts.share_token`, and the `external_*` / `referred_by_member_id` / `referrer_name` columns on `job_board_applications`. Dropping them was blocked by the safety check because `db:setup` runs on production. Leave them unless Onur asks.
- `.gitignore` (in `ad80c04`) — `vercel link` added `.vercel` and `.env*`.
- `README.md`, `TODO.md`, `SESSION_HANDOFF.md` — updated for the above.

## Auth map

- Member sign-in: `POST /api/members/auth`, then `/auth/callback`. Only emails already in `members` get a real link. Past members are rejected. In development the JSON includes `devLink` and the browser redirects immediately. In production it sends the email through Resend.
- Admin sign-in: `POST /api/admin/auth`, then `/auth/admin/callback`. Only `ADMIN_EMAILS`. Same dev-link behavior. Onur's admin login on localhost is `onur5celik8@gmail.com`.
- `proxy.ts` sends `/` to `/members/dashboard`, forces incomplete members to `/members/onboarding`, and blocks everyone else. Public exceptions include `/members/login`, `/members/invite`, and `/api/members/auth`.
- Member cookie `rcceb_session` and admin cookie `rcceb_admin_session` are separate.

## Do not

- Do not complete or wipe Eray's onboarding for him. He is supposed to go through it.
- Do not print or commit `.env.local`, AWS keys, `APP_SECRET`, or the invite tokens.
- Do not redesign desktop.
- Do not turn Vercel Deployment Protection back on for production.
- Do not remove the PostgreSQL `0.0.0.0/0` rule unless Vercel can still reach Aurora.
- Do not add a paid email service.
- Do not revoke the previous developer's Resend key or remove their access unless Onur asks.
- Do not add back the "Meet" email, the weekly cron, or job board referrals. Do not automate 1-on-1 rounds unless Onur asks.

## Pitch decks (live since `d902f78`)

The tables are in Aurora (`npm run db:setup` was run): `pitch_decks`, `pitch_deck_files`, `pitch_deck_views`.

Onboarded members open it from the sidebar. They submit a title, company, stage (Idea, Pre-seed, Seed, Growth), short description, and a PDF up to 4 MB. Other onboarded members can browse, filter, and open the PDF. The file is not public; it is served only through the member session. A view is counted once per other member, not when the author opens their own deck. The author can edit or delete. There is no event gate and no locked state.
