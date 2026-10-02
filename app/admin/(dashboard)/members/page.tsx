'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowPathIcon, MagnifyingGlassIcon, TrashIcon, PlusCircleIcon, XMarkIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ArrowDownTrayIcon, ArchiveBoxIcon, ArrowUturnLeftIcon, ChevronDownIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { LinkedinIcon, WhatsappIcon } from '@/app/components/ui/BrandIcons';
import { categoryLabel, FIRST_GRADUATION_YEAR, MEMBER_CATEGORIES } from '@/app/lib/categories';

interface Referral {
    name: string;
    email?: string;
    linkedin?: string;
}

interface Member {
    id: string;
    name: string;
    email: string;
    location: string;
    graduation_year: number | null;
    categories: string[];
    is_past_member: boolean;
    onboarding_complete: boolean;
    created_at: string;
    linkedin: string | null;
    website: string | null;
    // Drafted by ChatGPT during onboarding (see app/lib/onboarding-paste.ts). Admin-only.
    whatsapp_intro: string | null;
}

const GRADUATION_YEARS = Array.from(
    { length: new Date().getFullYear() + 6 - FIRST_GRADUATION_YEAR + 1 },
    (_, i) => new Date().getFullYear() + 6 - i,
);

// Refer-a-Friend suggestions are stored as JSON in members.website (see the member
// portal's Refer a Friend tab).
function parseReferrals(website: string | null): Referral[] {
    if (!website) return [];
    try {
        const parsed = JSON.parse(website);
        return Array.isArray(parsed) ? parsed.filter(r => r.name?.trim()) : [];
    } catch { return []; }
}

const EMPTY_FORM = { name: '', email: '', location: '', linkedin: '', graduation_year: '', categories: [] as string[], onboarding_complete: false };

function CategoryEditor({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    // The table sits in an overflow container, so an absolutely positioned menu got
    // clipped by it. The menu is fixed to the viewport instead, placed under the
    // button, or above it when there isn't room below.
    const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
    const open = menuPos !== null;

    function toggle() {
        if (open) return setMenuPos(null);
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return;
        const menuHeight = MEMBER_CATEGORIES.length * 40 + 16;
        const left = Math.min(rect.left, window.innerWidth - 264);
        setMenuPos(window.innerHeight - rect.bottom < menuHeight + 8
            ? { left, bottom: window.innerHeight - rect.top + 4 }
            : { left, top: rect.bottom + 4 });
    }

    useEffect(() => {
        if (!open) return;
        const close = () => setMenuPos(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [open]);

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={toggle}
                disabled={disabled}
                className="flex flex-wrap items-center gap-1 min-h-[28px] max-w-[220px] text-left rounded-lg border border-slate-200 bg-white px-2 py-1 hover:border-slate-300 transition-all disabled:opacity-50"
            >
                {value.length > 0 ? value.map(id => (
                    <span key={id} className="px-2 py-0.5 bg-gold-100 text-gold-800 text-[10px] font-bold rounded-full border border-gold-200 whitespace-nowrap">
                        {categoryLabel(id)}
                    </span>
                )) : <span className="text-[11px] text-slate-400 px-1">Set pathway</span>}
                <ChevronDownIcon className="w-3 h-3 text-slate-400 ml-auto" />
            </button>
            {menuPos && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
                    <div
                        className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-lg p-1.5"
                        style={{ left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom }}
                    >
                        {MEMBER_CATEGORIES.map(c => {
                            const checked = value.includes(c.id);
                            return (
                                <label key={c.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => onChange(checked ? value.filter(v => v !== c.id) : MEMBER_CATEGORIES.map(x => x.id).filter(id => id === c.id || value.includes(id)))}
                                        className="accent-navy-700 shrink-0"
                                    />
                                    {c.label}
                                </label>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export default function MembersPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [introMember, setIntroMember] = useState<Member | null>(null);
    const [introCopied, setIntroCopied] = useState(false);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [invitingId, setInvitingId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [copied, setCopied] = useState(false);
    const [addingMember, setAddingMember] = useState(false);
    const [addForm, setAddForm] = useState(EMPTY_FORM);

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/members', { cache: 'no-store' });
            const data = await res.json();
            setMembers(Array.isArray(data) ? data : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMembers(); }, []);

    const addMember = async () => {
        if (!addForm.name.trim() || !addForm.email.trim()) return;
        setAddingMember(true);
        try {
            const response = await fetch('/api/admin/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to add member');
            setMembers(prev => [data, ...prev]);
            setAddForm(EMPTY_FORM);
            setShowAddModal(false);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to add member. Please try again.');
        } finally {
            setAddingMember(false);
        }
    };

    const update = async (id: string, patch: Partial<Member>) => {
        setUpdatingId(id);
        try {
            const res = await fetch('/api/admin/members', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...patch }),
            });
            if (!res.ok) throw new Error();
            setMembers(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
        } catch {
            alert('Could not save that change.');
        } finally {
            setUpdatingId(null);
        }
    };

    const sendInvite = async (member: Member) => {
        if (!window.confirm(`Email ${member.email} a link to set up their portal profile?`)) return;
        setInvitingId(member.id);
        try {
            const res = await fetch('/api/admin/members/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to send invite');
            alert(`Invite sent to ${member.email}`);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to send invite');
        } finally {
            setInvitingId(null);
        }
    };

    const deleteMember = async (id: string) => {
        if (!window.confirm('Delete this member? This cannot be undone. To keep their history, mark them as a past member instead.')) return;
        setDeletingId(id);
        try {
            await fetch(`/api/admin/members?id=${id}`, { method: 'DELETE' });
            setMembers(prev => prev.filter(m => m.id !== id));
        } finally {
            setDeletingId(null);
        }
    };

    const q = search.trim().toLowerCase();
    const filtered = members.filter(m =>
        (!categoryFilter || (m.categories ?? []).includes(categoryFilter)) && (
            !q ||
            m.name?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.location?.toLowerCase().includes(q) ||
            String(m.graduation_year ?? '').includes(q)
        ),
    );

    const downloadCSV = () => {
        const headers = ['Name', 'Email', 'Location', 'RC Class', 'Pathway', 'Onboarding', 'Past Member', 'LinkedIn', 'Joined'];
        const rows = filtered.map(m => [
            m.name || '',
            m.email || '',
            m.location || '',
            m.graduation_year ?? '',
            (m.categories ?? []).map(id => categoryLabel(id, 'label')).join('; '),
            m.onboarding_complete ? 'Complete' : 'Pending',
            m.is_past_member ? 'Yes' : 'No',
            m.linkedin || '',
            new Date(m.created_at).toLocaleDateString('en-GB'),
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rcceb-members-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyEmails = () => {
        const emails = filtered.filter(m => !m.is_past_member).map(m => m.email).filter(Boolean).join(', ');
        navigator.clipboard.writeText(emails);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const currentCount = filtered.filter(m => !m.is_past_member).length;
    const directoryCount = filtered.filter(m => m.onboarding_complete && !m.is_past_member).length;

    return (
        <div className="p-4 md:p-6 text-slate-700">
            <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Members</h1>
                    <span className="px-2.5 py-1 bg-white text-slate-500 text-[10px] font-bold uppercase rounded-full border border-slate-200 shadow-sm">
                        {currentCount} current
                    </span>
                    <span className="px-2.5 py-1 bg-white text-slate-500 text-[10px] font-bold uppercase rounded-full border border-slate-200 shadow-sm">
                        {directoryCount} in directory
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <select
                            value={categoryFilter}
                            onChange={e => setCategoryFilter(e.target.value)}
                            className="appearance-none pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:border-brand-blue-500 cursor-pointer hover:border-slate-300 transition-all"
                        >
                            <option value="">All pathways</option>
                            {MEMBER_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative w-full md:w-auto">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search name, email, class year…"
                            className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-blue-500 text-sm w-full md:w-64 shadow-sm transition-all placeholder:text-slate-400"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={copyEmails}
                        title="Copy the emails of every current member in this view"
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all shadow-sm text-[11px] font-bold uppercase tracking-widest"
                    >
                        {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy emails'}
                    </button>
                    <button
                        onClick={downloadCSV}
                        disabled={filtered.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all shadow-sm text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-blue-500 text-white rounded-xl hover:bg-brand-blue-600 transition-all shadow-sm text-[11px] font-bold uppercase tracking-widest"
                    >
                        <PlusCircleIcon className="w-4 h-4" />
                        Add Member
                    </button>
                    <button onClick={fetchMembers} title="Refresh" className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-brand-blue-500' : 'text-slate-500'}`} />
                    </button>
                </div>
            </header>

            {/* Phones: one card per member (the table below is md and up) */}
            <div className="md:hidden space-y-3">
                {loading && members.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-sm">
                        <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-3 text-slate-300" />
                        Loading members...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-sm italic">
                        {members.length === 0 ? 'No members yet. Accept an application and send a portal invite to add the first one.' : 'No members match your filters.'}
                    </div>
                ) : filtered.map(member => {
                    const refs = parseReferrals(member.website);
                    return (
                        <div key={member.id} className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-4 ${member.is_past_member ? 'opacity-60' : ''}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-900 text-[15px]">{member.name || '—'}</div>
                                    <div className="text-xs text-slate-400 mt-0.5 break-all">{member.email}</div>
                                    {member.location && <div className="text-xs text-slate-400">{member.location}</div>}
                                </div>
                                {member.is_past_member
                                    ? <span className="shrink-0 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">Past</span>
                                    : member.onboarding_complete && member.name
                                        ? <span className="shrink-0 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">● Visible</span>
                                        : <span className="shrink-0 text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">Hidden</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                                <label className="block">
                                    <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">RC class</span>
                                    <select
                                        value={member.graduation_year ?? ''}
                                        onChange={e => update(member.id, { graduation_year: e.target.value ? Number(e.target.value) : null })}
                                        disabled={updatingId === member.id}
                                        className="w-full appearance-none bg-white border border-slate-200 rounded-lg py-2 px-2.5 text-[12px] font-bold"
                                    >
                                        <option value="">—</option>
                                        {GRADUATION_YEARS.map(year => <option key={year} value={year}>{year}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Onboarding</span>
                                    <select
                                        value={member.onboarding_complete ? 'complete' : 'pending'}
                                        onChange={e => update(member.id, { onboarding_complete: e.target.value === 'complete' })}
                                        disabled={updatingId === member.id}
                                        className={`w-full appearance-none bg-white border rounded-lg py-2 px-2.5 text-[11px] font-bold uppercase tracking-wider ${member.onboarding_complete ? 'text-brand-blue-500 border-brand-blue-500/20' : 'text-slate-400 border-slate-200'}`}
                                    >
                                        <option value="complete">Complete</option>
                                        <option value="pending">Pending</option>
                                    </select>
                                </label>
                            </div>
                            <div className="mt-2">
                                <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Pathway</span>
                                <CategoryEditor value={member.categories ?? []} disabled={updatingId === member.id} onChange={next => update(member.id, { categories: next })} />
                            </div>
                            {refs.length > 0 && (
                                <div className="mt-2 text-xs text-slate-500">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Referred: </span>
                                    {refs.map(r => r.name).join(', ')}
                                </div>
                            )}
                            <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
                                <span className="flex-1 text-[11px] text-slate-400">Joined {new Date(member.created_at).toLocaleDateString('en-GB')}</span>
                                {member.linkedin && (
                                    <a href={member.linkedin.startsWith('http') ? member.linkedin : `https://${member.linkedin}`} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-brand-blue-500">
                                        <LinkedinIcon className="w-4 h-4" />
                                    </a>
                                )}
                                {member.whatsapp_intro && (
                                    <button onClick={() => setIntroMember(member)} aria-label="WhatsApp intro" className="flex h-10 w-10 items-center justify-center rounded-lg text-emerald-600">
                                        <WhatsappIcon className="w-4 h-4" />
                                    </button>
                                )}
                                {!member.onboarding_complete && !member.is_past_member && (
                                    <button onClick={() => sendInvite(member)} disabled={invitingId === member.id} aria-label="Re-send the onboarding invite" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-brand-blue-500 disabled:opacity-50">
                                        {invitingId === member.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <EnvelopeIcon className="w-4 h-4" />}
                                    </button>
                                )}
                                <button
                                    onClick={() => update(member.id, { is_past_member: !member.is_past_member })}
                                    disabled={updatingId === member.id}
                                    aria-label={member.is_past_member ? 'Restore portal access' : 'Mark as past member'}
                                    className={`flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-50 ${member.is_past_member ? 'text-amber-600' : 'text-slate-400'}`}
                                >
                                    {member.is_past_member ? <ArrowUturnLeftIcon className="w-4 h-4" /> : <ArchiveBoxIcon className="w-4 h-4" />}
                                </button>
                                <button onClick={() => deleteMember(member.id)} disabled={deletingId === member.id} aria-label="Delete member" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 disabled:opacity-50">
                                    {deletingId === member.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                {['Member', 'Directory', 'RC Class', 'Pathway', 'Onboarding', 'Referrals', 'Joined', ''].map(h => (
                                    <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && members.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-24 text-center text-slate-400 text-sm">
                                    <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-3 text-slate-300" />
                                    Loading members...
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-sm italic">
                                    {members.length === 0 ? 'No members yet. Accept an application and send a portal invite to add the first one.' : 'No members match your filters.'}
                                </td></tr>
                            ) : filtered.map(member => (
                                <tr key={member.id} className={`hover:bg-slate-50/40 transition-colors group ${member.is_past_member ? 'opacity-60' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-900 text-sm">{member.name || '—'}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{member.email}</div>
                                        {member.location && <div className="text-xs text-slate-400">{member.location}</div>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {member.is_past_member
                                            ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg" title="No portal access — shown as a past member">Past</span>
                                            : member.onboarding_complete && member.name
                                                ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">● Visible</span>
                                                : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg" title="Hidden until they finish onboarding">Hidden</span>
                                        }
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={member.graduation_year ?? ''}
                                            onChange={e => update(member.id, { graduation_year: e.target.value ? Number(e.target.value) : null })}
                                            disabled={updatingId === member.id}
                                            className="appearance-none bg-white border border-slate-200 rounded-lg py-1 pl-2.5 pr-6 text-[11px] font-bold tracking-wider cursor-pointer hover:border-slate-300 transition-all"
                                        >
                                            <option value="">—</option>
                                            {GRADUATION_YEARS.map(year => <option key={year} value={year}>{year}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <CategoryEditor
                                            value={member.categories ?? []}
                                            disabled={updatingId === member.id}
                                            onChange={next => update(member.id, { categories: next })}
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={member.onboarding_complete ? 'complete' : 'pending'}
                                            onChange={e => update(member.id, { onboarding_complete: e.target.value === 'complete' })}
                                            disabled={updatingId === member.id}
                                            className={`appearance-none bg-white border rounded-lg py-1 pl-2.5 pr-6 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                                                member.onboarding_complete ? 'text-brand-blue-500 border-brand-blue-500/20' : 'text-slate-400 border-slate-200'
                                            }`}
                                        >
                                            <option value="complete">Complete</option>
                                            <option value="pending">Pending</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const refs = parseReferrals(member.website);
                                            if (refs.length === 0) return <span className="text-xs text-slate-300">—</span>;
                                            return (
                                                <div className="space-y-1">
                                                    {refs.map((r, i) => (
                                                        <div key={i}>
                                                            <div className="flex items-center gap-2">
                                                                <div className="text-xs font-medium text-slate-700">{r.name}</div>
                                                                {r.linkedin && (
                                                                    <a href={r.linkedin.startsWith('http') ? r.linkedin : `https://${r.linkedin}`} target="_blank" rel="noreferrer" className="text-brand-blue-500 hover:text-brand-blue-600">
                                                                        <LinkedinIcon className="w-3.5 h-3.5" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                            {r.email && <div className="text-[11px] text-slate-400">{r.email}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-xs text-slate-500">{new Date(member.created_at).toLocaleDateString('en-GB')}</div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {member.linkedin && (
                                                <a
                                                    href={member.linkedin.startsWith('http') ? member.linkedin : `https://${member.linkedin}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="p-1.5 text-slate-300 hover:text-brand-blue-500 hover:bg-brand-blue-500/5 rounded-lg transition-all"
                                                >
                                                    <LinkedinIcon className="w-4 h-4" />
                                                </a>
                                            )}
                                            {member.whatsapp_intro && (
                                                <button
                                                    onClick={() => setIntroMember(member)}
                                                    title="WhatsApp intro"
                                                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                >
                                                    <WhatsappIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                            {!member.onboarding_complete && !member.is_past_member && (
                                                <button
                                                    onClick={() => sendInvite(member)}
                                                    disabled={invitingId === member.id}
                                                    title="Re-send the onboarding invite"
                                                    className="p-1.5 text-slate-400 hover:text-brand-blue-500 hover:bg-brand-blue-500/5 rounded-lg transition-all disabled:opacity-50"
                                                >
                                                    {invitingId === member.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <EnvelopeIcon className="w-4 h-4" />}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => update(member.id, { is_past_member: !member.is_past_member })}
                                                disabled={updatingId === member.id}
                                                title={member.is_past_member ? 'Restore portal access' : 'Mark as past member (keeps data, revokes portal access)'}
                                                className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                                                    member.is_past_member
                                                        ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                                        : 'text-slate-300 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100'
                                                }`}
                                            >
                                                {member.is_past_member ? <ArrowUturnLeftIcon className="w-4 h-4" /> : <ArchiveBoxIcon className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => deleteMember(member.id)}
                                                disabled={deletingId === member.id}
                                                title="Delete member"
                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                            >
                                                {deletingId === member.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white border border-slate-200 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="relative p-8 border-b border-slate-100 bg-slate-50/60">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                            <div className="text-[10px] font-black text-gold-600 uppercase tracking-[0.2em] mb-2">Manual Entry</div>
                            <h2 className="text-2xl font-bold text-slate-900">Add Member</h2>
                            <p className="text-slate-500 text-sm mt-1">Create a member directly. Use the envelope button afterwards to email their onboarding link.</p>
                        </div>
                        <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                {([
                                    ['name', 'Name *'],
                                    ['email', 'Email *'],
                                    ['location', 'Location'],
                                    ['linkedin', 'LinkedIn'],
                                ] as const).map(([key, label]) => (
                                    <div key={key}>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
                                        <input
                                            type={key === 'email' ? 'email' : 'text'}
                                            value={addForm[key]}
                                            onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-blue-500"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">RC Graduation Year</label>
                                <select
                                    value={addForm.graduation_year}
                                    onChange={e => setAddForm(f => ({ ...f, graduation_year: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-blue-500"
                                >
                                    <option value="">—</option>
                                    {GRADUATION_YEARS.map(year => <option key={year} value={year}>{year}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Pathway</label>
                                <div className="flex flex-wrap gap-2">
                                    {MEMBER_CATEGORIES.map(c => {
                                        const selected = addForm.categories.includes(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => setAddForm(f => ({ ...f, categories: selected ? f.categories.filter(x => x !== c.id) : [...f.categories, c.id] }))}
                                                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${selected ? 'bg-brand-blue-500 border-brand-blue-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                            >
                                                {c.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={addForm.onboarding_complete}
                                    onChange={e => setAddForm(f => ({ ...f, onboarding_complete: e.target.checked }))}
                                    className="accent-navy-700"
                                />
                                Already onboarded (skip the profile setup step)
                            </label>
                        </div>
                        <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">Cancel</button>
                            <button
                                onClick={addMember}
                                disabled={addingMember || !addForm.name.trim() || !addForm.email.trim()}
                                className="px-5 py-2 bg-brand-blue-500 text-white rounded-xl text-sm font-bold hover:bg-brand-blue-600 disabled:opacity-40 transition-all"
                            >
                                {addingMember ? 'Adding…' : 'Add member'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {introMember?.whatsapp_intro && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => { setIntroMember(null); setIntroCopied(false); }}>
                    <div className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-slate-100">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-9 h-9 shrink-0 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <WhatsappIcon className="w-4 h-4" />
                                </span>
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-900 truncate">{introMember.name}</div>
                                    <div className="text-xs text-slate-500">WhatsApp intro, drafted with ChatGPT during onboarding</div>
                                </div>
                            </div>
                            <button onClick={() => { setIntroMember(null); setIntroCopied(false); }} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-700">
                            {introMember.whatsapp_intro}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={async () => {
                                    try { await navigator.clipboard.writeText(introMember.whatsapp_intro ?? ''); setIntroCopied(true); } catch { /* clipboard blocked */ }
                                }}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all"
                            >
                                {introCopied ? <ClipboardDocumentCheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                                {introCopied ? 'Copied' : 'Copy intro'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
