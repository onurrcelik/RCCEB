import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/app/lib/admin-auth';
import { fetchTextSafely } from '@/app/lib/request-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Source type from the hostname alone — the same buckets the member Links tab draws icons for.
function detectType(url: URL): string {
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'github.com' || host === 'gitlab.com') return 'repo';
    if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) return 'youtube';
    if (host.endsWith('linkedin.com')) return 'linkedin';
    if (host === 'twitter.com' || host === 'x.com') return 'twitter';
    if (host.endsWith('instagram.com')) return 'instagram';
    if (host === 'arxiv.org' || host.endsWith('ssrn.com') || host.endsWith('semanticscholar.org') || host.endsWith('.edu')) return 'paper';
    return 'article';
}

function decodeEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

// <meta property="og:title" content="…"> in either attribute order.
function metaContent(html: string, names: string[]): string {
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patterns = [
            new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
            new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match?.[1]?.trim()) return decodeEntities(match[1]);
        }
    }
    return '';
}

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

// POST /api/admin/manual-links/analyze — suggest a type, title and note for a link from
// its page metadata (og:title / og:description). The admin reviews and edits before saving.
export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url: rawUrl, pastedContent } = await request.json().catch(() => ({}));
    if (!rawUrl || typeof rawUrl !== 'string') return NextResponse.json({ error: 'url is required' }, { status: 400 });

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return NextResponse.json({ error: 'That is not a valid URL' }, { status: 400 });
    }

    const html = await fetchTextSafely(url.toString(), 200 * 1024);
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
    const title = metaContent(html, ['og:title', 'twitter:title']) || decodeEntities(titleTag)
        || `${url.hostname.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`;
    const description = metaContent(html, ['og:description', 'twitter:description', 'description'])
        || (typeof pastedContent === 'string' ? pastedContent.trim() : '');

    return NextResponse.json({
        type: detectType(url),
        title: truncate(title, 80),
        notes: truncate(description, 240),
    });
}
