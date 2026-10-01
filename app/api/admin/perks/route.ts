import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let interests;
    try {
        ({ rows: interests } = await query<{ perk_id: string; member_id: string; created_at: string }>(
            'SELECT perk_id, member_id, created_at FROM perk_interests ORDER BY created_at DESC',
        ));
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }

    const memberIds = Array.from(new Set(interests.map(row => row.member_id)));
    let members: { id: string; name: string | null; email: string | null }[] = [];
    if (memberIds.length) {
        try {
            ({ rows: members } = await query('SELECT id, name, email FROM members WHERE id = ANY($1)', [memberIds]));
        } catch (error: unknown) {
            return NextResponse.json({ error: (error as Error).message }, { status: 500 });
        }
    }

    const memberById = new Map(members.map(m => [m.id, m]));

    const rows = interests.map(row => ({
        perk_id: row.perk_id,
        created_at: row.created_at,
        member: memberById.get(row.member_id) ?? null,
    }));

    return NextResponse.json(rows);
}
