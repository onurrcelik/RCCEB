import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { MATCH_POOL_SELECT, isMatchEligible, type MatchPoolSource } from '@/app/lib/categories';
import { BRAND } from '@/app/lib/brand';
import { pendingMetAsks, renderMetAskEmail } from '@/app/lib/match-confirm';
import { escapeHtml } from '@/app/lib/html-escape';

// Opening a monthly 1-on-1 round: who takes part, creating the round, and the heads-up
// email. Rounds are opened by hand from Admin → Matches; nothing runs on a schedule.

// The members taking part in the monthly 1-on-1s (see app/lib/categories.ts). Anyone outside
// it is out entirely: not seeded into a new round, not emailed about one, and not paired
// even if an old opt-in row of theirs is still around.
//
// `ids` answers "is this member in the pool"; `uniqueIds` holds one id per person, so a
// duplicated member row under one email is never seeded, emailed or paired twice.
export async function loadMatchPool() {
    const { rows } = await query<MatchPoolSource>(`SELECT ${MATCH_POOL_SELECT} FROM members`);
    const eligible = rows.filter(isMatchEligible);

    const byEmail = new Map<string, string>();
    const noEmail: string[] = [];
    for (const row of eligible) {
        const email = row.email?.toLowerCase().trim();
        if (!email) noEmail.push(row.id);
        else if (!byEmail.has(email)) byEmail.set(email, row.id);
    }

    return {
        ids: new Set(eligible.map(row => row.id)),
        uniqueIds: [...byEmail.values(), ...noEmail],
    };
}

// The date a round is filed under: the day it was opened. The portal shows it as a month
// ("October 2026"). The column is still called week_of from when rounds were weekly.
export function roundDate(now = new Date()) {
    return now.toISOString().split('T')[0];
}

// Opens a round and puts the whole pool in it. Sitting out is an explicit opt-out on the
// portal for that month, not something a member has to remember to opt into.
export async function createMatchRound() {
    let round;
    try {
        ({ rows: [round] } = await query(
            "INSERT INTO match_rounds (week_of, status) VALUES ($1, 'open') RETURNING *",
            [roundDate()],
        ));
    } catch {
        return { round: null, seeded: 0 };
    }
    if (!round) return { round: null, seeded: 0 };

    const pool = await loadMatchPool();
    if (pool.uniqueIds.length > 0) {
        await query(
            `INSERT INTO match_responses (round_id, member_id, opted_in) VALUES ${pool.uniqueIds.map((_, i) => `($1, $${i + 2}, true)`).join(', ')}`,
            [round.id, ...pool.uniqueIds],
        );
    }

    return { round, seeded: pool.uniqueIds.length };
}

// Tells the pool the round is open. Everyone in it is already opted in, so this is a
// heads-up with a way out rather than an invitation. Members outside the pool never get it.
//
// It also carries last month's "did you meet?" question for anyone whose pair still has no
// answer on it. A new round opening is the right moment to ask — the month it's about has
// just ended — and this email was already going to land in their inbox, so the question
// costs the member one tap and costs us no extra send. The round opened moments ago has no
// matches in it yet, so pendingMetAsks lands on last month's round without being told to.
export async function notifyRoundMembers(baseUrl: string) {
    const pool = await loadMatchPool();
    const { rows: members } = await query<{ id: string; name: string | null; email: string }>(
        'SELECT id, name, email FROM members WHERE id = ANY($1) AND email IS NOT NULL',
        [pool.uniqueIds],
    );
    if (members.length === 0) return { sent: 0, failed: 0 };

    const optOutLink = `${baseUrl}/members/dashboard?section=match`;
    const asks = await pendingMetAsks(members.map(member => member.id));

    let sent = 0;
    let failed = 0;

    for (const member of members) {
        if (!member.email) { failed++; continue; }
        const first = (member.name || 'there').split(' ')[0];
        const ask = asks.get(member.id);
        const askBlock = ask ? renderMetAskEmail(ask, escapeHtml) : null;
        try {
            await sendResendEmail({
                to: member.email,
                subject: "You're in this month's 1-on-1 round",
                text: `Hey ${first},\n\n${askBlock ? `${askBlock.text}\n\n` : ''}This month's ${BRAND.shortName} 1-on-1 round is open and you're in — we'll email you your match once the round runs.\n\nCan't make a 30-min conversation this month? Head to the portal and opt out before matches go out. No need to do anything if you're in.\n\n${optOutLink}`,
                html: `<p>Hey ${first},</p>${askBlock ? askBlock.html : ''}<p>This month's <strong>${BRAND.shortName} 1-on-1 round</strong> is open and you're in — we'll email you your match once the round runs.</p><p>Can't make a 30-min conversation this month? Head to the portal and opt out before matches go out. No need to do anything if you're in.</p><p><a href="${optOutLink}" style="display:inline-block;padding:10px 20px;background:${BRAND.colors.brandNavy};color:white;border-radius:8px;text-decoration:none;font-weight:600;">Sit this month out →</a></p>`,
                category: 'marketing',
            });
            sent++;
        } catch {
            failed++;
        }
        // Small delay between sends to respect rate limits.
        await new Promise(res => setTimeout(res, 100));
    }

    return { sent, failed };
}
