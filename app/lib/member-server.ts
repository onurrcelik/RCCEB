import { cookies } from 'next/headers';
import { emailForSessionToken, SESSION_COOKIE } from '@/app/lib/auth';
import { getMemberByEmail } from '@/app/lib/member-session';
import type { InternalMember } from '@/app/lib/member-validation';

// For server components, which see cookies() rather than a NextRequest.
export async function getMemberFromServerCookies(): Promise<InternalMember | null> {
    const cookieStore = await cookies();
    const email = await emailForSessionToken(cookieStore.get(SESSION_COOKIE.member)?.value, 'member');
    return email ? getMemberByEmail(email) : null;
}
