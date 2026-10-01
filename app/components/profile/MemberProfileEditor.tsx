'use client';

import { useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { FIRST_GRADUATION_YEAR } from '@/app/lib/categories';
import { EMPTY_COMPANY, type CompanyDraft } from '@/app/lib/company-input';
import { CompanyFields } from '@/app/components/profile/CompanyFields';
import { ExpertisePicker } from '@/app/components/profile/ExpertisePicker';

type CompanyLink = { name: string; role?: string | null; website?: string | null; linkedin?: string | null };

export type EditableMember = {
    name: string;
    location?: string | null;
    phone?: string | null;
    linkedin?: string | null;
    github?: string | null;
    bio?: string | null;
    can_help_with?: string | null;
    working_on?: string | null;
    education?: string | null;
    instagram?: string | null;
    favorite_resource?: string | null;
    graduation_year?: number | null;
    expertise?: string[] | null;
    companies?: CompanyLink[] | null;
};

function draftsFrom(companies: CompanyLink[] | null | undefined): CompanyDraft[] {
    if (!companies?.length) return [{ ...EMPTY_COMPANY }];
    return companies.map(company => ({
        name: company.name || '',
        role: company.role || '',
        website: company.website || '',
        linkedin: company.linkedin || '',
    }));
}

export function MemberProfileEditor({
    member,
    onSave,
}: {
    member: EditableMember;
    onSave: (updated: Record<string, unknown>) => void;
}) {
    const [form, setForm] = useState({
        name: member.name || '',
        location: member.location || '',
        phone: member.phone || '',
        linkedin: member.linkedin || '',
        github: member.github || '',
        bio: member.bio || '',
        can_help_with: member.can_help_with || '',
        working_on: member.working_on || '',
        education: member.education || member.instagram || '',
        favorite_resource: member.favorite_resource || '',
        graduation_year: member.graduation_year ? String(member.graduation_year) : '',
    });
    const [expertise, setExpertise] = useState<string[]>(member.expertise || []);
    const [companies, setCompanies] = useState<CompanyDraft[]>(() => draftsFrom(member.companies));
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    function update(key: string, value: string) {
        setForm(current => ({ ...current, [key]: value }));
    }

    async function handleSave() {
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/members/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, expertise, education: form.education, companies }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not save profile');
                return;
            }
            onSave({ ...data.member, companies: data.companies });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            setError('Could not save profile');
        } finally {
            setSaving(false);
        }
    }

    const fields: { key: keyof typeof form; label: string; placeholder: string; textarea?: boolean }[] = [
        { key: 'name', label: 'Full Name', placeholder: 'Your name' },
        { key: 'graduation_year', label: 'RC Graduation Year', placeholder: `e.g. ${FIRST_GRADUATION_YEAR + 55}` },
        { key: 'location', label: 'Location', placeholder: 'Istanbul, Turkey' },
        { key: 'phone', label: 'Phone', placeholder: '+90 555 000 00 00' },
        { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/...' },
        { key: 'github', label: 'GitHub', placeholder: 'github.com/...' },
        { key: 'bio', label: 'Bio', placeholder: 'A few lines on who you are.', textarea: true },
        { key: 'can_help_with', label: 'What I can help with', placeholder: 'Introductions, fundraising, hiring…', textarea: true },
        { key: 'working_on', label: "What I'm working on", placeholder: 'The company, fund, or project in front of you.', textarea: true },
        { key: 'education', label: 'Education after RC', placeholder: 'BSc Economics, Boğaziçi; MBA, INSEAD…' },
        { key: 'favorite_resource', label: 'Favorite Read / Video / Person / Source', placeholder: 'Zero to One, Lex Fridman…', textarea: true },
    ];

    return (
        <div>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {fields.map(field => (
                        <div key={field.key} className={field.textarea ? 'sm:col-span-2' : ''}>
                            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{field.label}</label>
                            {field.textarea ? (
                                <textarea
                                    value={form[field.key]}
                                    onChange={e => update(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    rows={3}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm resize-none transition-colors"
                                />
                            ) : (
                                <input
                                    value={form[field.key]}
                                    onChange={e => update(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm transition-colors"
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Expertise</div>
                    <ExpertisePicker selected={expertise} onChange={setExpertise} />
                </div>
                <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Companies I&apos;m affiliated with</div>
                    <p className="mb-3 text-xs text-zinc-500">These show up in the Companies directory so other members know who can introduce them.</p>
                    <CompanyFields companies={companies} onChange={setCompanies} />
                </div>
            </div>
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-400 py-2.5 px-6 text-sm font-semibold text-zinc-950 transition-all hover:bg-gold-400/90 disabled:opacity-50 sm:w-auto"
            >
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <><CheckCircleIcon className="w-4 h-4" /> Saved</> : 'Save changes'}
            </button>
        </div>
    );
}
