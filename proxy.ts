import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { ADMIN_COOKIE_NAME } from '@/app/lib/admin-session';
import { query } from '@/app/lib/db';

function denyAdmin(request: NextRequest, pathname: string) {
    if (pathname.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/admin/login', request.url));
}

function denyMember(request: NextRequest, pathname: string) {
    if (pathname.startsWith('/api/members')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/members/login', request.url));
}

type MemberGateRow = {
    onboarding_complete: boolean;
    is_past_member: boolean;
};

// Rolling 30 days: every visit that refreshes the token pushes the expiry back out.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname === '/') return NextResponse.redirect(new URL('/members/dashboard', request.url));

    // Admin auth bypass — exact matches only, so a future route created under
    // these prefixes doesn't inherit public access by accident.
    if (pathname === '/admin/login') return NextResponse.next();
    if (pathname === '/api/admin/auth' && request.method === 'POST') return NextResponse.next();

    // Admin routes — validate the Supabase session against the admin email list.
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !anonKey) return denyAdmin(request, pathname);

        let adminResponse = NextResponse.next({ request });

        const supabase = createServerClient(supabaseUrl, anonKey, {
            cookieOptions: { name: ADMIN_COOKIE_NAME },
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    adminResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        adminResponse.cookies.set(name, value, { ...options, maxAge: SESSION_MAX_AGE });
                    });
                }
            },
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (!isAdminEmail(user?.email)) return denyAdmin(request, pathname);

        return adminResponse;
    }

    // Member auth bypass routes — exact matches only.
    if (pathname === '/members/login') return NextResponse.next();
    if (pathname === '/members/verify') return NextResponse.next();
    // Redeeming an onboarding invite is how a member gets their first session.
    if (pathname === '/members/invite') return NextResponse.next();
    if (pathname === '/auth/callback') return NextResponse.next();
    if (pathname === '/api/members/auth') return NextResponse.next();

    // Member routes — validate the Supabase session.
    if (pathname.startsWith('/members') || pathname.startsWith('/api/members')) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !anonKey) return denyMember(request, pathname);

        let supabaseResponse = NextResponse.next({ request });

        const supabase = createServerClient(supabaseUrl, anonKey, {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        supabaseResponse.cookies.set(name, value, { ...options, maxAge: SESSION_MAX_AGE });
                    });
                }
            },
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return denyMember(request, pathname);

        // Paths a signed-in member can reach before finishing onboarding. delete-account
        // is here so someone can always leave, onboarded or not.
        const isOnboardingPath =
            pathname.startsWith('/members/onboarding') ||
            pathname.startsWith('/api/members/onboarding') ||
            pathname.startsWith('/api/members/profile') ||
            pathname.startsWith('/api/members/upload-avatar') ||
            pathname.startsWith('/api/members/delete-account');

        // Fail closed: membership can't be verified without a working DB query, so
        // deny rather than let the request through.
        let member: MemberGateRow | undefined;
        try {
            const { rows } = await query<MemberGateRow>(
                'SELECT onboarding_complete, is_past_member FROM members WHERE email ILIKE $1',
                [user.email.toLowerCase()],
            );
            member = rows[0];
        } catch (e) {
            console.error('proxy.ts member-gate query failed:', e);
            return denyMember(request, pathname);
        }

        // Not a member, or marked as a past member.
        if (!member || member.is_past_member) return denyMember(request, pathname);

        if (!member.onboarding_complete && !isOnboardingPath) {
            if (pathname.startsWith('/members')) {
                return NextResponse.redirect(new URL('/members/onboarding', request.url));
            }
            return denyMember(request, pathname);
        }

        return supabaseResponse;
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.png|apple-touch-icon.png|rcceb-seal.png).*)'],
};
