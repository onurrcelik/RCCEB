import { NextRequest, NextResponse } from 'next/server';
import { normalizeJobBoardPostInput, type JobBoardPost } from '@/app/lib/job-board';
import { notifyNewJobBoardPost } from '@/app/lib/job-board-notify';
import { checkRateLimit, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

const POST_SELECT = 'id, author_id, type, title, description, location, tags, status, closed_at, created_at, updated_at, share_token';
const AUTHOR_SELECT = 'id, name, avatar_url';

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...(init?.headers ?? {}),
        },
    });
}

export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const visibleSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let posts;
    try {
        ({ rows: posts } = await query<{ id: string; author_id: string; type: string; title: string; description: string; location: string | null; tags: unknown; status: string; closed_at: string | null; created_at: string; updated_at: string; share_token: string | null }>(
            `SELECT ${POST_SELECT} FROM job_board_posts WHERE status = 'open' OR closed_at >= $1`,
            [visibleSince],
        ));
    } catch {
        return jsonNoStore({ error: 'Failed to fetch Job Board posts' }, { status: 500 });
    }

    if (posts.length === 0) return jsonNoStore({ posts: [] });

    const authorIds = Array.from(new Set(posts.map(post => post.author_id)));
    const postIds = posts.map(post => post.id);

    let authors, companies, applications, referrals;
    try {
        [
            { rows: authors },
            { rows: companies },
            { rows: applications },
            { rows: referrals },
        ] = await Promise.all([
            query<{ id: string; name: string | null; avatar_url: string | null }>(
                `SELECT ${AUTHOR_SELECT} FROM members WHERE id = ANY($1)`, [authorIds],
            ),
            query<{ member_id: string; company_name: string | null }>(
                'SELECT member_id, company_name FROM member_companies WHERE member_id = ANY($1)', [authorIds],
            ),
            query<{ post_id: string; applicant_member_id: string }>(
                'SELECT post_id, applicant_member_id FROM job_board_applications WHERE post_id = ANY($1)', [postIds],
            ),
            query<{ post_id: string; referrer_member_id: string; note: string | null }>(
                `SELECT post_id, referrer_member_id, note FROM job_board_referrals
                 WHERE referred_member_id = $1 AND status = $2 AND post_id = ANY($3)`,
                [member.id, 'pending', postIds],
            ),
        ]);
    } catch {
        return jsonNoStore({ error: 'Failed to load Job Board details' }, { status: 500 });
    }

    // Resolve the names of members who referred the viewer, for the "X referred
    // you" banner. Referrers may not be post authors, so fetch them separately.
    const referrerIds = Array.from(new Set(referrals.map(referral => referral.referrer_member_id)));
    const referrerNameById = new Map<string, string>();
    if (referrerIds.length > 0) {
        const { rows: referrers } = await query<{ id: string; name: string | null }>(
            'SELECT id, name FROM members WHERE id = ANY($1)', [referrerIds],
        );
        for (const referrer of referrers) referrerNameById.set(referrer.id, referrer.name || 'An RCCEB member');
    }

    const authorById = new Map(authors.map(author => [author.id, author]));
    const companyByMemberId = new Map(companies.map(company => [company.member_id, company.company_name]));
    const applicationCountByPostId = new Map<string, number>();
    const viewerAppliedPostIds = new Set<string>();

    for (const application of applications) {
        applicationCountByPostId.set(application.post_id, (applicationCountByPostId.get(application.post_id) ?? 0) + 1);
        if (application.applicant_member_id === member.id) viewerAppliedPostIds.add(application.post_id);
    }

    const referralByPostId = new Map(referrals.map(referral => [referral.post_id, referral]));

    const result: JobBoardPost[] = posts
        .map(post => {
        const author = authorById.get(post.author_id);
        const isOwn = post.author_id === member.id;
        const referral = referralByPostId.get(post.id);

        return {
            id: post.id,
            type: post.type as JobBoardPost['type'],
            title: post.title,
            description: post.description,
            location: post.location,
            tags: Array.isArray(post.tags) ? post.tags : [],
            status: post.status as 'open' | 'closed',
            closed_at: post.closed_at,
            created_at: post.created_at,
            updated_at: post.updated_at,
            author: {
                id: post.author_id,
                name: author?.name || 'RCCEB member',
                avatar_url: author?.avatar_url ?? null,
                company_name: companyByMemberId.get(post.author_id) ?? null,
            },
            is_own: isOwn,
            viewer_applied: viewerAppliedPostIds.has(post.id),
            application_count: isOwn ? applicationCountByPostId.get(post.id) ?? 0 : 0,
            // Public share token — any member can build a "refer an outside friend"
            // link from it; only the owner sees applicant details.
            share_token: post.share_token ?? null,
            incoming_referral: referral && !isOwn
                ? { referrer_name: referrerNameById.get(referral.referrer_member_id) || 'An RCCEB member', note: referral.note ?? null }
                : null,
        };
    }).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'job' ? -1 : 1;
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    return jsonNoStore({ posts: result });
}

export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await checkRateLimit({
        limit: 10,
        windowMs: 60 * 60 * 1000,
        key: `job-board:create:${member.id}`,
    });
    if (!rateLimit.allowed) {
        return jsonNoStore({ error: 'Too many posts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rateLimit.resetAt)) } });
    }

    const body = await request.json().catch(() => ({}));
    const { value, error: validationError } = normalizeJobBoardPostInput(body);
    if (!value || validationError) {
        return jsonNoStore({ error: validationError || 'Invalid post' }, { status: 400 });
    }

    let data;
    try {
        ({ rows: [data] } = await query<{ id: string; type: string; title: string; description: string; location: string | null; [key: string]: unknown }>(
            `INSERT INTO job_board_posts (author_id, type, title, description, location, tags)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${POST_SELECT}`,
            [member.id, value.type, value.title, value.description, value.location, value.tags],
        ));
    } catch {
        return jsonNoStore({ error: 'Failed to create post' }, { status: 500 });
    }
    if (!data) return jsonNoStore({ error: 'Failed to create post' }, { status: 500 });

    // Email members who opted in to notifications for this post type. Delivery is
    // best-effort and never blocks the response from succeeding.
    try {
        const { rows: companyRows } = await query<{ company_name: string | null }>(
            'SELECT company_name FROM member_companies WHERE member_id = $1',
            [member.id],
        );
        const company = companyRows[0];

        await notifyNewJobBoardPost(
            {
                id: data.id,
                type: data.type as 'job' | 'need',
                title: data.title,
                description: data.description,
                location: data.location,
            },
            {
                id: member.id,
                name: member.name,
                company_name: company?.company_name ?? null,
            },
            `${getBaseUrl(request)}/members/dashboard?section=job-board`,
        );
    } catch (notifyError) {
        console.error('Job Board notification dispatch failed', notifyError);
    }

    return jsonNoStore({ post: data }, { status: 201 });
}
