import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { isValidEmail } from '@/app/lib/request-security';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { isValidGraduationYear, normalizeCategories } from '@/app/lib/categories';

const MEMBER_SELECT = 'id, name, email, location, graduation_year, categories, is_past_member, onboarding_complete, created_at, linkedin, website';

// GET /api/admin/members — list all members
export async function GET(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rows } = await query(`SELECT ${MEMBER_SELECT} FROM members ORDER BY created_at DESC`);
        return NextResponse.json(rows);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }
}

// POST /api/admin/members — create a member manually
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const linkedin = typeof body.linkedin === 'string' ? body.linkedin.trim() : '';
    const categories = normalizeCategories(body.categories);
    const onboardingComplete = Boolean(body.onboarding_complete);
    const yearRaw = body.graduation_year;
    const graduationYear = yearRaw === '' || yearRaw === null || yearRaw === undefined ? null : Number(yearRaw);

    if (!name || !email) {
        return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    if (name.length > 120 || email.length > 254 || location.length > 120 || linkedin.length > 300) {
        return NextResponse.json({ error: 'One or more fields are too long' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (graduationYear !== null && !isValidGraduationYear(graduationYear)) {
        return NextResponse.json({ error: 'Graduation year is not valid' }, { status: 400 });
    }

    const { rows: existingRows } = await query('SELECT id FROM members WHERE email ILIKE $1', [email]);
    if (existingRows[0]) {
        return NextResponse.json({ error: 'A member with this email already exists' }, { status: 409 });
    }

    try {
        const { rows } = await query(
            `INSERT INTO members (name, email, location, linkedin, graduation_year, categories, onboarding_complete)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${MEMBER_SELECT}`,
            [name, email, location || null, linkedin || null, graduationYear, categories, onboardingComplete],
        );
        return NextResponse.json(rows[0], { status: 201 });
    } catch {
        return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
    }
}

// PATCH /api/admin/members — update a member
export async function PATCH(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const filtered: Record<string, unknown> = {};
    if (typeof body.onboarding_complete === 'boolean') filtered.onboarding_complete = body.onboarding_complete;
    if (typeof body.is_past_member === 'boolean') filtered.is_past_member = body.is_past_member;
    if (body.categories !== undefined) filtered.categories = normalizeCategories(body.categories);
    if (body.graduation_year !== undefined) {
        if (body.graduation_year === null) filtered.graduation_year = null;
        else if (isValidGraduationYear(body.graduation_year)) filtered.graduation_year = Number(body.graduation_year);
        else return NextResponse.json({ error: 'Graduation year is not valid' }, { status: 400 });
    }
    if (Object.keys(filtered).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    // Column names come only from the fixed keys above, never the request body.
    const keys = Object.keys(filtered);
    const setClause = [...keys.map((key, i) => `${key} = $${i + 1}`), 'updated_at = now()'].join(', ');
    try {
        await query(`UPDATE members SET ${setClause} WHERE id = $${keys.length + 1}`, [...keys.map(k => filtered[k]), id]);
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

// DELETE /api/admin/members — delete a member
export async function DELETE(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        await query('DELETE FROM members WHERE id = $1', [id]);
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
