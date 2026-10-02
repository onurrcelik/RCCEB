import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { isIntakeAuthorized } from '@/app/lib/intake-auth';
import { createMemberFromApplication, sendOnboardingInvite } from '@/app/lib/onboarding-invite';
import { getBaseUrl } from '@/app/lib/site-url';

export const dynamic = 'force-dynamic';

// POST /api/applications/rc-decision — an RC clerk clicked Approve or Reject in the
// rcceb.org reviewer email. The site's /api/review records it in the Google Sheet and then
// forwards it here (server to server, intake secret), so the portal follows without
// anyone touching the admin dashboard:
//
//   approve → RC Verified + Accepted, member created, "Welcome to the Bond" email with the
//             onboarding link sent (once: a repeat finds member_id set and sends nothing)
//   reject  → Declined. The site sends the applicant its own rejection email.
//
// The application is found by externalId, the sheet's User ID, which every forwarded and
// imported application carries.

type Body = { externalId?: unknown; decision?: unknown; reviewer?: unknown; reviewedAt?: unknown };

export async function POST(request: NextRequest) {
    if (!isIntakeAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as Body | null;
    const externalId = typeof body?.externalId === 'string' ? body.externalId.trim() : '';
    const decision = body?.decision;
    if (!externalId || (decision !== 'approve' && decision !== 'reject')) {
        return NextResponse.json({ error: 'externalId and decision (approve | reject) are required' }, { status: 400 });
    }
    const reviewer = typeof body?.reviewer === 'string' ? body.reviewer.trim().slice(0, 200) : 'an RC reviewer';
    const reviewedAt = typeof body?.reviewedAt === 'string' ? body.reviewedAt.trim().slice(0, 60) : new Date().toISOString();

    const { rows } = await query<{ id: string; member_id: string | null }>(
        'SELECT id, member_id FROM applications WHERE external_id = $1',
        [externalId],
    );
    const application = rows[0];
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    // Already approved and invited (a repeated or retried call): leave everything as is.
    if (decision === 'approve' && application.member_id) {
        return NextResponse.json({ ok: true, decision, alreadyInvited: true });
    }

    const note = `RC ${decision === 'approve' ? 'approved' : 'rejected'} by ${reviewer} on ${reviewedAt}.`;
    await query(
        `UPDATE applications SET
            status = CASE WHEN $2 = 'accepted' THEN 'rc verified' ELSE status END,
            admission_status = $2,
            notes = CASE WHEN notes = '' THEN $3 ELSE notes || E'\n' || $3 END,
            updated_at = now()
         WHERE id = $1`,
        [application.id, decision === 'approve' ? 'accepted' : 'declined', note],
    );

    if (decision === 'reject') return NextResponse.json({ ok: true, decision });

    let target;
    try {
        target = await createMemberFromApplication(application.id);
    } catch (err) {
        console.error('[rc-decision] Failed to create member:', err);
        return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
    }
    if (!target) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    try {
        await sendOnboardingInvite(target, getBaseUrl(request));
    } catch (err) {
        // The member exists, so admins can press Resend; tell the site so it can fall back.
        console.error('[rc-decision] Invite failed:', err);
        return NextResponse.json({ error: 'Member created, but the welcome email failed', memberId: target.memberId }, { status: 502 });
    }
    return NextResponse.json({ ok: true, decision, invited: true, memberId: target.memberId });
}
