import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { createSession, setSessionCookie } from '@/app/lib/auth';
import { hashInviteToken } from '@/app/lib/member-invites';
import { checkRateLimit, getClientIp } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';

export const dynamic = 'force-dynamic';

// Every exit from here lands on the sign-in page, which can always mail a fresh
// link — so a bad invite is a small detour, never a dead end.
function bounce(baseUrl: string, notice: string) {
    return NextResponse.redirect(`${baseUrl}/members/login?notice=${notice}`, {
        headers: { 'Cache-Control': 'no-store' },
    });
}

// GET /members/invite?token=… — redeem an onboarding invite.
// Deliberately reusable until onboarding completes: mail scanners prefetch links,
// and a single-use token would leave the member holding a dead one. A scanner's
// prefetch only ever gets a session cookie in the scanner's own cookie jar.
export async function GET(request: NextRequest) {
    const baseUrl = getBaseUrl(request);
    const token = request.nextUrl.searchParams.get('token');
    if (!token) return bounce(baseUrl, 'invite_invalid');

    const ip = getClientIp(request);
    const throttle = await checkRateLimit({
        key: `member-invite:ip:${ip}`,
        limit: 20,
        windowMs: 15 * 60 * 1000,
    });
    if (!throttle.allowed) return bounce(baseUrl, 'invite_throttled');

    const { rows: inviteRows } = await query<{ id: string; member_id: string; expires_at: string; revoked_at: string | null; used_at: string | null }>(
        'SELECT id, member_id, expires_at, revoked_at, used_at FROM member_invites WHERE token_hash = $1',
        [hashInviteToken(token)],
    );
    const invite = inviteRows[0];

    if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) {
        return bounce(baseUrl, 'invite_expired');
    }

    const { rows: memberRows } = await query<{ email: string; onboarding_complete: boolean; is_past_member: boolean }>(
        'SELECT email, onboarding_complete, is_past_member FROM members WHERE id = $1',
        [invite.member_id],
    );
    const member = memberRows[0];

    if (!member?.email || member.is_past_member) return bounce(baseUrl, 'invite_invalid');
    // Onboarding done means the invite has served its purpose; normal sign-in takes over.
    if (member.onboarding_complete) return bounce(baseUrl, 'invite_used');

    await query(
        `UPDATE member_invites
         SET used_at = COALESCE(used_at, now()), last_redeemed_at = now(), redeem_count = redeem_count + 1
         WHERE id = $1`,
        [invite.id],
    );

    // The invite itself is the proof of identity (it went to their inbox), so open a
    // session directly and send them to onboarding.
    const response = NextResponse.redirect(`${baseUrl}/members/onboarding`, {
        headers: { 'Cache-Control': 'no-store' },
    });
    setSessionCookie(response, 'member', await createSession(member.email, 'member'));
    return response;
}
