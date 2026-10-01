import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { sendResendEmail } from '@/app/lib/member-auth';
import { escapeHtml } from '@/app/lib/html-escape';
import { MEETING_LINK_KEY } from '@/app/lib/admin-config';

export const dynamic = 'force-dynamic';

// POST /api/admin/send-invite — email an applicant a link to book their intro meeting.
// The booking link is set in Settings so it can change without a deploy.
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { id } = await request.json();
        if (!id) return NextResponse.json({ error: 'Applicant ID is required' }, { status: 400 });

        const [{ rows: applicantRows }, { rows: configRows }] = await Promise.all([
            query<{ id: string; name: string; first_name: string | null; email: string }>(
                'SELECT id, name, first_name, email FROM applications WHERE id = $1', [id],
            ),
            query<{ value: string }>('SELECT value FROM admin_config WHERE key = $1', [MEETING_LINK_KEY]),
        ]);
        const applicant = applicantRows[0];
        const meetingLink = configRows[0]?.value?.trim();

        if (!applicant) return NextResponse.json({ error: 'Applicant not found' }, { status: 404 });
        if (!meetingLink) {
            return NextResponse.json({ error: 'Set a meeting booking link in Settings first.' }, { status: 400 });
        }

        const firstName = applicant.first_name || applicant.name.split(' ')[0];
        await sendResendEmail({
            to: applicant.email,
            subject: `Let's meet, ${firstName}`,
            text: `Dear ${firstName},\n\nThank you for applying to the Robert College Community Entrepreneurs Bond. We review every application personally, and we'd like to get to know you.\n\nPlease pick a time for a short introductory conversation:\n${meetingLink}\n\nWarm regards,\nThe RCCEB team`,
            html: `<p>Dear ${escapeHtml(firstName)},</p>
<p>Thank you for applying to the Robert College Community Entrepreneurs Bond. We review every application personally, and we'd like to get to know you.</p>
<p><a href="${escapeHtml(meetingLink)}">Pick a time for a short introductory conversation</a></p>
<p>Warm regards,<br>The RCCEB team</p>`,
        });

        await query(`UPDATE applications SET status = 'meeting invited', updated_at = now() WHERE id = $1`, [id]);
        return NextResponse.json({ message: `Invite sent to ${applicant.email}` });
    } catch (error) {
        console.error('send-invite error:', error);
        return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
    }
}
