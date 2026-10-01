import { createHash, randomBytes } from 'crypto';
import { query } from '@/app/lib/db';

// Onboarding invites are sent by an admin and opened on a human timescale — hours,
// often days, so the invite carries its own long-lived token (30 days), separate from
// the 15-minute sign-in codes. /members/invite trades it for a session at click time.
export const INVITE_TTL_DAYS = 30;

export function hashInviteToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

// Returns the raw token — the only time it exists in plaintext. Only its hash is stored.
export async function issueInviteToken(memberId: string): Promise<string> {
    const now = new Date();

    // A resent invite supersedes whatever was mailed before.
    await query(
        'UPDATE member_invites SET revoked_at = $1 WHERE member_id = $2 AND revoked_at IS NULL',
        [now.toISOString(), memberId],
    );

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    try {
        await query(
            'INSERT INTO member_invites (member_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [memberId, hashInviteToken(token), expiresAt.toISOString()],
        );
    } catch (error) {
        throw new Error(`Failed to store invite token: ${error}`);
    }
    return token;
}

export function buildInviteUrl(baseUrl: string, token: string): string {
    return `${baseUrl}/members/invite?token=${encodeURIComponent(token)}`;
}
