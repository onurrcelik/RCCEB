import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

const BLOCKED_DOMAINS = [
    'meet.google.com',
    'zoom.us',
    'wa.me',
    'chat.whatsapp.com',
    'web.whatsapp.com',
    't.me',
    'calendar.google.com',
    'forms.gle',
    'forms.google.com',
    'docs.google.com',
    'drive.google.com',
    'notion.so',
    'loom.com',
];

function isBlocked(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch {
        return true;
    }
}

const TYPE_LABEL: Record<string, string> = {
    repo: 'GitHub',
    article: 'Article',
    paper: 'Research',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
    instagram: 'Instagram',
    youtube: 'YouTube',
    other: 'Link',
};

// Links curated by admins on the Links page, grouped by the month they were added
// so the member tab reads newest first.
export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let links: { id: string; url: string; type: string; title: string; notes: string; added_at: string }[];
    try {
        ({ rows: links } = await query<{ id: string; url: string; type: string; title: string; notes: string; added_at: string }>(
            'SELECT id, url, type, title, notes, added_at FROM manual_links ORDER BY added_at DESC',
        ));
    } catch {
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    const byMonth = new Map<string, typeof links>();
    for (const link of links) {
        if (isBlocked(link.url)) continue;
        const month = String(link.added_at).slice(0, 7);
        const bucket = byMonth.get(month);
        if (bucket) bucket.push(link);
        else byMonth.set(month, [link]);
    }

    const groups = [...byMonth.entries()].map(([month, monthLinks]) => ({
        id: month,
        date_from: monthLinks[monthLinks.length - 1].added_at,
        date_to: monthLinks[0].added_at,
        links: monthLinks.map(l => ({
            url: l.url,
            type: l.type,
            label: TYPE_LABEL[l.type] || 'Link',
            title: l.title,
            notes: l.notes,
        })),
    }));

    return NextResponse.json({ groups });
}
