# RCCEB to-do

Tasks for Claude. Add one line per task under **To do**. Claude moves a task to **Done** with the date when it's finished.

## To do

- what is welcome to rcceb onboarding link? we should make the onboarding flawless without admin touch (when the robert college clerk approves that the applicant is actually an rc alumni, it should automatically mark it in the admin dashboard and sign the onboarding link. BUT DONT DO THIS YET, I'LL TELL YOU ABOUT HOW RC CLERK APROVES THEN WE CAN DO IT.)


## Done

- **2 Oct 2026 — Add location to the member portal.** Onboarding now asks for **Location** (required, e.g. "Istanbul, Turkey"), and the server rejects onboarding without it. The directory card and the profile popup show it with a pin under the name, and directory search already matches it. Members who onboarded earlier (you) can add it under Edit profile → Location.
- **2 Oct 2026 — Add Eray and Oz to "the team".** `NOTIFICATION_EMAIL` is now `onur5celik8@gmail.com,eray@reflectstudio.com,oz.silahtar@gmail.com` locally and on Vercel (production and preview), and production was redeployed so it's live now. All three get the new-application and perk-interest alerts.
- **2 Oct 2026 — Does accepting send the onboarding email?** It didn't: **Portal** only appeared after you set Admission to Accepted, and was a second click. Now choosing **Accepted** asks you to confirm, then creates the member and sends "Welcome to RCCEB" right away. If they aren't marked RC Verified yet, the confirmation says so. The button is now **Invite** (if the email failed) or **Resend**. Not live until committed and pushed.
- **2 Oct 2026 — Stay signed in for 30 days.** Already mostly true, with one gap: the sign-in cookie was set once and expired 30 days after sign-in, even for active members. Now every visit renews it for another 30 days, for members and admins. A member is only asked to sign in again after 30 days without visiting.
- **2 Oct 2026 — Who is "the team" that gets notified?** Only you: `NOTIFICATION_EMAIL` is `onur5celik8@gmail.com`, locally and on Vercel. It gets the new-application alert and perk-interest alerts. To add people, make it a comma-separated list on Vercel and redeploy.
- **2 Oct 2026 — Remove "Let's meet", keep "Welcome to RCCEB".** Removed the Meet button, its email, and the booking link in admin Settings. The Application status on each application now follows the RC check: **Submitted → Sent to RC → RC Verified**. After that, set Admission to **Accepted** and click **Portal** to send the "Welcome to RCCEB" onboarding email (unchanged).
- **2 Oct 2026 — 1-on-1s monthly and manual.** Removed the Sunday scheduled job. All wording in the portal, admin and emails now says "this month" / "last month", and rounds are labelled by month (e.g. "October 2026"). Admin → Matches works the same; it now also refuses to open a second round while one is still open. Tested locally against the live database: create round, run match, delete round.
- **2 Oct 2026 — Needs and offers board.** As you chose, the Job Board stays as it is and the Marketplace became **Asks & Offers**. Members post an **Ask** (something they need) or an **Offer** (something they can help with), filter by All / Asks / Offers, and can turn on emails for new asks and/or new offers. The new email goes through Resend with an unsubscribe link and never goes to the poster. A test email was sent to you.
- **2 Oct 2026 — Remove job board referrals.** Removed "Refer a friend" / "Refer", the "X referred you" banner, the referral email, and the outside-friend share link (`/jobs/…`). Only members can apply to jobs now. The separate **Refer a Friend** section (suggesting people to join RCCEB) is untouched.
