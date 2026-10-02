import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { isIntakeAuthorized } from '@/app/lib/intake-auth';
import { insertApplication, normalizeApplicationInput } from '@/app/lib/applications';
import { categoryLabel } from '@/app/lib/categories';
import { sendResendEmail } from '@/app/lib/member-auth';
import { escapeHtml } from '@/app/lib/html-escape';
import { getBaseUrl } from '@/app/lib/site-url';

export const dynamic = 'force-dynamic';

// POST /api/applications — intake for the rcceb.org/join form.
//
// The public website keeps its own form and posts to its own /api/join; that handler
// forwards the same JSON body here, server to server, with the shared secret in
// `Authorization: Bearer <APPLICATIONS_INTAKE_SECRET>`. The secret never reaches a
// browser, so nobody can write applications straight into the portal's database.
//
// This path is outside /api/admin and /api/members, so proxy.ts does not gate it —
// the secret check below is the only thing in front of it.

export async function POST(request: NextRequest) {
    if (!isIntakeAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { value, error } = normalizeApplicationInput(body, { requireAgreements: true });
    if (!value) return NextResponse.json({ error }, { status: 400 });

    // The join form's submission id (its sheet "User ID"). Optional, but when present it
    // makes the intake idempotent: a repeat is acknowledged without a second row or email.
    const rawExternalId = (body as Record<string, unknown>).externalId;
    const externalId = typeof rawExternalId === 'string' && rawExternalId.trim()
        ? rawExternalId.trim().slice(0, 100)
        : null;

    let row;
    try {
        // The site emails the RC clerks for verification at the same moment, so a new
        // application starts as "Sent to RC" (see /api/applications/rc-decision).
        row = await insertApplication(query, value, 'rcceb.org', externalId, 'sent to rc');
        if (!row && externalId) {
            const { rows } = await query<{ id: string }>('SELECT id FROM applications WHERE external_id = $1', [externalId]);
            return NextResponse.json({ ok: true, id: rows[0]?.id ?? null, duplicate: true });
        }
    } catch (err) {
        console.error('Application intake insert failed:', err);
        return NextResponse.json({ error: 'Could not save the application' }, { status: 500 });
    }

    // Tell the team. Best-effort: the application is already saved.
    const recipients = (process.env.NOTIFICATION_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean);
    const roles = value.categories.map(id => categoryLabel(id, 'label')).join(', ') || '—';
    const adminLink = `${getBaseUrl(request)}/admin/applications`;
    for (const to of recipients) {
        try {
            await sendResendEmail({
                to,
                subject: `New RCCEB application: ${value.name}`,
                text: `${value.name} (RC ${value.graduation_year ?? '—'}) applied to join RCCEB.\n\nRole: ${roles}\nEmail: ${value.email}\nPhone: ${value.phone}\nLinkedIn: ${value.linkedin ?? '—'}\n\nReview it: ${adminLink}`,
                html: `<p><strong>${escapeHtml(value.name)}</strong> (RC ${value.graduation_year ?? '—'}) applied to join RCCEB.</p>
<p>Role: ${escapeHtml(roles)}<br>Email: ${escapeHtml(value.email)}<br>Phone: ${escapeHtml(value.phone)}<br>LinkedIn: ${escapeHtml(value.linkedin ?? '—')}</p>
<p><a href="${adminLink}">Review it in the admin dashboard</a></p>`,
            });
        } catch (err) {
            console.error('New-application notification failed:', err);
        }
    }

    return NextResponse.json({ ok: true, id: row?.id ?? null }, { status: 201 });
}
