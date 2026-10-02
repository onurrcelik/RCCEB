import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { buildInviteUrl, issueInviteToken, INVITE_TTL_DAYS } from '@/app/lib/member-invites';
import { getBaseUrl } from '@/app/lib/site-url';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { escapeHtml } from '@/app/lib/html-escape';
import { BRAND } from '@/app/lib/brand';

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

function buildText(firstName: string, inviteLink: string): string {
    return `Dear ${firstName},

Welcome to the Robert College Community Entrepreneurs Bond. We're delighted to have you with us.

Set up your member profile to meet the rest of the Bond:
${inviteLink}

This link works for ${INVITE_TTL_DAYS} days — no rush.

Warm regards,
The RCCEB team`;
}

function buildHtml(firstName: string, inviteLink: string): string {
    return `<div style="max-width:560px;font-family:Inter,Arial,sans-serif;color:${BRAND.colors.navy};">
<p style="font-size:15px;line-height:1.7;">Dear ${escapeHtml(firstName)},</p>
<p style="font-size:15px;line-height:1.7;">Welcome to the Robert College Community Entrepreneurs Bond. We're delighted to have you with us.</p>
<p style="margin:28px 0;"><a href="${inviteLink}" style="display:inline-block;background:${BRAND.colors.brandNavy};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">Set up your member profile</a></p>
<p style="color:#888;font-size:12px;">This link works for ${INVITE_TTL_DAYS} days — no rush.</p>
<p style="font-size:15px;line-height:1.7;">Warm regards,<br>The RCCEB team</p>
</div>`;
}

// POST /api/admin/members/invite — turn an accepted application into a member and email
// them their onboarding link. Name, phone, LinkedIn, class year and pathway are copied
// over from the application so onboarding opens pre-filled. Re-sending is safe: it
// updates the existing member row (matched on email) and issues a fresh link.
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId : null;
    const memberIdParam = typeof body.memberId === 'string' ? body.memberId : null;

    let memberId: string;
    let email: string;
    let firstName: string;

    if (applicationId) {
        const { rows } = await query<ApplicationRow>(
            'SELECT id, name, first_name, email, phone, linkedin, location, graduation_year, categories FROM applications WHERE id = $1',
            [applicationId],
        );
        const app = rows[0];
        if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

        email = app.email.toLowerCase().trim();
        firstName = app.first_name || app.name.split(' ')[0] || 'there';
        try {
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
            memberId = upserted[0].id;
            await query('UPDATE applications SET member_id = $1, updated_at = now() WHERE id = $2', [memberId, app.id]);
        } catch (err) {
            console.error('[members/invite] Failed to create member:', err);
            return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
        }
    } else if (memberIdParam) {
        // Re-sending an invite to someone already on the Members page.
        const { rows } = await query<{ id: string; email: string; name: string | null }>(
            'SELECT id, email, name FROM members WHERE id = $1', [memberIdParam],
        );
        const member = rows[0];
        if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
        memberId = member.id;
        email = member.email;
        firstName = (member.name || 'there').split(' ')[0];
    } else {
        return NextResponse.json({ error: 'applicationId or memberId is required' }, { status: 400 });
    }

    // A long-lived invite token, traded for a session when they actually click,
    // however many days later that is.
    let inviteLink: string;
    try {
        inviteLink = buildInviteUrl(getBaseUrl(request), await issueInviteToken(memberId));
    } catch (err) {
        console.error('[members/invite] Failed to issue invite token:', err);
        return NextResponse.json({ error: 'Could not create the invite link.' }, { status: 500 });
    }

    try {
        await sendResendEmail({
            to: email,
            subject: `Welcome to ${BRAND.shortName}, ${firstName}`,
            text: buildText(firstName, inviteLink),
            html: buildHtml(firstName, inviteLink),
        });
    } catch (err) {
        console.error('[members/invite] Email failed:', err);
        return NextResponse.json({ error: 'Member saved, but the email could not be sent.', memberId }, { status: 502 });
    }

    return NextResponse.json({ ok: true, memberId });
}
