import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';

const KEY = 'hidden_nav';

// GET /api/admin/nav-prefs — returns { hidden: string[] }
export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query<{ value: string }>(
            'SELECT value FROM admin_config WHERE key = $1',
            [KEY],
        );

        let hidden: string[] = [];
        if (rows[0]?.value) {
            try {
                const parsed = JSON.parse(rows[0].value);
                if (Array.isArray(parsed)) hidden = parsed.filter((h): h is string => typeof h === 'string');
            } catch {
                // stored value malformed — treat as empty
            }
        }

        return NextResponse.json({ hidden });
    } catch (error) {
        console.error('Error reading nav prefs:', error);
        return NextResponse.json({ error: 'Failed to load nav preferences' }, { status: 500 });
    }
}

// PUT /api/admin/nav-prefs — body { hidden: string[] }
export async function PUT(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { hidden } = await request.json();

        if (!Array.isArray(hidden) || !hidden.every(h => typeof h === 'string')) {
            return NextResponse.json({ error: 'hidden must be an array of strings' }, { status: 400 });
        }

        await query(
            `INSERT INTO admin_config (key, value, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            [KEY, JSON.stringify(hidden), new Date().toISOString()],
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error saving nav prefs:', error);
        return NextResponse.json({ error: 'Failed to save nav preferences' }, { status: 500 });
    }
}
