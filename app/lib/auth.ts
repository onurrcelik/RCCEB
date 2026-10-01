import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';

// Passwordless sign-in, stored in our own database.
//
// Requesting a sign-in creates one auth_codes row holding two secrets: a long token for
// the emailed link and a 6-digit code for typing in. Either one, used once, opens a
// session: a random token in an httpOnly cookie whose hash is kept in auth_sessions.
// Only hashes are stored, so a database leak hands out no working links or sessions.
//
// Members and admins sign in separately and keep separate cookies, so signing into one
// never signs you out of the other.

export type SessionKind = 'member' | 'admin';

export const SESSION_COOKIE: Record<SessionKind, string> = {
    member: 'rcceb_session',
    admin: 'rcceb_admin_session',
};

const SESSION_DAYS = 30;
const CODE_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// ── Sign-in codes ────────────────────────────────────────────────────────────

// Returns the raw link token and code — the only time either exists in plaintext.
// A new request replaces any earlier unused one for the same email and kind.
export async function createSignInCode(email: string, kind: SessionKind) {
    const normalized = normalizeEmail(email);
    const linkToken = randomBytes(32).toString('base64url');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000);

    await query('DELETE FROM auth_codes WHERE email = $1 AND kind = $2 AND used_at IS NULL', [normalized, kind]);
    await query(
        `INSERT INTO auth_codes (email, kind, link_token_hash, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [normalized, kind, sha256(linkToken), sha256(code), expiresAt.toISOString()],
    );
    return { linkToken, code, expiresInMinutes: CODE_MINUTES };
}

type CodeRow = { id: string; email: string; kind: SessionKind; code_hash: string; attempts: number };

// Consumes an emailed link token. Returns the email it was issued to, or null.
export async function redeemLinkToken(token: string, kind: SessionKind): Promise<string | null> {
    const { rows } = await query<{ email: string }>(
        `UPDATE auth_codes SET used_at = now()
         WHERE link_token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
         RETURNING email`,
        [sha256(token), kind],
    );
    return rows[0]?.email ?? null;
}

// Consumes a typed 6-digit code. Five wrong tries burn the code.
export async function redeemCode(email: string, code: string, kind: SessionKind): Promise<string | null> {
    const normalized = normalizeEmail(email);
    const { rows } = await query<CodeRow>(
        `SELECT id, email, kind, code_hash, attempts FROM auth_codes
         WHERE email = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1`,
        [normalized, kind],
    );
    const row = rows[0];
    if (!row || row.attempts >= MAX_CODE_ATTEMPTS) return null;

    if (!/^\d{6}$/.test(code) || !safeEqualHex(row.code_hash, sha256(code))) {
        await query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        return null;
    }

    const { rowCount } = await query('UPDATE auth_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL', [row.id]);
    return rowCount ? row.email : null;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(email: string, kind: SessionKind): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await query(
        'INSERT INTO auth_sessions (token_hash, email, kind, expires_at) VALUES ($1, $2, $3, $4)',
        [sha256(token), normalizeEmail(email), kind, expiresAt.toISOString()],
    );
    // Opportunistic cleanup instead of a cron job.
    if (Math.random() < 0.05) {
        query("DELETE FROM auth_sessions WHERE expires_at < now() - interval '1 day'").catch(() => {});
        query("DELETE FROM auth_codes WHERE expires_at < now() - interval '1 day'").catch(() => {});
    }
    return token;
}

// The signed-in email for this cookie value, or null. Each successful lookup pushes the
// expiry out again (rolling 30 days), at most once a day so reads stay cheap.
export async function emailForSessionToken(token: string | undefined, kind: SessionKind): Promise<string | null> {
    if (!token) return null;
    const { rows } = await query<{ email: string; expires_at: string }>(
        'SELECT email, expires_at FROM auth_sessions WHERE token_hash = $1 AND kind = $2 AND expires_at > now()',
        [sha256(token), kind],
    );
    const row = rows[0];
    if (!row) return null;

    const remainingMs = new Date(row.expires_at).getTime() - Date.now();
    if (remainingMs < (SESSION_DAYS - 1) * 24 * 60 * 60 * 1000) {
        query(
            `UPDATE auth_sessions SET expires_at = now() + interval '${SESSION_DAYS} days' WHERE token_hash = $1`,
            [sha256(token)],
        ).catch(() => {});
    }
    return row.email;
}

export function sessionEmailFromRequest(request: NextRequest, kind: SessionKind) {
    return emailForSessionToken(request.cookies.get(SESSION_COOKIE[kind])?.value, kind);
}

export async function deleteSession(token: string | undefined) {
    if (token) await query('DELETE FROM auth_sessions WHERE token_hash = $1', [sha256(token)]);
}

// Keeps someone signed in when their sign-in email changes.
export async function moveSessionsToEmail(oldEmail: string, newEmail: string) {
    await query('UPDATE auth_sessions SET email = $1 WHERE email = $2', [normalizeEmail(newEmail), normalizeEmail(oldEmail)]);
}

export function setSessionCookie(response: NextResponse, kind: SessionKind, token: string) {
    response.cookies.set(SESSION_COOKIE[kind], token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
}

export function clearSessionCookie(response: NextResponse, kind: SessionKind) {
    response.cookies.set(SESSION_COOKIE[kind], '', { httpOnly: true, path: '/', maxAge: 0 });
}
