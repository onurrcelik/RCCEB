import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { query } from '@/app/lib/db';
import { detectImageKind, imageExtension } from '@/app/lib/upload-security';
import {
    AttendanceMember,
    isIsoDate,
    latestThursday,
    matchAttendance,
    parseMeetingDateFromFilename,
    runTesseractOcr,
} from '@/app/lib/attendance';

const MAX_ATTENDANCE_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MEMBER_SELECT = 'id, name, email, is_past_member';
const MEETING_SELECT = 'id, meeting_date, screenshot_file_name, created_at, updated_at';

interface Meeting {
    id: string;
    meeting_date: string;
    screenshot_file_name: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dateValue = String(formData.get('date') || '').trim();

    if (!file) return NextResponse.json({ error: 'No screenshot provided' }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Only JPG, PNG, and WEBP screenshots are allowed' }, { status: 400 });
    }
    if (file.size > MAX_ATTENDANCE_IMAGE_SIZE_BYTES) {
        return NextResponse.json({ error: 'Screenshot is too large' }, { status: 400 });
    }
    if (dateValue && !isIsoDate(dateValue)) {
        return NextResponse.json({ error: 'Date must be YYYY-MM-DD' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectImageKind(buffer);
    if (!kind) return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });

    const meetingDate = dateValue || parseMeetingDateFromFilename(file.name) || latestThursday();

    let allMembers;
    try {
        ({ rows: allMembers } = await query<{ id: string; name: string | null; email: string | null; is_past_member: boolean | null }>(
            `SELECT ${MEMBER_SELECT} FROM members WHERE onboarding_complete = true ORDER BY name`,
        ));
    } catch {
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    // Past members aren't on the roster, so they're never matched or marked absent.
    const members = allMembers.filter(member => !member.is_past_member);
    if (!members.length) {
        return NextResponse.json({ error: 'No members to take attendance for yet' }, { status: 400 });
    }

    let ocrText = '';
    try {
        ocrText = await runTesseractOcr(buffer, imageExtension(kind));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR failed';
        return NextResponse.json({ error: `OCR failed: ${message}` }, { status: 500 });
    }

    const matches = matchAttendance(ocrText, members as AttendanceMember[]);
    const matchByMember = new Map(matches.map(match => [match.memberId, match]));

    let meeting: Meeting;
    try {
        meeting = await findOrCreateMeeting({
            meetingDate,
            screenshotFileName: file.name,
            ocrText,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save attendance meeting';
        return NextResponse.json({ error: message }, { status: 500 });
    }

    const memberIds = members.map(member => member.id);
    let existingRows: { member_id: string; present: boolean; manually_adjusted: boolean }[];
    try {
        ({ rows: existingRows } = await query<{ member_id: string; present: boolean; manually_adjusted: boolean }>(
            'SELECT member_id, present, manually_adjusted FROM member_attendance WHERE meeting_id = $1 AND member_id = ANY($2)',
            [meeting.id, memberIds],
        ));
    } catch {
        return NextResponse.json({ error: 'Failed to read existing attendance' }, { status: 500 });
    }

    const existingByMember = new Map(existingRows.map(row => [row.member_id, row]));
    const now = new Date().toISOString();
    const rows = members.map(member => {
        const match = matchByMember.get(member.id);
        const existing = existingByMember.get(member.id);
        const alreadyPresent = existing?.present === true;
        const present = alreadyPresent || Boolean(match);

        return {
            meeting_id: meeting.id,
            member_id: member.id,
            present,
            matched_text: match?.matchedText ?? null,
            match_score: match?.score ?? null,
            match_strategy: match?.strategy ?? null,
            manually_adjusted: existing?.manually_adjusted ?? false,
            updated_at: now,
        };
    });

    const values = rows.map((_, i) => {
        const o = i * 8;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
    }).join(', ');
    const params = rows.flatMap(r => [r.meeting_id, r.member_id, r.present, r.matched_text, r.match_score, r.match_strategy, r.manually_adjusted, r.updated_at]);

    try {
        await query(
            `INSERT INTO member_attendance (meeting_id, member_id, present, matched_text, match_score, match_strategy, manually_adjusted, updated_at)
             VALUES ${values}
             ON CONFLICT (meeting_id, member_id) DO UPDATE SET
                present = EXCLUDED.present, matched_text = EXCLUDED.matched_text, match_score = EXCLUDED.match_score,
                match_strategy = EXCLUDED.match_strategy, manually_adjusted = EXCLUDED.manually_adjusted, updated_at = EXCLUDED.updated_at`,
            params,
        );
    } catch {
        return NextResponse.json({ error: 'Failed to save attendance' }, { status: 500 });
    }

    return NextResponse.json({
        meeting,
        matchedCount: matches.length,
        memberCount: members.length,
        matches,
        ocrText,
    });

    async function findOrCreateMeeting(input: {
        meetingDate: string;
        screenshotFileName: string;
        ocrText: string;
    }): Promise<Meeting> {
        let existingRows: Meeting[];
        try {
            ({ rows: existingRows } = await query<Meeting>(
                `SELECT ${MEETING_SELECT} FROM attendance_meetings WHERE meeting_date = $1`,
                [input.meetingDate],
            ));
        } catch {
            throw new Error('Failed to find attendance meeting');
        }
        const existing = existingRows[0] ?? null;

        if (existing) {
            let data: Meeting | undefined;
            try {
                ({ rows: [data] } = await query<Meeting>(
                    `UPDATE attendance_meetings SET screenshot_file_name = $1, ocr_text = $2, updated_at = now() WHERE id = $3 RETURNING ${MEETING_SELECT}`,
                    [input.screenshotFileName, input.ocrText, existing.id],
                ));
            } catch {
                throw new Error('Failed to update attendance meeting');
            }
            if (!data) throw new Error('Failed to update attendance meeting');
            return data;
        }

        let data: Meeting | undefined;
        try {
            ({ rows: [data] } = await query<Meeting>(
                `INSERT INTO attendance_meetings (meeting_date, screenshot_file_name, ocr_text) VALUES ($1, $2, $3) RETURNING ${MEETING_SELECT}`,
                [input.meetingDate, input.screenshotFileName, input.ocrText],
            ));
        } catch {
            throw new Error('Failed to create attendance meeting');
        }
        if (!data) throw new Error('Failed to create attendance meeting');
        return data;
    }
}
