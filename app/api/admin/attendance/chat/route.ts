import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

// The parsed WhatsApp group chat behind the attendance page's participation charts.
// One community group, so one saved analysis, kept as JSON in admin_config.
const KEY = 'attendance_chat_analysis';

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { rows } = await query<{ value: string }>('SELECT value FROM admin_config WHERE key = $1', [KEY]);
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try {
        return NextResponse.json(JSON.parse(rows[0].value));
    } catch {
        return NextResponse.json({ error: 'Saved analysis is unreadable' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // { messages, mapping } from the page; a bare message array is accepted too.
    const body = await request.json().catch(() => null);
    const valid = Array.isArray(body) || (body && typeof body === 'object' && Array.isArray(body.messages));
    if (!valid) {
        return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    try {
        await query(
            `INSERT INTO admin_config (key, value, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [KEY, JSON.stringify(body)],
        );
    } catch {
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        await query('DELETE FROM admin_config WHERE key = $1', [KEY]);
    } catch {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
