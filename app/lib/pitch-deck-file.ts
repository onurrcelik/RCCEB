import { detectDocKind } from '@/app/lib/upload-security';
import { MAX_DECK_BYTES } from '@/app/lib/pitch-decks';

export type StoredDeckFile = {
    name: string;
    bytes: Buffer;
    size: number;
};

function cleanFileName(name: string): string {
    const base = name.split(/[/\\]/).pop()?.replace(/[^\w.\- ()]/g, '').trim() || 'deck.pdf';
    const trimmed = base.slice(0, 180);
    return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

export async function readDeckPdf(file: unknown): Promise<{ value?: StoredDeckFile; error?: string }> {
    if (!(file instanceof File) || file.size === 0) {
        return { error: 'Add a PDF of your deck' };
    }
    if (file.size > MAX_DECK_BYTES) {
        return { error: 'PDF must be 4 MB or smaller' };
    }
    if (file.type && file.type !== 'application/pdf') {
        return { error: 'Upload a PDF' };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (detectDocKind(bytes) !== 'pdf') {
        return { error: 'That file is not a PDF' };
    }

    return {
        value: {
            name: cleanFileName(file.name || 'deck.pdf'),
            bytes,
            size: bytes.length,
        },
    };
}
