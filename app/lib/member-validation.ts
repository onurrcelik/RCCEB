import { isValidGraduationYear, normalizeCategories } from '@/app/lib/categories';

const MAX_LENGTHS: Record<string, number> = {
    name: 120,
    bio: 280,
    avatar_url: 600,
    member_types: 120,
    linkedin: 300,
    location: 120,
    instagram: 300,
    twitter: 300,
    website: 5000,
    github: 300,
    favorite_resource: 500,
    occupation_link: 300,
    phone: 40,
};

const PUBLIC_MEMBER_FIELDS = [
    'id',
    'email',
    'name',
    'bio',
    'avatar_url',
    'member_types',
    'linkedin',
    'location',
    'instagram',
    'twitter',
    'website',
    'github',
    'favorite_resource',
    'occupation_link',
    'phone',
    'graduation_year',
    'categories',
    'is_past_member',
    'onboarding_complete',
    'created_at',
] as const;

const BOOLEAN_FIELDS = new Set(['onboarding_complete']);

type PublicMemberField = typeof PUBLIC_MEMBER_FIELDS[number];

export const INTERNAL_MEMBER_SELECT = PUBLIC_MEMBER_FIELDS.join(', ');

export const SAFE_MEMBER_SELECT = PUBLIC_MEMBER_FIELDS.join(', ');

export type MemberUpdates = Partial<Record<PublicMemberField, string | boolean | number | string[] | null>>;

export type InternalMember = {
    id: string;
    email: string;
    name: string | null;
    bio: string | null;
    avatar_url: string | null;
    member_types: string | null;
    linkedin: string | null;
    location: string | null;
    instagram: string | null;
    twitter: string | null;
    website: string | null;
    github: string | null;
    favorite_resource: string | null;
    occupation_link: string | null;
    phone: string | null;
    graduation_year: number | null;
    categories: string[];
    is_past_member: boolean;
    onboarding_complete: boolean;
    created_at: string;
};

export function sanitizeMemberForClient(member: Record<string, unknown>) {
    const safe: Record<string, unknown> = {};
    for (const field of PUBLIC_MEMBER_FIELDS) {
        if (member[field] !== undefined) safe[field] = member[field];
    }
    return safe;
}

export function normalizeMemberUpdates(body: Record<string, unknown>, allowed: string[]): { updates?: MemberUpdates; error?: string } {
    const updates: MemberUpdates = {};

    for (const key of allowed) {
        if (body[key] === undefined) continue;

        if (key === 'avatar_url') {
            return { error: 'Avatar URL cannot be updated directly' };
        }

        const value = body[key];

        if (key === 'categories') {
            updates.categories = normalizeCategories(value);
            continue;
        }

        if (value === null || value === '') {
            updates[key as PublicMemberField] = null;
            continue;
        }

        if (key === 'graduation_year') {
            if (!isValidGraduationYear(value)) return { error: 'Graduation year is not valid' };
            updates.graduation_year = Number(value);
            continue;
        }

        if (BOOLEAN_FIELDS.has(key)) {
            if (typeof value !== 'boolean') return { error: `${key} must be a boolean` };
            updates[key as PublicMemberField] = value;
            continue;
        }

        if (typeof value !== 'string') {
            return { error: `${key} must be a string` };
        }

        const normalized = value.trim();
        const max = MAX_LENGTHS[key] ?? 300;
        if (normalized.length > max) {
            return { error: `${key} is too long` };
        }

        updates[key as PublicMemberField] = normalized;
    }

    return { updates };
}
