import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/members/delete-account — the member deletes their own account.
//
// What this does: revokes access and records the request. is_past_member = true
// already means (a) /api/members/auth never mails another login link, and
// (b) getMemberFromRequest returns null, so every members endpoint answers 401.
//
// What this deliberately does NOT do: delete the row, wipe profile fields, or
// sign them out of other devices. Community records stay intact,
// and an admin can undo this by flipping is_past_member back. Nothing here
// claims the data was erased — the page that calls it says the same.
export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        await query(
            'UPDATE members SET is_past_member = true, deletion_requested_at = now(), updated_at = now() WHERE id = $1',
            [member.id],
        );
    } catch (error) {
        console.error('delete-account failed:', error);
        return NextResponse.json({ error: 'Could not complete the request.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
