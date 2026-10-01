import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query, withTransaction } from '@/app/lib/db';
import { normalizeMemberUpdates, SAFE_MEMBER_SELECT, sanitizeMemberForClient, type InternalMember } from '@/app/lib/member-validation';
import { listMemberCompanies, normalizeCompanyDrafts, saveMemberCompanies } from '@/app/lib/companies';

// Join already asked for name, phone, LinkedIn, class year and pathway. If the
// member row is still blank, show the application answers so onboarding does not
// ask for them again.
async function withApplicationDefaults(member: InternalMember): Promise<InternalMember> {
    const needsName = !member.name?.trim();
    const needsPhone = !member.phone?.trim();
    const needsLinkedin = !member.linkedin?.trim();
    const needsYear = !member.graduation_year;
    const needsPathway = !member.categories?.length;
    if (!needsName && !needsPhone && !needsLinkedin && !needsYear && !needsPathway) return member;

    const { rows } = await query<{ name: string; phone: string; linkedin: string | null; graduation_year: number | null; categories: string[] }>(
        `SELECT name, phone, linkedin, graduation_year, categories
         FROM applications
         WHERE lower(email) = lower($1)
         ORDER BY created_at DESC
         LIMIT 1`,
        [member.email],
    );
    const application = rows[0];
    if (!application) return member;

    return {
        ...member,
        name: needsName ? application.name : member.name,
        phone: needsPhone ? application.phone || member.phone : member.phone,
        linkedin: needsLinkedin ? application.linkedin : member.linkedin,
        graduation_year: needsYear ? application.graduation_year : member.graduation_year,
        categories: needsPathway ? application.categories : member.categories,
    };
}

// GET /api/members/profile — get own profile
export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const companies = await listMemberCompanies(member.id);
    return NextResponse.json({ member: sanitizeMemberForClient(await withApplicationDefaults(member)), companies });
}

// PATCH /api/members/profile — update own profile
export async function PATCH(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const allowed = ['name', 'bio', 'linkedin', 'location', 'instagram', 'twitter', 'website', 'member_types', 'github', 'favorite_resource', 'occupation_link', 'phone', 'graduation_year', 'can_help_with', 'working_on', 'expertise', 'education'];
    const { updates, error: validationError } = normalizeMemberUpdates(body, allowed);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const companies = body.companies === undefined
        ? undefined
        : normalizeCompanyDrafts(body.companies);
    if (companies?.error) return NextResponse.json({ error: companies.error }, { status: 400 });
    if (companies && companies.companies && companies.companies.length === 0) {
        return NextResponse.json({ error: 'Add at least one company you are affiliated with' }, { status: 400 });
    }

    // Column names come only from the hardcoded `allowed` list above (never raw
    // body keys), so they're safe to interpolate — can't be bind params anyway.
    const columns = Object.keys(updates!);
    const setClause = columns.length > 0
        ? [...columns.map((col, i) => `${col} = $${i + 2}`), 'updated_at = now()'].join(', ')
        : 'updated_at = now()';
    const values = columns.map((col) => (updates as Record<string, unknown>)[col]);

    try {
        const saved = await withTransaction(async (q) => {
            const { rows } = await q(
                `UPDATE members SET ${setClause} WHERE id = $1 RETURNING ${SAFE_MEMBER_SELECT}`,
                [member.id, ...values],
            );
            if (companies?.companies) await saveMemberCompanies(q, member.id, companies.companies);
            return rows[0];
        });
        const savedCompanies = await listMemberCompanies(member.id);
        return NextResponse.json({ member: saved, companies: savedCompanies });
    } catch {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
