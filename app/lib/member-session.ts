import { NextRequest } from 'next/server';
import { query } from '@/app/lib/db';
import { sessionEmailFromRequest } from '@/app/lib/auth';
import { INTERNAL_MEMBER_SELECT, InternalMember } from '@/app/lib/member-validation';

// The signed-in member's email from their session cookie, or null.
export async function getSessionEmailFromRequest(request: NextRequest): Promise<string | null> {
    return sessionEmailFromRequest(request, 'member');
}

export async function getMemberByEmail(email: string): Promise<InternalMember | null> {
    const { rows } = await query<InternalMember>(
        `SELECT ${INTERNAL_MEMBER_SELECT} FROM members WHERE email ILIKE $1`,
        [email.toLowerCase().trim()],
    );
    const member = rows[0] ?? null;
    // Past members keep their data + directory listing but lose portal access:
    // treat them as unauthenticated everywhere.
    if (member?.is_past_member) return null;
    return member;
}

export async function getMemberFromRequest(request: NextRequest): Promise<InternalMember | null> {
    const email = await getSessionEmailFromRequest(request);
    return email ? getMemberByEmail(email) : null;
}

// Defense-in-depth for routes: full membership gate independent of proxy.ts
// (member exists and is onboarded). Use in routes that would otherwise rely
// on middleware alone.
export async function requireActiveMember(request: NextRequest): Promise<InternalMember | null> {
    const member = await getMemberFromRequest(request);
    if (!member || !member.onboarding_complete) return null;
    return member;
}
