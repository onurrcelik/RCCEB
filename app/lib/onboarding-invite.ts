import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { buildInviteUrl, issueInviteToken, INVITE_TTL_DAYS } from '@/app/lib/member-invites';
import { escapeHtml } from '@/app/lib/html-escape';
import { BRAND } from '@/app/lib/brand';

// Turning an accepted application into a member, and the "Welcome to the Bond" email that
// carries their onboarding link. Shared by the admin buttons (Accepted / Invite / Resend)
// and by the RC clerk's Approve click (POST /api/applications/rc-decision), so both send
// exactly the same email.

type ApplicationRow = {
    id: string;
    name: string;
    first_name: string | null;
    email: string;
    phone: string | null;
    linkedin: string | null;
    location: string | null;
    graduation_year: number | null;
    categories: string[];
};

export type InviteTarget = { memberId: string; email: string; firstName: string };

// Name, phone, LinkedIn, location, class year and pathway are copied from the application
// so onboarding opens pre-filled. Safe to repeat: it updates the member matched on email.
export async function createMemberFromApplication(applicationId: string): Promise<InviteTarget | null> {
    const { rows } = await query<ApplicationRow>(
        'SELECT id, name, first_name, email, phone, linkedin, location, graduation_year, categories FROM applications WHERE id = $1',
        [applicationId],
    );
    const app = rows[0];
    if (!app) return null;

    const email = app.email.toLowerCase().trim();
    const { rows: upserted } = await query<{ id: string }>(
        `INSERT INTO members (application_id, email, name, phone, linkedin, graduation_year, categories, location, onboarding_complete)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         ON CONFLICT (email) DO UPDATE SET
            application_id = EXCLUDED.application_id,
            name = COALESCE(members.name, EXCLUDED.name),
            phone = COALESCE(members.phone, EXCLUDED.phone),
            linkedin = COALESCE(members.linkedin, EXCLUDED.linkedin),
            location = COALESCE(members.location, EXCLUDED.location),
            graduation_year = COALESCE(members.graduation_year, EXCLUDED.graduation_year),
            categories = CASE WHEN cardinality(members.categories) = 0 THEN EXCLUDED.categories ELSE members.categories END,
            is_past_member = false,
            updated_at = now()
         RETURNING id`,
        [app.id, email, app.name, app.phone || null, app.linkedin, app.graduation_year, app.categories ?? [], app.location],
    );
    const memberId = upserted[0].id;
    await query('UPDATE applications SET member_id = $1, updated_at = now() WHERE id = $2', [memberId, app.id]);

    return { memberId, email, firstName: app.first_name || app.name.split(' ')[0] || 'there' };
}

const WHATSAPP_LINE = "After that, we'll add you to the RCCEB WhatsApp group, where the network actually lives. Keep an eye out for the invite.";

function buildText(firstName: string, inviteLink: string): string {
    return `${firstName}, welcome to the Bond.

We're building this network together, and you're part of it now.

Your first step is your member profile. It takes a few minutes, and ChatGPT can draft most of it for you:
${inviteLink}

${WHATSAPP_LINE}

This link works for ${INVITE_TTL_DAYS} days.

Questions? Just reply to this email.

The RCCEB team`;
}

function buildHtml(firstName: string, inviteLink: string): string {
    const { navy, gold } = BRAND.colors;
    return `<div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:auto;color:${navy}">
  <div style="background:${navy};padding:32px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:${gold};margin:0;font-size:26px;font-style:italic;font-family:Georgia,'Playfair Display',serif;font-weight:400">The Bond</h1>
    <p style="color:#ffffff99;margin:8px 0 0;font-size:12px;letter-spacing:.15em;text-transform:uppercase">${BRAND.shortName}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:36px 32px">
    <h2 style="font-size:22px;margin:0 0 16px;font-family:Georgia,'Playfair Display',serif;font-weight:600">${escapeHtml(firstName)}, welcome to the Bond.</h2>
    <p style="font-size:15px;line-height:1.8;color:#374151;margin:0 0 16px">We're building this network together, and you're part of it now.</p>
    <p style="font-size:15px;line-height:1.8;color:#374151;margin:0 0 28px">Your first step is your member profile. It takes a few minutes, and ChatGPT can draft most of it for you.</p>
    <div style="text-align:center;margin:0 0 28px">
      <a href="${inviteLink}" style="display:inline-block;background:${gold};color:${navy};font-weight:700;font-size:15px;padding:14px 34px;border-radius:100px;text-decoration:none">Complete your profile</a>
      <p style="font-size:12px;color:#9ca3af;margin:12px 0 0">This link works for ${INVITE_TTL_DAYS} days.</p>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px">
    <p style="font-size:15px;line-height:1.8;color:#374151;margin:0 0 24px">${WHATSAPP_LINE}</p>
    <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.7">Questions? Just reply to this email.<br>The ${BRAND.shortName} team</p>
  </div>
</div>`;
}

// Issues a fresh 30-day invite link and emails it. Throws if either step fails, so callers
// can tell "member saved, email failed" apart.
export async function sendOnboardingInvite(target: InviteTarget, baseUrl: string) {
    const inviteLink = buildInviteUrl(baseUrl, await issueInviteToken(target.memberId));
    await sendResendEmail({
        to: target.email,
        subject: `Welcome to the Bond, ${target.firstName}`,
        text: buildText(target.firstName, inviteLink),
        html: buildHtml(target.firstName, inviteLink),
    });
}
