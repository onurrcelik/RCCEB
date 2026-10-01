import { NextRequest } from 'next/server';
import { sessionEmailFromRequest } from '@/app/lib/auth';

// Who may sign into the admin dashboard. Configured per deployment rather than in code,
// as a comma-separated list: ADMIN_EMAILS="a@rcceb.org,b@rcceb.org".
export const ADMIN_ALLOWED_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

export function isAdminEmail(email?: string | null): boolean {
    return !!email && ADMIN_ALLOWED_EMAILS.includes(email.toLowerCase().trim());
}

// Checked on every admin request, so removing someone from ADMIN_EMAILS locks them out
// at the next request even if their session cookie is still valid.
export async function verifyAdminSession(request: NextRequest): Promise<boolean> {
    return isAdminEmail(await sessionEmailFromRequest(request, 'admin'));
}
