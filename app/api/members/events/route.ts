import { NextRequest, NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...(init?.headers ?? {}),
        },
    });
}

export async function GET(request: NextRequest) {
    const member = await requireActiveMember(request);
    if (!member) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { rows } = await query('SELECT * FROM events ORDER BY date DESC');
        return jsonNoStore({ events: rows });
    } catch (error) {
        return jsonNoStore({ error: error instanceof Error ? error.message : 'Failed to fetch events' }, { status: 500 });
    }
}
