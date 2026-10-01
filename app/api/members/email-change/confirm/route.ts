import { NextRequest, NextResponse } from 'next/server';
import { replyToAddress } from '@/app/lib/brand';
import { createHash, timingSafeEqual } from 'crypto';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { moveSessionsToEmail } from '@/app/lib/auth';
import { query } from '@/app/lib/db';
import { sendResendEmail } from '@/app/lib/member-auth';
import { checkRateLimit, retryAfterSeconds } from '@/app/lib/request-security';
import { escapeHtml } from '@/app/lib/html-escape';

const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
}

function hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// POST /api/members/email-change/confirm — redeem the code mailed to the new
// address, then swap it into the members row and move their sessions with it so
// they stay signed in.
export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { code } = await request.json();
    if (!code || typeof code !== 'string') {
        return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const limit = await checkRateLimit({ key: `email-change-confirm:member:${member.id}`, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(limit.resetAt)) } });
    }

    const { rows: pendingRows } = await query<{
        pending_email: string | null;
        pending_email_code_hash: string | null;
        pending_email_expires_at: string | null;
        pending_email_attempts: number;
    }>(
        'SELECT pending_email, pending_email_code_hash, pending_email_expires_at, pending_email_attempts FROM members WHERE id = $1',
        [member.id],
    );
    const row = pendingRows[0];

    if (!row?.pending_email || !row.pending_email_code_hash || !row.pending_email_expires_at) {
        return NextResponse.json({ error: 'No pending email change. Start over.' }, { status: 400 });
    }
    if (new Date(row.pending_email_expires_at).getTime() < Date.now()) {
        await query('UPDATE members SET pending_email = null, pending_email_code_hash = null, pending_email_expires_at = null, pending_email_attempts = 0 WHERE id = $1', [member.id]);
        return NextResponse.json({ error: 'That code has expired. Start over.' }, { status: 400 });
    }
    if (row.pending_email_attempts >= MAX_ATTEMPTS) {
        await query('UPDATE members SET pending_email = null, pending_email_code_hash = null, pending_email_expires_at = null, pending_email_attempts = 0 WHERE id = $1', [member.id]);
        return NextResponse.json({ error: 'Too many incorrect attempts. Start over.' }, { status: 400 });
    }

    if (!hashesMatch(hashCode(code.trim()), row.pending_email_code_hash)) {
        await query('UPDATE members SET pending_email_attempts = $2 WHERE id = $1', [member.id, row.pending_email_attempts + 1]);
        return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
    }

    const newEmail = row.pending_email;
    const oldEmail = member.email;

    try {
        await query(
            'UPDATE members SET email = $2, pending_email = null, pending_email_code_hash = null, pending_email_expires_at = null, pending_email_attempts = 0, updated_at = now() WHERE id = $1',
            [member.id, newEmail],
        );
    } catch (error) {
        // Unique violation: someone else claimed that address between the code being
        // sent and redeemed. Clear the pending change so they start over.
        if ((error as { code?: string } | undefined)?.code === '23505') {
            await query('UPDATE members SET pending_email = null, pending_email_code_hash = null, pending_email_expires_at = null, pending_email_attempts = 0 WHERE id = $1', [member.id]);
            return NextResponse.json({ error: 'That email could not be used. Please try a different one.' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Could not complete the change. Please try again.' }, { status: 500 });
    }
    await moveSessionsToEmail(oldEmail, newEmail);

    // Best-effort: let the old inbox know, in case this wasn't the member.
    sendResendEmail({
        to: oldEmail,
        subject: 'Your RCCEB sign-in email was changed',
        text: `Your RCCEB account email was changed to ${newEmail}.\n\nIf this wasn't you, contact ${replyToAddress()} immediately.`,
        html: `<p>Your RCCEB account email was changed to <strong>${escapeHtml(newEmail)}</strong>.</p><p>If this wasn't you, contact <a href="mailto:${replyToAddress()}">${replyToAddress()}</a> immediately.</p>`,
    }).catch(() => {});

    return NextResponse.json({ ok: true, email: newEmail });
}
