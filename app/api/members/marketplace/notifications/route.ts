import { NextRequest, NextResponse } from 'next/server';
import { normalizeMarketplaceSubscription, type MarketplaceSubscription } from '@/app/lib/marketplace';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

const DEFAULT_SUBSCRIPTION: MarketplaceSubscription = { notify_asks: false, notify_offers: false };

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
        const { rows } = await query<MarketplaceSubscription>(
            'SELECT notify_asks, notify_offers FROM marketplace_subscriptions WHERE member_id = $1',
            [member.id],
        );
        return jsonNoStore({ subscription: rows[0] ?? DEFAULT_SUBSCRIPTION });
    } catch {
        return jsonNoStore({ error: 'Failed to load notification settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const subscription = normalizeMarketplaceSubscription(body);

    try {
        await query(
            `INSERT INTO marketplace_subscriptions (member_id, notify_asks, notify_offers, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (member_id) DO UPDATE SET notify_asks = EXCLUDED.notify_asks, notify_offers = EXCLUDED.notify_offers, updated_at = EXCLUDED.updated_at`,
            [member.id, subscription.notify_asks, subscription.notify_offers],
        );
        return jsonNoStore({ subscription });
    } catch {
        return jsonNoStore({ error: 'Failed to save notification settings' }, { status: 500 });
    }
}
