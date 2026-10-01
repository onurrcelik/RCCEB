import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { sendSignInEmail } from '@/app/lib/member-auth';
import { createSignInCode } from '@/app/lib/auth';
import { checkRateLimit, getClientIp, isValidEmail, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';

// POST /api/members/auth — send magic link to email
export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json();
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();
        if (normalizedEmail.length > 254 || !isValidEmail(normalizedEmail)) {
            return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
        }

        const ip = getClientIp(request);
        const ipLimit = await checkRateLimit({
            key: `member-auth:ip:${ip}`,
            limit: 8,
            windowMs: 15 * 60 * 1000,
        });
        const emailLimit = await checkRateLimit({
            key: `member-auth:email:${normalizedEmail}`,
            limit: 5,
            windowMs: 15 * 60 * 1000,
        });
        if (!ipLimit.allowed || !emailLimit.allowed) {
            const resetAt = !ipLimit.allowed ? ipLimit.resetAt : emailLimit.resetAt;
            return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(resetAt)) } });
        }

        const { rows } = await query<{ id: string; email: string; name: string | null; onboarding_complete: boolean; is_past_member: boolean }>(
            'SELECT id, email, name, onboarding_complete, is_past_member FROM members WHERE email ILIKE $1',
            [normalizedEmail],
        );
        const member = rows[0] ?? null;

        if (!member || member.is_past_member) {
            // Don't reveal whether the email exists, and never send a login link to
            // a past member (they keep their data but lose portal access).
            return NextResponse.json({ ok: true });
        }

        const baseUrl = getBaseUrl(request);
        const { linkToken, code, expiresInMinutes } = await createSignInCode(member.email, 'member');
        const link = `${baseUrl}/auth/callback?token=${encodeURIComponent(linkToken)}`;

        // Local development has no mail delivery to rely on; hand the link straight back.
        if (process.env.NODE_ENV !== 'production') {
            return NextResponse.json({ ok: true, devLink: link });
        }

        await sendSignInEmail({ to: member.email, name: member.name, link, code, minutes: expiresInMinutes, audience: 'member' });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Member auth error:', err);
        return NextResponse.json({ error: 'Unable to process sign-in right now' }, { status: 500 });
    }
}

// DELETE /api/members/auth — kept for compatibility; sign-out is POST /api/auth/logout
export async function DELETE() {
    return NextResponse.json({ ok: true });
}
