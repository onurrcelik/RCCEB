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
            `SELECT m.id, m.name, m.bio, m.avatar_url, m.member_types, m.linkedin, m.location, m.instagram, m.twitter, m.github, m.favorite_resource, m.occupation_link, m.graduation_year, m.categories, m.is_past_member, m.created_at,
                    m.can_help_with, m.working_on, m.expertise, m.education,
                    COALESCE(aff.companies, '[]'::json) AS companies
             FROM members m
             LEFT JOIN LATERAL (
                 SELECT json_agg(json_build_object(
                     'id', c.id, 'name', c.name, 'role', ca.role, 'website', c.website, 'linkedin', c.linkedin
                 ) ORDER BY c.name) AS companies
                 FROM company_affiliations ca
                 JOIN companies c ON c.id = ca.company_id
                 WHERE ca.member_id = m.id
             ) aff ON true
             WHERE m.name IS NOT NULL AND m.onboarding_complete = true
             ORDER BY m.created_at DESC`,
        );
        return NextResponse.json(
            { members: rows },
            { headers: { 'Cache-Control': 'no-store, max-age=0' } },
        );
    } catch {
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }
}
