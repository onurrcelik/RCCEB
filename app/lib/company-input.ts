export type CompanyDraft = {
    name: string;
    role: string;
    website: string;
    linkedin: string;
};

export const EMPTY_COMPANY: CompanyDraft = { name: '', role: '', website: '', linkedin: '' };

const MAX_COMPANIES = 8;
const MAX_NAME = 120;
const MAX_ROLE = 120;
const MAX_LINK = 300;

export type NormalizedCompany = {
    name: string;
    nameKey: string;
    role: string | null;
    website: string | null;
    linkedin: string | null;
};

export function companyNameKey(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Members must give a role and a website for each company (the website is what other
// members open from the company page). Admins can save partial companies.
export function normalizeCompanyDrafts(value: unknown, options?: { requireRole?: boolean; requireWebsite?: boolean }): { companies?: NormalizedCompany[]; error?: string } {
    const requireRole = options?.requireRole !== false;
    const requireWebsite = options?.requireWebsite !== false;
    if (!Array.isArray(value)) return { error: 'Companies must be a list' };

    const companies: NormalizedCompany[] = [];
    const seen = new Set<string>();

    for (const item of value) {
        if (!item || typeof item !== 'object') return { error: 'Each company needs a name' };
        const record = item as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name.trim().replace(/\s+/g, ' ') : '';
        const role = typeof record.role === 'string' ? record.role.trim().replace(/\s+/g, ' ') : '';
        const website = typeof record.website === 'string' ? record.website.trim() : '';
        const linkedin = typeof record.linkedin === 'string' ? record.linkedin.trim() : '';

        if (!name && !role && !website && !linkedin) continue;
        if (!name) return { error: 'Each company needs a name' };
        if (requireRole && !role) return { error: 'Add your role at each company' };
        if (requireWebsite && !website) return { error: 'Add a website for each company' };
        if (name.length > MAX_NAME) return { error: 'A company name is too long' };
        if (role.length > MAX_ROLE) return { error: 'A role is too long' };
        if (website.length > MAX_LINK || linkedin.length > MAX_LINK) return { error: 'A company link is too long' };

        const nameKey = companyNameKey(name);
        if (seen.has(nameKey)) continue;
        seen.add(nameKey);
        companies.push({
            name,
            nameKey,
            role: role || null,
            website: website || null,
            linkedin: linkedin || null,
        });
    }

    if (companies.length > MAX_COMPANIES) return { error: `Add at most ${MAX_COMPANIES} companies` };
    return { companies };
}
