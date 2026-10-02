import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { MATCH_POOL_SELECT, isMatchEligible, type MatchPoolSource } from '@/app/lib/categories';
import { BRAND } from '@/app/lib/brand';
import { pendingMetAsks, renderMetAskEmail } from '@/app/lib/match-confirm';
import { escapeHtml } from '@/app/lib/html-escape';
import { buildMatchJoinUrl } from '@/app/lib/match-join';

// Opening a monthly 1-on-1 round: who is invited, creating the round, and the invitation
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

// Opens a round. Joining is opt-in: members who chose "join every month" are put in right
// away; everyone else is in only once they say yes, from the invitation email's
// "Count me in" button or from the portal.
export async function createMatchRound() {
    let round;
    try {
        ({ rows: [round] } = await query(
            "INSERT INTO match_rounds (week_of, status) VALUES ($1, 'open') RETURNING *",
            [roundDate()],
        ));
    } catch {
        return { round: null, autoJoined: 0 };
    }
    if (!round) return { round: null, autoJoined: 0 };

    const pool = await loadMatchPool();
    const { rowCount } = await query(
        `INSERT INTO match_responses (round_id, member_id, opted_in)
         SELECT $1, id, true FROM members WHERE match_auto_opt_in AND id = ANY($2)`,
        [round.id, pool.uniqueIds],
    );
    return { round, autoJoined: rowCount ?? 0 };
}

// How the monthly 1-on-1s work, said once in the invitation so a member knows what they're
// signing up for before they tap the button.
const HOW_IT_WORKS = [
    "Say yes below, and we'll pair you with another RCCEB member at random, someone you haven't been matched with before whenever possible.",
    'You get one email with your match: who they are, how to reach them, and which one of you reaches out first.',
    "The person reaching out sends the first message and you set up a 30-minute conversation together, by call, video or over coffee, sometime this month.",
    "Only members who join are matched. Can't make it this month? Just ignore this email.",
    'Want in every month? Choose "Count me in every month" and we\'ll skip this email and just send you your match.',
];

// Invites the pool to this month's round. Anyone who has already answered (in or out) is
// skipped, so the admin can send it again as a reminder without bothering people twice.
// That includes auto-joiners, who are put in when the round opens and so never get it.
//
// It also carries last month's "did you meet?" question for anyone whose pair still has no
// answer on it. A new round opening is the right moment to ask — the month it's about has
// just ended — and this email was already going to land in their inbox, so the question
// costs the member one tap and costs us no extra send. The round opened moments ago has no
// matches in it yet, so pendingMetAsks lands on last month's round without being told to.
export async function notifyRoundMembers(roundId: string) {
    const pool = await loadMatchPool();
    const { rows: members } = await query<{ id: string; name: string | null; email: string }>(
        `SELECT id, name, email FROM members
         WHERE id = ANY($1) AND email IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM match_responses r
               WHERE r.round_id = $2 AND r.member_id = members.id AND r.opted_in IS NOT NULL
           )`,
        [pool.uniqueIds, roundId],
    );
    if (members.length === 0) return { sent: 0, failed: 0 };

    const asks = await pendingMetAsks(members.map(member => member.id));
    const month = new Date().toLocaleDateString('en-US', { month: 'long', timeZone: 'Europe/Istanbul' });

    let sent = 0;
    let failed = 0;

    for (const member of members) {
        const first = escapeHtml((member.name || 'there').split(' ')[0]);
        const ask = asks.get(member.id);
        const askBlock = ask ? renderMetAskEmail(ask, escapeHtml) : null;
        const joinLink = buildMatchJoinUrl(roundId, member.id);
        try {
            await sendResendEmail({
                to: member.email,
                subject: `Join ${month}'s ${BRAND.shortName} 1-on-1?`,
                text: `Hey ${first},\n\n${askBlock ? `${askBlock.text}\n\n` : ''}${month}'s ${BRAND.shortName} 1-on-1 round is open. Want to meet another member this month?\n\nHow it works:\n${HOW_IT_WORKS.map(line => `- ${line}`).join('\n')}\n\nCount me in: ${joinLink}\nCount me in every month: ${joinLink}&a=always`,
                html: `<p>Hey ${first},</p>${askBlock ? askBlock.html : ''}<p><strong>${month}'s ${BRAND.shortName} 1-on-1 round</strong> is open. Want to meet another member this month?</p><p style="margin:0 0 6px;font-weight:600">How it works</p><ul style="margin:0 0 20px;padding-left:20px;line-height:1.6">${HOW_IT_WORKS.map(line => `<li>${line}</li>`).join('')}</ul><p><a href="${joinLink}" style="display:inline-block;padding:12px 24px;background:${BRAND.colors.brandNavy};color:white;border-radius:8px;text-decoration:none;font-weight:600;">Count me in →</a></p><p style="font-size:13px"><a href="${joinLink}&a=always" style="color:${BRAND.colors.brandNavy};font-weight:600;">Count me in every month</a></p>`,
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
