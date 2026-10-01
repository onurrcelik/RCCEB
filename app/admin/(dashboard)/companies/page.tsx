'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    ArrowPathIcon,
    BuildingOffice2Icon,
    CheckIcon,
    MagnifyingGlassIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';

type MemberCompanyRow = {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    bio: string | null;
    is_past_member: boolean;
    company_name: string | null;
};

function getInitials(name: string) {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function CompaniesPage() {
    const [members, setMembers] = useState<MemberCompanyRow[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState('');

    async function fetchMembers() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/companies?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not load companies');
                return;
            }
            const rows = Array.isArray(data.members) ? data.members : [];
            setMembers(rows);
            setDrafts(Object.fromEntries(rows.map((member: MemberCompanyRow) => [member.id, member.company_name || ''])));
        } catch {
            setError('Could not load companies');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchMembers();
    }, []);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return members;
        return members.filter(member => [
            member.name,
            member.email,
            member.bio || '',
            member.company_name || '',
        ].some(value => value.toLowerCase().includes(query)));
    }, [members, search]);

    async function saveCompany(memberId: string) {
        const companyName = drafts[memberId]?.trim() || '';
        if (!companyName) return;
        setSavingId(memberId);
        setError('');
        const res = await fetch('/api/admin/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId, company_name: companyName }),
        });
        const data = await res.json();
        if (res.ok) {
            setMembers(current => current.map(member => member.id === memberId ? { ...member, company_name: companyName } : member));
        } else {
            setError(data.error || 'Could not save company');
        }
        setSavingId(null);
    }

    async function removeCompany(memberId: string) {
        if (!window.confirm('Remove this company mapping?')) return;
        setSavingId(memberId);
        const res = await fetch(`/api/admin/companies?member_id=${encodeURIComponent(memberId)}`, { method: 'DELETE' });
        if (res.ok) {
            setMembers(current => current.map(member => member.id === memberId ? { ...member, company_name: null } : member));
            setDrafts(current => ({ ...current, [memberId]: '' }));
        } else {
            setError('Could not remove company');
        }
        setSavingId(null);
    }

    return (
        <div className="p-4 text-slate-700 md:p-12">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Companies</h1>
                    <p className="mt-1 text-sm text-slate-400">Company names shown automatically on member Job Board posts.</p>
                </div>
                <button onClick={fetchMembers} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition-colors hover:bg-slate-50">
                    <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin text-brand-blue-500' : 'text-slate-500'}`} />
                    <span className="sr-only">Refresh</span>
                </button>
            </header>

            <div className="relative mb-5 max-w-lg">
                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search members or companies..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-blue-500"
                />
            </div>

            {error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>}

            {loading ? (
                <div className="flex h-40 items-center justify-center"><ArrowPathIcon className="h-5 w-5 animate-spin text-slate-300" /></div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="divide-y divide-slate-100">
                        {filtered.map(member => {
                            const changed = (drafts[member.id] || '').trim() !== (member.company_name || '');
                            return (
                                <div key={member.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        {member.avatar_url ? (
                                            <img src={member.avatar_url} alt={member.name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                                        ) : (
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-500/10 text-xs font-bold text-brand-blue-500">
                                                {getInitials(member.name)}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-semibold text-slate-900">{member.name}</span>
                                                {member.is_past_member && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600">Past</span>}
                                            </div>
                                            <div className="truncate text-xs text-slate-400">{member.bio || member.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex min-w-0 gap-2 lg:w-[28rem]">
                                        <div className="relative min-w-0 flex-1">
                                            <BuildingOffice2Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input
                                                value={drafts[member.id] || ''}
                                                onChange={event => setDrafts(current => ({ ...current, [member.id]: event.target.value }))}
                                                onKeyDown={event => { if (event.key === 'Enter') saveCompany(member.id); }}
                                                placeholder="Company name"
                                                maxLength={120}
                                                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-brand-blue-500"
                                            />
                                        </div>
                                        <button
                                            onClick={() => saveCompany(member.id)}
                                            disabled={!changed || !drafts[member.id]?.trim() || savingId === member.id}
                                            className="rounded-xl bg-brand-blue-500 p-2.5 text-white transition-colors hover:bg-brand-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            {savingId === member.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
                                            <span className="sr-only">Save company</span>
                                        </button>
                                        <button
                                            onClick={() => removeCompany(member.id)}
                                            disabled={!member.company_name || savingId === member.id}
                                            className="rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                            <span className="sr-only">Remove company</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {filtered.length === 0 && <div className="py-20 text-center text-sm text-slate-400">No members match your search.</div>}
                </div>
            )}
        </div>
    );
}
