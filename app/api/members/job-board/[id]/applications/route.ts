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
        ({ rows: applications } = await query<{ id: string; applicant_member_id: string | null; external_name: string | null; external_email: string | null; pitch: string; link: string | null; referrer_name: string | null; created_at: string }>(
            `SELECT a.id, a.applicant_member_id, a.external_name, a.external_email, a.pitch, a.link,
                    a.referrer_name, a.created_at
             FROM job_board_applications a
             WHERE a.post_id = $1
             ORDER BY a.created_at DESC`,
            [id],
        ));
    } catch {
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
    }
    if (!applications.length) return NextResponse.json({ applications: [] });

    const memberIds = Array.from(new Set(
        applications.map(application => application.applicant_member_id).filter((value): value is string => Boolean(value)),
    ));

    const membersById = new Map<string, { name: string | null; avatar_url: string | null; email: string | null; phone: string | null; linkedin: string | null; bio: string | null }>();
    const companyByMemberId = new Map<string, string>();
    if (memberIds.length > 0) {
        const [{ rows: applicants }, { rows: companies }] = await Promise.all([
            query<{ id: string; name: string | null; avatar_url: string | null; email: string | null; phone: string | null; linkedin: string | null; bio: string | null }>(
                'SELECT id, name, avatar_url, email, phone, linkedin, bio FROM members WHERE id = ANY($1)', [memberIds],
            ),
            query<{ member_id: string; company_name: string }>(
                'SELECT member_id, company_name FROM member_companies WHERE member_id = ANY($1)', [memberIds],
            ),
        ]);
        for (const applicant of applicants) membersById.set(applicant.id, applicant);
        for (const company of companies) companyByMemberId.set(company.member_id, company.company_name);
    }

    const result: JobBoardApplication[] = applications.map(application => {
        const profile = application.applicant_member_id ? membersById.get(application.applicant_member_id) : undefined;
        const isExternal = !application.applicant_member_id;
        return {
            id: application.id,
            applicant: {
                member_id: application.applicant_member_id ?? null,
                name: (isExternal ? application.external_name : profile?.name) || 'Applicant',
                avatar_url: profile?.avatar_url ?? null,
                company_name: application.applicant_member_id ? companyByMemberId.get(application.applicant_member_id) ?? null : null,
                email: isExternal ? application.external_email ?? null : profile?.email ?? null,
                phone: profile?.phone ?? null,
                linkedin: profile?.linkedin ?? null,
                bio: profile?.bio ?? null,
                is_external: isExternal,
            },
            pitch: application.pitch,
            link: application.link ?? null,
            referred_by_name: application.referrer_name ?? null,
            created_at: application.created_at,
        };
    });

    return NextResponse.json({ applications: result });
}
