import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type CompanyMember = {
    id: string;
    name: string | null;
    avatar_url: string | null;
    linkedin: string | null;
    graduation_year: number | null;
    categories: string[] | null;
    is_past_member: boolean | null;
    role: string | null;
};

type CompanyRow = {
    id: string;
    name: string;
    website: string | null;
    linkedin: string | null;
    members: CompanyMember[];
};

// GET /api/members/companies — companies members can reach through the Bond.
export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { rows } = await query<CompanyRow>(
            `SELECT c.id, c.name, c.website, c.linkedin,
                    json_agg(json_build_object(
                        'id', m.id,
                        'name', m.name,
                        'avatar_url', m.avatar_url,
                        'linkedin', m.linkedin,
                        'graduation_year', m.graduation_year,
                        'categories', m.categories,
                        'is_past_member', m.is_past_member,
                        'role', ca.role
                    ) ORDER BY m.name) AS members
             FROM companies c
             JOIN company_affiliations ca ON ca.company_id = c.id
             JOIN members m ON m.id = ca.member_id
             WHERE m.name IS NOT NULL AND m.onboarding_complete = true
             GROUP BY c.id
             ORDER BY c.name`,
        );
        return NextResponse.json(
            { companies: rows },
            { headers: { 'Cache-Control': 'no-store, max-age=0' } },
        );
    } catch {
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
    }
}
