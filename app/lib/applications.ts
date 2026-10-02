import { isValidEmail } from '@/app/lib/request-security';
import { isValidGraduationYear, normalizeCategories, type MemberCategoryId } from '@/app/lib/categories';

// Applications arrive from the rcceb.org/join form (forwarded to POST /api/applications)
// or are typed in by an admin. Both go through this one normaliser so a row looks the
// same whichever way it came in.

export const APPLICATION_SELECT = `id, name, first_name, last_name, email, phone, linkedin, graduation_year, categories,
    contact_consent, agreed_to_terms, agreed_to_letter_of_intent, source, external_id, status, admission_status, notes,
    member_id, created_at, updated_at`;

export type ApplicationInput = {
    first_name: string;
    last_name: string;
    name: string;
    email: string;
    phone: string;
    linkedin: string | null;
    graduation_year: number | null;
    categories: MemberCategoryId[];
    contact_consent: boolean;
    agreed_to_terms: boolean;
    agreed_to_letter_of_intent: boolean;
};

function text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Accepts both the join form's camelCase payload (firstName, graduationYear,
// memberTypes, agreedToTerms, …) and snake_case, so the website can forward its
// request body unchanged.
export function normalizeApplicationInput(
    body: Record<string, unknown>,
    { requireAgreements }: { requireAgreements: boolean },
): { value?: ApplicationInput; error?: string } {
    const pick = (...keys: string[]) => keys.map(k => body[k]).find(v => v !== undefined && v !== null && v !== '');

    const first_name = text(pick('first_name', 'firstName'), 80);
    const last_name = text(pick('last_name', 'lastName'), 80);
    const email = text(pick('email'), 254).toLowerCase();
    const phone = text(pick('phone'), 40);
    const linkedin = text(pick('linkedin', 'linkedIn'), 300) || null;
    const yearRaw = pick('graduation_year', 'graduationYear');
    const categories = normalizeCategories(pick('categories', 'memberTypes', 'member_types'));

    if (!first_name) return { error: 'First name is required' };
    if (!email || !isValidEmail(email)) return { error: 'A valid email is required' };
    if (yearRaw !== undefined && !isValidGraduationYear(yearRaw)) return { error: 'Graduation year is not valid' };

    const agreed_to_terms = pick('agreed_to_terms', 'agreedToTerms') === true;
    const agreed_to_letter_of_intent = pick('agreed_to_letter_of_intent', 'agreedToLetterOfIntent') === true;

    if (requireAgreements) {
        if (!last_name) return { error: 'Last name is required' };
        if (!phone) return { error: 'Phone number is required' };
        if (yearRaw === undefined) return { error: 'Graduation year is required' };
        if (categories.length === 0) return { error: 'Choose at least one role in the community' };
        if (!agreed_to_terms || !agreed_to_letter_of_intent) {
            return { error: 'The community guidelines and letter of intent must be accepted' };
        }
    }

    return {
        value: {
            first_name,
            last_name,
            name: [first_name, last_name].filter(Boolean).join(' '),
            email,
            phone,
            linkedin,
            graduation_year: yearRaw === undefined ? null : Number(yearRaw),
            categories,
            contact_consent: pick('contact_consent', 'contactConsent') === true,
            agreed_to_terms,
            agreed_to_letter_of_intent,
        },
    };
}

// `externalId` is the join form's own id for the submission. When it is given and a row
// with that id already exists, nothing is inserted and this returns undefined, so a
// retried forward or a re-run backfill never creates a second application.
export async function insertApplication(
    q: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
    value: ApplicationInput,
    source: string,
    externalId: string | null = null,
) {
    const { rows } = await q(
        `INSERT INTO applications
            (first_name, last_name, name, email, phone, linkedin, graduation_year, categories,
             contact_consent, agreed_to_terms, agreed_to_letter_of_intent, source, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
         RETURNING ${APPLICATION_SELECT}`,
        [
            value.first_name, value.last_name, value.name, value.email, value.phone, value.linkedin,
            value.graduation_year, value.categories, value.contact_consent, value.agreed_to_terms,
            value.agreed_to_letter_of_intent, source, externalId,
        ],
    );
    return rows[0];
}
