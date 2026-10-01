import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { query } from '@/app/lib/db';

export async function GET() {
    try {
        if (process.env.NODE_ENV === 'production') {
            const healthToken = process.env.HEALTH_CHECK_TOKEN;
            const headerStore = await headers();
            const providedToken = headerStore.get('x-health-token') || headerStore.get('authorization')?.replace(/^Bearer\s+/i, '');

            if (!healthToken || providedToken !== healthToken) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 });
            }
        }

        // Check the database connection with the cheapest possible query
        try {
            await query('SELECT 1');
        } catch {
            return NextResponse.json({
                status: 'error',
                message: 'Database connection failed',
            }, { status: 500 });
        }

        // 3. Success
        return NextResponse.json({
            status: 'ok',
            message: 'System is healthy',
            timestamp: new Date().toISOString(),
            database: 'connected'
        }, { status: 200 });

    } catch {
        return NextResponse.json({
            status: 'error',
            message: 'Internal server error',
        }, { status: 500 });
    }
}
