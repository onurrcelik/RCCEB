import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';
import { isMatchEligible } from '@/app/lib/categories';
import { pendingMetAsks } from '@/app/lib/match-confirm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MetRow = { round_id: string; member_id: string; confirmed_met: boolean | null };

// Whether a pair met, treated as a fact about the pair rather than about one member: the
// member's own answer wins, and their partner's fills in when they never gave one. Only
// about a quarter of matches ever get both sides' confirmation, so without the fallback
// most rows would read as unanswered.
function metResolver(rows: MetRow[]) {
    const byKey = new Map(rows.map(row => [`${row.round_id}:${row.member_id}`, row.confirmed_met]));
    return (roundId: string, selfId: string, partnerId: string) =>
        byKey.get(`${roundId}:${selfId}`) ?? byKey.get(`${roundId}:${partnerId}`) ?? null;
}


// GET — return current round state for the logged-in member
export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const eligible = isMatchEligible(member);

    const { rows: rounds } = await query<{ id: string; week_of: string | null; status: string }>(
        'SELECT * FROM match_rounds ORDER BY created_at DESC LIMIT 1',
    );

    const currentRound = rounds[0] ?? null;

    // My response for the current round
    let myResponse = null;
    if (currentRound) {
        const { rows } = await query(
            'SELECT * FROM match_responses WHERE round_id = $1 AND member_id = $2',
            [currentRound.id, member.id],
        );
        myResponse = rows[0] ?? null;
    }

    // My match for the current round (only relevant once status = matched)
    let myCurrentMatch = null;
    let isOpener: boolean | null = null;
    if (currentRound?.status === 'matched') {
        const { rows: matches } = await query(
            'SELECT * FROM matches WHERE round_id = $1 AND (member1_id = $2 OR member2_id = $2)',
            [currentRound.id, member.id],
        );
        const match = matches[0] ?? null;

        if (match) {
            const partnerId = match.member1_id === member.id ? match.member2_id : match.member1_id;
            isOpener = match.opener_member_id != null ? match.opener_member_id === member.id : null;
            const { rows: partners } = await query<{ id: string; [key: string]: unknown }>(
                'SELECT id, name, email, phone, bio, linkedin, github, location, avatar_url, member_types, twitter, instagram, favorite_resource, occupation_link, batch, is_past_member, created_at FROM members WHERE id = $1',
                [partnerId],
            );
            myCurrentMatch = partners[0] ?? null;
        }
    }

    // Pending confirmation: did I have a match last round that nobody has answered for?
    //
    // pendingMetAsks owns this question so the portal, Sunday's email and Monday's email
    // all agree on who still owes an answer. Two things it fixes over asking here: it finds
    // the last round that actually produced pairs rather than assuming that's the
    // second-newest round, and it stays quiet once the partner has answered, since whether
    // a pair met is a fact about the pair and being asked for an answer that already exists
    // is how members learn to ignore the card.
    let pendingConfirmation = null;
    const ask = (await pendingMetAsks([member.id], currentRound?.id)).get(member.id);
    if (ask) {
        const { rows: partners } = await query(
            'SELECT id, name, avatar_url FROM members WHERE id = $1',
            [ask.partnerId],
        );
        pendingConfirmation = partners[0] ? { round_id: ask.roundId, member: partners[0] } : null;
    }

    // My full match history (all rounds, excluding the current one)
    const { rows: allMyMatches } = await query<{ id: string; round_id: string; member1_id: string; member2_id: string }>(
        'SELECT id, round_id, member1_id, member2_id FROM matches WHERE member1_id = $1 OR member2_id = $1',
        [member.id],
    );

    const pastMyMatches = allMyMatches.filter(m => m.round_id !== currentRound?.id);

    type HistoryPartner = { id: string; name: string; bio?: string; avatar_url?: string; member_types?: string; linkedin?: string; location?: string; twitter?: string; instagram?: string; github?: string; favorite_resource?: string; occupation_link?: string; batch?: number | null; is_past_member?: boolean; created_at?: string };
    type HistoryEntry = { round_id: string; week_of: string; partner: HistoryPartner; confirmed_met: boolean | null };
    let matchHistory: HistoryEntry[] = [];

    if (pastMyMatches.length > 0) {
        const roundIds = [...new Set(pastMyMatches.map(m => m.round_id))];
        const partnerIds = [...new Set(pastMyMatches.map(m => m.member1_id === member.id ? m.member2_id : m.member1_id))];

        const [roundsRes, partnersRes, responsesRes] = await Promise.all([
            query('SELECT id, week_of FROM match_rounds WHERE id = ANY($1)', [roundIds]),
            query('SELECT id, name, bio, avatar_url, member_types, linkedin, location, twitter, instagram, github, favorite_resource, occupation_link, batch, is_past_member, created_at FROM members WHERE id = ANY($1)', [partnerIds]),
            query('SELECT round_id, member_id, confirmed_met FROM match_responses WHERE member_id = ANY($1) AND round_id = ANY($2)', [[member.id, ...partnerIds], roundIds]),
        ]);

        const roundMap = new Map(roundsRes.rows.map(r => [r.id, r.week_of]));
        const partnerMap = new Map(partnersRes.rows.map(p => [p.id, p]));
        const metFor = metResolver(responsesRes.rows as MetRow[]);

        matchHistory = (pastMyMatches
            .map(m => {
                const partnerId = m.member1_id === member.id ? m.member2_id : m.member1_id;
                const partner = partnerMap.get(partnerId);
                if (!partner) return null;
                return { round_id: m.round_id as string, week_of: (roundMap.get(m.round_id) || '') as string, partner: partner as HistoryPartner, confirmed_met: metFor(m.round_id, member.id, partnerId) };
            })
            .filter(e => e !== null) as HistoryEntry[])
            .sort((a, b) => b.week_of.localeCompare(a.week_of));
    }

    // Current match partner's previous matches, each carrying whether that meeting actually
    // happened — so you can see how reliably the person you've been paired with shows up.
    type PartnerHistoryEntry = { round_id: string; week_of: string; partner: HistoryPartner; confirmed_met: boolean | null };
    let currentMatchHistory: PartnerHistoryEntry[] = [];

    if (myCurrentMatch) {
        const { rows: partnerAllMatches } = await query<{ id: string; round_id: string; member1_id: string; member2_id: string }>(
            'SELECT id, round_id, member1_id, member2_id FROM matches WHERE member1_id = $1 OR member2_id = $1',
            [myCurrentMatch.id],
        );

        const partnerPastMatches = partnerAllMatches.filter(m => m.round_id !== currentRound?.id);

        if (partnerPastMatches.length > 0) {
            const proundIds = [...new Set(partnerPastMatches.map(m => m.round_id))];
            const ppIds = [...new Set(partnerPastMatches.map(m => m.member1_id === myCurrentMatch.id ? m.member2_id : m.member1_id))];

            const [proundsRes, ppRes, pResponsesRes] = await Promise.all([
                query('SELECT id, week_of FROM match_rounds WHERE id = ANY($1)', [proundIds]),
                query('SELECT id, name, bio, avatar_url, member_types, linkedin, location, twitter, instagram, github, favorite_resource, occupation_link, batch, is_past_member, created_at FROM members WHERE id = ANY($1)', [ppIds]),
                query('SELECT round_id, member_id, confirmed_met FROM match_responses WHERE member_id = ANY($1) AND round_id = ANY($2)', [[myCurrentMatch.id, ...ppIds], proundIds]),
            ]);

            const pRoundMap = new Map(proundsRes.rows.map(r => [r.id, r.week_of]));
            const ppMap = new Map(ppRes.rows.map(p => [p.id, p]));
            const pMetFor = metResolver(pResponsesRes.rows as MetRow[]);

            currentMatchHistory = (partnerPastMatches
                .map(m => {
                    const ppId = m.member1_id === myCurrentMatch.id ? m.member2_id : m.member1_id;
                    const partner = ppMap.get(ppId);
                    if (!partner) return null;
                    return { round_id: m.round_id as string, week_of: (pRoundMap.get(m.round_id) || '') as string, partner: partner as HistoryPartner, confirmed_met: pMetFor(m.round_id, myCurrentMatch.id, ppId) };
                })
                .filter(e => e !== null) as PartnerHistoryEntry[])
                .sort((a, b) => b.week_of.localeCompare(a.week_of));
        }
    }

    return NextResponse.json({ eligible, currentRound, myResponse, myCurrentMatch, isOpener, pendingConfirmation, matchHistory, currentMatchHistory });
}

// POST — submit opt-in or confirmation
export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { round_id, opted_in, confirmed_met } = await request.json();
    if (!round_id) return NextResponse.json({ error: 'round_id required' }, { status: 400 });
    if (typeof round_id !== 'string' || !UUID_RE.test(round_id)) {
        return NextResponse.json({ error: 'Invalid round_id' }, { status: 400 });
    }
    if (opted_in !== undefined && typeof opted_in !== 'boolean') {
        return NextResponse.json({ error: 'opted_in must be a boolean' }, { status: 400 });
    }
    if (confirmed_met !== undefined && typeof confirmed_met !== 'boolean' && confirmed_met !== null) {
        return NextResponse.json({ error: 'confirmed_met must be a boolean' }, { status: 400 });
    }

    // Opting in or out only applies to the round currently on the portal — reject
    // historical/closed/discovered round_ids (SA-03). While that round is still open both
    // directions are allowed; once it has been matched, only opting *in* is, which raises
    // a late hand for the admin to pair up. Opting out of a round you've already been
    // paired in wouldn't undo the pair, so it stays closed off.
    if (opted_in !== undefined) {
        if (!isMatchEligible(member)) {
            return NextResponse.json({ error: 'You are not in the 1-on-1 pool right now' }, { status: 403 });
        }
        const { rows: currentRounds } = await query(
            'SELECT id, status FROM match_rounds ORDER BY created_at DESC LIMIT 1',
        );
        const round = currentRounds[0] ?? null;
        const isCurrent = round?.id === round_id;
        const lateOptIn = round?.status === 'matched' && opted_in === true;
        if (!isCurrent || (round.status !== 'open' && !lateOptIn)) {
            return NextResponse.json({ error: 'This round is no longer accepting changes' }, { status: 400 });
        }
    }

    // confirmed_met requires an actual assigned match for this member in
    // this round, otherwise a member could confirm a meeting that never
    // happened, or for a round they were never paired in (SA-03).
    if (confirmed_met !== undefined) {
        const { rows: matches } = await query(
            'SELECT id FROM matches WHERE round_id = $1 AND (member1_id = $2 OR member2_id = $2)',
            [round_id, member.id],
        );
        if (!matches[0]) {
            return NextResponse.json({ error: 'No match found for this round' }, { status: 400 });
        }
    }

    const { rows: existingRows } = await query(
        'SELECT id FROM match_responses WHERE round_id = $1 AND member_id = $2',
        [round_id, member.id],
    );
    const existing = existingRows[0] ?? null;

    if (existing) {
        const patch: Record<string, unknown> = {};
        if (opted_in !== undefined) patch.opted_in = opted_in;
        if (confirmed_met !== undefined) patch.confirmed_met = confirmed_met;
        const columns = Object.keys(patch);
        if (columns.length > 0) {
            const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
            await query(
                `UPDATE match_responses SET ${setClause} WHERE id = $1`,
                [existing.id, ...columns.map((col) => patch[col])],
            );
        }
    } else {
        await query(
            'INSERT INTO match_responses (round_id, member_id, opted_in, confirmed_met) VALUES ($1, $2, $3, $4)',
            [round_id, member.id, opted_in ?? null, confirmed_met ?? null],
        );
    }

    return NextResponse.json({ ok: true });
}
