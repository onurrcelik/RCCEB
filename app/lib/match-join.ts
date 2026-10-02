import { createHmac, timingSafeEqual } from 'crypto';
import { getBaseUrl } from '@/app/lib/site-url';

// One-click "Count me in" links for the monthly 1-on-1 invitation email.
//
// Joining is opt-in: a round starts empty and only members who say yes are matched. The
// invitation carries a signed link so saying yes takes one tap from the inbox, with no
// sign-in, the same reasoning as the "did you meet?" links in app/lib/match-confirm.ts.
// The signature covers the round and the member, so a link only ever answers for the
// person it was sent to, and only for that month.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secret(): string {
    const value = process.env.APP_SECRET;
    if (!value) throw new Error('APP_SECRET must be configured');
    return value;
}

// The "match-join:" prefix keeps these from being interchangeable with the other tokens
// signed with the same secret (unsubscribe, match-met).
export function signMatchJoin(roundId: string, memberId: string): string {
    return createHmac('sha256', secret()).update(`match-join:${roundId}:${memberId}`).digest('base64url').slice(0, 32);
}

export function verifyMatchJoin(roundId: string, memberId: string, token: string): boolean {
    if (!UUID_RE.test(roundId) || !UUID_RE.test(memberId)) return false;
    const expected = Buffer.from(signMatchJoin(roundId, memberId));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

export function buildMatchJoinUrl(roundId: string, memberId: string): string {
    return `${getBaseUrl()}/api/match-join?r=${roundId}&m=${memberId}&t=${signMatchJoin(roundId, memberId)}`;
}
