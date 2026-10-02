import { EXPERTISE_OPTIONS } from '@/app/lib/categories';
import type { CompanyDraft } from '@/app/lib/company-input';

// Sorts a pasted ChatGPT reply (from the prompt in app/lib/onboarding-prompt.ts) into the
// onboarding fields. The prompt pins the headings and the company line format, so plain
// parsing is enough: no model call, nothing leaves the browser. It tolerates the ways
// ChatGPT dresses headings up (markdown #, **bold**, "1)" instead of "1.") and keeps the
// Turkish WhatsApp intro at the end separately, for admins.

export type ParsedOnboarding = {
    bio?: string;
    can_help_with?: string;
    working_on?: string;
    expertise?: string[];
    companies?: CompanyDraft[];
    education?: string;
    favorite_resource?: string;
    whatsapp_intro?: string;
};

type SectionKey = 'bio' | 'can_help_with' | 'working_on' | 'expertise' | 'companies' | 'education' | 'favorite_resource' | 'bonus';

// Matched against a heading line once numbering and markdown are stripped.
const HEADINGS: [SectionKey, RegExp][] = [
    ['bio', /^bio\b/],
    ['can_help_with', /^what i can help with\b/],
    ['working_on', /^what i('|’)?m working on\b|^what i am working on\b/],
    ['expertise', /^expertise\b/],
    ['companies', /^compan(y|ies)\b/],
    ['education', /^education\b/],
    ['favorite_resource', /^favou?rite\b/],
    ['bonus', /^(bonus|whatsapp)\b/],
];

function cleanLine(line: string) {
    return line
        .replace(/^\s*(#{1,6}\s*)?/, '')
        .replace(/\*\*|__/g, '')
        .replace(/^\s*(\d{1,2})\s*[.)]\s*/, '')
        .replace(/:\s*$/, '')
        .trim();
}

function headingOf(line: string): SectionKey | null {
    // Headings are short; a long sentence starting with "Bio..." is body text.
    if (line.trim().length > 60) return null;
    const text = cleanLine(line).toLowerCase();
    return HEADINGS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function tidy(lines: string[]) {
    return lines
        .map(line => line.replace(/\*\*|__/g, '').replace(/^\s*[-•*]\s+/, '').trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function parseCompanies(lines: string[]): CompanyDraft[] {
    const companies: CompanyDraft[] = [];
    for (const raw of lines) {
        const line = raw.replace(/\*\*|__/g, '').replace(/^\s*([-•*]|\d+[.)])\s*/, '').trim();
        if (!line.includes('|')) continue;
        const [name = '', role = '', website = '', linkedin = ''] = line.split('|').map(part => part.trim());
        // The format line itself, if ChatGPT repeats it.
        if (!name || /^company name$/i.test(name)) continue;
        const blank = (value: string) => (/^(-|n\/?a|none|blank|unknown)$/i.test(value) ? '' : value);
        companies.push({ name, role: blank(role), website: blank(website), linkedin: blank(linkedin) });
    }
    return companies.slice(0, 8);
}

// Favorite source is just a name ("Paul Graham's essays"). ChatGPT likes to add why;
// keep each item's first sentence and drop anything after a dash or colon.
function namesOnly(text: string): string {
    const items = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line =>
            line
                // First sentence only: a period after a word of 3+ letters ends it, so
                // "Dr. Seuss" survives but "essays. I like…" is cut.
                .replace(/^(.*?[\p{L}\d'’)"]{3,})[.!?](\s+\S[\s\S]*)?$/u, '$1')
                .split(/\s+[—–-]\s+|:\s+|,?\s+because\s+|,\s+(?:which|as|since)\s+/i)[0]
                .replace(/[\s,;.]+$/, '')
                .trim(),
        )
        .filter(Boolean);
    return items.slice(0, 3).join(', ');
}

function parseExpertise(text: string): string[] {
    const lower = text.toLowerCase();
    return EXPERTISE_OPTIONS.filter(option => lower.includes(option.toLowerCase()));
}

export function parseChatGptReply(reply: string): { fields: ParsedOnboarding; found: number } {
    const sections = new Map<SectionKey, string[]>();
    let current: SectionKey | null = null;

    for (const line of reply.replace(/\r\n/g, '\n').split('\n')) {
        const heading = headingOf(line);
        if (heading) {
            current = heading;
            if (!sections.has(heading)) sections.set(heading, []);
            // "1. Bio: I'm a founder…" puts the answer on the heading line itself.
            const inline = cleanLine(line).split(/:\s+/).slice(1).join(': ').trim();
            // The bonus heading's own label ("Bonus: WhatsApp intro") isn't part of the intro.
            if (inline && heading !== 'bonus') sections.get(heading)!.push(inline);
            continue;
        }
        if (current) sections.get(current)!.push(line);
    }

    const fields: ParsedOnboarding = {};
    const text = (key: SectionKey) => (sections.has(key) ? tidy(sections.get(key)!) : '');

    if (text('bio')) fields.bio = text('bio');
    if (text('can_help_with')) fields.can_help_with = text('can_help_with');
    if (text('working_on')) fields.working_on = text('working_on');
    const expertise = parseExpertise(text('expertise'));
    if (expertise.length) fields.expertise = expertise;
    const companies = parseCompanies(sections.get('companies') ?? []);
    if (companies.length) fields.companies = companies;
    const education = text('education');
    if (education && !/^none\.?$/i.test(education)) fields.education = education;
    const favorite = namesOnly(text('favorite_resource'));
    if (favorite) fields.favorite_resource = favorite;
    // The WhatsApp intro isn't a form field: it's kept for admins. Bullets inside it are
    // part of the intro, so it's taken as written rather than through tidy().
    const intro = (sections.get('bonus') ?? []).join('\n').replace(/\*\*|__/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (intro) fields.whatsapp_intro = intro.slice(0, 2000);

    // `found` counts only the profile sections the form shows.
    return { fields, found: Object.keys(fields).filter(key => key !== 'whatsapp_intro').length };
}
