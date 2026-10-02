# RCCEB: guide for the next developer

Written 2 October 2026, at the end of the build session that took the portal from a local prototype to production at **www.rcceb.org**. It is the "start here" document: what this is, who is who, where everything lives, how the pieces fit, and the lessons that cost time. It does not repeat the details in the other docs; it points to them.

| Read this | For |
| --- | --- |
| [deployment.md](deployment.md) | How the two apps deploy together on one domain. **Read before shipping anything.** |
| [architecture.md](architecture.md) | How the portal works: database, auth, onboarding, matching, UI conventions. |
| [email.md](email.md) | Resend setup and how mail is sent. |
| [changelog.md](changelog.md) | What changed and why. |
| [whatsapp-plan.md](whatsapp-plan.md) | The next step in the membership flow (being built in another repo). |
| [history/join-sync.md](history/join-sync.md) | Archive: how rcceb.org/join got connected to the portal. |
| [`../TODO.md`](../TODO.md) | Open tasks, and what was done and when. |
| [`../README.md`](../README.md) | Setup and layout. |

## 1. What RCCEB is

The **Robert College Community Entrepreneurs Bond**: a private network of Robert College (RC) alumni who build, invest in and support startups. Membership is free and approved by RC staff, who confirm the applicant really graduated. Brand: navy, cream and gold; Playfair Display for headings, Inter for text. Mobile matters, because members open links from email on phones.

Two web apps share one domain:

- **Public site** (landing): home, `/join`, legal pages. Repo `rcceb/landingpage`, local `~/Desktop/rcceb-landing`.
- **Member & admin portal**: `/members/*` and `/admin/*`. This repo, `onurrcelik/RCCEB`.

## 2. People and who to ask

| Who | Role |
| --- | --- |
| **Onur Çelik** (onur5celik8@gmail.com) | Built this session. Product owner for the portal. Admin. |
| **Eray Erdoğan** (eray@reflectstudio.com, RC'11) | Co-leads RCCEB. Admin. Wrote the original WhatsApp intro prompt. |
| **Oğuz** (oz.silahtar@gmail.com) | Receives new-application and perk alerts (`NOTIFICATION_EMAIL`). Not an admin. |
| **Yasemin Gökçe** (yaseming@alum.mit.edu) | Built and ran rcceb.org and the community data before leaving the role. Her handoff email is the best background on the Google Sheet, Gmail and Vercel setup. Reachable on WhatsApp via Onur. |
| **RC clerks**: mkorkmaz@robcol.k12.tr, tayangil@robcol.k12.tr | RC staff who verify applicants (confirmed by Yasemin, 2 Oct). They get the Approve/Reject emails. |
| **Hüseyin** (htigli9@gmail.com) | Addressed in Yasemin's handoff email; in the Connectors group. |

`connectors@rcceb.org` is a Google Group (admin@rcceb.org owns it; members: Eray, htigli9@gmail.com, kaan@212.vc, sinangolhan@googlemail.com, Yasemin). It is CC'd on applicant and decision emails. Members of it can't approve anything.

## 3. Accounts and where things live

| What | Where | Notes |
| --- | --- | --- |
| Portal hosting | Vercel account `onur5celik8-8068s-projects` (Hobby), project `rcceb` | Git-connected. Push to `main` deploys. |
| Landing hosting | Vercel account `admin-66535438s-projects` (Hobby, the **admin@rcceb.org** account), project `project-uu3bm` | Git-connected since 2 Oct. **Commits must be authored as `rcceb`** (see [deployment.md](deployment.md)). The domain www.rcceb.org is attached here. |
| Database | AWS Aurora PostgreSQL, `eu-central-1` (cluster `rcceb-db`) | Port 5432 is open to `0.0.0.0/0` on purpose, because Vercel Hobby has no fixed IP. The password is the gate. **Local dev uses this same production database.** |
| Photos | S3 bucket `rcceb-uploads` (`avatars/`, `events/`) | The portal's IAM user can **write but not delete**, so deleting a member leaves their photo behind (harmless). |
| Email | Resend (free plan), logged in as admin@rcceb.org, team `rcceb`, domain `rcceb.org` verified | The portal calls `https://api.resend.com/emails` with `fetch`. The previous developer's older Resend key ("MagicLink Mails") still exists; leave it unless Onur asks. |
| Landing email | Gmail SMTP as admin@rcceb.org (`GMAIL_USER`, `GMAIL_APP_PASSWORD`) | Sends the applicant confirmation, reviewer emails and clerk notices. |
| Applications sheet | Google Sheet `1te4bWypslsr2seqYHmja32EPp2VeeY2p61MeDDWxNnk`, tab `Sheet1` | Written by the landing site through a Google service account. Columns: Timestamp, First Name, Last Name, Email, Phone, Graduation Year, LinkedIn, Member Type, Contact Consent, Referrer Name, Referrer Phone, (legacy discovery call), Agreed to Terms, **User ID**, Membership Status, Reviewed By, Reviewed At, Letter of Intent, **Location** (added last). The review route reads columns **by index**, so only ever append new columns at the end. |
| Yasemin's member list | Google Sheet `1MvbblQTKxvIw4vKjqhIx7GymAKuZnG4B13B-YfOAiJM` | Her intended "source of truth" for who may log in. Not wired to anything. |
| admin@rcceb.org Google account | Her 2FA is tied to **Yasemin's phone**. She offered to hand it over. | Do this early: if she becomes unreachable you lose access to Gmail, Sheets and the landing Vercel account. |
| DigitalOcean | Another team's databases (`rcceb-dev-pg17`, `rcceb-preview-pg17`) | **Unrelated to this portal.** They're another project's test data (140 of 145 emails are `@example.invalid`). We looked and shelved them. Ignore. |

Secrets live in `.env.local` (both repos, gitignored) and in the two Vercel projects. Names are listed in [deployment.md](deployment.md) and `.env.example`. **Never print or commit values.** On the landing project, `ADMIN_EMAILS` and several others are **Sensitive** in Vercel: they can be overwritten but never read back, and an "empty" box when editing is normal. Do not rotate `REVIEW_SECRET`: that would break every Approve/Reject button already sitting in clerks' inboxes.

## 4. How a person becomes a member (live flow)

1. **Apply at rcceb.org/join.** One glass card: name, email, phone, location, RC class year, LinkedIn, role(s), and four agreements. Every field is required. Each agreement box **opens its document first**; only "I've read and agree" ticks it (a rule from RCCEB's founder, kept verbatim, including the Code of Conduct acknowledgement text). Submitting writes the sheet, emails reviewers and the applicant, and POSTs the application to the portal (`/api/applications`) with `externalId` = the sheet's User ID.
2. **Admins are alerted.** The portal emails `NOTIFICATION_EMAIL` (Onur, Eray, Oğuz). The application shows in **Admin → Applications** as **Sent to RC**.
3. **RC clerks verify.** Each gets an email with their own signed Approve/Reject buttons.
4. **A clerk clicks Approve** → landing `/api/review` updates the sheet, then POSTs to the portal's `/api/applications/rc-decision`. The portal marks the application **RC Verified + Accepted**, creates the member (copying name, phone, LinkedIn, location, class year, role) and sends the **"Welcome to the Bond"** onboarding email with a 30-day personal link. Reject → **Declined**, and the landing site sends the rejection email. If the portal can't be reached, the landing site falls back to its old WhatsApp welcome email. Repeat clicks never send twice.
5. **Onboarding** (`/members/onboarding`), pre-filled. After 5 seconds a popup offers a **personal ChatGPT prompt** (it includes their name, year, city, role). They paste ChatGPT's whole reply and **Fill my profile** sorts it into the form: bio, what I can help with, what I'm working on, expertise, companies (website required), education, favorite source (name only). It also keeps their Turkish **WhatsApp intro** in `members.whatsapp_intro` (admin-only, shown behind a WhatsApp icon in Admin → Members). The parser (`app/lib/onboarding-paste.ts`) is plain code, no AI call, and tolerates markdown and a heading-less intro.
6. **WhatsApp group step:** *not built here*. See [whatsapp-plan.md](whatsapp-plan.md).

Admins can always do the manual route: Admin → Applications → **Accepted / Invite / Resend**, or Members → add a member. Both use the same shared helper (`app/lib/onboarding-invite.ts`).

**Verified live on 2 Oct:** the portal side (approve → member → email → onboarding → intro saved). **Not yet run live:** a real clerk clicking Approve in their email (the landing → portal hand-off code is deployed and builds). Its first real run is the test: the application should flip to RC Verified + Accepted · Invited by itself.

## 5. Other features worth knowing

- **Directory** (`DashboardClient.tsx`, `DirectoryFilters.tsx`): search plus filters for pathway, class year, expertise and location (OR within a group, AND across).
- **1-on-1 matching is opt-in each month** (`app/lib/matching.ts`, `app/api/admin/matches`). **Create Round** opens an empty round and emails every onboarded member an invitation explaining how it works, with a signed one-click "Count me in" (`/api/match-join`, no sign-in). Members can also choose **Join every month automatically** (`members.match_auto_opt_in`): they're put in when a round opens and skip the invitation. **Remind Members** re-sends only to people who haven't answered. **Run Match** pairs only the people who joined; the match email and its subject say who reaches out first. Nothing runs on a schedule.
- **Job board, Asks & Offers (marketplace), Pitch Decks, Perks, Links, Companies, Events** are member features; see [architecture.md](architecture.md).
- **Admin**: Applications, Members (past-member toggle, invite/resend, WhatsApp intro), Companies, Events, Matches, Perks, Analytics, Settings.
- **Auth**: passwordless magic links (members: only emails already in `members`; admins: only `ADMIN_EMAILS`). Cookies `rcceb_session` and `rcceb_admin_session`, renewed on each visit for 30 days. `proxy.ts` is the gate. The callback page hides the token from the address bar.
- **Removed on purpose:** Stripe, Overexposed, YouTube, AI academy, talent pool, newsletter, email templates, the weekly 1-on-1 cron, the "Meet" email, job-board referrals. Don't add them back.

## 6. Data state at handoff (2 Oct 2026)

- **104 members, none onboarded.** They are the 106-person WhatsApp community list, imported with onboarding pending and **no emails sent** (Onur and Eray, plus a test member, were deleted). The three people with two emails in the source CSV were set to canduru2004@gmail.com, denizbeser15@gmail.com and suleyman.gokoglu@aya.yale.edu. Class years come from the CSV ("RC2004" → 2004; "RCFriend" has none). Pathway was left blank on purpose.
- **59 applications** from the old sheet (19 May to 29 Sep 2026) were imported with their original dates: 53 Accepted, 2 Declined, 4 pending. The sheet's reviewer and date are in `notes`. Nobody has been invited from them yet. One person applied twice.
- **Inviting people** is Onur's call; he said he'd send the onboarding links himself. Until then nobody gets any email.
- The Google Sheet keeps being updated by the landing site; the portal reads only Aurora.

## 7. Working here: rules and habits

- **Onur's rules:** test emails go **only** to onur5celik8@gmail.com (`onur5celik8+anything@gmail.com` works for test members; delete them afterwards). Don't commit or push until he has asked; a push to `main` is a production deploy. Don't change the desktop layout unless asked (mobile-only fixes are fine). Don't add paid services. Ask before anything that emails real people. A test application on `/join` emails the clerks and Eray/Oğuz.
- **Brand/UI:** Tailwind's `zinc` scale is remapped to navy; use `text-white` on dark member surfaces. Gold buttons keep dark text. Don't go back to hand-drawn icons (use `@heroicons/react`).
- **Database:** `db/schema.sql` is idempotent. **Run `npm run db:setup` before pushing code that reads a new column.** `external_id`, `location`, `match_auto_opt_in` and `whatsapp_intro` were added this way.
- **Next.js here is not the one you know.** `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing code (Next 16, React 18 in the portal, React 19 + Tailwind 4 on the landing). The rewrites, `proxy.ts` and cache behavior differ from older versions.
- **Verify what ships:** `npx tsc --noEmit -p .` and `npx next build` before pushing. After a push, confirm the new text is live (curl the page or its JS chunk). If "nothing changed", check Vercel Deployments for an **Error**: a commit that imports a file added in a later commit fails the build and the old deploy keeps serving.
- **Screenshots:** headless Chrome works for checking layouts: `chrome --headless=new --window-size=1280,900 --virtual-time-budget=10000 --screenshot=out.png URL`. Use a long time budget or it captures an intro animation.

## 8. Things that cost time (so they don't cost you)

- **Sandbox/permission blocks.** The harness may refuse actions touching production (live deploys, production writes) or showing other people's personal data. When blocked, don't work around it: say what you wanted and ask Onur to run it (`! command` typed as the **first character** of the prompt, on one line) or approve it.
- **The landing preview deploys are behind Vercel login**, so `curl` gets a 302 to vercel.com. Test landing changes locally (`next build && next start`) instead of against a preview.
- **`pnpm build` fails** on pnpm's "ignored build scripts" check; call `./node_modules/.bin/next build` directly.
- **Vercel env changes need a redeploy**, and `NEXT_PUBLIC_*` is baked in at build.
- **Behind the rewrite, `request.url` has the portal's own Vercel host.** Build absolute URLs from `APP_URL` (`getBaseUrl()`), never from the request. A new top-level portal route or public API **must be added to `portalPaths` in the landing repo's `next.config.mjs`**, or it 404s on rcceb.org (this is how `/api/match-join` was missed at first).
- **Mail scanners prefetch links**, so one-time actions must not happen on GET. The sign-in callback, the 1-on-1 "did you meet?" and "Count me in" links all show a page that posts from a script or button.
- **`/join` redesign:** Onur's founder rule (open documents before agreeing) was removed once and had to be restored. Keep it.
- **A "Needs Attention" badge on `REVIEW_SECRET`** in Vercel is only a suggestion to mark it sensitive. Leave it.

## 9. Open items for whoever continues

1. **WhatsApp step** (waiting on Onur's other repo): see [whatsapp-plan.md](whatsapp-plan.md). Open questions are listed there.
2. **Watch the first real clerk approval** and confirm the application flips to RC Verified + Accepted · Invited. If it stays "Sent to RC" while the sheet says Approved, read the landing project's logs (`[review] portal decision failed`).
3. **Get the admin@rcceb.org 2FA moved off Yasemin's phone.**
4. **Clean up local secrets:** `.env.local` still holds `LANDING_VERCEL_TOKEN` (a token for the admin@rcceb.org Vercel account, set to expire 3 Oct 2026; delete the line **and** revoke it in that account's Settings → Tokens) and `VERCEL_OIDC_TOKEN`. Remove any leftover `JOIN_DB_*` lines.
5. **Orphan S3 photos** from deleted test members (`avatars/3f217f1a…`, `1d281172…`, `f1910b88…`, `b39ffae5…`, and an earlier test member) can be removed in the AWS console.
6. **Onboarding invites for the 104 members and 53 accepted applicants** are manual, by Onur, when he chooses.
7. **Yasemin's source-of-truth sheet** (login allow-list idea) isn't used; the portal's own `members` table is the allow-list.
8. Possible later work, not started: an Industry field (the directory filter has none), a reminder for members without a location, Gemma/Bedrock for messy pasted replies (the plain parser hasn't needed it yet).
