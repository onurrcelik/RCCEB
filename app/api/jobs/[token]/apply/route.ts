import { NextRequest, NextResponse } from 'next/server';
import { normalizeExternalApplicationInput } from '@/app/lib/job-board';
import { notifyPosterNewApplication } from '@/app/lib/job-board-notify';
import { checkRateLimit, getClientIp, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

// Public (unauthenticated) application from an outside friend who followed a
// member's referral link (/jobs/<token>?ref=<referrer_member_id>).
export async function POST(request: NextRequest, { params }: RouteContext) {
    const { token } = await params;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rateLimit = await checkRateLimit({
        limit: 5,
        windowMs: 60 * 60 * 1000,
        key: `job-board:external-apply:${getClientIp(request)}`,
    });
    if (!rateLimit.allowed) {
        return NextResponse.json({ error: 'Too many applications. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rateLimit.resetAt)) } });
    }

    const body = await request.json().catch(() => ({}));
    const { value, error: validationError } = normalizeExternalApplicationInput(body);
    if (!value || validationError) {
        return NextResponse.json({ error: validationError || 'Invalid application' }, { status: 400 });
    }

    const { rows: postRows } = await query<{ id: string; author_id: string; title: string; status: string }>(
        'SELECT id, author_id, title, status FROM job_board_posts WHERE share_token = $1',
        [token],
    );
    const post = postRows[0];

    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (post.status !== 'open') return NextResponse.json({ error: 'This job is no longer open' }, { status: 409 });

    // Attribute to the referrer if the link carried a valid, referable member id.
    const ref = typeof body.ref === 'string' ? body.ref.trim() : '';
    let referrerId: string | null = null;
    let referrerName: string | null = null;
    if (uuid.test(ref) && ref !== post.author_id) {
        const { rows } = await query<{
            id: string;
            name: string | null;
            onboarding_complete: boolean;
            is_past_member: boolean;
        }>(
            'SELECT id, name, onboarding_complete, is_past_member FROM members WHERE id = $1',
            [ref],
        );
        const referrer = rows[0];
        if (referrer?.onboarding_complete && !referrer.is_past_member) {
            referrerId = referrer.id;
            referrerName = referrer.name ?? null;
        }
    }

    try {
        await query(
            `INSERT INTO job_board_applications
             (post_id, external_name, external_email, pitch, link, referred_by_member_id, referrer_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [post.id, value.name, value.email, value.pitch, value.link, referrerId, referrerName],
        );
    } catch {
        return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
    }

    try {
        const { rows } = await query<{ email: string | null; name: string | null }>(
            'SELECT email, name FROM members WHERE id = $1',
            [post.author_id],
        );
        const author = rows[0];
        if (author?.email) {
            await notifyPosterNewApplication(
                { email: author.email, name: author.name },
                { title: post.title, applicantName: value.name, referrerName },
                `${getBaseUrl(request)}/members/dashboard?section=job-board`,
            );
        }
    } catch (notifyError) {
        console.error('Job Board external application notification failed', notifyError);
    }

    return NextResponse.json({ ok: true });
}
