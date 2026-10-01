import { query } from '@/app/lib/db';
import { type NormalizedCompany } from '@/app/lib/company-input';

export { EMPTY_COMPANY, normalizeCompanyDrafts } from '@/app/lib/company-input';
export type { CompanyDraft, NormalizedCompany } from '@/app/lib/company-input';

export type StoredCompany = {
    id: string;
    name: string;
    role: string | null;
    website: string | null;
    linkedin: string | null;
};

type QueryFn = typeof query;

// Replaces this member's affiliations. Companies are shared by name, so two members
// who enter "Acme" land on the same directory card. A blank website or LinkedIn
// does not wipe one another member already saved.
export async function saveMemberCompanies(q: QueryFn, memberId: string, companies: NormalizedCompany[]): Promise<void> {
    const saved: { id: string; role: string | null }[] = [];
    for (const company of companies) {
        const { rows } = await q<{ id: string }>(
            `INSERT INTO companies (name, name_key, website, linkedin)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (name_key) DO UPDATE SET
               website = COALESCE(EXCLUDED.website, companies.website),
               linkedin = COALESCE(EXCLUDED.linkedin, companies.linkedin),
               updated_at = now()
             RETURNING id`,
            [company.name, company.nameKey, company.website, company.linkedin],
        );
        if (rows[0]) saved.push({ id: rows[0].id, role: company.role });
    }
    const ids = saved.map(company => company.id);

    if (ids.length === 0) {
        await q('DELETE FROM company_affiliations WHERE member_id = $1', [memberId]);
    } else {
        await q(
            `DELETE FROM company_affiliations
             WHERE member_id = $1
               AND NOT (company_id = ANY($2::uuid[]))`,
            [memberId, ids],
        );
    }

    for (const company of saved) {
        await q(
            `INSERT INTO company_affiliations (company_id, member_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (company_id, member_id) DO UPDATE SET role = EXCLUDED.role`,
            [company.id, memberId, company.role],
        );
    }

    const primary = companies[0]?.name ?? null;
    if (primary) {
        await q(
            `INSERT INTO member_companies (member_id, company_name, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (member_id) DO UPDATE SET company_name = EXCLUDED.company_name, updated_at = now()`,
            [memberId, primary],
        );
    } else {
        await q('DELETE FROM member_companies WHERE member_id = $1', [memberId]);
    }
}

export async function listMemberCompanies(memberId: string): Promise<StoredCompany[]> {
    const { rows } = await query<StoredCompany>(
        `SELECT c.id, c.name, ca.role, c.website, c.linkedin
         FROM company_affiliations ca
         JOIN companies c ON c.id = ca.company_id
         WHERE ca.member_id = $1
         ORDER BY c.name`,
        [memberId],
    );
    return rows;
}

export async function companyNamesByMemberId(memberIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (memberIds.length === 0) return names;
    const { rows } = await query<{ member_id: string; company_name: string }>(
        `SELECT ca.member_id, string_agg(c.name, ', ' ORDER BY c.name) AS company_name
         FROM company_affiliations ca
         JOIN companies c ON c.id = ca.company_id
         WHERE ca.member_id = ANY($1)
         GROUP BY ca.member_id`,
        [memberIds],
    );
    for (const row of rows) names.set(row.member_id, row.company_name);
    return names;
}

export async function companyNamesForMember(memberId: string): Promise<string | null> {
    const names = await companyNamesByMemberId([memberId]);
    return names.get(memberId) ?? null;
}
