import { NextRequest, NextResponse } from 'next/server';
import { generateMemberLinkDetails, sendResendEmail } from '@/app/lib/member-auth';
import { checkRateLimit, getClientIp, isValidEmail, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';
import { isAdminEmail } from '@/app/lib/admin-auth';

// POST /api/admin/auth — send a magic link to a whitelisted admin email.
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
        const ipLimit = await checkRateLimit({ key: `admin-auth:ip:${ip}`, limit: 8, windowMs: 15 * 60 * 1000 });
        const emailLimit = await checkRateLimit({ key: `admin-auth:email:${normalizedEmail}`, limit: 5, windowMs: 15 * 60 * 1000 });
        if (!ipLimit.allowed || !emailLimit.allowed) {
            const resetAt = !ipLimit.allowed ? ipLimit.resetAt : emailLimit.resetAt;
            return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(resetAt)) } });
        }

        // Don't reveal whether an email is whitelisted.
        if (!isAdminEmail(normalizedEmail)) {
            return NextResponse.json({ ok: true });
        }

        const baseUrl = getBaseUrl(request);
        const { link: magicLink, otp } = await generateMemberLinkDetails(normalizedEmail, `${baseUrl}/auth/admin/callback`, ['magiclink', 'invite', 'signup']);

        if (process.env.NODE_ENV !== 'production') {
            return NextResponse.json({ ok: true, devLink: magicLink });
        }

        const otpText = otp ? `\n\nOr enter this code on the sign-in page: ${otp}` : '';
        const text = `Sign in to the RCCEB admin dashboard using the link below. This link expires in 15 minutes.

${magicLink}${otpText}

If you didn't request this, you can safely ignore this email.`;
        const html = `<p>Sign in to the RCCEB admin dashboard.</p>
<p><a href="${magicLink}">Click this link to log in</a></p>
${otp ? `<p>Or enter this code on the sign-in page: <strong style="font-size:18px;letter-spacing:2px;">${otp}</strong></p>` : ''}
<p>If you didn't request this, you can safely ignore this email.</p>`;

        await sendResendEmail({
            to: normalizedEmail,
            subject: 'Your RCCEB admin login link',
            text,
            html,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Admin auth error:', err);
        return NextResponse.json({ error: 'Unable to process sign-in right now' }, { status: 500 });
    }
}

// DELETE /api/admin/auth — logout handled client-side via Supabase auth
export async function DELETE() {
    return NextResponse.json({ ok: true });
}
