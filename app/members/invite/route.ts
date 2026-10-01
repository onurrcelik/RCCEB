import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/app/lib/supabase';
import { generateMemberLink } from '@/app/lib/member-auth';
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
// and a single-use token would leave the member holding a dead one.
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

    const supabase = getSupabase();
    const { data: invite } = await supabase
        .from('member_invites')
        .select('id, member_id, expires_at, revoked_at, used_at, redeem_count')
        .eq('token_hash', hashInviteToken(token))
        .maybeSingle();

    if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) {
        return bounce(baseUrl, 'invite_expired');
    }

    const { data: member } = await supabase
        .from('members')
        .select('email, onboarding_complete, is_past_member')
        .eq('id', invite.member_id)
        .single();

    if (!member?.email || member.is_past_member) return bounce(baseUrl, 'invite_invalid');
    // Onboarding done means the invite has served its purpose; normal sign-in takes over.
    if (member.onboarding_complete) return bounce(baseUrl, 'invite_used');

    let actionLink: string;
    try {
        actionLink = await generateMemberLink(
            member.email,
            `${baseUrl}/auth/callback`,
            ['invite', 'magiclink', 'signup'],
        );
    } catch (err) {
        console.error('[members/invite] Failed to mint auth link:', err);
        return bounce(baseUrl, 'invite_error');
    }

    const now = new Date().toISOString();
    await supabase
        .from('member_invites')
        .update({
            used_at: invite.used_at ?? now,
            last_redeemed_at: now,
            redeem_count: invite.redeem_count + 1,
        })
        .eq('id', invite.id);

    // The Supabase link is single-use and short-lived, but it only has to survive
    // this one redirect. no-store keeps any proxy from replaying a spent one.
    return NextResponse.redirect(actionLink, {
        headers: { 'Cache-Control': 'no-store' },
    });
}
