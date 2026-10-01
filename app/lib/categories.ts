// RCCEB's four membership pathways, as offered on rcceb.org/join. The ids are the
// exact values the join form submits, so an application's categories can be copied
// onto the member row unchanged.
export const MEMBER_CATEGORIES = [
    { id: 'young-entrepreneur', label: 'RC Young Entrepreneur', short: 'Young Entrepreneur', description: 'Building their first venture(s)' },
    { id: 'experienced-entrepreneur', label: 'RC Experienced Entrepreneur', short: 'Experienced Entrepreneur', description: 'Seasoned founder with exits or scale' },
    { id: 'executive', label: 'RC Executive', short: 'Executive', description: 'Senior leader in industry or community' },
    { id: 'investor', label: 'RC Investor', short: 'Investor', description: 'Angel, VC or institutional investor' },
] as const;

export type MemberCategoryId = typeof MEMBER_CATEGORIES[number]['id'];

const CATEGORY_IDS = new Set<string>(MEMBER_CATEGORIES.map(c => c.id));

export function isCategoryId(value: unknown): value is MemberCategoryId {
    return typeof value === 'string' && CATEGORY_IDS.has(value);
}

// Keeps only known ids, de-duplicated and in canonical order. Accepts an array or a
// comma-separated string so it can sit in front of both JSON bodies and form posts.
export function normalizeCategories(value: unknown): MemberCategoryId[] {
    const raw = Array.isArray(value)
        ? value
        : typeof value === 'string' ? value.split(',') : [];
    const given = new Set(raw.map(v => String(v).trim()));
    return MEMBER_CATEGORIES.filter(c => given.has(c.id)).map(c => c.id);
}

export function categoryLabel(id: string, form: 'label' | 'short' = 'short'): string {
    const found = MEMBER_CATEGORIES.find(c => c.id === id);
    return found ? found[form] : id;
}

// Robert College class years run back to the 1950s on the join form.
export const FIRST_GRADUATION_YEAR = 1950;

export function isValidGraduationYear(value: unknown): value is number {
    const year = Number(value);
    const latest = new Date().getFullYear() + 6;
    return Number.isInteger(year) && year >= FIRST_GRADUATION_YEAR && year <= latest;
}

// "RC '05" — how a class year reads on a member card.
export function classYearLabel(year: number | null | undefined): string | null {
    if (!year) return null;
    return `RC '${String(year).slice(-2)}`;
}

// ── Weekly 1-on-1 matching pool ────────────────────────────────────────────────
// Every onboarded, current member takes part. There's no paywall or cohort to filter
// on, so the pool is simply everyone who finished onboarding and hasn't been marked
// as a past member.
export type MatchPoolSource = {
    id: string;
    email?: string | null;
    onboarding_complete: boolean | null;
    is_past_member?: boolean | null;
};

export const MATCH_POOL_SELECT = 'id, email, onboarding_complete, is_past_member';

export function isMatchEligible(row: MatchPoolSource): boolean {
    return !!row.onboarding_complete && !row.is_past_member;
}

// Sector chips on a member's profile (stored comma-separated in members.member_types).
export const SECTOR_OPTIONS = ['Tech', 'Finance', 'Investing', 'Consumer', 'Industrial', 'Healthcare', 'Energy', 'Real Estate', 'Media', 'Operations'];

// Expertise tags asked at onboarding. Stored on members.expertise. The labels are
// the exact set shown to members, so a pasted or typed value only sticks if it
// matches one of these.
export const EXPERTISE_OPTIONS = [
    'Artificial Intelligence',
    'Board Governance',
    'Business Development',
    'Community Building',
    'Cybersecurity',
    'Data Analytics',
    'Finance',
    'Fintech',
    'Fundraising',
    'International Growth',
    'Legal',
    'Marketing',
    'Operations',
    'Product Management',
    'Sales',
] as const;

export type ExpertiseOption = typeof EXPERTISE_OPTIONS[number];

const EXPERTISE_BY_KEY = new Map(EXPERTISE_OPTIONS.map(option => [option.toLowerCase(), option]));

export function normalizeExpertise(value: unknown): ExpertiseOption[] {
    const raw = Array.isArray(value)
        ? value
        : typeof value === 'string' ? value.split(',') : [];
    const seen = new Set<string>();
    for (const item of raw) {
        const match = EXPERTISE_BY_KEY.get(String(item).trim().toLowerCase());
        if (match) seen.add(match);
    }
    return EXPERTISE_OPTIONS.filter(option => seen.has(option));
}
