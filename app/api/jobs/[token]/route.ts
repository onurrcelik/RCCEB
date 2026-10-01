import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

// Public (unauthenticated) fetch of a single job by its share token, used by the
// "refer an outside friend" apply page. Exposes only the info an external person
// needs to decide whether to apply — never contact details.
export async function GET(_request: NextRequest, { params }: RouteContext) {
    const { token } = await params;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { rows: postRows } = await query<{
        id: string;
        author_id: string;
        title: string;
        description: string;
        location: string | null;
        status: string;
    }>(
        'SELECT id, author_id, title, description, location, status FROM job_board_posts WHERE share_token = $1',
        [token],
    );
    const post = postRows[0];

    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [{ rows: authorRows }, { rows: companyRows }] = await Promise.all([
        query<{ name: string | null }>('SELECT name FROM members WHERE id = $1', [post.author_id]),
        query<{ company_name: string }>('SELECT company_name FROM member_companies WHERE member_id = $1', [post.author_id]),
    ]);
    const author = authorRows[0];
    const company = companyRows[0];

    return NextResponse.json({
        job: {
            title: post.title,
            description: post.description,
            location: post.location,
            status: post.status,
            poster_name: author?.name || 'An RCCEB member',
            company_name: company?.company_name ?? null,
        },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
}
