import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { normalizeCompanyDrafts, saveMemberCompanies } from '@/app/lib/companies';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const [{ rows: members }, { rows: companies }] = await Promise.all([
            query<{ id: string; name: string | null; email: string; avatar_url: string | null; bio: string | null; is_past_member: boolean | null }>(
                "SELECT id, name, email, avatar_url, bio, is_past_member FROM members WHERE name IS NOT NULL ORDER BY name ASC",
            ),
            query<{ member_id: string; company_name: string }>(
                `SELECT ca.member_id, string_agg(c.name, ', ' ORDER BY c.name) AS company_name
                 FROM company_affiliations ca
                 JOIN companies c ON c.id = ca.company_id
                 GROUP BY ca.member_id`,
            ),
        ]);

        const companyByMemberId = new Map(companies.map(company => [company.member_id, company.company_name]));
        return NextResponse.json({
            members: members.map(member => ({
                ...member,
                company_name: companyByMemberId.get(member.id) ?? null,
            })),
        });
    } catch {
        return NextResponse.json({ error: 'Failed to fetch company mappings' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const memberId = typeof body.member_id === 'string' ? body.member_id.trim() : '';
    const companyName = typeof body.company_name === 'string' ? body.company_name.trim() : '';

    if (!memberId || !companyName) {
        return NextResponse.json({ error: 'Member and company name are required' }, { status: 400 });
    }

    const drafts = companyName.split(/[,;\n]/).map((name: string) => ({ name: name.trim(), website: '', linkedin: '' })).filter((company: { name: string }) => company.name);
    const { companies, error } = normalizeCompanyDrafts(drafts, { requireRole: false, requireWebsite: false });
    if (error || !companies?.length) {
        return NextResponse.json({ error: error || 'Company name is required' }, { status: 400 });
    }

    try {
        await withTransaction(async (q) => {
            await saveMemberCompanies(q, memberId, companies);
        });
        return NextResponse.json({ company: { member_id: memberId, company_name: companies.map(company => company.name).join(', ') } });
    } catch {
        return NextResponse.json({ error: 'Failed to save company' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const memberId = new URL(request.url).searchParams.get('member_id');
    if (!memberId) return NextResponse.json({ error: 'Member is required' }, { status: 400 });

    try {
        await withTransaction(async (q) => {
            await saveMemberCompanies(q, memberId, []);
        });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to remove company' }, { status: 500 });
    }
}
