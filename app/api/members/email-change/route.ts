import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomInt } from 'crypto';
import { getMemberFromRequest } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { checkRateLimit, getClientIp, isValidEmail, retryAfterSeconds } from '@/app/lib/request-security';

const CODE_TTL_MS = 10 * 60 * 1000;

function hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
}

// POST /api/members/email-change — start a change: mail a 6-digit code to the
// NEW address to prove the member owns it before anything is swapped.
export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { newEmail } = await request.json();
    if (!newEmail || typeof newEmail !== 'string') {
        return NextResponse.json({ error: 'New email is required' }, { status: 400 });
    }
    const normalized = newEmail.toLowerCase().trim();
    if (normalized.length > 254 || !isValidEmail(normalized)) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (normalized === member.email.toLowerCase()) {
        return NextResponse.json({ error: 'That is already your email.' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit({ key: `email-change:ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000 });
    const memberLimit = await checkRateLimit({ key: `email-change:member:${member.id}`, limit: 5, windowMs: 60 * 60 * 1000 });
    if (!ipLimit.allowed || !memberLimit.allowed) {
        const resetAt = !ipLimit.allowed ? ipLimit.resetAt : memberLimit.resetAt;
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(resetAt)) } });
    }

    const { rows: taken } = await query(
        'SELECT id FROM members WHERE email ILIKE $1 AND id != $2',
        [normalized, member.id],
    );
    if (taken[0]) return NextResponse.json({ error: 'That email is already in use.' }, { status: 400 });

    const code = String(randomInt(100000, 1000000));
    try {
        await query(
            'UPDATE members SET pending_email = $2, pending_email_code_hash = $3, pending_email_expires_at = $4, pending_email_attempts = 0 WHERE id = $1',
            [member.id, normalized, hashCode(code), new Date(Date.now() + CODE_TTL_MS).toISOString()],
        );
    } catch {
        return NextResponse.json({ error: 'Could not start the change.' }, { status: 500 });
    }

    try {
        await sendResendEmail({
            to: normalized,
            subject: 'Confirm your new RCCEB email',
            text: `Enter this code on your RCCEB account page to confirm this as your new sign-in email:\n\n${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
            html: `<p>Enter this code on your RCCEB account page to confirm this as your new sign-in email:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
        });
    } catch (err) {
        console.error('email-change: send failed', err);
        // The code never reached them — don't leave a pending change they can't complete.
        await query(
            'UPDATE members SET pending_email = null, pending_email_code_hash = null, pending_email_expires_at = null, pending_email_attempts = 0 WHERE id = $1',
            [member.id],
        );
        return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}

// DELETE /api/members/email-change — cancel a pending change
export async function DELETE(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await query(
        'UPDATE members SET pending_email = null, pending_email_code_hash = null, pending_email_expires_at = null, pending_email_attempts = 0 WHERE id = $1',
        [member.id],
    );

    return NextResponse.json({ ok: true });
}
