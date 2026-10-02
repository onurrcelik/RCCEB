# How RCCEB is deployed (read this before shipping anything)

See also [architecture.md](architecture.md) (how the portal works) and [email.md](email.md).

RCCEB is **two Next.js apps in two repos and two Vercel accounts**, served together on one domain, **www.rcceb.org**.

| | Member & admin portal | Public site (landing) |
| --- | --- | --- |
| Local folder | `~/Desktop/RCCEB` (this repo) | `~/Desktop/rcceb-landing` |
| GitHub | `onurrcelik/RCCEB` | `rcceb/landingpage` |
| Vercel account | `onur5celik8-8068s-projects` (Hobby), project `rcceb` (`prj_i8J7Sfo6u1HocemmMdX7lkhMzPBq`) | `admin-66535438s-projects` (Hobby, the `admin@rcceb.org` account), project `project-uu3bm` (`prj_1lRRclVgGgOLygtsH6tzZzm7sgmq`) |
| Own URL | https://rcceb-onur5celik8-8068s-projects.vercel.app | https://project-uu3bm.vercel.app |
| Serves on rcceb.org | `/members/*`, `/admin/*`, `/auth/*`, portal APIs | everything else: `/`, `/join`, legal pages, `/api/join`, `/api/review` |
| Stack | Next 16, React 18, Tailwind 3, npm, Aurora Postgres | Next 16, React 19, Tailwind 4, pnpm, Google Sheet + Gmail |

## Deploying = pushing to `main`

Both projects are Git-connected. **A push to `main` deploys to production in about a minute.** A push to any other branch gives a preview URL instead.

- **Portal:** commit and push as usual (author `onurrcelik`).
- **Landing:** commits **must be authored as `rcceb`** (`329207150+rcceb@users.noreply.github.com`). Vercel Hobby only builds commits from the account owner's linked GitHub, and anything else shows as **Blocked**. `~/Desktop/rcceb-landing` already has this as its repo-local git config, so commit from that folder. The push itself can use Onur's GitHub login (he's a collaborator).
- **Landing previews** are behind Vercel Authentication, so `curl` gets a login wall. To test landing changes before they go live, run them locally instead (`next build && next start`). Use the full paths `./node_modules/.bin/next`; `pnpm build` trips on pnpm's ignored-build-scripts check.
- **A failed build keeps the previous deploy live.** If a change "isn't showing", check the Vercel Deployments page for an **Error**. Once it happened because a commit imported a file that was only committed in the next push: **commit every file a change needs, together.**
- To confirm a deploy is live, `curl https://www.rcceb.org/<path>` and grep for new text. Client-only text lives in JS chunks under `/_next/static/chunks/` (landing) or `/portal-static/_next/static/chunks/` (portal).

## How one domain serves two apps (Next.js multi-zones)

The domain `www.rcceb.org` is attached to the **landing** project. Its `next.config.mjs` **rewrites the portal's paths to the portal's Vercel URL** (`PORTAL_ORIGIN`, defaulting to the URL above). Visitors only ever see rcceb.org.

- The list of forwarded paths is `portalPaths` in `rcceb-landing/next.config.mjs`. Today it covers: `/members`, `/members/*`, `/admin`, `/admin/*`, `/auth/*`, `/portal-static/*`, `/api/admin/*`, `/api/applications`, `/api/auth/*`, `/api/match-confirm`, `/api/match-join`, `/api/members/*`, `/api/unsubscribe`, `/favicon.png`, `/apple-touch-icon.png`, `/rcceb-seal.png`. `/_next/image` is forwarded too, because the landing site never uses the image optimizer.
- **If you add a new top-level portal route or public API (outside those prefixes), add it to `portalPaths` in the landing repo and push both repos.** Otherwise it 404s on rcceb.org. Example: `/api/match-join` (the 1-on-1 "Count me in" email link) needed this.
- The portal sets `assetPrefix: '/portal-static'` in production (`next.config.mjs`), so its JS/CSS never collide with the landing site's `/_next` files. Next serves `/portal-static/_next/*` itself, so the portal's own Vercel URL keeps working.
- Behind the rewrite, `request.url` in the portal carries the portal's own Vercel host. **Build absolute URLs and redirects from `APP_URL` (`getBaseUrl()` in `app/lib/site-url.ts`)**, never from `request.url`. `proxy.ts` does this in `redirectTo()`.
- Links from landing pages to portal pages must be plain `<a href>`, not `<Link>` (they're different apps). Example: the navbar's **Member Access** goes to `/members/login`.
- Cookies are host-only, so sessions set through rcceb.org stay on rcceb.org.

## Environment variables

Changing a variable on Vercel only takes effect after a **redeploy** (Deployments → ⋯ → Redeploy). `NEXT_PUBLIC_*` values are baked in at build time.

- **Portal** (set for production and preview): `APP_URL` and `NEXT_PUBLIC_BASE_URL` are `https://www.rcceb.org`; they are used in every emailed link (magic links, invites, 1-on-1 links). Also `DATABASE_URL`, `APP_SECRET`, `APPLICATIONS_INTAKE_SECRET`, `RESEND_API_KEY` (sensitive), `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ADMIN_EMAILS` (`onur5celik8@gmail.com,eray@reflectstudio.com`; add an admin here and redeploy), `NOTIFICATION_EMAIL`, `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. `CRON_SECRET` is still set on Vercel but nothing uses it any more (the cron was removed). `.env.example` lists what a local setup needs; `vercel link` also adds a `VERCEL_OIDC_TOKEN` to `.env.local` that the app doesn't use.
- **Landing**: `GOOGLE_SHEET_ID`, `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `REVIEW_SECRET`, `ADMIN_EMAILS` (reviewers who get approve/reject emails), plus `PORTAL_APPLICATIONS_URL` and `PORTAL_INTAKE_SECRET` (same value as the portal's `APPLICATIONS_INTAKE_SECRET`). Optional `PORTAL_ORIGIN` overrides the rewrite target.
- Never print or commit secret values. `.env.local` is gitignored in both repos.
- **Vercel CLI for the portal:** `npx vercel@latest …` is logged in as `onur5celik8-8068` on Onur's Mac and this folder is linked to project `rcceb` (`.vercel/`, gitignored). To redeploy after an env change: `npx vercel@latest redeploy <current production url> --target production`. To add a secret without printing it, pipe it from `.env.local` into `vercel env add NAME production --sensitive`. The landing project is a different account: use its dashboard or a short-lived token.

## If a deploy shows "This page doesn't exist"

That's Vercel's own `x-vercel-error: NOT_FOUND`, not Next.js, so the app never ran. It happened once on the portal for three reasons, in order: **Deployment Protection** was locking the host behind a Vercel login (keep "Require Log In" off for production); the project's **Framework Preset** wasn't Next.js (changing it doesn't rebuild, so create a new deployment); and `rcceb.vercel.app` wasn't the working host yet (use `rcceb-onur5celik8-8068s-projects.vercel.app`).

## Database changes come first

The portal's schema is `db/schema.sql` (idempotent). Pushing does **not** migrate the database. When code reads a new column:

1. Add it to `db/schema.sql` (`ALTER TABLE … ADD COLUMN IF NOT EXISTS …`).
2. Run `npm run db:setup` (it uses `DATABASE_URL` from `.env.local`, the production Aurora database; additive changes only).
3. Then push the code.

Local dev uses the **same production database**, so be careful with test data, and delete what you create.

## How the pieces talk

- **rcceb.org/join → portal:** `rcceb-landing/app/api/join/route.ts` writes the application to the Google Sheet, emails reviewers via Gmail, then best-effort POSTs it to the portal's `/api/applications` with `externalId` = the sheet's User ID. The portal dedupes on `applications.external_id`. The 59 pre-Oct-2026 sheet rows were imported once.
- **RC clerk approval → portal:** the clerk's Approve/Reject in the landing reviewer email hits landing `/api/review`, which updates the sheet and POSTs `{ externalId, decision, reviewer, reviewedAt }` to the portal's `/api/applications/rc-decision` (`PORTAL_APPLICATIONS_URL` + `/rc-decision`, same intake secret). Approve → RC Verified + Accepted, member created, onboarding email from `app/lib/onboarding-invite.ts` (once). Reject → Declined; the landing site sends the rejection email. If the portal call fails, the landing site falls back to its old welcome email. Admin → Applications → Accepted / Invite / Resend send the same onboarding email by hand.
- **Next step, not built here:** the WhatsApp group step. See [whatsapp-plan.md](whatsapp-plan.md).

## Rules from Onur

- Any test that sends real email goes **only to onur5celik8@gmail.com**. `onur5celik8+anything@gmail.com` works for test members. A test application on `/join` also emails every landing `ADMIN_EMAILS` reviewer, so ask first.
- On `/join`, applicants **can't tick an agreement without opening its document** (the founder's rule). Ticking a box opens the document, and its "I've read and agree" button ticks it.
- Don't remove the read-before-agree gate, and keep every `/join` field required.
- Push to `main` only when Onur has asked for the change; he reviews on the live site.
