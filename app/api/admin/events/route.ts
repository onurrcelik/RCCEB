import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Same column set the POST insert accepts — PATCH must not let a caller name an
// arbitrary column, since column names can't be bind params.
const ALLOWED_EVENT_COLUMNS = ['title', 'description', 'date', 'location', 'type', 'attendees', 'images', 'upcoming'];

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...(init?.headers ?? {}),
        },
    });
}

function normalizeImages(images: unknown) {
    if (!Array.isArray(images)) return [];
    return images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0);
}

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query('SELECT * FROM events ORDER BY date DESC');
        return jsonNoStore(rows);
    } catch (error: unknown) {
        return jsonNoStore({ error: (error as Error | undefined)?.message ?? 'Failed to fetch events' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { title, description, date, location, type, attendees, images, upcoming } = body;
    if (!title || !date) return jsonNoStore({ error: 'title and date are required' }, { status: 400 });

    try {
        const { rows: [data] } = await query(
            `INSERT INTO events (title, description, date, location, type, attendees, images, upcoming)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [title, description, date, location, type, attendees, JSON.stringify(normalizeImages(images)), upcoming ?? false],
        );
        return jsonNoStore(data);
    } catch (error: unknown) {
        return jsonNoStore({ error: (error as Error | undefined)?.message ?? 'Failed to create event' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return jsonNoStore({ error: 'id required' }, { status: 400 });

    const columns = Object.keys(updates).filter(col => ALLOWED_EVENT_COLUMNS.includes(col));
    if (columns.length === 0) return jsonNoStore({ error: 'No valid fields to update' }, { status: 400 });

    const values = columns.map(col => col === 'images' ? JSON.stringify(normalizeImages(updates[col])) : updates[col]);
    const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');

    try {
        const { rows: [data] } = await query(
            `UPDATE events SET ${setClause} WHERE id = $1 RETURNING *`,
            [id, ...values],
        );
        return jsonNoStore(data);
    } catch (error: unknown) {
        return jsonNoStore({ error: (error as Error | undefined)?.message ?? 'Failed to update event' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return jsonNoStore({ error: 'id required' }, { status: 400 });

    try {
        await query('DELETE FROM events WHERE id = $1', [id]);
        return jsonNoStore({ ok: true });
    } catch (error: unknown) {
        return jsonNoStore({ error: (error as Error | undefined)?.message ?? 'Failed to delete event' }, { status: 500 });
    }
}
