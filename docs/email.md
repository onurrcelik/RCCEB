# Email

The portal sends mail through **Resend** (free plan: 3,000 emails/month, 100/day, no card). Don't add another provider.

## Setup

- **Account:** log in to Resend as `admin@rcceb.org` (team `rcceb`, free plan, invoices go to that address).
- **Domain:** `rcceb.org` is verified there (done around 24 September by the previous portal's developer). No DNS work needed.
- **Key:** a sending-only key restricted to `rcceb.org`, in `.env.local` and on Vercel (production and preview) as `RESEND_API_KEY`. Never print it. Missing key → `sendSignInEmail` throws and the login routes return 500.
- **Addresses:** `EMAIL_FROM` is `RCCEB <hello@rcceb.org>`; `EMAIL_REPLY_TO` is `hello@rcceb.org`.
- **The previous developer's** portal still has its own Resend key in the same account ("MagicLink Mails", full access). Onur decided on 2 October not to revoke it or remove their access. Leave it unless he asks. This portal never uses Resend's library; it calls `https://api.resend.com/emails` with `fetch`.

## Who gets what

- **`NOTIFICATION_EMAIL`** ("the team": new-application and perk-interest alerts): Onur, Eray and Oğuz (`onur5celik8@gmail.com`, `eray@reflectstudio.com`, `oz.silahtar@gmail.com`). Vercel stores it as sensitive, so `vercel env pull` shows `[SENSITIVE]`.
- **Applicant confirmation, reviewer Approve/Reject emails and decision notices** are sent by the **landing site** over Gmail, not Resend (see [deployment.md](deployment.md)).

## How sending works in code

- Most mail goes through `sendResendEmail` in `app/lib/member-auth.ts`. Separate senders: `app/lib/job-board-notify.ts` (job board), `app/api/members/perks/send-notification.ts` (perk interest), `app/lib/marketplace-notify.ts` (Asks & Offers).
- **Welcome / onboarding email:** `app/lib/onboarding-invite.ts`.
- **1-on-1 emails:** `app/lib/matching.ts` (invitation) and `app/api/admin/matches/route.ts` (match emails).
- `sendResendEmail` takes `category: 'transactional' | 'marketing'`. **Marketing** = 1-on-1 emails and Asks & Offers notifications: they get an Unsubscribe footer and `List-Unsubscribe` headers and skip unsubscribed people. **Transactional** (sign-in, invites, email change, new-application alerts) has no unsubscribe and always sends. Every email sets `reply_to` to `EMAIL_REPLY_TO`.
- Sign-in button is navy `#213b6d` with white text; Gmail dark mode recolors it light purple. That's the mail client, not a bug.
- Local dev doesn't send sign-in emails (the auth routes return `devLink`).

## Checking an email went out

Unknown member emails and non-admin emails return `{ ok: true }` and send nothing, **on purpose**, so `{ ok: true }` alone proves nothing. Check the inbox or Resend's **Emails** page.

**Testing rule:** any test that sends real mail goes only to `onur5celik8@gmail.com` (or `onur5celik8+anything@gmail.com`). Delete test members afterwards.
