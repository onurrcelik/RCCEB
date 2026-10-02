import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '@/app/lib/db';
import { getBaseUrl } from '@/app/lib/site-url';

// One-click "did you meet?" links for the monthly 1-on-1 emails.
//
// Confirming a meeting used to mean opening the portal, logging in and finding the match
// section — six steps for a yes/no — and about three quarters of pairs never answered.
// These links put the question in the email that was already going to land in the inbox.
//
// Signed rather than stored, the same reasoning as the unsubscribe links: they keep
// working for an email sent weeks ago, and nobody can answer on somebody else's behalf by
// guessing a URL. The signature covers the round and the member but NOT the answer, so one
// token carries both buttons and the change-your-mind toggle on the landing page.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secret(): string {
    const value = process.env.APP_SECRET;
    if (!value) throw new Error('APP_SECRET must be configured');
    return value;
}

// The "match-met:" prefix keeps these from being interchangeable with unsubscribe tokens,
// which are signed with the same secret.
export function signMatchConfirm(roundId: string, memberId: string): string {
    return createHmac('sha256', secret()).update(`match-met:${roundId}:${memberId}`).digest('base64url').slice(0, 32);
}

export function verifyMatchConfirm(roundId: string, memberId: string, token: string): boolean {
    if (!UUID_RE.test(roundId) || !UUID_RE.test(memberId)) return false;
    const expected = Buffer.from(signMatchConfirm(roundId, memberId));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

export type MetAnswer = 'yes' | 'no';

export function buildMatchConfirmUrl(roundId: string, memberId: string, answer: MetAnswer): string {
    const token = signMatchConfirm(roundId, memberId);
    return `${getBaseUrl()}/api/match-confirm?r=${roundId}&m=${memberId}&a=${answer}&t=${token}`;
}

// ── Who still owes us an answer ────────────────────────────────────────────────

export type MetAsk = {
    roundId: string;
    selfId: string;
    weekOf: string | null;
    partnerId: string;
    partnerName: string;
    partnerFirst: string;
    selfIsOpener: boolean | null;
};

// The round the question is about: the most recent one that actually produced pairs.
// Derived rather than "the second newest round" because a new round is opened before its
// email goes out, so the newest round is this month's and has no matches in it yet.
// `excludeRoundId` is for the intro emails, where the round being emailed about was just matched.
async function lastMatchedRound(excludeRoundId?: string | null) {
    const exclude = excludeRoundId && UUID_RE.test(excludeRoundId) ? excludeRoundId : null;
    const { rows } = await query<{ id: string; week_of: string | null }>(
        `SELECT r.id, r.week_of
           FROM match_rounds r
          WHERE EXISTS (SELECT 1 FROM matches m WHERE m.round_id = r.id)
            AND ($1::uuid IS NULL OR r.id <> $1::uuid)
          ORDER BY r.week_of DESC NULLS LAST, r.created_at DESC
          LIMIT 1`,
        [exclude],
    );
    return rows[0] ?? null;
}

// Members from `memberIds` who were paired last round and whose pair still has no answer
// on it — keyed by member id, absent for anyone there's nothing to ask.
//
// "Still has no answer" looks at the partner's response too, not just the member's own.
// Whether a pair met is a fact about the pair: one side answering settles it, and asking
// the other side anyway is how you train people to ignore the question.
export async function pendingMetAsks(memberIds: string[], excludeRoundId?: string | null): Promise<Map<string, MetAsk>> {
    try {
        return await collectMetAsks(memberIds, excludeRoundId);
    } catch (error) {
        // The question rides along on emails whose real job is telling members they're in
        // the round or who they got. Losing it costs a round of answers; letting it throw
        // would cost the send itself, so fail soft — but loudly, since a silently missing
        // question looks exactly like nobody having anything to answer.
        console.error('pendingMetAsks failed, sending without the question:', error);
        return new Map();
    }
}

async function collectMetAsks(memberIds: string[], excludeRoundId?: string | null): Promise<Map<string, MetAsk>> {
    const asks = new Map<string, MetAsk>();
    if (memberIds.length === 0) return asks;

    const round = await lastMatchedRound(excludeRoundId);
    if (!round) return asks;

    const { rows: matches } = await query<{ member1_id: string; member2_id: string; opener_member_id: string | null }>(
        `SELECT member1_id, member2_id, opener_member_id FROM matches
          WHERE round_id = $1 AND (member1_id = ANY($2) OR member2_id = ANY($2))`,
        [round.id, memberIds],
    );
    if (matches.length === 0) return asks;

    const everyone = [...new Set(matches.flatMap(m => [m.member1_id, m.member2_id]))];

    const [{ rows: responses }, { rows: people }] = await Promise.all([
        query<{ member_id: string; confirmed_met: boolean | null }>(
            'SELECT member_id, confirmed_met FROM match_responses WHERE round_id = $1 AND member_id = ANY($2)',
            [round.id, everyone],
        ),
        query<{ id: string; name: string | null }>('SELECT id, name FROM members WHERE id = ANY($1)', [everyone]),
    ]);

    const answered = new Map(responses.map(r => [r.member_id, r.confirmed_met]));
    const nameById = new Map(people.map(p => [p.id, p.name]));
    const wanted = new Set(memberIds);

    for (const match of matches) {
        for (const [self, partner] of [[match.member1_id, match.member2_id], [match.member2_id, match.member1_id]] as const) {
            if (!wanted.has(self)) continue;
            if (answered.get(self) != null || answered.get(partner) != null) continue;

            const partnerName = nameById.get(partner);
            if (!partnerName) continue;

            asks.set(self, {
                roundId: round.id,
                selfId: self,
                weekOf: round.week_of,
                partnerId: partner,
                partnerName,
                partnerFirst: partnerName.split(' ')[0],
                selfIsOpener: match.opener_member_id != null ? match.opener_member_id === self : null,
            });
        }
    }

    return asks;
}

// ── The block that carries the question in an email ────────────────────────────

// The same question in both monthly emails, so a member meets one phrasing whether they
// answer from the round-open email or the intro email. Two buttons of equal weight on purpose: the moment "no"
// looks like a confession people stop answering at all, and how often these meetings
// *don't* happen is the number worth having.
// Returns null rather than throwing for the same reason pendingMetAsks swallows its
// errors: a missing signing secret must not take the whole send down with it.
export function renderMetAskEmail(ask: MetAsk, escapeHtml: (value: string) => string) {
    try {
        return buildMetAskEmail(ask, escapeHtml);
    } catch (error) {
        console.error('renderMetAskEmail failed, sending without the question:', error);
        return null;
    }
}

function buildMetAskEmail(ask: MetAsk, escapeHtml: (value: string) => string) {
    const yes = buildMatchConfirmUrl(ask.roundId, ask.selfId, 'yes');
    const no = buildMatchConfirmUrl(ask.roundId, ask.selfId, 'no');
    const question = `Did you meet ${ask.partnerName} last month?`;

    const text = `${question}\n\nYes, we met: ${yes}\nNo, we didn't: ${no}`;

    const button = (href: string, label: string, primary: boolean) =>
        `<a href="${href}" style="display:inline-block;padding:10px 20px;margin:0 8px 8px 0;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;`
        + (primary
            ? 'background:#18181b;color:#ffffff;">'
            : 'background:#ffffff;color:#18181b;border:1px solid #d4d4d8;">')
        + `${label}</a>`;

    const html = `<div style="margin:0 0 24px;padding:16px 18px;background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;">`
        + `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#18181b;">${escapeHtml(question)}</p>`
        + button(yes, 'Yes, we met', true)
        + button(no, "No, we didn't", false)
        + `</div>`;

    return { text, html };
}
