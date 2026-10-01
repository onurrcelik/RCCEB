import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';
import { normalizeMemberUpdates, SAFE_MEMBER_SELECT, sanitizeMemberForClient } from '@/app/lib/member-validation';

// GET /api/members/profile — get own profile
export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ member: sanitizeMemberForClient(member) });
}

// PATCH /api/members/profile — update own profile
export async function PATCH(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const allowed = ['name', 'bio', 'linkedin', 'location', 'instagram', 'twitter', 'website', 'member_types', 'github', 'favorite_resource', 'occupation_link', 'phone', 'graduation_year'];
    const { updates, error: validationError } = normalizeMemberUpdates(body, allowed);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Column names come only from the hardcoded `allowed` list above (never raw
    // body keys), so they're safe to interpolate — can't be bind params anyway.
    const columns = Object.keys(updates!);
    const setClause = [...columns.map((col, i) => `${col} = $${i + 2}`), 'updated_at = now()'].join(', ');

    try {
        const { rows } = await query(
            `UPDATE members SET ${setClause} WHERE id = $1 RETURNING ${SAFE_MEMBER_SELECT}`,
            [member.id, ...columns.map((col) => (updates as Record<string, unknown>)[col])],
        );
        return NextResponse.json({ member: rows[0] });
    } catch {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
