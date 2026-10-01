import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { query } from '@/app/lib/db';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ memberId: string }> }
) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId } = await context.params;
    const body = await request.json();
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
    const present = body.present === null ? null : (typeof body.present === 'boolean' ? body.present : undefined);

    if (!memberId || !meetingId || present === undefined) {
        return NextResponse.json({ error: 'memberId, meetingId, and present are required' }, { status: 400 });
    }

    if (present === null) {
        try {
            await query('DELETE FROM member_attendance WHERE meeting_id = $1 AND member_id = $2', [meetingId, memberId]);
        } catch {
            return NextResponse.json({ error: 'Failed to clear attendance' }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }

    try {
        await query(
            `INSERT INTO member_attendance (meeting_id, member_id, present, manually_adjusted, updated_at)
             VALUES ($1, $2, $3, true, now())
             ON CONFLICT (meeting_id, member_id) DO UPDATE SET
                present = EXCLUDED.present, manually_adjusted = EXCLUDED.manually_adjusted, updated_at = EXCLUDED.updated_at`,
            [meetingId, memberId, present],
        );
    } catch {
        return NextResponse.json({ error: 'Failed to update attendance' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
