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
    created_at?: string;
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
