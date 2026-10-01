import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';

const MAX_COMPANY_NAME_LENGTH = 120;

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const [{ rows: members }, { rows: companies }] = await Promise.all([
            query<{ id: string; name: string | null; email: string; avatar_url: string | null; bio: string | null; is_past_member: boolean | null }>(
                "SELECT id, name, email, avatar_url, bio, is_past_member FROM members WHERE name IS NOT NULL ORDER BY name ASC",
            ),
            query<{ member_id: string; company_name: string; updated_at: string }>(
                'SELECT member_id, company_name, updated_at FROM member_companies',
            ),
        ]);

        const companyByMemberId = new Map(companies.map(company => [company.member_id, company]));
        return NextResponse.json({
            members: members.map(member => ({
                ...member,
                company_name: companyByMemberId.get(member.id)?.company_name ?? null,
                company_updated_at: companyByMemberId.get(member.id)?.updated_at ?? null,
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
    if (companyName.length > MAX_COMPANY_NAME_LENGTH) {
        return NextResponse.json({ error: 'Company name is too long' }, { status: 400 });
    }

    const now = new Date().toISOString();
    try {
        const { rows } = await query<{ member_id: string; company_name: string; updated_at: string }>(
            `INSERT INTO member_companies (member_id, company_name, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (member_id) DO UPDATE SET company_name = EXCLUDED.company_name, updated_at = EXCLUDED.updated_at
             RETURNING member_id, company_name, updated_at`,
            [memberId, companyName, now],
        );
        return NextResponse.json({ company: rows[0] });
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
        await query('DELETE FROM member_companies WHERE member_id = $1', [memberId]);
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to remove company' }, { status: 500 });
    }
}
