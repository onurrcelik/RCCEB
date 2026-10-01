import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { sessionEmailFromRequest } from '@/app/lib/auth';
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

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname === '/') return NextResponse.redirect(new URL('/members/dashboard', request.url));

    // Admin auth bypass — exact matches only, so a future route created under
    // these prefixes doesn't inherit public access by accident.
    if (pathname === '/admin/login') return NextResponse.next();
    if (pathname === '/api/admin/auth' && request.method === 'POST') return NextResponse.next();

    // Admin routes — validate the admin session against the admin email list.
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
        let email: string | null = null;
        try {
            email = await sessionEmailFromRequest(request, 'admin');
        } catch (e) {
            console.error('proxy.ts admin session lookup failed:', e);
        }
        if (!isAdminEmail(email)) return denyAdmin(request, pathname);
        return NextResponse.next();
    }

    // Member auth bypass routes — exact matches only.
    if (pathname === '/members/login') return NextResponse.next();
    // Redeeming an onboarding invite is how a member gets their first session.
    if (pathname === '/members/invite') return NextResponse.next();
    if (pathname === '/api/members/auth') return NextResponse.next();

    // Member routes — validate the member session.
    if (pathname.startsWith('/members') || pathname.startsWith('/api/members')) {
        let email: string | null = null;
        try {
            email = await sessionEmailFromRequest(request, 'member');
        } catch (e) {
            console.error('proxy.ts member session lookup failed:', e);
            return denyMember(request, pathname);
        }
        if (!email) return denyMember(request, pathname);

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
                [email],
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

        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.png|apple-touch-icon.png|rcceb-seal.png).*)'],
};
