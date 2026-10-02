'use client';

import { useMemo, useState } from 'react';
import { AdjustmentsHorizontalIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { EXPERTISE_OPTIONS, MEMBER_CATEGORIES } from '@/app/lib/categories';

// Directory filters. Picks inside one group widen the results (Investor OR Executive);
// picks across groups narrow them (Investor AND class of 2010). Results update as you
// tap, so there's no Apply step.

export type DirectoryFilterState = {
    categories: string[];
    years: number[];
    expertise: string[];
    locations: string[];
};

export const EMPTY_DIRECTORY_FILTERS: DirectoryFilterState = { categories: [], years: [], expertise: [], locations: [] };

type FilterableMember = {
    categories?: string[] | null;
    graduation_year?: number | null;
    expertise?: string[] | null;
    location?: string | null;
};

// Locations are free text, so "istanbul " and "Istanbul" are the same place.
function locationKey(value: string) {
    return value.trim().toLowerCase();
}

export function activeFilterCount(filters: DirectoryFilterState) {
    return filters.categories.length + filters.years.length + filters.expertise.length + filters.locations.length;
}

export function matchesDirectoryFilters(member: FilterableMember, filters: DirectoryFilterState) {
    if (filters.categories.length && !filters.categories.some(id => (member.categories ?? []).includes(id))) return false;
    if (filters.years.length && !filters.years.includes(member.graduation_year ?? -1)) return false;
    if (filters.expertise.length && !filters.expertise.some(tag => (member.expertise ?? []).includes(tag))) return false;
    if (filters.locations.length && !filters.locations.includes(locationKey(member.location ?? ''))) return false;
    return true;
}

function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`rounded-full border px-3 py-2 md:py-1.5 text-[11px] font-medium transition-all ${
                selected
                    ? 'border-gold-400 bg-gold-400 text-zinc-950'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white'
            }`}
        >
            {children}
        </button>
    );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {title}
                {count > 0 && <span className="rounded-full bg-gold-400/15 px-1.5 py-0.5 text-gold-300">{count}</span>}
            </div>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">{children}</div>
        </div>
    );
}

export function DirectoryFilters({ members, filters, onChange }: {
    members: FilterableMember[];
    filters: DirectoryFilterState;
    onChange: (next: DirectoryFilterState) => void;
}) {
    const [open, setOpen] = useState(false);
    const active = activeFilterCount(filters);

    // Class years and locations come from the members themselves, so every option
    // matches somebody. Expertise and pathway use the fixed lists members pick from.
    const years = useMemo(
        () => [...new Set(members.map(m => m.graduation_year).filter((y): y is number => !!y))].sort((a, b) => b - a),
        [members],
    );
    const locations = useMemo(() => {
        const byKey = new Map<string, string>();
        for (const m of members) {
            const label = m.location?.trim();
            if (label && !byKey.has(locationKey(label))) byKey.set(locationKey(label), label);
        }
        return [...byKey.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [members]);

    return (
        <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-expanded={open}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                        open || active ? 'border-gold-400/50 bg-zinc-900 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white'
                    }`}
                >
                    <AdjustmentsHorizontalIcon className="h-4 w-4" />
                    Filters
                    {active > 0 && <span className="rounded-full bg-gold-400 px-1.5 text-[11px] font-bold text-zinc-950">{active}</span>}
                    <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {active > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange(EMPTY_DIRECTORY_FILTERS)}
                        className="text-xs font-medium text-gold-300 underline-offset-4 hover:underline"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {open && (
                <div className="mt-3 grid grid-cols-1 gap-6 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5 sm:grid-cols-2 xl:grid-cols-4">
                    <Group title="Pathway" count={filters.categories.length}>
                        {MEMBER_CATEGORIES.map(c => (
                            <Chip key={c.id} selected={filters.categories.includes(c.id)} onClick={() => onChange({ ...filters, categories: toggle(filters.categories, c.id) })}>
                                {c.short}
                            </Chip>
                        ))}
                    </Group>
                    <Group title="RC class" count={filters.years.length}>
                        {years.length === 0 && <span className="text-xs text-zinc-500">No class years yet</span>}
                        {years.map(year => (
                            <Chip key={year} selected={filters.years.includes(year)} onClick={() => onChange({ ...filters, years: toggle(filters.years, year) })}>
                                {year}
                            </Chip>
                        ))}
                    </Group>
                    <Group title="Expertise" count={filters.expertise.length}>
                        {EXPERTISE_OPTIONS.map(tag => (
                            <Chip key={tag} selected={filters.expertise.includes(tag)} onClick={() => onChange({ ...filters, expertise: toggle(filters.expertise, tag) })}>
                                {tag}
                            </Chip>
                        ))}
                    </Group>
                    <Group title="Location" count={filters.locations.length}>
                        {locations.length === 0 && <span className="text-xs text-zinc-500">No locations yet</span>}
                        {locations.map(([key, label]) => (
                            <Chip key={key} selected={filters.locations.includes(key)} onClick={() => onChange({ ...filters, locations: toggle(filters.locations, key) })}>
                                {label}
                            </Chip>
                        ))}
                    </Group>
                </div>
            )}
        </div>
    );
}
