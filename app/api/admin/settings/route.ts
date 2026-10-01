import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { MEETING_LINK_KEY } from '@/app/lib/admin-config';

export const dynamic = 'force-dynamic';

const EDITABLE_KEYS = [MEETING_LINK_KEY] as const;

// GET /api/admin/settings — current settings plus a database round-trip, which doubles
// as the dashboard's health check.
export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query<{ key: string; value: string }>(
            'SELECT key, value FROM admin_config WHERE key = ANY($1)',
            [EDITABLE_KEYS],
        );
        const settings = Object.fromEntries(EDITABLE_KEYS.map(key => [key, rows.find(r => r.key === key)?.value ?? '']));
        return NextResponse.json({ settings, database: 'connected' });
    } catch (error) {
        console.error('settings GET failed:', error);
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }
}

// PUT /api/admin/settings — save settings
export async function PUT(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    try {
        for (const key of EDITABLE_KEYS) {
            if (typeof body[key] !== 'string') continue;
            const value = body[key].trim();
            if (key === MEETING_LINK_KEY && value && !/^https?:\/\//i.test(value)) {
                return NextResponse.json({ error: 'The meeting link must start with https://' }, { status: 400 });
            }
            await query(
                `INSERT INTO admin_config (key, value, updated_at) VALUES ($1, $2, now())
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
                [key, value.slice(0, 1000)],
            );
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('settings PUT failed:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
