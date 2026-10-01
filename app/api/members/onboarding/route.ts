import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';
import { normalizeMemberUpdates } from '@/app/lib/member-validation';

// POST /api/members/onboarding — save profile details (step 1 of onboarding)
export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const allowed = ['name', 'bio', 'linkedin', 'location', 'instagram', 'twitter', 'website', 'member_types', 'github', 'favorite_resource', 'occupation_link', 'phone', 'graduation_year'];
    const { updates, error: validationError } = normalizeMemberUpdates(body, allowed);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (!updates?.name || !updates.bio || !updates.location) {
        return NextResponse.json({ error: 'Name, location, and current occupation are required' }, { status: 400 });
    }

    // Column names come only from the hardcoded `allowed` list above (never raw
    // body keys), so they're safe to interpolate — can't be bind params anyway.
    const columns = Object.keys(updates!);
    const setClause = [...columns.map((col, i) => `${col} = $${i + 2}`), 'updated_at = now()'].join(', ');

    try {
        await query(
            `UPDATE members SET ${setClause} WHERE id = $1`,
            [member.id, ...columns.map((col) => (updates as Record<string, unknown>)[col])],
        );
    } catch (error) {
        console.error('[onboarding POST] query error:', error);
        return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

// PATCH /api/members/onboarding — mark onboarding complete. Membership is free, so
// there's no payment step: finishing the profile is all it takes.
export async function PATCH(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!member.name || !member.bio || !member.location) {
        return NextResponse.json({ error: 'Please complete your profile first' }, { status: 400 });
    }

    try {
        await query(
            'UPDATE members SET onboarding_complete = true, updated_at = now() WHERE id = $1',
            [member.id],
        );
    } catch {
        return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
