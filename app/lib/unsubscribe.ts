import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '@/app/lib/db';
import { getBaseUrl } from '@/app/lib/site-url';

// Unsubscribe links are signed rather than stored so they keep working for
// emails we sent months ago, and so nobody can opt somebody else out by
// guessing a URL. No expiry on purpose — an unsubscribe link that has gone
// stale is worse than no link at all.
function secret(): string {
    const value = process.env.APP_SECRET;
    if (!value) throw new Error('APP_SECRET must be configured');
    return value;
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function base64url(value: Buffer | string): string {
    return Buffer.from(value).toString('base64url');
}

export function signEmail(email: string): string {
    return createHmac('sha256', secret()).update(normalizeEmail(email)).digest('base64url').slice(0, 32);
}

export function verifyToken(email: string, token: string): boolean {
    const expected = Buffer.from(signEmail(email));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
}

// Decodes the ?e= parameter, returning null for anything malformed.
export function decodeEmailParam(value: string | null): string | null {
    if (!value) return null;
    try {
        const email = normalizeEmail(Buffer.from(value, 'base64url').toString('utf8'));
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
    } catch {
        return null;
    }
}

export function buildUnsubscribeUrl(email: string): string {
    const normalized = normalizeEmail(email);
    return `${getBaseUrl()}/api/unsubscribe?e=${base64url(normalized)}&t=${signEmail(normalized)}`;
}

export async function isUnsubscribed(email: string): Promise<boolean> {
    try {
        const { rows } = await query('SELECT email FROM email_unsubscribes WHERE email = $1', [normalizeEmail(email)]);
        return rows.length > 0;
    } catch (error) {
        // Fail open so a database hiccup can't block every send, but make the reason
        // loud — silently treating everyone as subscribed is how opt-outs get ignored.
        console.error('isUnsubscribed check failed, sending anyway:', error);
        return false;
    }
}

export async function recordUnsubscribe(email: string, source: 'one_click' | 'link' | 'admin') {
    // upsert so a second click (or a client that fires both POST and GET) is a no-op
    // rather than a primary-key error surfaced to the person unsubscribing.
    try {
        await query(
            'INSERT INTO email_unsubscribes (email, source) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET source = EXCLUDED.source',
            [normalizeEmail(email), source],
        );
    } catch (error) {
        // Never swallow this: showing "you're unsubscribed" over a failed write is the
        // exact failure members reported. Let the caller render an honest error instead.
        throw new Error(`Failed to record unsubscribe: ${error}`);
    }
}

export async function clearUnsubscribe(email: string) {
    try {
        await query('DELETE FROM email_unsubscribes WHERE email = $1', [normalizeEmail(email)]);
    } catch (error) {
        throw new Error(`Failed to clear unsubscribe: ${error}`);
    }
}
