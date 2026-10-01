import { NextRequest, NextResponse } from 'next/server';
import { normalizePitchDeckFields } from '@/app/lib/pitch-decks';
import { readDeckPdf } from '@/app/lib/pitch-deck-file';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query, withTransaction } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });

    const { value, error: validationError } = normalizePitchDeckFields({
        title: form.get('title'),
        company_name: form.get('company_name'),
        description: form.get('description'),
        stage: form.get('stage'),
    });
    if (!value || validationError) {
        return NextResponse.json({ error: validationError || 'Invalid deck' }, { status: 400 });
    }

    const uploaded = form.get('file');
    const replacingFile = uploaded instanceof File && uploaded.size > 0;
    const fileResult = replacingFile ? await readDeckPdf(uploaded) : null;
    if (fileResult && (!fileResult.value || fileResult.error)) {
        return NextResponse.json({ error: fileResult.error || 'Upload a PDF' }, { status: 400 });
    }

    try {
        const updated = await withTransaction(async q => {
            const file = fileResult?.value;
            const { rows } = await q(
                `UPDATE pitch_decks
                 SET title = $3, company_name = $4, description = $5, stage = $6,
                     file_name = COALESCE($7, file_name),
                     file_size = COALESCE($8, file_size),
                     updated_at = now()
                 WHERE id = $1 AND author_id = $2
                 RETURNING id`,
                [id, member.id, value.title, value.company_name, value.description, value.stage, file?.name ?? null, file?.size ?? null],
            );
            if (!rows[0]) return false;
            if (file) {
                await q(
                    `INSERT INTO pitch_deck_files (deck_id, bytes) VALUES ($1, $2)
                     ON CONFLICT (deck_id) DO UPDATE SET bytes = EXCLUDED.bytes`,
                    [id, file.bytes],
                );
            }
            return true;
        });
        if (!updated) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to update deck' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

    try {
        const { rowCount } = await query('DELETE FROM pitch_decks WHERE id = $1 AND author_id = $2', [id, member.id]);
        if (!rowCount) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete deck' }, { status: 500 });
    }
}
