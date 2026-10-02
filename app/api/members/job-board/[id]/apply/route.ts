import { NextRequest, NextResponse } from 'next/server';
import { normalizeApplicationInput } from '@/app/lib/job-board';
import { notifyPosterNewApplication } from '@/app/lib/job-board-notify';
import { checkRateLimit, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await checkRateLimit({
        limit: 30,
        windowMs: 60 * 60 * 1000,
        key: `job-board:apply:${member.id}`,
    });
    if (!rateLimit.allowed) {
        return NextResponse.json({ error: 'Too many applications. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rateLimit.resetAt)) } });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { value, error: validationError } = normalizeApplicationInput(body);
    if (!value || validationError) {
        return NextResponse.json({ error: validationError || 'Invalid application' }, { status: 400 });
    }

    const { rows: postRows } = await query<{ id: string; author_id: string; title: string; status: string }>(
        `SELECT p.id, p.author_id, p.title, p.status FROM job_board_posts p
         WHERE p.id = $1`,
        [id],
    );
    const post = postRows[0];

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (post.author_id === member.id) return NextResponse.json({ error: 'You cannot apply to your own post' }, { status: 400 });
    if (post.status !== 'open') return NextResponse.json({ error: 'This post is closed' }, { status: 409 });

    try {
        await query(
            `INSERT INTO job_board_applications (post_id, applicant_member_id, pitch, link)
             VALUES ($1, $2, $3, $4)`,
            [id, member.id, value.pitch, value.link],
        );
    } catch (error: unknown) {
        // Unique index violation → the member already applied.
        if ((error as { code?: string } | undefined)?.code === '23505') return NextResponse.json({ error: 'You have already applied to this post' }, { status: 409 });
        return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
    }

    try {
        const { rows: authorRows } = await query<{ email: string | null; name: string | null }>(
            'SELECT email, name FROM members WHERE id = $1', [post.author_id],
        );
        const author = authorRows[0];
        if (author?.email) {
            await notifyPosterNewApplication(
                { email: author.email, name: author.name },
                { title: post.title, applicantName: member.name || 'An RCCEB member' },
                `${getBaseUrl(request)}/members/dashboard?section=job-board`,
            );
        }
    } catch (notifyError) {
        console.error('Job Board application notification failed', notifyError);
    }

    return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    try {
        await query('DELETE FROM job_board_applications WHERE post_id = $1 AND applicant_member_id = $2', [id, member.id]);
    } catch {
        return NextResponse.json({ error: 'Failed to withdraw application' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
