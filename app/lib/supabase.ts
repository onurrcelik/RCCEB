import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { query } from '@/app/lib/db';
import { INTERNAL_MEMBER_SELECT, InternalMember } from '@/app/lib/member-validation';

// Force every supabase-js request to bypass Next.js's fetch data cache.
// Without this, Next.js caches REST responses by URL+headers, freezing
// reads (e.g. /api/members/directory) until the container restarts.
const noStoreFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, cache: 'no-store' });

export function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Supabase configuration is missing');
    return createClient(url, key, {
        global: { fetch: noStoreFetch },
    });
}

// Shared by getMemberFromRequest and anything that needs the Supabase Auth
// user itself (not just the members row) — e.g. email-change, which has to
// call auth.admin.updateUserById(user.id, ...).
export async function getAuthUserFromRequest(request: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;

    const auth = createServerClient(url, anonKey, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: () => {},
        },
    });
    const { data: { user } } = await auth.auth.getUser();
    return user?.email ? user : null;
}

export async function getMemberFromRequest(request: NextRequest): Promise<InternalMember | null> {
    const user = await getAuthUserFromRequest(request);
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

// Defense-in-depth for routes: full membership gate independent of proxy.ts
// (member exists and is onboarded). Use in routes that would otherwise rely
// on middleware alone.
export async function requireActiveMember(request: NextRequest): Promise<InternalMember | null> {
    const member = await getMemberFromRequest(request);
    if (!member || !member.onboarding_complete) return null;
    return member;
}
