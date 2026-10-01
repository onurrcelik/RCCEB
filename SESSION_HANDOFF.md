# RCCEB session handoff — 1 October 2026

Handoff for the next person or model working in `/Users/onurcelik/Desktop/RCCEB`. This covers the member portal, admin portal, and the production deploy done in this session. Do not print secrets from `.env.local` or from the Vercel project. Do not commit this file unless Onur asks.

The public marketing site is https://www.rcceb.org/. This repo is only the member and admin portals.

## What Onur wants

- Brand: navy, cream, and gold. Playfair Display for headings, Inter for text. Logo is already in the repo. Brand reference: https://rcceb.lovable.app/branding.
- Data lives in AWS Aurora PostgreSQL in Frankfurt (`eu-central-1`), not Supabase.
- Photos live in S3 bucket `rcceb-uploads` in Frankfurt, prefixes `avatars/` and `events/`.
- Do not change the desktop layout unless he asks. Mobile-only fixes are allowed.
- Do not commit unless he asks. Do not push unless he asks.
- For anything on Vercel, use the Vercel connection already available in Cursor. He explicitly said to do that instead of walking him through the dashboard.
- He does not want to pay for email. Resend's free plan is the chosen sender. It is not connected yet.

## Repo and deploy

- Next.js 16 App Router, React 18, Tailwind. Local dev is `npm run dev` on http://localhost:3000. `APP_URL` in `.env.local` is still `http://localhost:3001`, so a local magic link often opens the wrong port. Change `3001` to `3000` in the address bar, or fix `APP_URL` before relying on local links.
- Git branch `main`, in sync with `origin/main` at commit `13d9265` (`onboarding`).
- Production is that commit. Later mobile and menu edits are **not** committed and **not** on the live site.
- Live URL that works: https://rcceb-onur5celik8-8068s-projects.vercel.app
- `https://rcceb.vercel.app` was an empty address during the failed deploys. After the last redeploy it is also an alias. Prefer the longer URL until someone confirms the short one in a browser.
- Vercel project: `rcceb`, id `prj_i8J7Sfo6u1HocemmMdX7lkhMzPBq`, team account `team_YQNnvFe1EGiXcbBfmfZ6MaAi` (Hobby, scope `onur5celik8-8068s-projects`). Framework preset is Next.js. Node 24. Region `iad1`.
- Deployment Protection was turned **off** (Require Log In disabled) so a teammate can open the site without a Vercel account. Do not turn on "All Deployments" protection.

## People

| Person | Email | Access |
| --- | --- | --- |
| Onur Çelik | onur5celik8@gmail.com | Admin. Member row exists and onboarding is **Complete**, so he is visible in the directory. |
| Eray Erdoğan | eray@reflectstudio.com | Member row exists. Onboarding is **Pending**, so the directory shows him as **Hidden** until he finishes onboarding. He is also on the admin allow-list. |

Onur added Eray in the local admin under Members → Add member and left **Already onboarded** unchecked. That is correct. Pending means the next sign-in goes to `/members/onboarding` before the rest of the dashboard.

## Links already sent to Eray

Onur sent both links on 1 October 2026. Do not generate replacements unless he says a link failed. Do not put the raw tokens in git.

- Member link: `GET /members/invite?token=…` on the live host. It was tested after the database was opened and returned **307 to `/members/onboarding`**. The invite is reusable until onboarding is complete (mail scanners do not burn it). It lasts 30 days. Stored as a hash in `member_invites`.
- Admin link: `GET /auth/admin/callback?token=…` on the live host. Single-use. Expires about 7 days after it was created (around 8 October 2026), which is longer than the normal 15-minute code. Stored as a hash in `auth_codes` with `kind = 'admin'`. If Eray lands on the admin login page instead of the dashboard, the token was already used or expired. Issue a new one. Do not curl that URL yourself or you will consume it.

There is still no email sender, so **Send magic link** on the live login pages cannot deliver mail. These two links are the only way in until Resend is connected.

## Why the first Vercel deploy showed "This page doesn't exist"

That page was Vercel's own `x-vercel-error: NOT_FOUND`, not the Next.js 404. The app never ran.

What fixed it, in order:

1. Deployment Protection was locking the real host behind a Vercel login. Onur turned **Require Log In** off.
2. The project had been created before the Next.js app existed, so the framework preset was not Next.js. A Ready deploy then served nothing. He set **Framework Preset** to Next.js. Changing the setting does not rebuild. A new deployment had to be created. The current production deploy is a redeploy of `13d9265` with framework `nextjs`.
3. `rcceb.vercel.app` was not the working host at first. The working host is `rcceb-onur5celik8-8068s-projects.vercel.app`.

## Production environment

These variables are set on Vercel for **production** and **preview**. Values are the same as `.env.local` except the two URLs, which point at the live site instead of localhost.

Set: `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_BASE_URL`, `ADMIN_EMAILS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NOTIFICATION_EMAIL`, `APPLICATIONS_INTAKE_SECRET`, `CRON_SECRET`, `APP_SECRET`, `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

`APP_URL` and `NEXT_PUBLIC_BASE_URL` on Vercel are `https://rcceb-onur5celik8-8068s-projects.vercel.app`.

`ADMIN_EMAILS` is `onur5celik8@gmail.com,eray@reflectstudio.com` both in `.env.local` and on Vercel. Admin access is this allow-list only. It is not the same as being a member. A new admin must be added here and the site redeployed. Local `next dev` only reads `.env.local` at startup, so restart the dev server after changing it.

Not set anywhere: `RESEND_API_KEY`. `EMAIL_FROM` is `RCCEB <hello@rcceb.org>`.

## Database reachability

Aurora cluster `rcceb-db` in `eu-central-1`. Writer instance `rcceb-db-instance-1`. Security group `sg-0cedb2d495493f71b` (`default`).

The cluster page's Connectivity tab does **not** show the security group. It is on the writer instance, in **Security group rules**. Onur added an inbound rule: PostgreSQL, port 5432, source `0.0.0.0/0`, and saved it. The older inbound rule only allowed his laptop (`213.74.112.42/32`), which is why Vercel got a ~30s timeout and HTTP 500 before that rule existed.

Opening 5432 to the world was a deliberate choice so Vercel (no fixed IP on Hobby) can connect. The database password still gates login. Do not remove that rule unless you replace it with a working path from Vercel.

## Email, still to do

Onur will come back to this. Use Resend's free plan (3,000 emails/month, 100/day, no card). The code already calls Resend in `app/lib/member-auth.ts`. Do not add another email provider.

He still has to:

1. Sign up at https://resend.com.
2. Verify the domain `rcceb.org` by adding the DNS records Resend shows. Until a domain is verified, Resend only delivers to the account owner's own address.
3. Create an API key and give it to the agent. Put it in `.env.local` and on Vercel as `RESEND_API_KEY`, then redeploy. Do not invent a key.

`sendSignInEmail` throws if `RESEND_API_KEY` is missing, and the login routes return 500. Unknown member emails and non-admin emails return `{ ok: true }` and send nothing, on purpose.

## Product behavior already shipped in `13d9265`

Onboarding asks for a photo, name, phone, LinkedIn, RC graduation year, bio, what I can help with, what I'm working on, expertise tags, companies (name, role, website, company LinkedIn), education after RC, and a favorite read/video/person/source. Join-form answers are copied onto the member at invite time and backfilled on profile GET when blank. Location is not required. At least one expertise tag and one company with a role are required.

Expertise tags, in order: Artificial Intelligence, Board Governance, Business Development, Community Building, Cybersecurity, Data Analytics, Finance, Fintech, Fundraising, International Growth, Legal, Marketing, Operations, Product Management, Sales.

Companies are shared rows in `companies`, keyed by a normalized name, with the person's role on `company_affiliations`. Two members who type the same company name share one directory card. Blank website or LinkedIn must not wipe an existing value. `member_companies` still stores the first company name for the job board.

Pathways (separate from expertise): `young-entrepreneur`, `experienced-entrepreneur`, `executive`, `investor`.

Removed earlier from this portal: Stripe, Overexposed, YouTube, and on the admin side rejections, payments, AI academy, talent pool, newsletter, and email templates. Do not add them back.

ChatGPT-paste of onboarding answers was explicitly postponed. Do not build it.

Tailwind's zinc scale is remapped to navy. `zinc-950` is dark navy `#0a1628`, not black text. On dark member surfaces use `text-white`. Gold buttons keep dark text.

## Local edits not deployed

These files are modified and uncommitted. The live site does not have them. Do not commit unless Onur asks. Desktop layout at `md` and up was meant to stay the same.

- `app/globals.css` — below 768px, inputs, selects, and textareas are 16px so iOS does not zoom on focus.
- `app/layout.tsx` — `viewportFit: 'cover'` so safe-area insets work.
- `app/members/onboarding/page.tsx` — referral cards are one column below `md` and two columns from `md` up. Tighter mobile padding. Phone field is `type="tel"`. Camera badge stays visible on touch after a photo is set. Safe-area padding.
- `app/members/dashboard/DashboardClient.tsx` — mobile header, menu button, safe area, filter chips, email row stacking, close buttons, and readable text on dark fields. The hamburger is `Bars3Icon`. The previous version was three `div` bars inside `display: flex` (a row), so they sat side by side and got clipped. Do not go back to hand-drawn bars.
- `app/components/profile/CompanyFields.tsx` and `ExpertisePicker.tsx` — larger tap targets below `sm` / `md` only.
- Job board and marketplace inputs that used `text-zinc-950` on dark backgrounds now use `text-white`, so typed text is visible. That change is visible on desktop too. It was a contrast bug, not a layout change.

## Auth map

- Member sign-in: `POST /api/members/auth`, then `/auth/callback`. Only emails already in `members` get a real link. Past members are rejected. In development the JSON includes `devLink` and the browser redirects immediately. In production it tries to send mail.
- Admin sign-in: `POST /api/admin/auth`, then `/auth/admin/callback`. Only `ADMIN_EMAILS`. Same dev-link behavior. Onur's admin login on localhost is `onur5celik8@gmail.com`.
- `proxy.ts` sends `/` to `/members/dashboard`, forces incomplete members to `/members/onboarding`, and blocks everyone else. Public exceptions include `/members/login`, `/members/invite`, and `/api/members/auth`.
- Member cookie `rcceb_session` and admin cookie `rcceb_admin_session` are separate.

## Do not

- Do not complete or wipe Eray's onboarding for him. He is supposed to go through it.
- Do not print or commit `.env.local`, AWS keys, `APP_SECRET`, or the invite tokens.
- Do not redesign desktop.
- Do not turn Vercel Deployment Protection back on for production.
- Do not remove the PostgreSQL `0.0.0.0/0` rule unless Vercel can still reach Aurora.
- Do not add a paid email service. Wait for his Resend API key.

## Pitch decks (1 October 2026, local only)

A Pitch Decks section was added to the member portal after this handoff was first written. It is in the working tree and is **not** on Vercel until it is committed, pushed, and redeployed. The tables are already in Aurora (`npm run db:setup` was run): `pitch_decks`, `pitch_deck_files`, `pitch_deck_views`.

Onboarded members open it from the sidebar. They submit a title, company, stage (Idea, Pre-seed, Seed, Growth), short description, and a PDF up to 4 MB. Other onboarded members can browse, filter, and open the PDF. The file is not public; it is served only through the member session. A view is counted once per other member, not when the author opens their own deck. The author can edit or delete. There is no event gate and no locked state.
