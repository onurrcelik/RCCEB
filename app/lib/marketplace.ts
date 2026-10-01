export type MarketplaceAuthor = {
    id: string;
    name: string;
    avatar_url: string | null;
};

export type MarketplaceListing = {
    id: string;
    title: string;
    description: string;
    contact_info: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    author: MarketplaceAuthor;
    is_own: boolean;
};

export type MarketplaceListingInput = {
    title: string;
    description: string;
    contact_info: string;
    tags: string[];
};

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 30;

export function normalizeMarketplaceListingInput(body: Record<string, unknown>): {
    value?: MarketplaceListingInput;
    error?: string;
} {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const contact_info = typeof body.contact_info === 'string' ? body.contact_info.trim() : '';
    const tags = Array.isArray(body.tags)
        ? Array.from(new Set(
            body.tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map(tag => tag.trim())
                .filter(Boolean),
        ))
        : [];

    if (!title) return { error: 'Title is required' };
    if (!description) return { error: 'Description is required' };
    if (!contact_info) return { error: 'Add how members should contact you' };
    if (title.length > 140) return { error: 'Title is too long' };
    if (description.length > 3000) return { error: 'Description is too long' };
    if (contact_info.length > 300) return { error: 'Contact info is too long' };
    if (tags.length > MAX_TAGS || tags.some(tag => tag.length > MAX_TAG_LENGTH)) {
        return { error: `Use up to ${MAX_TAGS} tags, each ${MAX_TAG_LENGTH} characters or fewer` };
    }

    return { value: { title, description, contact_info, tags } };
}
