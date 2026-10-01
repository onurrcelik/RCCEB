import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';
import { PERKS } from '@/app/members/dashboard/perks/perks-data';
import { sendPerkInterestNotification } from '@/app/api/members/perks/send-notification';

export const dynamic = 'force-dynamic';

const VALID_PERK_IDS = new Set(PERKS.map(perk => perk.id));

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
        const { rows } = await query<{ perk_id: string }>('SELECT perk_id FROM perk_interests WHERE member_id = $1', [member.id]);
        return jsonNoStore({ perkIds: rows.map(row => row.perk_id) });
    } catch {
        return jsonNoStore({ error: 'Failed to load perk interests' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const perkId = typeof body.perkId === 'string' ? body.perkId : '';
    const interested = body.interested === true;

    if (!VALID_PERK_IDS.has(perkId)) return jsonNoStore({ error: 'Unknown perk' }, { status: 400 });

    if (!interested) {
        try {
            await query('DELETE FROM perk_interests WHERE perk_id = $1 AND member_id = $2', [perkId, member.id]);
        } catch {
            return jsonNoStore({ error: 'Failed to save interest' }, { status: 500 });
        }
        return jsonNoStore({ interested });
    }

    // ON CONFLICT DO NOTHING + RETURNING tells us whether this is a first-time interest:
    // a member re-tapping one they already have comes back empty, and must not re-notify.
    let inserted;
    try {
        ({ rows: inserted } = await query<{ perk_id: string }>(
            'INSERT INTO perk_interests (perk_id, member_id) VALUES ($1, $2) ON CONFLICT (perk_id, member_id) DO NOTHING RETURNING perk_id',
            [perkId, member.id],
        ));
    } catch {
        return jsonNoStore({ error: 'Failed to save interest' }, { status: 500 });
    }

    if (inserted.length > 0) {
        const perk = PERKS.find(p => p.id === perkId)!;
        // Fire-and-forget: the member's tap is already saved, and a mail failure must not
        // turn into a failed save they'd have to retry.
        sendPerkInterestNotification(perk, {
            name: member.name,
            email: member.email,
            phone: member.phone,
            linkedin: member.linkedin,
            location: member.location,
        }).catch(err => console.error('Failed to send perk interest notification:', err));
    }

    return jsonNoStore({ interested });
}
