import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';

type ManualLink = {
    id: string;
    url: string;
    title: string;
    type: string;
    notes: string | null;
    added_at: string;
};

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query<ManualLink>('SELECT * FROM manual_links ORDER BY added_at DESC');
        return NextResponse.json(rows);
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { url, title, type, notes, added_at } = body;

    if (!url || !title || !added_at) {
        return NextResponse.json({ error: 'url, title, and added_at are required' }, { status: 400 });
    }

    try {
        const { rows } = await query<ManualLink>(
            `INSERT INTO manual_links (url, title, type, notes, added_at) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [url, title, type || 'article', notes || null, added_at],
        );
        return NextResponse.json(rows[0], { status: 201 });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
