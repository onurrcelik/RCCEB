import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, deleteSession, SESSION_COOKIE, type SessionKind } from '@/app/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout — { kind: 'member' | 'admin' }
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const kind: SessionKind = body.kind === 'admin' ? 'admin' : 'member';
    await deleteSession(request.cookies.get(SESSION_COOKIE[kind])?.value).catch(() => {});
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response, kind);
    return response;
}
