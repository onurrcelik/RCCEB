import { NextRequest, NextResponse } from 'next/server';
import { normalizeReferralNote } from '@/app/lib/job-board';
import { notifyMemberReferred } from '@/app/lib/job-board-notify';
import { checkRateLimit, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';
import { getMemberFromRequest } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await checkRateLimit({
        limit: 30,
        windowMs: 60 * 60 * 1000,
        key: `job-board:refer:${member.id}`,
    });
    if (!rateLimit.allowed) {
        return NextResponse.json({ error: 'Too many referrals. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rateLimit.resetAt)) } });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const referredMemberId = typeof body.referred_member_id === 'string' ? body.referred_member_id : '';
    if (!referredMemberId) return NextResponse.json({ error: 'Choose someone to refer' }, { status: 400 });
    if (referredMemberId === member.id) return NextResponse.json({ error: 'You cannot refer yourself' }, { status: 400 });

    const note = normalizeReferralNote(body.note);
    if (note.error) return NextResponse.json({ error: note.error }, { status: 400 });

    const { rows: postRows } = await query<{ id: string; author_id: string; title: string; status: string }>(
        `SELECT p.id, p.author_id, p.title, p.status FROM job_board_posts p
         WHERE p.id = $1`,
        [id],
    );
    const post = postRows[0];

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (post.status !== 'open') return NextResponse.json({ error: 'This post is closed' }, { status: 409 });
    if (post.author_id === referredMemberId) return NextResponse.json({ error: 'That member posted this job' }, { status: 400 });

    const { rows: referredRows } = await query<{ id: string; name: string | null; email: string | null; onboarding_complete: boolean; is_past_member: boolean }>(
        'SELECT id, name, email, onboarding_complete, is_past_member FROM members WHERE id = $1',
        [referredMemberId],
    );
    const referred = referredRows[0];

    if (!referred) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (!referred.onboarding_complete || referred.is_past_member) {
        return NextResponse.json({ error: 'That member cannot be referred right now' }, { status: 400 });
    }

    try {
        await query(
            `INSERT INTO job_board_referrals (post_id, referrer_member_id, referred_member_id, note) VALUES ($1, $2, $3, $4)`,
            [id, member.id, referredMemberId, note.value],
        );
    } catch (error: unknown) {
        if ((error as { code?: string } | undefined)?.code === '23505') return NextResponse.json({ error: 'This person has already been referred to this job' }, { status: 409 });
        return NextResponse.json({ error: 'Failed to save referral' }, { status: 500 });
    }

    try {
        if (referred.email) {
            await notifyMemberReferred(
                { email: referred.email, name: referred.name },
                { title: post.title, referrerName: member.name || 'An RCCEB member', note: note.value },
                `${getBaseUrl(request)}/members/dashboard?section=job-board`,
            );
        }
    } catch (notifyError) {
        console.error('Job Board referral notification failed', notifyError);
    }

    return NextResponse.json({ ok: true });
}
