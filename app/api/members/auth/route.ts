import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { generateMemberLinkDetails, sendResendEmail } from '@/app/lib/member-auth';
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
        const { link: magicLink, otp } = await generateMemberLinkDetails(normalizedEmail, `${baseUrl}/auth/callback`, ['magiclink', 'invite', 'signup']);
        // Local development has no mail delivery to rely on; hand the link straight back.
        if (process.env.NODE_ENV !== 'production') {
            return NextResponse.json({ ok: true, devLink: magicLink });
        }

        const firstName = (member.name || 'there').split(' ')[0];
        const otpText = otp ? `\n\nOr enter this code on the sign-in page: ${otp}` : '';
        const text = `Welcome back, ${firstName}

Sign in to RCCEB using the link below. This link expires in 15 minutes.

${magicLink}${otpText}

If you didn't request this, you can safely ignore this email.`;
        const html = `<p>Welcome back, ${firstName}</p>
<p><a href="${magicLink}">Click this link to log in</a></p>
${otp ? `<p>Or enter this code on the sign-in page: <strong style="font-size:18px;letter-spacing:2px;">${otp}</strong></p>` : ''}
<p>If you didn't request this, you can safely ignore this email.</p>`;

        await sendResendEmail({
            to: member.email,
            subject: 'Your RCCEB login link',
            text,
            html,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Member auth error:', err);
        return NextResponse.json({ error: 'Unable to process sign-in right now' }, { status: 500 });
    }
}

// DELETE /api/members/auth — logout handled client-side via Supabase auth
export async function DELETE() {
    return NextResponse.json({ ok: true });
}
