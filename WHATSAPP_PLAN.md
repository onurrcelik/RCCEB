# WhatsApp step: plan (not built here yet)

Onur is building the WhatsApp automation **in a separate repo**. Don't build it in this repo until he says it's ready. This file records the plan and what already exists, so the next session can connect it.

## Where it sits in the membership flow

1. Applicant fills rcceb.org/join → Google Sheet + portal application (`/api/applications`), status **Sent to RC**.
2. Admins (Onur, Eray, Oğuz = `NOTIFICATION_EMAIL`) get the portal's "New RCCEB application" email.
3. RC clerks get the Approve/Reject email from the landing site (`ADMIN_EMAILS` on the landing Vercel project).
4. Clerk approves → landing `/api/review` updates the sheet and calls the portal's `/api/applications/rc-decision` → application **RC Verified + Accepted**, member created, "Welcome to the Bond" email with the onboarding link (`app/lib/onboarding-invite.ts`). That email already says they'll be added to the WhatsApp group.
5. Member completes onboarding (optionally pasting a ChatGPT reply, which also yields their Turkish WhatsApp intro).
6. **WhatsApp step (to build):** add the member to the RCCEB WhatsApp group, then post their intro in the group.

## What's already available for it

- **The intro text:** `members.whatsapp_intro` (TEXT, admin-only), filled when the member pastes ChatGPT's reply during onboarding. The format, set in `app/lib/onboarding-prompt.ts` (section 8):
  ```
  [Name] - [Company] — [Role], RC'[year]
  Ne yapıyorum: …
  Katkım & beklentim: …
  Lokasyon: …
  ```
  Admins can see and copy it in Admin → Members (WhatsApp icon).
- **Members who filled onboarding by hand have no `whatsapp_intro`.** Onur's plan: write theirs for them from the profile fields (`name`, companies + role from `company_affiliations`, `graduation_year`, `bio` / `working_on`, `can_help_with`, `location`).
- **The trigger point:** onboarding completes in `PATCH /api/members/onboarding` (`onboarding_complete = true`). That's the natural moment to hand a member to the WhatsApp automation.
- **Phone numbers:** `members.phone` (international format from the join form).
- **The group invite link** used by the old landing welcome email: `WHATSAPP_GROUP_URL` in `rcceb-landing/app/api/join/route.ts` (default `https://chat.whatsapp.com/CcVGTWu2FDLKMQZKriIMVc`). Eray (RC'11, `ERAY_WHATSAPP_NUMBER` there) was the "talk it through" contact.

## Open questions for when it's built

- How the other repo receives members: a webhook from the portal when onboarding completes, or it polls the portal / database.
- Whether intros for manual-fill members are generated automatically (e.g. by a model) or written by an admin first.
- Whether admins approve the intro before it's posted.
