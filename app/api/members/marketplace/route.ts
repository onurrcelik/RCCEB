import { NextRequest, NextResponse } from 'next/server';
import { normalizeMarketplaceListingInput, type MarketplaceListing, type MarketplaceListingType } from '@/app/lib/marketplace';
import { notifyNewMarketplaceListing } from '@/app/lib/marketplace-notify';
import { checkRateLimit, retryAfterSeconds } from '@/app/lib/request-security';
import { getBaseUrl } from '@/app/lib/site-url';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';

export const dynamic = 'force-dynamic';

const LISTING_SELECT = 'id, author_id, type, title, description, contact_info, tags, created_at, updated_at';
const AUTHOR_SELECT = 'id, name, avatar_url';

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...(init?.headers ?? {}),
        },
    });
}

export async function GET(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    let listings;
    try {
        ({ rows: listings } = await query<{ id: string; author_id: string; type: string; title: string; description: string; contact_info: string; tags: unknown; created_at: string; updated_at: string }>(
            `SELECT ${LISTING_SELECT} FROM marketplace_listings ORDER BY created_at DESC`,
        ));
    } catch {
        return jsonNoStore({ error: 'Failed to fetch Asks & Offers' }, { status: 500 });
    }
    if (listings.length === 0) return jsonNoStore({ listings: [] });

    const authorIds = Array.from(new Set(listings.map(listing => listing.author_id)));
    let authors;
    try {
        ({ rows: authors } = await query<{ id: string; name: string | null; avatar_url: string | null }>(
            `SELECT ${AUTHOR_SELECT} FROM members WHERE id = ANY($1)`,
            [authorIds],
        ));
    } catch {
        return jsonNoStore({ error: 'Failed to load Asks & Offers' }, { status: 500 });
    }

    const authorById = new Map(authors.map(author => [author.id, author]));

    const result: MarketplaceListing[] = listings
        .map(listing => {
            const author = authorById.get(listing.author_id);
            return {
                id: listing.id,
                type: listing.type as MarketplaceListingType,
                title: listing.title,
                description: listing.description,
                contact_info: listing.contact_info,
                tags: Array.isArray(listing.tags) ? listing.tags : [],
                created_at: listing.created_at,
                updated_at: listing.updated_at,
                author: {
                    id: listing.author_id,
                    name: author?.name || 'RCCEB member',
                    avatar_url: author?.avatar_url ?? null,
                },
                is_own: listing.author_id === member.id,
            };
        });

    return jsonNoStore({ listings: result });
}

export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member?.onboarding_complete) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = await checkRateLimit({
        limit: 10,
        windowMs: 60 * 60 * 1000,
        key: `marketplace:create:${member.id}`,
    });
    if (!rateLimit.allowed) {
        return jsonNoStore({ error: 'Too many posts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(rateLimit.resetAt)) } });
    }

    const body = await request.json().catch(() => ({}));
    const { value, error: validationError } = normalizeMarketplaceListingInput(body);
    if (!value || validationError) {
        return jsonNoStore({ error: validationError || 'Invalid post' }, { status: 400 });
    }

    let listing;
    try {
        ({ rows: [listing] } = await query<{ id: string }>(
            `INSERT INTO marketplace_listings (author_id, type, title, description, contact_info, tags)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${LISTING_SELECT}`,
            [member.id, value.type, value.title, value.description, value.contact_info, value.tags],
        ));
    } catch {
        return jsonNoStore({ error: 'Failed to create post' }, { status: 500 });
    }

    // Best-effort: the post is saved whether or not the emails go out.
    try {
        await notifyNewMarketplaceListing(
            { id: listing.id, type: value.type, title: value.title, description: value.description },
            { id: member.id, name: member.name },
            `${getBaseUrl(request)}/members/dashboard?section=marketplace`,
        );
    } catch (notifyError) {
        console.error('Asks & Offers notification failed', notifyError);
    }

    return jsonNoStore({ listing }, { status: 201 });
}
