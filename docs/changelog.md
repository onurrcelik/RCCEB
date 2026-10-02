# Changelog

What changed and why, newest first. Open tasks live in [`../TODO.md`](../TODO.md). The first build is commits `5c91be6` (backbone) through `d902f78` (pitch decks); everything below is 1 to 2 October 2026.

## 3 October 2026

- **Clickable names:** any member's name or photo in the member portal opens their card (`MemberLink.tsx`, `OpenMemberContext`).
- **Event link:** `events.link`; admin field with https normalization; Register / Event page button for members.
- **Mobile:** admin phone top bar + drawer, card views for Applications and Members, stacked event cards; desktop untouched (all below `md`).

## 2 October 2026: going live and the membership flow

- **Portal moved to rcceb.org.** It now runs at www.rcceb.org/members and /admin, behind the landing site's rewrites, with assets under `/portal-static`. `APP_URL` is `https://www.rcceb.org`. (See [deployment.md](deployment.md).)
- **rcceb.org/join connected.** The landing site forwards every application to `/api/applications` (deduped by the sheet's User ID, `applications.external_id`). The 59 older sheet rows were imported with their original dates; 106 WhatsApp-community people were imported as members with onboarding pending (no emails sent).
- **RC clerk approval is automatic.** Approve in the reviewer email → `/api/applications/rc-decision` → RC Verified + Accepted, member created, "Welcome to the Bond" email (`app/lib/onboarding-invite.ts`). Reject → Declined. New applications start as **Sent to RC**.
- **Join form redesigned** (landing repo): one compact glass card, location added, every field required, agreements last with one box per document that opens it first (the founder's rule), "Join the Bond!" button, **Member Access** link in the top bar.
- **Onboarding:** required **location**, required company **website**, a ChatGPT popup with a personal prompt, and "Fill my profile" from a pasted reply. The Turkish WhatsApp intro is saved to `members.whatsapp_intro` and shown to admins behind a WhatsApp icon in Admin → Members.
- **Directory filters:** pathway, class year, expertise, location.
- **1-on-1s are opt-in.** Create Round emails an invitation with a one-click "Count me in"; members can "join every month" (`match_auto_opt_in`); the match email says who reaches out first; Notify became Remind.
- **Sign-in link** no longer shows the token in the address bar.
- **Admin Members:** the pathway menu is no longer clipped by the table.
- **Resend connected** (`ad80c04`): unsubscribe footer and headers only on marketing mail, `reply_to` on every email.

## 2 October 2026: earlier in the day

- **30-day sign-in.** `proxy.ts` + `refreshSessionCookie` (`app/lib/auth.ts`) re-issue the cookie on every authorized request, so it expires 30 days after the last visit, not the sign-in.
- **Applications.** The "Meet" button, `/api/admin/send-invite`, the booking-link setting and `app/lib/admin-config.ts` were removed. Application status values are `submitted | sent to rc | rc verified` (were `meeting invited | meeting done`). Admin → Settings only has the system status check.
- **1-on-1s monthly and manual.** `/api/cron/weekly-match-round` was deleted, so nothing is scheduled. `nextMonday()` became `roundDate()`; `match_rounds.week_of` keeps its name but is shown as a month. `create_round` refuses while another round is open.
- **Asks & Offers.** The Marketplace became Asks & Offers (section id still `marketplace`, table still `marketplace_listings`): each post is `ask` or `offer`, with optional email subscriptions. The Job Board was deliberately left as is.
- **Job-board referrals removed.** The Refer panel, `/api/members/job-board/[id]/refer`, the outside-friend page `/jobs/[token]`, the referral email and referral attribution. Only members apply now. The separate **Refer a Friend** section (suggesting people to join) is untouched.
- **Mobile fixes** (`0c07ffe`): 16px inputs below 768px, safe-area insets, one-column referral cards, larger tap targets, a real hamburger icon, and readable text on dark fields. Desktop (`md`+) unchanged apart from a contrast fix (`text-zinc-950` → `text-white` on dark inputs).

## 1 October 2026

- First production deploy (`13d9265`): onboarding, directory, companies, job board, marketplace. Pitch Decks added in `d902f78`.
