import { NextRequest, NextResponse } from 'next/server';
import { isPitchStage, type PitchDeck } from '@/app/lib/pitch-decks';
import { readDeckPdf } from '@/app/lib/pitch-deck-file';
import { normalizePitchDeckFields } from '@/app/lib/pitch-decks';
import { checkRateLimit, retryAfterSeconds } from '@/app/lib/request-security';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query, withTransaction } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

const DECK_SELECT = `
    d.id, d.title, d.company_name, d.description, d.stage, d.file_name, d.file_size,
    d.view_count, d.created_at, d.updated_at, d.author_id,
    m.name AS author_name, m.avatar_url AS author_avatar
`;

type DeckRow = {
    id: string;
    title: string;
    company_name: string;
    description: string;
    stage: string;
    file_name: string;
    file_size: number;
    view_count: number;
    created_at: string;
    updated_at: string;
    author_id: string;
    author_name: string | null;
    author_avatar: string | null;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...(init?.headers ?? {}),
        },
    });
}

function toDeck(row: DeckRow, memberId: string): PitchDeck | null {
    if (!isPitchStage(row.stage)) return null;
    return {
        id: row.id,
        title: row.title,
        company_name: row.company_name,
        description: row.description,
        stage: row.stage,
        file_name: row.file_name,
        file_size: row.file_size,
        view_count: row.view_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author: {
            id: row.author_id,
            name: row.author_name || 'RCCEB member',
            avatar_url: row.author_avatar,
        },
        is_own: row.author_id === memberId,
    };
}

async function fieldsFromForm(form: FormData) {
    return normalizePitchDeckFields({
        title: form.get('title'),
        company_name: form.get('company_name'),
        description: form.get('description'),
        stage: form.get('stage'),
    });
}

export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { rows } = await query<DeckRow>(
            `SELECT ${DECK_SELECT}
             FROM pitch_decks d
             JOIN members m ON m.id = d.author_id
             ORDER BY d.created_at DESC`,
        );
        const decks = rows.flatMap(row => {
            const deck = toDeck(row, member.id);
            return deck ? [deck] : [];
        });
        return jsonNoStore({ decks });
    } catch {
        return jsonNoStore({ error: 'Failed to fetch pitch decks' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await checkRateLimit({
        limit: 10,
        windowMs: 60 * 60 * 1000,
        key: `pitch-deck:create:${member.id}`,
    });
    if (!rateLimit.allowed) {
        return jsonNoStore(
            { error: 'Too many decks. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rateLimit.resetAt)) } },
        );
    }

    const form = await request.formData().catch(() => null);
    if (!form) return jsonNoStore({ error: 'Invalid upload' }, { status: 400 });

    const { value, error: validationError } = await fieldsFromForm(form);
    if (!value || validationError) return jsonNoStore({ error: validationError || 'Invalid deck' }, { status: 400 });

    const fileResult = await readDeckPdf(form.get('file'));
    if (!fileResult.value || fileResult.error) {
        return jsonNoStore({ error: fileResult.error || 'Add a PDF of your deck' }, { status: 400 });
    }
    const file = fileResult.value;

    try {
        const deck = await withTransaction(async q => {
            const inserted = await q<{ deck_id: string }>(
                `WITH created AS (
                    INSERT INTO pitch_decks (author_id, title, company_name, description, stage, file_name, file_size)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id
                 )
                 INSERT INTO pitch_deck_files (deck_id, bytes)
                 SELECT id, $8 FROM created
                 RETURNING deck_id`,
                [member.id, value.title, value.company_name, value.description, value.stage, file.name, file.size, file.bytes],
            );
            const id = inserted.rows[0]?.deck_id;
            if (!id) throw new Error('insert failed');
            const { rows } = await q<DeckRow>(
                `SELECT ${DECK_SELECT} FROM pitch_decks d JOIN members m ON m.id = d.author_id WHERE d.id = $1`,
                [id],
            );
            return rows[0];
        });
        const mapped = deck ? toDeck(deck, member.id) : null;
        if (!mapped) return jsonNoStore({ error: 'Failed to save deck' }, { status: 500 });
        return jsonNoStore({ deck: mapped }, { status: 201 });
    } catch {
        return jsonNoStore({ error: 'Failed to save deck' }, { status: 500 });
    }
}
