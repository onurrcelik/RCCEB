import { NextRequest, NextResponse } from 'next/server';
import { normalizeJobBoardPostInput } from '@/app/lib/job-board';
import { getMemberFromRequest } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedPost(id: string, memberId: string) {
    const { rows } = await query<{ id: string; author_id: string; type: string; title: string; description: string; location: string | null; tags: unknown; status: string; closed_at: string | null }>(
        'SELECT id, author_id, type, title, description, location, tags, status, closed_at FROM job_board_posts WHERE id = $1 AND author_id = $2',
        [id, memberId],
    );
    return rows[0] ?? null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const existing = await getOwnedPost(id, member.id);
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));

    if (body.action === 'close') {
        if (existing.status === 'closed') return NextResponse.json({ ok: true });
        try {
            await query(
                "UPDATE job_board_posts SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = $1 AND author_id = $2",
                [id, member.id],
            );
            return NextResponse.json({ ok: true });
        } catch {
            return NextResponse.json({ error: 'Failed to close post' }, { status: 500 });
        }
    }

    const { value, error: validationError } = normalizeJobBoardPostInput(body);
    if (!value || validationError) {
        return NextResponse.json({ error: validationError || 'Invalid post' }, { status: 400 });
    }

    try {
        await query(
            'UPDATE job_board_posts SET type = $3, title = $4, description = $5, location = $6, tags = $7, updated_at = now() WHERE id = $1 AND author_id = $2',
            [id, member.id, value.type, value.title, value.description, value.location, value.tags],
        );
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    try {
        await query('DELETE FROM job_board_posts WHERE id = $1 AND author_id = $2', [id, member.id]);
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
    }
}
