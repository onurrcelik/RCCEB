import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';

// GET /api/admin/settings — a database round-trip for the dashboard's health check.
export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        await query('SELECT 1');
        return NextResponse.json({ database: 'connected' });
    } catch (error) {
        console.error('settings GET failed:', error);
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }
}
