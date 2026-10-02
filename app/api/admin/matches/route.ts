import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { createMatchRound, loadMatchPool, notifyRoundMembers } from '@/app/lib/matching';
import { pendingMetAsks, renderMetAskEmail } from '@/app/lib/match-confirm';
import { escapeHtml } from '@/app/lib/html-escape';

type MatchRound = { id: string; week_of: string | null; status: string; created_at: string };

function pairMembers(ids: string[], pastPairs: Set<string>) {
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const pairs: [string, string][] = [];
    const used = new Set<string>();

    for (let i = 0; i < shuffled.length; i++) {
        if (used.has(shuffled[i])) continue;
        let paired = false;

        // Prefer a partner not previously matched
        for (let j = i + 1; j < shuffled.length; j++) {
            if (used.has(shuffled[j])) continue;
            const key = [shuffled[i], shuffled[j]].sort().join(':');
            if (!pastPairs.has(key)) {
                pairs.push([shuffled[i], shuffled[j]]);
                used.add(shuffled[i]);
                used.add(shuffled[j]);
                paired = true;
                break;
            }
        }

        // Fall back to any available partner (all previously matched)
        if (!paired) {
            for (let j = i + 1; j < shuffled.length; j++) {
                if (!used.has(shuffled[j])) {
                    pairs.push([shuffled[i], shuffled[j]]);
                    used.add(shuffled[i]);
                    used.add(shuffled[j]);
                    break;
                }
            }
        }
    }

    const unmatched = shuffled.filter(id => !used.has(id));
    return { pairs, unmatched };
}

function pairKey(member1Id: string, member2Id: string) {
    return [member1Id, member2Id].sort().join(':');
}

// GET — list rounds with responses and match results
export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { rows: rounds } = await query<MatchRound>(
        'SELECT * FROM match_rounds ORDER BY created_at DESC LIMIT 12',
    );

    if (!rounds.length) return NextResponse.json([]);

    const { rows: allMatches } = await query<{ id: string; round_id: string; member1_id: string; member2_id: string }>(
        'SELECT id, round_id, member1_id, member2_id FROM matches',
    );

    const { rows: allRoundDates } = await query<{ id: string; week_of: string | null; created_at: string }>(
        'SELECT id, week_of, created_at FROM match_rounds',
    );

    const roundDateMap = new Map(allRoundDates.map(round => [round.id, round]));
    const matchesByPair = new Map<string, {
        id: string;
        round_id: string;
        member1_id: string;
        member2_id: string;
        week_of: string | null;
        sortDate: string;
    }[]>();

    for (const match of allMatches) {
        const round = roundDateMap.get(match.round_id);
        const key = pairKey(match.member1_id, match.member2_id);
        const history = matchesByPair.get(key) || [];
        history.push({
            ...match,
            week_of: round?.week_of ?? null,
            sortDate: round?.week_of ?? round?.created_at ?? '',
        });
        matchesByPair.set(key, history);
    }

    const duplicateHistoryByMatchId = new Map<string, { match_id: string; round_id: string; week_of: string | null }[]>();
    for (const history of matchesByPair.values()) {
        history.sort((a, b) => {
            const byDate = a.sortDate.localeCompare(b.sortDate);
            return byDate || a.id.localeCompare(b.id);
        });
        history.forEach((match, index) => {
            if (index === 0) return;
            duplicateHistoryByMatchId.set(
                match.id,
                history.slice(0, index).map(previous => ({
                    match_id: previous.id,
                    round_id: previous.round_id,
                    week_of: previous.week_of,
                })),
            );
        });
    }

    const enriched = await Promise.all(rounds.map(async round => {
        const { rows: responses } = await query<{ member_id: string; opted_in: boolean | null; confirmed_met: boolean | null; not_met_reason: string | null; met_rating: number | null; feedback_note: string | null }>(
            'SELECT member_id, opted_in, confirmed_met, not_met_reason, met_rating, feedback_note FROM match_responses WHERE round_id = $1',
            [round.id],
        );

        const { rows: matches } = await query<{ id: string; member1_id: string; member2_id: string; opener_member_id: string | null; email_sent: boolean | null; admin_note: string | null; admin_note_updated_at: string | null }>(
            'SELECT id, member1_id, member2_id, opener_member_id, email_sent, admin_note, admin_note_updated_at FROM matches WHERE round_id = $1',
            [round.id],
        );

        // Enrich with member names
        const memberIds = [
            ...responses.map(r => r.member_id),
            ...matches.flatMap(m => [m.member1_id, m.member2_id]),
        ];
        const uniqueIds = Array.from(new Set(memberIds));

        let memberMap: Map<string, { name: string; email: string }> = new Map();
        if (uniqueIds.length > 0) {
            const { rows: members } = await query<{ id: string; name: string; email: string }>(
                'SELECT id, name, email FROM members WHERE id = ANY($1)',
                [uniqueIds],
            );
            memberMap = new Map(members.map(m => [m.id, m]));
        }

        // Deduplicate responses by email — members in multiple batches have two UUIDs
        const seenEmails = new Set<string>();
        const responsesWithNames = responses
            .map(r => ({ ...r, member: memberMap.get(r.member_id) || null }))
            .filter(r => {
                const email = r.member?.email;
                if (!email) return true;
                if (seenEmails.has(email)) return false;
                seenEmails.add(email);
                return true;
            });

        const matchesWithNames = matches.map(m => ({
            ...m,
            member1: memberMap.get(m.member1_id) || null,
            member2: memberMap.get(m.member2_id) || null,
            duplicate_previous_matches: duplicateHistoryByMatchId.get(m.id) || [],
        }));

        return { ...round, responses: responsesWithNames, matches: matchesWithNames };
    }));

    return NextResponse.json(enriched);
}

// POST — create_round | run_match
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { action } = body;

    // ── Create round ───────────────────────────────────────────────────
    if (action === 'create_round') {
        // One round at a time: run_match only ever pairs the newest open round, so a
        // second open round would leave the first one stranded.
        const { rows: openRounds } = await query<{ id: string }>("SELECT id FROM match_rounds WHERE status = 'open' LIMIT 1");
        if (openRounds[0]) {
            return NextResponse.json({ error: 'A round is already open. Run the match or delete that round first.' }, { status: 400 });
        }
        const { round } = await createMatchRound();
        if (!round) return NextResponse.json({ error: 'Failed to create round' }, { status: 500 });
        // The round starts empty, so the invitation is what fills it: send it right away.
        const { sent, failed } = await notifyRoundMembers(String(round.id));
        return NextResponse.json({ ok: true, round, sent, failed });
    }

    // ── Run match (pairs only, no emails) ─────────────────────────────
    if (action === 'run_match') {
        const { rows: openRounds } = await query<MatchRound>(
            "SELECT * FROM match_rounds WHERE status = 'open' ORDER BY created_at DESC LIMIT 1",
        );
        const round = openRounds[0] ?? null;
        if (!round) return NextResponse.json({ error: 'No open round found' }, { status: 400 });

        const { rows: responses } = await query<{ member_id: string }>(
            'SELECT member_id FROM match_responses WHERE round_id = $1 AND opted_in = true',
            [round.id],
        );
        if (responses.length < 2) {
            return NextResponse.json({ error: 'Need at least 2 opt-ins to run a match' }, { status: 400 });
        }

        // Deduplicate by email in case a person has two member rows, and drop anyone out
        // of the pool, who may still carry an opt-in row from an earlier round.
        const pool = await loadMatchPool();
        const rawIds = responses.map(r => r.member_id).filter(id => pool.ids.has(id));
        const { rows: memberEmails } = await query<{ id: string; email: string | null }>(
            'SELECT id, email FROM members WHERE id = ANY($1)',
            [rawIds],
        );
        const emailSeen = new Set<string>();
        const memberIds = rawIds.filter(id => {
            const m = memberEmails.find(m => m.id === id);
            if (!m?.email) return true;
            if (emailSeen.has(m.email)) return false;
            emailSeen.add(m.email);
            return true;
        });
        if (memberIds.length < 2) {
            return NextResponse.json({ error: 'Need at least 2 eligible opt-ins to run a match' }, { status: 400 });
        }
        const { rows: pastMatches } = await query<{ member1_id: string; member2_id: string }>('SELECT member1_id, member2_id FROM matches');
        const pastPairs = new Set<string>(pastMatches.map(m => [m.member1_id, m.member2_id].sort().join(':')));

        const { pairs, unmatched } = pairMembers(memberIds, pastPairs);

        if (pairs.length > 0) {
            const rows = pairs.map(([m1, m2]) => ({ m1, m2, opener: Math.random() > 0.5 ? m1 : m2 }));
            const values = rows.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(', ');
            const params = [round.id, ...rows.flatMap(r => [r.m1, r.m2, r.opener])];
            await query(`INSERT INTO matches (round_id, member1_id, member2_id, opener_member_id) VALUES ${values}`, params);
        }
        await query("UPDATE match_rounds SET status = 'matched' WHERE id = $1", [round.id]);

        return NextResponse.json({ ok: true, pairs: pairs.length, unmatched });
    }

    // ── Send intro emails for a round ──────────────────────────────────
    if (action === 'send_intro_emails') {
        const { round_id } = body;
        if (!round_id) return NextResponse.json({ error: 'round_id required' }, { status: 400 });

        const { rows: matches } = await query<{ id: string; member1_id: string; member2_id: string; opener_member_id: string }>(
            "SELECT id, member1_id, member2_id, opener_member_id FROM matches WHERE round_id = $1 AND (email_sent IS NULL OR email_sent = false)",
            [round_id],
        );

        if (matches.length === 0) {
            return NextResponse.json({ ok: true, sent: 0, failed: 0, message: 'All emails already sent' });
        }

        const allIds = Array.from(new Set(matches.flatMap(m => [m.member1_id, m.member2_id])));
        const { rows: memberDetails } = await query<{ id: string; name: string; email: string; phone: string | null; bio: string | null; linkedin: string | null; location: string | null }>(
            'SELECT id, name, email, phone, bio, linkedin, location FROM members WHERE id = ANY($1)',
            [allIds],
        );
        const byId = new Map(memberDetails.map(m => [m.id, m]));
        // Last month's question rides along for anyone who hasn't answered it yet — a second
        // chance at it inside the email people are most likely to open, since it's the one
        // telling them who they got. Whoever already answered from the round-open email sees
        // nothing here, and `round_id` is excluded so the ask is about last month rather than
        // this pairing.
        const asks = await pendingMetAsks(allIds, round_id);

        let sent = 0;
        let failed = 0;

        for (const match of matches) {
            const m1 = byId.get(match.member1_id);
            const m2 = byId.get(match.member2_id);
            if (!m1 || !m2) { failed += 2; continue; }

            let matchSent = true;
            for (const [self, other] of [[m1, m2], [m2, m1]] as const) {
                const first = (self.name || 'there').split(' ')[0];
                const ask = asks.get(self.id);
                const askBlock = ask ? renderMetAskEmail(ask, escapeHtml) : null;
                const selfIsOpener = match.opener_member_id === self.id;
                const otherFirst = other.name.split(' ')[0];
                const outreachLine = selfIsOpener
                    ? `👋 You're reaching out. It's your responsibility to message ${otherFirst} first and set up a time.`
                    : `📬 ${otherFirst} is reaching out. It's ${otherFirst}'s responsibility to message you first, so keep an eye out.`;
                const outreachNote = 'Who reaches out first is picked at random for each pair.';
                const lines = [
                    `Name: ${other.name}`,
                    other.bio && `What they do: ${other.bio}`,
                    other.location && `Location: ${other.location}`,
                    `Email: ${other.email}`,
                    other.phone && `Phone: ${other.phone}`,
                    other.linkedin && `LinkedIn: ${other.linkedin}`,
                ].filter(Boolean).join('\n');

                try {
                    await sendResendEmail({
                        to: self.email,
                        subject: selfIsOpener
                            ? `Your RCCEB 1-on-1 this month: you reach out to ${other.name}`
                            : `Your RCCEB 1-on-1 this month: ${other.name} will reach out to you`,
                        text: `Hey ${first},\n\nYou've been matched with ${other.name} for your 30-min 1-on-1 this month!\n\n${outreachLine}\n${outreachNote}\n\n${lines}${askBlock ? `\n\n—\n\n${askBlock.text}` : ''}`,
                        html: `<p>Hey ${first},</p><p>You've been matched with <strong>${other.name}</strong> for your 30-min 1-on-1 this month!</p><p style="background:${selfIsOpener ? '#f3ead8' : '#f4f4f5'};padding:12px 16px;border-radius:8px;font-size:14px;font-weight:600;color:${selfIsOpener ? '#4a3710' : '#3f3f46'}">${outreachLine}<br><span style="font-weight:400;font-size:12px">${outreachNote}</span></p><pre style="background:#f5f5f5;padding:14px;border-radius:8px;font-family:sans-serif;font-size:14px;line-height:1.6">${lines}</pre>${askBlock ? askBlock.html : ''}`,
                        category: 'marketing',
                    });
                    sent++;
                } catch {
                    failed++;
                    matchSent = false;
                }
            }
            // Only mark email_sent if both emails for this pair went through
            if (matchSent) {
                await query('UPDATE matches SET email_sent = true WHERE id = $1', [match.id]);
            }
            // Small delay between pairs to respect rate limits
            await new Promise(res => setTimeout(res, 200));
        }

        return NextResponse.json({ ok: true, sent, failed });
    }

    // ── Notify all members about an open round ────────────────────────
    if (action === 'notify_round') {
        const { round_id } = body;
        if (!round_id) return NextResponse.json({ error: 'round_id required' }, { status: 400 });

        const { rows: roundRows } = await query<{ id: string }>('SELECT id FROM match_rounds WHERE id = $1', [round_id]);
        if (!roundRows[0]) return NextResponse.json({ error: 'Round not found' }, { status: 404 });

        const { sent, failed } = await notifyRoundMembers(round_id);
        return NextResponse.json({ ok: true, sent, failed });
    }

    // ── Add opt-in manually (works for open and matched rounds) ───────
    if (action === 'add_opt_in') {
        const { round_id, member_id } = body;
        if (!round_id || !member_id) return NextResponse.json({ error: 'round_id and member_id required' }, { status: 400 });

        // run_match would drop them again anyway, so say so here rather than letting the
        // opt-in sit in the round and quietly go nowhere.
        const pool = await loadMatchPool();
        if (!pool.ids.has(member_id)) {
            return NextResponse.json({ error: 'This member is not in the 1-on-1 pool (past member, or onboarding not finished)' }, { status: 400 });
        }

        const { rows: existingRows } = await query<{ id: string }>(
            'SELECT id FROM match_responses WHERE round_id = $1 AND member_id = $2',
            [round_id, member_id],
        );
        const existing = existingRows[0] ?? null;

        if (existing) {
            try {
                await query('UPDATE match_responses SET opted_in = true WHERE id = $1', [existing.id]);
            } catch {
                return NextResponse.json({ error: 'Failed to update opt-in' }, { status: 500 });
            }
        } else {
            try {
                await query('INSERT INTO match_responses (round_id, member_id, opted_in) VALUES ($1, $2, true)', [round_id, member_id]);
            } catch {
                return NextResponse.json({ error: 'Failed to add opt-in' }, { status: 500 });
            }
        }
        return NextResponse.json({ ok: true });
    }

    // ── Remove an opt-in manually ─────────────────────────────────────
    // Flips them to skipping rather than deleting the row, so they show under "Skipping"
    // and run_match leaves them out. Covers every member row under the same email, since
    // the list only shows one of them and a hidden duplicate would still get paired.
    if (action === 'remove_opt_in') {
        const { round_id, member_id } = body;
        if (!round_id || !member_id) return NextResponse.json({ error: 'round_id and member_id required' }, { status: 400 });

        const { rows: paired } = await query<{ id: string }>(
            'SELECT id FROM matches WHERE round_id = $1 AND $2 IN (member1_id, member2_id) LIMIT 1',
            [round_id, member_id],
        );
        if (paired[0]) {
            return NextResponse.json({ error: 'This member is already in a pair — delete the pair first' }, { status: 400 });
        }

        try {
            await query(
                `UPDATE match_responses SET opted_in = false
                 WHERE round_id = $1 AND (member_id = $2 OR member_id IN (
                     SELECT id FROM members
                     WHERE email IS NOT NULL
                       AND lower(email) = (SELECT lower(email) FROM members WHERE id = $2)
                 ))`,
                [round_id, member_id],
            );
        } catch {
            return NextResponse.json({ error: 'Failed to remove opt-in' }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }

    // ── Create match manually ──────────────────────────────────────────
    if (action === 'create_match') {
        const { round_id, member1_id, member2_id } = body;
        if (!round_id || !member1_id || !member2_id) {
            return NextResponse.json({ error: 'round_id, member1_id, member2_id required' }, { status: 400 });
        }
        if (member1_id === member2_id) {
            return NextResponse.json({ error: 'Cannot match a member with themselves' }, { status: 400 });
        }
        const opener_member_id = Math.random() > 0.5 ? member1_id : member2_id;
        try {
            await query(
                'INSERT INTO matches (round_id, member1_id, member2_id, opener_member_id) VALUES ($1, $2, $3, $4)',
                [round_id, member1_id, member2_id, opener_member_id],
            );
        } catch {
            return NextResponse.json({ error: 'Failed to create match' }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// PATCH — edit a match pair or set pair met status
export async function PATCH(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { match_id, action } = body;

    if (action === 'set_match_met') {
        const { met } = body as { met: boolean | null };
        if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 });
        const { rows: matchRows } = await query<{ round_id: string; member1_id: string; member2_id: string }>(
            'SELECT round_id, member1_id, member2_id FROM matches WHERE id = $1',
            [match_id],
        );
        const match = matchRows[0];
        if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

        for (const memberId of [match.member1_id, match.member2_id]) {
            const { rows: existingRows } = await query<{ id: string }>(
                'SELECT id FROM match_responses WHERE round_id = $1 AND member_id = $2',
                [match.round_id, memberId],
            );
            const existing = existingRows[0] ?? null;
            if (existing) {
                await query('UPDATE match_responses SET confirmed_met = $1 WHERE id = $2', [met, existing.id]);
            } else {
                await query(
                    'INSERT INTO match_responses (round_id, member_id, confirmed_met, opted_in) VALUES ($1, $2, $3, NULL)',
                    [match.round_id, memberId, met],
                );
            }
        }
        return NextResponse.json({ ok: true });
    }

    if (action === 'set_match_note') {
        if (!match_id) return NextResponse.json({ error: 'match_id required' }, { status: 400 });
        const note = typeof body.note === 'string' ? body.note.trim() : '';
        const { rowCount } = await query(
            'UPDATE matches SET admin_note = $1, admin_note_updated_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END WHERE id = $2',
            [note || null, match_id],
        );
        if (!rowCount) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
        return NextResponse.json({ ok: true });
    }

    const { member1_id, member2_id } = body;
    if (!match_id || !member1_id || !member2_id) {
        return NextResponse.json({ error: 'match_id, member1_id, member2_id required' }, { status: 400 });
    }
    if (member1_id === member2_id) {
        return NextResponse.json({ error: 'Cannot match a member with themselves' }, { status: 400 });
    }
    try {
        // Keep the opener if they're still in the pair; otherwise re-pick at random so it
        // never points at someone who was swapped out.
        await query(
            `UPDATE matches SET member1_id = $1, member2_id = $2,
                opener_member_id = CASE
                    WHEN opener_member_id IS NULL OR opener_member_id IN ($1, $2) THEN opener_member_id
                    WHEN random() < 0.5 THEN $1 ELSE $2
                END
             WHERE id = $3`,
            [member1_id, member2_id, match_id],
        );
    } catch {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

// DELETE — delete a match or an entire round
export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('match_id');
    const roundId = searchParams.get('round_id');

    if (matchId) {
        try {
            await query('DELETE FROM matches WHERE id = $1', [matchId]);
        } catch {
            return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }
    if (roundId) {
        try {
            await query('DELETE FROM match_rounds WHERE id = $1', [roundId]);
        } catch {
            return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'match_id or round_id required' }, { status: 400 });
}
