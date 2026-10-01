import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ADMIN_COOKIE_NAME } from '@/app/lib/admin-session';

// Who may sign into the admin dashboard. Configured per deployment rather than in code,
// as a comma-separated list: ADMIN_EMAILS="a@rcceb.org,b@rcceb.org".
export const ADMIN_ALLOWED_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

export function isAdminEmail(email?: string | null): boolean {
    return !!email && ADMIN_ALLOWED_EMAILS.includes(email.toLowerCase().trim());
}

export async function verifyAdminSession(request: NextRequest): Promise<boolean> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return false;

    const supabase = createServerClient(url, anonKey, {
        cookieOptions: { name: ADMIN_COOKIE_NAME },
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: () => {},
        },
    });
    const { data: { user } } = await supabase.auth.getUser();
    return isAdminEmail(user?.email);
}
