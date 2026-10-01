import { NextRequest, NextResponse } from 'next/server';
import { normalizeMarketplaceListingInput } from '@/app/lib/marketplace';
import { getMemberFromRequest } from '@/app/lib/supabase';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { value, error: validationError } = normalizeMarketplaceListingInput(body);
    if (!value || validationError) {
        return NextResponse.json({ error: validationError || 'Invalid listing' }, { status: 400 });
    }

    try {
        const { rows } = await query(
            `UPDATE marketplace_listings SET title = $3, description = $4, contact_info = $5, tags = $6, updated_at = now()
             WHERE id = $1 AND author_id = $2 RETURNING id`,
            [id, member.id, value.title, value.description, value.contact_info, value.tags],
        );
        if (!rows[0]) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to update listing' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    try {
        await query('DELETE FROM marketplace_listings WHERE id = $1 AND author_id = $2', [id, member.id]);
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 });
    }
}
