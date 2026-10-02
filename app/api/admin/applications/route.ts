import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { APPLICATION_SELECT, insertApplication, normalizeApplicationInput } from '@/app/lib/applications';

export const dynamic = 'force-dynamic';

// Robert College checks each applicant really graduated before anyone is accepted.
const STATUS_VALUES = new Set(['submitted', 'sent to rc', 'rc verified']);
const ADMISSION_VALUES = new Set(['', 'accepted', 'deferred', 'declined']);

export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query(`SELECT ${APPLICATION_SELECT} FROM applications ORDER BY created_at DESC`);
        return NextResponse.json(rows);
    } catch (error) {
        console.error('Postgres error fetching applications:', error);
        return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { id, status, admission_status, notes } = await request.json();
        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        const updates: Record<string, unknown> = {};
        if (status !== undefined) {
            if (!STATUS_VALUES.has(status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
            updates.status = status;
        }
        if (admission_status !== undefined) {
            if (!ADMISSION_VALUES.has(admission_status)) return NextResponse.json({ error: 'Unknown admission status' }, { status: 400 });
            updates.admission_status = admission_status;
        }
        if (notes !== undefined) updates.notes = typeof notes === 'string' ? notes.slice(0, 5000) : '';
        if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

        // Column names come only from the fixed keys above, never the request body.
        const keys = Object.keys(updates);
        const setClause = [...keys.map((key, i) => `${key} = $${i + 1}`), 'updated_at = now()'].join(', ');
        const { rows } = await query(
            `UPDATE applications SET ${setClause} WHERE id = $${keys.length + 1} RETURNING ${APPLICATION_SELECT}`,
            [...keys.map(k => updates[k]), id],
        );
        return NextResponse.json({ data: rows[0] ?? null });
    } catch (error) {
        console.error('Postgres error updating application:', error);
        return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
    }
}

// POST — an admin adding someone who applied outside the website form.
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const body = await request.json().catch(() => ({}));
        const { value, error } = normalizeApplicationInput(body, { requireAgreements: false });
        if (!value) return NextResponse.json({ error }, { status: 400 });
        const row = await insertApplication(query, value, 'admin');
        return NextResponse.json(row, { status: 201 });
    } catch (error) {
        console.error('Postgres error creating application:', error);
        return NextResponse.json({ error: 'Failed to create application' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        await query('DELETE FROM applications WHERE id = $1', [id]);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Postgres error deleting application:', error);
        return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 });
    }
}
