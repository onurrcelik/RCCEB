import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query, withTransaction } from '@/app/lib/db';
import { normalizeMemberUpdates } from '@/app/lib/member-validation';
import { normalizeCompanyDrafts, saveMemberCompanies } from '@/app/lib/companies';

const PROFILE_FIELDS = ['name', 'bio', 'linkedin', 'location', 'instagram', 'twitter', 'website', 'member_types', 'github', 'favorite_resource', 'occupation_link', 'phone', 'graduation_year', 'can_help_with', 'working_on', 'expertise', 'education'];

function missingProfile(updates: Record<string, unknown> | undefined): string | null {
    if (!updates?.name || !updates.bio || !updates.can_help_with || !updates.working_on || !updates.education || !updates.favorite_resource) {
        return 'Bio, what you can help with, what you are working on, education, and a favorite source are required';
    }
    if (!Array.isArray(updates.expertise) || updates.expertise.length === 0) {
        return 'Pick at least one expertise tag';
    }
    return null;
}

// POST /api/members/onboarding — save profile details (step 1 of onboarding)
export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { updates, error: validationError } = normalizeMemberUpdates(body, PROFILE_FIELDS);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const profileError = missingProfile(updates);
    if (profileError) return NextResponse.json({ error: profileError }, { status: 400 });

    const { companies, error: companyError } = normalizeCompanyDrafts(body.companies);
    if (companyError) return NextResponse.json({ error: companyError }, { status: 400 });
    if (!companies || companies.length === 0) {
        return NextResponse.json({ error: 'Add at least one company you are affiliated with' }, { status: 400 });
    }

    // Column names come only from the hardcoded `PROFILE_FIELDS` list above (never raw
    // body keys), so they're safe to interpolate — can't be bind params anyway.
    const columns = Object.keys(updates!);
    const setClause = [...columns.map((col, i) => `${col} = $${i + 2}`), 'updated_at = now()'].join(', ');
    const values = columns.map((col) => (updates as Record<string, unknown>)[col]);

    try {
        await withTransaction(async (q) => {
            await q(
                `UPDATE members SET ${setClause} WHERE id = $1`,
                [member.id, ...values],
            );
            await saveMemberCompanies(q, member.id, companies);
        });
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

    if (!member.name || !member.bio || !member.can_help_with || !member.working_on || !member.education || !member.favorite_resource || !member.expertise?.length) {
        return NextResponse.json({ error: 'Please complete your profile first' }, { status: 400 });
    }

    const { rows } = await query<{ ok: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM company_affiliations WHERE member_id = $1) AS ok',
        [member.id],
    );
    if (!rows[0]?.ok) {
        return NextResponse.json({ error: 'Add at least one company before finishing' }, { status: 400 });
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
