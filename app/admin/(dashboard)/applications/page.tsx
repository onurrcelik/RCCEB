'use client';

import React, { useEffect, useState } from 'react';
import {
    ArrowTopRightOnSquareIcon,
    EnvelopeIcon,
    PhoneIcon,
    CalendarIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    XMarkIcon,
    TrashIcon,
    UserPlusIcon,
    PlusCircleIcon,
    PencilSquareIcon,
    AcademicCapIcon,
    MapPinIcon,
    ArrowDownTrayIcon,
    CheckCircleIcon,
    MinusCircleIcon,
} from '@heroicons/react/24/outline';
import { categoryLabel, FIRST_GRADUATION_YEAR, MEMBER_CATEGORIES } from '@/app/lib/categories';

interface Applicant {
    id: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string;
    linkedin: string | null;
    location: string | null;
    graduation_year: number | null;
    categories: string[];
    contact_consent: boolean;
    agreed_to_terms: boolean;
    agreed_to_letter_of_intent: boolean;
    source: string | null;
    status: string;
    admission_status: string;
    notes: string;
    member_id: string | null;
    created_at: string;
}

const APPLICATION_STATUS_OPTIONS = [
    { value: 'submitted', label: 'Submitted', color: 'text-brand-blue-500 bg-brand-blue-500/5 border-brand-blue-500/10' },
    { value: 'sent to rc', label: 'Sent to RC', color: 'text-violet-600 bg-violet-50 border-violet-100' },
    { value: 'rc verified', label: 'RC Verified', color: 'text-cyan-600 bg-cyan-50 border-cyan-100' },
];

const ADMISSION_STATUS_OPTIONS = [
    { value: '', label: '—', color: 'text-slate-400 bg-slate-50 border-slate-200' },
    { value: 'accepted', label: 'Accepted', color: 'text-green-600 bg-green-50 border-green-100' },
    { value: 'deferred', label: 'Deferred', color: 'text-amber-600 bg-amber-50 border-amber-100' },
    { value: 'declined', label: 'Declined', color: 'text-red-600 bg-red-50 border-red-100' },
];

const GRADUATION_YEARS = Array.from(
    { length: new Date().getFullYear() + 6 - FIRST_GRADUATION_YEAR + 1 },
    (_, i) => new Date().getFullYear() + 6 - i,
);

const appStatusConfig = (status: string) =>
    APPLICATION_STATUS_OPTIONS.find(s => s.value === status) || APPLICATION_STATUS_OPTIONS[0];

const admissionStatusConfig = (status: string) =>
    ADMISSION_STATUS_OPTIONS.find(s => s.value === (status || '')) || ADMISSION_STATUS_OPTIONS[0];

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

// CSV export — each column pulls its own value so derived fields flatten cleanly.
const CSV_COLUMNS: { label: string; value: (a: Applicant) => unknown }[] = [
    { label: 'Submitted',              value: a => new Date(a.created_at).toLocaleString('en-GB') },
    { label: 'Name',                   value: a => a.name },
    { label: 'Email',                  value: a => a.email },
    { label: 'Phone',                  value: a => a.phone },
    { label: 'Graduation Year',        value: a => a.graduation_year },
    { label: 'Location',               value: a => a.location },
    { label: 'Pathway',                value: a => a.categories.map(id => categoryLabel(id, 'label')).join('; ') },
    { label: 'LinkedIn',               value: a => a.linkedin },
    { label: 'Contact Consent',        value: a => yesNo(a.contact_consent) },
    { label: 'Guidelines Accepted',    value: a => yesNo(a.agreed_to_terms) },
    { label: 'Letter of Intent',       value: a => yesNo(a.agreed_to_letter_of_intent) },
    { label: 'Application Status',     value: a => appStatusConfig(a.status).label },
    { label: 'Admission Status',       value: a => admissionStatusConfig(a.admission_status).label },
    { label: 'Notes',                  value: a => a.notes },
];

function escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function externalUrl(value: string) {
    return value.startsWith('http') ? value : `https://${value}`;
}

const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', linkedin: '', graduation_year: '', categories: [] as string[] };

export default function ApplicationsPage() {
    const [applicants, setApplicants] = useState<Applicant[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
    const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
    const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
    const [sendingMemberInviteId, setSendingMemberInviteId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addingApplicant, setAddingApplicant] = useState(false);
    const [addForm, setAddForm] = useState(EMPTY_FORM);
    const [generalNotes, setGeneralNotes] = useState('');
    const [notesStatus, setNotesStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const fetchAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/applications', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load applications');
            const rows: Applicant[] = Array.isArray(data) ? data : [];
            setApplicants(rows);
            setLocalNotes(Object.fromEntries(rows.map(a => [a.id, a.notes || ''])));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load applications');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
        fetch('/api/admin/applications-notes')
            .then(res => res.json())
            .then(data => setGeneralNotes(data.notes || ''))
            .catch(() => { /* notes are optional */ });
    }, []);

    const flash = (message: string) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 4000);
    };

    const saveGeneralNotes = async () => {
        setNotesStatus('saving');
        try {
            await fetch('/api/admin/applications-notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: generalNotes }),
            });
            setNotesStatus('saved');
            setTimeout(() => setNotesStatus('idle'), 2000);
        } catch {
            setNotesStatus('idle');
        }
    };

    const patchApplicant = async (id: string, body: Record<string, unknown>, busyKey = id): Promise<boolean> => {
        setUpdatingId(busyKey);
        try {
            const response = await fetch('/api/admin/applications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...body }),
            });
            if (!response.ok) throw new Error('Update failed');
            setApplicants(prev => prev.map(a => a.id === id ? { ...a, ...body } as Applicant : a));
            setSelectedApplicant(current => current?.id === id ? { ...current, ...body } as Applicant : current);
            return true;
        } catch {
            setError('Could not save that change. Please try again.');
            return false;
        } finally {
            setUpdatingId(null);
        }
    };

    const saveNote = async (id: string) => {
        const note = localNotes[id] ?? '';
        const current = applicants.find(a => a.id === id);
        if (!current || (current.notes || '') === note) return;
        setSavingNoteId(id);
        await patchApplicant(id, { notes: note }, `${id}_notes`);
        setSavingNoteId(null);
    };

    const addApplicant = async () => {
        if (!addForm.first_name.trim() || !addForm.email.trim()) return;
        setAddingApplicant(true);
        try {
            const response = await fetch('/api/admin/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to add applicant');
            setApplicants(prev => [data, ...prev]);
            setLocalNotes(prev => ({ ...prev, [data.id]: '' }));
            setShowAddModal(false);
            setAddForm(EMPTY_FORM);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add applicant');
        } finally {
            setAddingApplicant(false);
        }
    };

    const deleteApplicant = async (id: string) => {
        if (!confirm('Delete this application? This cannot be undone.')) return;
        setDeletingId(id);
        try {
            const response = await fetch(`/api/admin/applications?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error();
            setApplicants(prev => prev.filter(a => a.id !== id));
            if (selectedApplicant?.id === id) setSelectedApplicant(null);
        } catch {
            setError('Could not delete the application.');
        } finally {
            setDeletingId(null);
        }
    };

    const sendMemberInvite = async (applicant: Applicant, alreadyConfirmed = false) => {
        const again = applicant.member_id ? ' again' : '';
        if (!alreadyConfirmed && !confirm(`Send ${applicant.name} their "Welcome to RCCEB" onboarding email${again}?`)) return;
        setSendingMemberInviteId(applicant.id);
        try {
            const response = await fetch('/api/admin/members/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId: applicant.id }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Failed to send the portal invite');
            setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, member_id: data.memberId } : a));
            flash(`Welcome email sent to ${applicant.email}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send the portal invite');
        } finally {
            setSendingMemberInviteId(null);
        }
    };

    // Accepting someone who isn't a member yet sends their "Welcome to RCCEB" onboarding
    // email straight away, so there's no separate step to forget.
    const changeAdmission = async (applicant: Applicant, value: string) => {
        if (value !== 'accepted' || applicant.member_id) {
            await patchApplicant(applicant.id, { admission_status: value }, `${applicant.id}_admission`);
            return;
        }
        const unverified = applicant.status !== 'rc verified'
            ? `\n\nNote: they aren't marked RC Verified yet.`
            : '';
        if (!confirm(`Accept ${applicant.name}? This emails them their "Welcome to RCCEB" onboarding link right away.${unverified}`)) return;
        if (await patchApplicant(applicant.id, { admission_status: value }, `${applicant.id}_admission`)) {
            await sendMemberInvite(applicant, true);
        }
    };

    const q = search.trim().toLowerCase();
    const filteredApplicants = applicants.filter(a =>
        (!categoryFilter || a.categories.includes(categoryFilter)) && (
            !q ||
            a.name.toLowerCase().includes(q) ||
            a.email.toLowerCase().includes(q) ||
            (a.phone || '').toLowerCase().includes(q) ||
            String(a.graduation_year ?? '').includes(q) ||
            (a.location ?? '').toLowerCase().includes(q)
        ),
    );

    const downloadCsv = () => {
        const rows = [
            CSV_COLUMNS.map(c => escapeCsv(c.label)).join(','),
            ...filteredApplicants.map(a => CSV_COLUMNS.map(c => escapeCsv(c.value(a))).join(',')),
        ];
        // Leading BOM so Excel opens Turkish characters correctly.
        const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rcceb-applications-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const toggleAddCategory = (id: string) => {
        setAddForm(f => ({
            ...f,
            categories: f.categories.includes(id) ? f.categories.filter(c => c !== id) : [...f.categories, id],
        }));
    };

    return (
        <div className="text-slate-700 font-sans selection:bg-gold-300/40 p-4 md:p-6">
            <div className="w-full">
                {/* Header */}
                <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Applications</h1>
                        <span className="px-2.5 py-1 bg-white text-slate-500 text-[10px] font-bold uppercase rounded-full border border-slate-200 shadow-sm">
                            {filteredApplicants.length} applications
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
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search name, email, class year…"
                                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-blue-500 focus:ring-4 focus:ring-brand-blue-500/5 text-sm w-64 shadow-sm transition-all placeholder:text-slate-400"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={downloadCsv}
                            disabled={filteredApplicants.length === 0}
                            title={`Export ${filteredApplicants.length} application${filteredApplicants.length === 1 ? '' : 's'} as CSV`}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm text-[11px] font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            Export CSV
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-blue-500 text-white rounded-xl hover:bg-brand-blue-600 transition-all shadow-sm text-[11px] font-bold uppercase tracking-widest"
                        >
                            <PlusCircleIcon className="w-4 h-4" />
                            Add Applicant
                        </button>
                        <button
                            onClick={fetchAll}
                            title="Refresh"
                            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm group"
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-brand-blue-500' : 'text-slate-500 group-hover:text-slate-900'}`} />
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center justify-between">
                        {error}
                        <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
                    </div>
                )}
                {notice && (
                    <div className="mb-4 px-4 py-3 bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl">{notice}</div>
                )}

                {/* General Notes */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <PencilSquareIcon className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">General Notes</span>
                        </div>
                        {notesStatus === 'saving' && <span className="text-[10px] text-slate-400">Saving…</span>}
                        {notesStatus === 'saved' && <span className="text-[10px] font-semibold text-green-600">Saved ✓</span>}
                    </div>
                    <textarea
                        rows={3}
                        value={generalNotes}
                        onChange={e => setGeneralNotes(e.target.value)}
                        onBlur={saveGeneralNotes}
                        placeholder="Shared notes, reminders, to-dos… (saved automatically)"
                        className="w-full resize-y text-sm text-slate-600 placeholder:text-slate-300 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-blue-500 focus:ring-2 focus:ring-brand-blue-500/10 transition-all leading-relaxed"
                    />
                </div>

                {/* Applications Table */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Candidate</th>
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date</th>
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Pathway</th>
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Application</th>
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Admission</th>
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Notes</th>
                                    <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && applicants.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-24 text-center text-slate-400 text-sm">
                                        <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-3 text-slate-300" />
                                        Fetching records...
                                    </td></tr>
                                ) : filteredApplicants.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-sm italic">
                                        {applicants.length === 0 ? 'No applications yet. New ones from rcceb.org/join land here.' : 'No applications match your filters.'}
                                    </td></tr>
                                ) : filteredApplicants.map((applicant) => (
                                    <tr key={applicant.id} className="hover:bg-slate-50/40 transition-colors group">
                                        <td className="px-3 py-3">
                                            <div className="font-semibold text-slate-900 text-sm">{applicant.name}</div>
                                            <div className="text-xs text-slate-500">
                                                {applicant.graduation_year ? `RC ${applicant.graduation_year}` : 'Class year —'}
                                                {applicant.location && <span> · {applicant.location}</span>}
                                                {applicant.member_id && <span className="ml-2 text-green-600 font-semibold">· Invited to portal</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="text-xs text-slate-500 font-medium">
                                                {new Date(applicant.created_at).toLocaleDateString('en-GB')}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                                                {applicant.categories.length > 0 ? applicant.categories.map(id => (
                                                    <span key={id} className="px-2 py-0.5 bg-gold-100 text-gold-800 text-[10px] font-bold rounded-full border border-gold-200 whitespace-nowrap">
                                                        {categoryLabel(id)}
                                                    </span>
                                                )) : <span className="text-xs text-slate-400">—</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="relative inline-block w-40">
                                                <select
                                                    value={applicant.status}
                                                    onChange={(e) => patchApplicant(applicant.id, { status: e.target.value })}
                                                    disabled={updatingId === applicant.id}
                                                    className={`w-full appearance-none bg-white border rounded-lg py-1 pl-2.5 pr-7 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:border-slate-300 transition-all ${appStatusConfig(applicant.status).color}`}
                                                >
                                                    {APPLICATION_STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value} className="bg-white text-slate-700">
                                                            {opt.label.toUpperCase()}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="relative inline-block w-28">
                                                <select
                                                    value={applicant.admission_status || ''}
                                                    onChange={(e) => changeAdmission(applicant, e.target.value)}
                                                    disabled={updatingId === `${applicant.id}_admission` || sendingMemberInviteId === applicant.id}
                                                    className={`w-full appearance-none bg-white border rounded-lg py-1 pl-2.5 pr-7 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:border-slate-300 transition-all ${admissionStatusConfig(applicant.admission_status).color}`}
                                                >
                                                    {ADMISSION_STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value} className="bg-white text-slate-700">
                                                            {opt.label.toUpperCase()}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="relative w-40">
                                                <textarea
                                                    rows={2}
                                                    placeholder="Add note..."
                                                    value={localNotes[applicant.id] ?? ''}
                                                    onChange={(e) => setLocalNotes(prev => ({ ...prev, [applicant.id]: e.target.value }))}
                                                    onBlur={() => saveNote(applicant.id)}
                                                    className="w-full resize-none text-xs text-slate-600 placeholder:text-slate-300 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-blue-500 focus:ring-2 focus:ring-brand-blue-500/10 transition-all leading-relaxed"
                                                />
                                                {savingNoteId === applicant.id && (
                                                    <ArrowPathIcon className="absolute bottom-2 right-2 w-3 h-3 animate-spin text-brand-blue-500" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setSelectedApplicant(applicant)}
                                                    className="text-[11px] font-bold text-slate-500 hover:text-brand-blue-500 transition-colors uppercase tracking-widest"
                                                >
                                                    Details
                                                </button>
                                                {applicant.admission_status === 'accepted' && (
                                                    <button
                                                        onClick={() => sendMemberInvite(applicant)}
                                                        disabled={sendingMemberInviteId === applicant.id}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                                                        title={applicant.member_id ? 'Send the onboarding email again' : 'Send the onboarding email'}
                                                    >
                                                        {sendingMemberInviteId === applicant.id ? (
                                                            <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <UserPlusIcon className="w-3 h-3" />
                                                        )}
                                                        {applicant.member_id ? 'Resend' : 'Invite'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => deleteApplicant(applicant.id)}
                                                    disabled={deletingId === applicant.id}
                                                    title="Delete application"
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                >
                                                    {deletingId === applicant.id ? (
                                                        <ArrowPathIcon className="w-4 h-4 animate-spin text-slate-300" />
                                                    ) : (
                                                        <TrashIcon className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedApplicant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedApplicant(null)}>
                    <div className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="relative p-8 border-b border-slate-100 bg-slate-50/60">
                            <button
                                onClick={() => setSelectedApplicant(null)}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                            <div className="text-[10px] font-black text-gold-600 uppercase tracking-[0.2em] mb-3">Application</div>
                            <h2 className="text-3xl font-bold text-slate-900 mb-2">{selectedApplicant.name}</h2>
                            <div className="flex items-center gap-2 text-slate-500 text-[13px] font-medium">
                                <CalendarIcon className="w-4 h-4" />
                                Applied on {new Date(selectedApplicant.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                {selectedApplicant.source && <span className="text-slate-400">· via {selectedApplicant.source}</span>}
                            </div>
                        </div>

                        <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Email</div>
                                    <a href={`mailto:${selectedApplicant.email}`} className="text-[15px] font-medium text-slate-700 hover:text-brand-blue-500 transition-colors flex items-center gap-2.5 break-all">
                                        <EnvelopeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                        {selectedApplicant.email}
                                    </a>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Phone</div>
                                    <a href={`tel:${selectedApplicant.phone}`} className="text-[15px] font-medium text-slate-700 flex items-center gap-2.5">
                                        <PhoneIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                        {selectedApplicant.phone || '—'}
                                    </a>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">RC Graduation Year</div>
                                    <div className="text-[15px] font-medium text-slate-700 flex items-center gap-2.5">
                                        <AcademicCapIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                        {selectedApplicant.graduation_year ?? '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Location</div>
                                    <div className="text-[15px] font-medium text-slate-700 flex items-center gap-2.5">
                                        <MapPinIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                        {selectedApplicant.location || '—'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Role in the Community</div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedApplicant.categories.length > 0 ? selectedApplicant.categories.map(id => (
                                        <span key={id} className="px-3 py-1 bg-gold-100 text-gold-800 text-[11px] font-bold rounded-full border border-gold-200">
                                            {categoryLabel(id, 'label')}
                                        </span>
                                    )) : <span className="text-sm text-slate-400">Not specified</span>}
                                </div>
                            </div>

                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Agreements</div>
                                <ul className="space-y-2 text-sm text-slate-700">
                                    {[
                                        { ok: selectedApplicant.agreed_to_terms, label: 'Privacy Notice, Code of Conduct, Consent & Release' },
                                        { ok: selectedApplicant.agreed_to_letter_of_intent, label: 'Letter of Intent' },
                                        { ok: selectedApplicant.contact_consent, label: 'Agreed to be contacted about membership & events' },
                                    ].map(item => (
                                        <li key={item.label} className="flex items-center gap-2">
                                            {item.ok
                                                ? <CheckCircleIcon className="w-4 h-4 text-green-600 shrink-0" />
                                                : <MinusCircleIcon className="w-4 h-4 text-slate-300 shrink-0" />}
                                            <span className={item.ok ? '' : 'text-slate-400'}>{item.label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {selectedApplicant.linkedin && (
                                <a
                                    href={externalUrl(selectedApplicant.linkedin)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2.5 px-6 py-3 bg-white text-slate-900 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                                >
                                    LINKEDIN PROFILE
                                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 opacity-40" />
                                </a>
                            )}

                            {selectedApplicant.notes && (
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</div>
                                    <p className="text-sm text-slate-700 whitespace-pre-line">{selectedApplicant.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Applicant Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="relative p-8 border-b border-slate-100 bg-slate-50/60">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                            <h2 className="text-2xl font-bold text-slate-900">Add Applicant</h2>
                            <p className="text-sm text-slate-500 mt-1">For someone who applied outside the website form.</p>
                        </div>
                        <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    ['first_name', 'First name *'],
                                    ['last_name', 'Last name'],
                                    ['email', 'Email *'],
                                    ['phone', 'Phone'],
                                ] as const).map(([key, label]) => (
                                    <div key={key}>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
                                        <input
                                            value={addForm[key]}
                                            onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-blue-500"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Graduation year</label>
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
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">LinkedIn</label>
                                    <input
                                        value={addForm.linkedin}
                                        onChange={e => setAddForm(f => ({ ...f, linkedin: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-blue-500"
                                    />
                                </div>
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
                                                onClick={() => toggleAddCategory(c.id)}
                                                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${selected ? 'bg-brand-blue-500 border-brand-blue-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                            >
                                                {c.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">Cancel</button>
                            <button
                                onClick={addApplicant}
                                disabled={addingApplicant || !addForm.first_name.trim() || !addForm.email.trim()}
                                className="px-5 py-2 bg-brand-blue-500 text-white rounded-xl text-sm font-bold hover:bg-brand-blue-600 disabled:opacity-40 transition-all"
                            >
                                {addingApplicant ? 'Adding…' : 'Add applicant'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
