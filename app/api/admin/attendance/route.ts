import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { query } from '@/app/lib/db';
import { isIsoDate } from '@/app/lib/attendance';

const MEMBER_SELECT = 'id, name, email, is_past_member';
const MEETING_SELECT = 'id, meeting_date, screenshot_file_name, created_at, updated_at';

interface AttendanceRow {
    member_id: string;
    meeting_id: string;
    present: boolean;
    matched_text: string | null;
    match_score: number | null;
    match_strategy: string | null;
    manually_adjusted: boolean;
    [key: string]: unknown;
}

interface Meeting {
    id: string;
    meeting_date: string;
    screenshot_file_name: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}

interface MemberRow {
    id: string;
    name: string | null;
    email: string | null;
    is_past_member: boolean | null;
    [key: string]: unknown;
}

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    if (dateParam && !isIsoDate(dateParam)) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    let allMembers: MemberRow[], meetings: Meeting[];
    try {
        [
            { rows: allMembers },
            { rows: meetings },
        ] = await Promise.all([
            query<MemberRow>(`SELECT ${MEMBER_SELECT} FROM members WHERE onboarding_complete = true ORDER BY name`),
            query<Meeting>(`SELECT ${MEETING_SELECT} FROM attendance_meetings ORDER BY meeting_date DESC, created_at DESC`),
        ]);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch attendance data' }, { status: 500 });
    }

    // Past members are left out of the roster; their attendance rows stay in history.
    const members = allMembers.filter(member => !member.is_past_member);

    const selectedMeeting = dateParam
        ? meetings.find(meeting => meeting.meeting_date === dateParam) ?? null
        : meetings[0] ?? null;

    const memberIds = members.map(member => member.id);
    const meetingIds = meetings.map(meeting => meeting.id);
    let history: AttendanceRow[] = [];
    if (memberIds.length > 0 && meetingIds.length > 0) {
        try {
            ({ rows: history } = await query<AttendanceRow>(
                'SELECT member_id, meeting_id, present, matched_text, match_score, match_strategy, manually_adjusted FROM member_attendance WHERE member_id = ANY($1) AND meeting_id = ANY($2)',
                [memberIds, meetingIds],
            ));
        } catch {
            return NextResponse.json({ error: 'Failed to fetch attendance history' }, { status: 500 });
        }
    }

    let attendance: AttendanceRow[] = [];
    if (selectedMeeting) {
        attendance = history.filter(row => row.meeting_id === selectedMeeting.id);
    }

    const streaks = await calculateMissedStreaks(memberIds);

    return NextResponse.json({
        members,
        meetings,
        selectedMeeting,
        attendance,
        history,
        streaks,
    });
}

export async function PATCH(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
    const meetingDate = typeof body.meetingDate === 'string' ? body.meetingDate : '';

    if (!meetingId || !isIsoDate(meetingDate)) {
        return NextResponse.json({ error: 'meetingId and a valid meetingDate are required' }, { status: 400 });
    }

    let data;
    try {
        ({ rows: [data] } = await query<Meeting>(
            `UPDATE attendance_meetings SET meeting_date = $1, updated_at = now() WHERE id = $2 RETURNING ${MEETING_SELECT}`,
            [meetingDate, meetingId],
        ));
    } catch (error: unknown) {
        const status = (error as { code?: string } | undefined)?.code === '23505' ? 409 : 500;
        const message = (error as { code?: string } | undefined)?.code === '23505'
            ? 'A meeting already exists for this date'
            : 'Failed to update attendance meeting';
        return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ meeting: data });
}

export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    if (!meetingId) {
        return NextResponse.json({ error: 'meetingId is required' }, { status: 400 });
    }

    try {
        await query('DELETE FROM attendance_meetings WHERE id = $1', [meetingId]);
    } catch {
        return NextResponse.json({ error: 'Failed to delete attendance meeting' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

async function calculateMissedStreaks(memberIds: string[]) {
    if (memberIds.length === 0) return {};

    let meetings: { id: string; meeting_date: string }[];
    try {
        ({ rows: meetings } = await query<{ id: string; meeting_date: string }>(
            'SELECT id, meeting_date FROM attendance_meetings WHERE meeting_date <= $1 ORDER BY meeting_date DESC',
            [new Date().toISOString().slice(0, 10)],
        ));
    } catch {
        return {};
    }
    if (!meetings.length) return {};

    const meetingIds = meetings.map(meeting => meeting.id);
    let rows: { member_id: string; meeting_id: string; present: boolean }[];
    try {
        ({ rows } = await query<{ member_id: string; meeting_id: string; present: boolean }>(
            'SELECT member_id, meeting_id, present FROM member_attendance WHERE member_id = ANY($1) AND meeting_id = ANY($2)',
            [memberIds, meetingIds],
        ));
    } catch {
        return {};
    }

    const rowsByMemberMeeting = new Map<string, boolean>();
    for (const row of rows) {
        rowsByMemberMeeting.set(`${row.member_id}:${row.meeting_id}`, row.present);
    }

    const streaks: Record<string, number> = {};
    for (const memberId of memberIds) {
        let count = 0;
        for (const meeting of meetings) {
            const present = rowsByMemberMeeting.get(`${memberId}:${meeting.id}`);
            if (present === undefined) continue;
            if (present) break;
            count += 1;
        }
        streaks[memberId] = count;
    }

    return streaks;
}
