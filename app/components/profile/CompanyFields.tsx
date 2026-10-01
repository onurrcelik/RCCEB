'use client';

import { BriefcaseIcon, GlobeAltIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { LinkedinIcon } from '@/app/components/ui/BrandIcons';
import { EMPTY_COMPANY, type CompanyDraft } from '@/app/lib/company-input';

export function CompanyFields({
    companies,
    onChange,
}: {
    companies: CompanyDraft[];
    onChange: (next: CompanyDraft[]) => void;
}) {
    function update(index: number, key: keyof CompanyDraft, value: string) {
        onChange(companies.map((company, i) => i === index ? { ...company, [key]: value } : company));
    }

    return (
        <div className="space-y-3">
            {companies.map((company, index) => (
                <div key={index} className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Company {index + 1}</div>
                        {companies.length > 1 && (
                            <button
                                type="button"
                                onClick={() => onChange(companies.filter((_, i) => i !== index))}
                                className="text-zinc-500 hover:text-red-400 transition-colors"
                            >
                                <TrashIcon className="h-4 w-4" />
                                <span className="sr-only">Remove company</span>
                            </button>
                        )}
                    </div>
                    <input
                        value={company.name ?? ''}
                        onChange={e => update(index, 'name', e.target.value)}
                        placeholder="Company or fund name"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm"
                    />
                    <div className="relative">
                        <BriefcaseIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                        <input
                            value={company.role ?? ''}
                            onChange={e => update(index, 'role', e.target.value)}
                            placeholder="Your role — Founder, Partner, Advisor…"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm"
                        />
                    </div>
                    <div className="relative">
                        <GlobeAltIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                        <input
                            value={company.website ?? ''}
                            onChange={e => update(index, 'website', e.target.value)}
                            placeholder="Website (optional)"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm"
                        />
                    </div>
                    <div className="relative">
                        <LinkedinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                        <input
                            value={company.linkedin ?? ''}
                            onChange={e => update(index, 'linkedin', e.target.value)}
                            placeholder="Company LinkedIn (optional)"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm"
                        />
                    </div>
                </div>
            ))}
            {companies.length < 8 && (
                <button
                    type="button"
                    onClick={() => onChange([...companies, { ...EMPTY_COMPANY }])}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-300 hover:text-white transition-colors"
                >
                    <PlusIcon className="h-4 w-4" />
                    Add another company
                </button>
            )}
        </div>
    );
}
