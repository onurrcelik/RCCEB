import { NextRequest, NextResponse } from 'next/server';
import type { JobBoardApplication } from '@/app/lib/job-board';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Ownership gate — only the post author can see who applied.
    const { rows: postRows } = await query<{ id: string }>(
        'SELECT id FROM job_board_posts WHERE id = $1 AND author_id = $2',
        [id, member.id],
    );
    if (!postRows[0]) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    let applications;
    try {
        ({ rows: applications } = await query<{ id: string; applicant_member_id: string; pitch: string; link: string | null; created_at: string }>(
            `SELECT a.id, a.applicant_member_id, a.pitch, a.link, a.created_at
             FROM job_board_applications a
             WHERE a.post_id = $1
             ORDER BY a.created_at DESC`,
            [id],
        ));
    } catch {
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
    }
    if (!applications.length) return NextResponse.json({ applications: [] });

    const memberIds = Array.from(new Set(applications.map(application => application.applicant_member_id)));

    const membersById = new Map<string, { name: string | null; avatar_url: string | null; email: string | null; phone: string | null; linkedin: string | null; bio: string | null }>();
    const companyByMemberId = new Map<string, string>();
    if (memberIds.length > 0) {
        const [{ rows: applicants }, { rows: companies }] = await Promise.all([
            query<{ id: string; name: string | null; avatar_url: string | null; email: string | null; phone: string | null; linkedin: string | null; bio: string | null }>(
                'SELECT id, name, avatar_url, email, phone, linkedin, bio FROM members WHERE id = ANY($1)', [memberIds],
            ),
            query<{ member_id: string; company_name: string }>(
                `SELECT ca.member_id, string_agg(c.name, ', ' ORDER BY c.name) AS company_name
                 FROM company_affiliations ca
                 JOIN companies c ON c.id = ca.company_id
                 WHERE ca.member_id = ANY($1)
                 GROUP BY ca.member_id`, [memberIds],
            ),
        ]);
        for (const applicant of applicants) membersById.set(applicant.id, applicant);
        for (const company of companies) companyByMemberId.set(company.member_id, company.company_name);
    }

    const result: JobBoardApplication[] = applications.map(application => {
        const profile = membersById.get(application.applicant_member_id);
        return {
            id: application.id,
            applicant: {
                member_id: application.applicant_member_id,
                name: profile?.name || 'Applicant',
                avatar_url: profile?.avatar_url ?? null,
                company_name: companyByMemberId.get(application.applicant_member_id) ?? null,
                email: profile?.email ?? null,
                phone: profile?.phone ?? null,
                linkedin: profile?.linkedin ?? null,
                bio: profile?.bio ?? null,
            },
            pitch: application.pitch,
            link: application.link ?? null,
            created_at: application.created_at,
        };
    });

    return NextResponse.json({ applications: result });
}
