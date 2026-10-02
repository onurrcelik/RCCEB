export interface EventRecord {
    id: string;
    title: string;
    description: string;
    date: string;
    location: string;
    type: 'In-person' | 'Online';
    attendees: number;
    images: string[];
    upcoming: boolean;
    // The event's own page, e.g. a Luma or Eventbrite link. Optional.
    link?: string | null;
    created_at?: string;
}

// Accepts what admins paste ("lu.ma/rcceb-dinner" or a full URL) and returns an https URL,
// null for blank, or an error for anything that isn't a web link.
export function normalizeEventLink(value: unknown): { link: string | null; error?: string } {
    if (value === undefined || value === null) return { link: null };
    if (typeof value !== 'string') return { link: null, error: 'Event link must be text' };
    const trimmed = value.trim();
    if (!trimmed) return { link: null };
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) throw new Error();
        if (url.href.length > 500) return { link: null, error: 'Event link is too long' };
        return { link: url.href };
    } catch {
        return { link: null, error: 'Event link must be a web address, like https://lu.ma/your-event' };
    }
}

export function toDateInputValue(value?: string) {
    if (!value) return '';

    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatEventDate(value?: string) {
    if (!value) return '';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}
