import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeFileName(name: string) {
    const cleaned = name.replace(/[\r\n"]/g, '').trim();
    return cleaned.slice(0, 180) || 'deck.pdf';
}

export async function GET(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

    try {
        const { rows } = await query<{ bytes: Buffer; file_name: string; author_id: string }>(
            `SELECT f.bytes, d.file_name, d.author_id
             FROM pitch_deck_files f
             JOIN pitch_decks d ON d.id = f.deck_id
             WHERE d.id = $1`,
            [id],
        );
        const file = rows[0];
        if (!file) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

        if (file.author_id !== member.id) {
            await query(
                `WITH inserted AS (
                    INSERT INTO pitch_deck_views (deck_id, member_id)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                    RETURNING deck_id
                 )
                 UPDATE pitch_decks
                 SET view_count = view_count + 1
                 WHERE id = $1 AND EXISTS (SELECT 1 FROM inserted)`,
                [id, member.id],
            );
        }

        const bytes = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${safeFileName(file.file_name)}"`,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return NextResponse.json({ error: 'Could not open this deck' }, { status: 500 });
    }
}
