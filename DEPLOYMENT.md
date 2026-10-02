# How RCCEB is deployed (read this before shipping anything)

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

- **Portal** (see `SESSION_HANDOFF.md` for the full list): `APP_URL` and `NEXT_PUBLIC_BASE_URL` are `https://www.rcceb.org`. These are used in every emailed link (magic links, invites, 1-on-1 links). Also `DATABASE_URL`, `APP_SECRET`, `APPLICATIONS_INTAKE_SECRET`, `RESEND_API_KEY`, `ADMIN_EMAILS`, `NOTIFICATION_EMAIL`, AWS/S3.
- **Landing**: `GOOGLE_SHEET_ID`, `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `REVIEW_SECRET`, `ADMIN_EMAILS` (reviewers who get approve/reject emails), plus `PORTAL_APPLICATIONS_URL` and `PORTAL_INTAKE_SECRET` (same value as the portal's `APPLICATIONS_INTAKE_SECRET`). Optional `PORTAL_ORIGIN` overrides the rewrite target.
- Never print or commit secret values. `.env.local` is gitignored in both repos.

## Database changes come first

The portal's schema is `db/schema.sql` (idempotent). Pushing does **not** migrate the database. When code reads a new column:

1. Add it to `db/schema.sql` (`ALTER TABLE … ADD COLUMN IF NOT EXISTS …`).
2. Run `npm run db:setup` (it uses `DATABASE_URL` from `.env.local`, the production Aurora database; additive changes only).
3. Then push the code.

Local dev uses the **same production database**, so be careful with test data, and delete what you create.

## How the pieces talk

- **rcceb.org/join → portal:** `rcceb-landing/app/api/join/route.ts` writes the application to the Google Sheet, emails reviewers via Gmail, then best-effort POSTs it to the portal's `/api/applications` with `externalId` = the sheet's User ID. The portal dedupes on `applications.external_id`. The 59 pre-Oct-2026 sheet rows were imported once.
- **Approving** in the sheet/email flow (landing `/api/review`) is separate from the portal. In the portal, **Admin → Applications → Accepted** creates the member and sends the onboarding email.

## Rules from Onur

- Any test that sends real email goes **only to onur5celik8@gmail.com**. `onur5celik8+anything@gmail.com` works for test members. A test application on `/join` also emails every landing `ADMIN_EMAILS` reviewer, so ask first.
- On `/join`, applicants **can't tick an agreement without opening its document** (the founder's rule). Ticking a box opens the document, and its "I've read and agree" button ticks it.
- Don't remove the read-before-agree gate, and keep every `/join` field required.
- Push to `main` only when Onur has asked for the change; he reviews on the live site.
