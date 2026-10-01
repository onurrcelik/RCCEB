import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { query } from '@/app/lib/db';
import { INTERNAL_MEMBER_SELECT, InternalMember } from '@/app/lib/member-validation';

export async function getMemberFromServerCookies(): Promise<InternalMember | null> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;

    const cookieStore = await cookies();
    const auth = createServerClient(url, anonKey, {
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: () => {},
        },
    });

    const { data: { user } } = await auth.auth.getUser();
    if (!user?.email) return null;

    const { rows } = await query<InternalMember>(
        `SELECT ${INTERNAL_MEMBER_SELECT} FROM members WHERE email ILIKE $1`,
        [user.email.toLowerCase().trim()],
    );

    const member = rows[0] ?? null;
    // Past members keep their data + directory listing but lose portal access:
    // treat them as unauthenticated everywhere.
    if (member?.is_past_member) return null;
    return member;
}
