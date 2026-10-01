import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { query } from '@/app/lib/db';
import { getBaseUrl } from '@/app/lib/site-url';
import { createMatchRound, loadMatchPool, nextMonday, notifyRoundMembers } from '@/app/lib/matching';

// Sunday's half of the weekly 1-on-1 cycle: open the round, seed the whole pool into it,
// and email everyone that they're in with a link to sit the week out. Monday's half —
// running the match and sending intro emails — stays manual in the admin dashboard.
//
// Scheduled for 13:00 Istanbul on Sundays; see the crontab line in the README.
//
// This path sits outside /api/admin and /api/members, so proxy.ts does not gate it and
// the shared secret below is the only thing standing in front of an email to every member.

function authorized(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    // Fail closed: with no secret configured there is no way to authorise the call.
    if (!secret) return false;

    const header = request.headers.get('authorization');
    const given = header?.startsWith('Bearer ') ? header.slice(7) : request.headers.get('x-cron-secret');
    if (!given) return false;

    const expected = Buffer.from(secret);
    const actual = Buffer.from(given);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function openWeeklyRound(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A round already open means either a retry of this same schedule or an admin who
    // opened one by hand. Either way, opening a second one would split the pool across
    // two rounds and email everybody twice.
    const { rows: existingRows } = await query<{ id: string; week_of: string }>(
        "SELECT id, week_of FROM match_rounds WHERE status = 'open' LIMIT 1",
    );
    const existing = existingRows[0] ?? null;

    // ?dry_run=1 answers "is this wired up correctly" without opening a round or sending
    // anything. It is the only way to confirm the secret is configured: a plain call with
    // no secret and a call to a server with no secret set both return 401 alike, and the
    // real path emails the whole pool. Reads only — no inserts, no email.
    if (request.nextUrl.searchParams.get('dry_run')) {
        const pool = await loadMatchPool();
        return NextResponse.json({
            ok: true,
            dryRun: true,
            secretConfigured: true,
            wouldSkip: Boolean(existing),
            openRound: existing ?? null,
            wouldOpenWeekOf: existing ? null : nextMonday(),
            wouldSeedAndEmail: existing ? 0 : pool.uniqueIds.length,
        });
    }

    if (existing) {
        return NextResponse.json({ ok: true, skipped: 'a round is already open', round: existing });
    }

    const { round, seeded } = await createMatchRound();
    if (!round) return NextResponse.json({ error: 'Failed to create round' }, { status: 500 });

    const { sent, failed } = await notifyRoundMembers(getBaseUrl(request));

    return NextResponse.json({ ok: true, round, seeded, sent, failed });
}

// Both verbs, since schedulers differ on which they use for a fire-and-forget call.
export const POST = openWeeklyRound;
export const GET = openWeeklyRound;
