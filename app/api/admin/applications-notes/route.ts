import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';

const KEY = 'applications_general_notes';

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query<{ value: string }>('SELECT value FROM admin_config WHERE key = $1', [KEY]);
        return NextResponse.json({ notes: rows[0]?.value ?? '' });
    } catch (error) {
        console.error('applications-notes GET error:', error);
        return NextResponse.json({ notes: '' });
    }
}

export async function PUT(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { notes } = await request.json();
        await query(
            `INSERT INTO admin_config (key, value, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            [KEY, typeof notes === 'string' ? notes : '', new Date().toISOString()],
        );
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('applications-notes PUT error:', error);
        return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
    }
}
