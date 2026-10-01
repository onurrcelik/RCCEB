import { NextRequest, NextResponse } from 'next/server';
import { createSession, redeemCode, redeemLinkToken, setSessionCookie, type SessionKind } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { getMemberByEmail } from '@/app/lib/member-session';
import { checkRateLimit, getClientIp, retryAfterSeconds } from '@/app/lib/request-security';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify — finish a sign-in with either the emailed link token
// ({ kind, token }) or the typed code ({ kind, email, code }), and set the session cookie.
//
// The emailed link opens a page that calls this with JavaScript rather than signing in
// on GET: mail scanners fetch every link in a message but don't run scripts, so a GET
// sign-in would be spent by the scanner before the person ever clicked.
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const kind: SessionKind = body.kind === 'admin' ? 'admin' : 'member';

    const ip = getClientIp(request);
    const limit = await checkRateLimit({ key: `auth-verify:ip:${ip}`, limit: 20, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(limit.resetAt)) } });
    }

    let email: string | null = null;
    if (typeof body.token === 'string' && body.token) {
        email = await redeemLinkToken(body.token, kind);
    } else if (typeof body.email === 'string' && typeof body.code === 'string') {
        email = await redeemCode(body.email, body.code.trim(), kind);
    }
    if (!email) {
        return NextResponse.json({ error: 'This link or code is invalid or has expired.' }, { status: 400 });
    }

    let redirectTo: string;
    if (kind === 'admin') {
        if (!isAdminEmail(email)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
        redirectTo = '/admin';
    } else {
        const member = await getMemberByEmail(email);
        if (!member) return NextResponse.json({ error: 'You are not registered as a member.' }, { status: 403 });
        redirectTo = member.onboarding_complete ? '/members/dashboard' : '/members/onboarding';
    }

    const response = NextResponse.json({ ok: true, redirectTo });
    setSessionCookie(response, kind, await createSession(email, kind));
    return response;
}
