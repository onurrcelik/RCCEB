import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { getBaseUrl } from '@/app/lib/site-url';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { createMemberFromApplication, sendOnboardingInvite, type InviteTarget } from '@/app/lib/onboarding-invite';

// POST /api/admin/members/invite — turn an accepted application into a member and email
// them their onboarding link (app/lib/onboarding-invite.ts). Re-sending is safe: it
// updates the existing member row (matched on email) and issues a fresh link.
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId : null;
    const memberIdParam = typeof body.memberId === 'string' ? body.memberId : null;

    let target: InviteTarget;
    if (applicationId) {
        try {
            const created = await createMemberFromApplication(applicationId);
            if (!created) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
            target = created;
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
        target = { memberId: member.id, email: member.email, firstName: (member.name || 'there').split(' ')[0] };
    } else {
        return NextResponse.json({ error: 'applicationId or memberId is required' }, { status: 400 });
    }

    try {
        await sendOnboardingInvite(target, getBaseUrl(request));
    } catch (err) {
        console.error('[members/invite] Invite failed:', err);
        return NextResponse.json({ error: 'Member saved, but the email could not be sent.', memberId: target.memberId }, { status: 502 });
    }

    return NextResponse.json({ ok: true, memberId: target.memberId });
}
