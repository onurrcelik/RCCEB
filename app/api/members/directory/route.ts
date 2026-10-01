import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/members/directory — list all visible members (requires auth via middleware)
export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Everyone in `members` is admin-approved (applicants live in `applications`).
    // The only meaningful display filter is having a name to render a card.
    try {
        const { rows } = await query(
            `SELECT id, name, bio, avatar_url, member_types, linkedin, location, instagram, twitter, github, favorite_resource, occupation_link, graduation_year, categories, is_past_member, created_at
             FROM members
             WHERE name IS NOT NULL AND onboarding_complete = true
             ORDER BY created_at DESC`,
        );
        return NextResponse.json(
            { members: rows },
            { headers: { 'Cache-Control': 'no-store, max-age=0' } },
        );
    } catch {
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }
}
