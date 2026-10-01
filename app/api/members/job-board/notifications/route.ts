import { NextRequest, NextResponse } from 'next/server';
import { normalizeJobBoardSubscription, type JobBoardSubscription } from '@/app/lib/job-board';
import { getMemberFromRequest } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

const DEFAULT_SUBSCRIPTION: JobBoardSubscription = { notify_jobs: false, notify_needs: false };

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

    try {
        const { rows } = await query<{ notify_jobs: boolean; notify_needs: boolean }>(
            'SELECT notify_jobs, notify_needs FROM job_board_subscriptions WHERE member_id = $1',
            [member.id],
        );
        const data = rows[0];
        return jsonNoStore({
            subscription: {
                notify_jobs: data?.notify_jobs ?? DEFAULT_SUBSCRIPTION.notify_jobs,
                notify_needs: data?.notify_needs ?? DEFAULT_SUBSCRIPTION.notify_needs,
            },
        });
    } catch {
        return jsonNoStore({ error: 'Failed to load notification settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const subscription = normalizeJobBoardSubscription(body);

    try {
        await query(
            `INSERT INTO job_board_subscriptions (member_id, notify_jobs, notify_needs, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (member_id) DO UPDATE SET notify_jobs = EXCLUDED.notify_jobs, notify_needs = EXCLUDED.notify_needs, updated_at = EXCLUDED.updated_at`,
            [member.id, subscription.notify_jobs, subscription.notify_needs],
        );
        return jsonNoStore({ subscription });
    } catch {
        return jsonNoStore({ error: 'Failed to save notification settings' }, { status: 500 });
    }
}
