'use client';

import React, { useEffect, useState } from 'react';
import { TrashIcon, ArrowPathIcon, LinkIcon, SparklesIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface ManualLink {
    id: string;
    url: string;
    title: string;
    type: string;
    notes: string;
    added_at: string;
}

type BulkItem = {
    key: string;
    url: string;
    pastedContent: string;
    showPaste: boolean;
    status: 'idle' | 'analyzing' | 'done' | 'error';
    type: string;
    title: string;
    notes: string;
    error?: string;
};

const LINK_TYPE_STYLES: Record<string, string> = {
    repo: 'bg-slate-800 text-slate-200',
    article: 'bg-blue-50 text-blue-600',
    paper: 'bg-purple-50 text-purple-600',
    linkedin: 'bg-sky-50 text-sky-600',
    twitter: 'bg-sky-50 text-sky-500',
    youtube: 'bg-red-50 text-red-500',
    instagram: 'bg-pink-50 text-pink-500',
    other: 'bg-slate-100 text-slate-500',
};

function fmt(date: string) {
    return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function resetModal() {
    return { bulkUrls: '', bulkDate: today(), bulkItems: [] as BulkItem[] };
}

export default function LinksPage() {
    const [manualLinks, setManualLinks] = useState<ManualLink[]>([]);
    const [loadingLinks, setLoadingLinks] = useState(true);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

    const [bulkUrls, setBulkUrls] = useState('');
    const [bulkDate, setBulkDate] = useState(today());
    const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
    const [savingBulk, setSavingBulk] = useState(false);

    const fetchLinks = async () => {
        setLoadingLinks(true);
        try {
            const res = await fetch('/api/admin/manual-links');
            setManualLinks(await res.json());
        } finally {
            setLoadingLinks(false);
        }
    };

    useEffect(() => {
        fetchLinks();
    }, []);

    const handleDeleteLink = async (id: string) => {
        setDeletingLinkId(id);
        try {
            await fetch(`/api/admin/manual-links/${id}`, { method: 'DELETE' });
            setManualLinks(prev => prev.filter(l => l.id !== id));
        } finally {
            setDeletingLinkId(null);
        }
    };

    const handleLoadUrls = () => {
        const incoming = bulkUrls
            .split('\n')
            .map(u => u.trim())
            .filter(u => u.length > 0);
        if (incoming.length === 0) return;

        const existingUrls = new Set(bulkItems.map(i => i.url));
        const newItems: BulkItem[] = incoming
            .filter(url => !existingUrls.has(url))
            .map(url => ({
                key: url + Math.random(),
                url,
                pastedContent: '',
                showPaste: false,
                status: 'idle',
                type: '',
                title: '',
                notes: '',
            }));

        setBulkItems(prev => [...prev, ...newItems]);
        setBulkUrls('');
    };

    const analyzeItem = (item: BulkItem) => {
        setBulkItems(prev => prev.map(i => i.key === item.key ? { ...i, status: 'analyzing' } : i));
        fetch('/api/admin/manual-links/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: item.url, pastedContent: item.pastedContent || undefined }),
        })
            .then(async r => {
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || `Analyze failed (HTTP ${r.status})`);
                return data;
            })
            .then(data => {
                setBulkItems(prev => prev.map(i =>
                    i.key === item.key
                        ? { ...i, status: 'done', type: data.type || 'other', title: data.title || '', notes: data.notes || '' }
                        : i
                ));
            })
            .catch(err => {
                setBulkItems(prev => prev.map(i =>
                    i.key === item.key ? { ...i, status: 'error', error: err instanceof Error ? err.message : String(err) } : i
                ));
            });
    };

    const handleAnalyzeAll = () => {
        bulkItems
            .filter(i => i.status === 'idle' || i.status === 'error')
            .forEach(analyzeItem);
    };

    const handleSaveBulk = async () => {
        const ready = bulkItems.filter(i => i.status === 'done' && i.title);
        if (ready.length === 0) return;
        setSavingBulk(true);
        try {
            const saved = await Promise.all(
                ready.map(item =>
                    fetch('/api/admin/manual-links', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: item.url,
                            title: item.title,
                            type: item.type || 'other',
                            notes: item.notes,
                            added_at: bulkDate,
                        }),
                    }).then(r => r.json())
                )
            );
            setManualLinks(prev => [...saved.reverse(), ...prev]);
            const { bulkItems: emptyItems, bulkDate: newDate, bulkUrls: emptyUrls } = resetModal();
            setBulkItems(emptyItems);
            setBulkDate(newDate);
            setBulkUrls(emptyUrls);
            setShowLinkForm(false);
        } finally {
            setSavingBulk(false);
        }
    };

    const updateItem = (key: string, patch: Partial<BulkItem>) =>
        setBulkItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));

    const readyCount = bulkItems.filter(i => i.status === 'done' && i.title).length;
    const pendingCount = bulkItems.filter(i => i.status === 'idle' || i.status === 'error').length;

    return (
        <div className="p-4 md:p-12 text-slate-700 font-sans">
            <div className="max-w-[1100px] mx-auto">

                <header className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Links</h1>
                        <p className="text-sm text-slate-400">Links shared during meetings. Auto-assigned to newsletter editions by date.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={fetchLinks} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                            <ArrowPathIcon className={`w-4 h-4 ${loadingLinks ? 'animate-spin text-brand-blue-500' : 'text-slate-500'}`} />
                        </button>
                        <button
                            onClick={() => setShowLinkForm(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-brand-blue-500 text-white text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-brand-blue-600 transition-all shadow-sm"
                        >
                            <LinkIcon className="w-4 h-4" />
                            Add Links
                        </button>
                    </div>
                </header>

                {loadingLinks && manualLinks.length === 0 ? (
                    <div className="flex items-center justify-center h-40">
                        <ArrowPathIcon className="w-5 h-5 animate-spin text-slate-300" />
                    </div>
                ) : manualLinks.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col items-center justify-center py-24 text-center px-6">
                        <LinkIcon className="w-8 h-8 text-slate-300 mb-3" />
                        <p className="text-sm text-slate-400 mb-6">No links added yet. Add links shared during your meetings.</p>
                        <button
                            onClick={() => setShowLinkForm(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue-500 text-white text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-brand-blue-600 transition-all"
                        >
                            <LinkIcon className="w-4 h-4" />
                            Add Links
                        </button>
                    </div>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="divide-y divide-slate-50">
                            {manualLinks.map(link => (
                                <div key={link.id} className="px-6 py-4 flex items-start justify-between gap-4 group">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border border-slate-100 px-2 py-1 rounded mt-0.5 whitespace-nowrap">
                                            {fmt(link.added_at)}
                                        </span>
                                        <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 ${LINK_TYPE_STYLES[link.type] || LINK_TYPE_STYLES.other}`}>
                                            {link.type}
                                        </span>
                                        <div className="min-w-0">
                                            <a
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[13px] font-semibold text-slate-800 hover:text-brand-blue-500 transition-colors leading-snug block truncate"
                                            >
                                                {link.title}
                                            </a>
                                            {link.notes && <p className="text-[12px] text-slate-500 mt-0.5">{link.notes}</p>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteLink(link.id)}
                                        disabled={deletingLinkId === link.id}
                                        className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        {deletingLinkId === link.id
                                            ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                            : <TrashIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Links modal */}
            {showLinkForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                        {/* Fixed header */}
                        <div className="px-8 pt-8 pb-5 border-b border-slate-100 shrink-0">
                            <div className="text-[10px] font-black text-brand-blue-500 uppercase tracking-[0.2em] mb-1">Add Links</div>
                            <h2 className="text-xl font-bold text-slate-900">Paste links from the meeting</h2>
                        </div>

                        {/* Scrollable body */}
                        <div className="overflow-y-auto flex-1 px-8 py-5 space-y-5">

                            {/* URL input + date */}
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">URLs — one per line</label>
                                    <textarea
                                        value={bulkUrls}
                                        onChange={e => setBulkUrls(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleLoadUrls(); } }}
                                        rows={3}
                                        placeholder={"https://github.com/...\nhttps://arxiv.org/...\nhttps://youtube.com/..."}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 focus:ring-4 focus:ring-brand-blue-500/5 transition-all resize-none font-mono"
                                    />
                                </div>
                                <div className="shrink-0 space-y-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Date shared</label>
                                        <input
                                            type="date"
                                            value={bulkDate}
                                            onChange={e => setBulkDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 focus:ring-4 focus:ring-brand-blue-500/5 transition-all"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleLoadUrls}
                                        disabled={!bulkUrls.trim()}
                                        className="w-full px-4 py-3 bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    >
                                        Load
                                    </button>
                                </div>
                            </div>

                            {/* Cards */}
                            {bulkItems.length > 0 && (
                                <div className="space-y-3">
                                    {bulkItems.map(item => (
                                        <div key={item.key} className="border border-slate-200 rounded-xl overflow-hidden">
                                            {/* Card header row */}
                                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/50">
                                                {/* Status indicator */}
                                                <div className="shrink-0 w-5 flex items-center justify-center">
                                                    {item.status === 'analyzing' && (
                                                        <ArrowPathIcon className="w-4 h-4 animate-spin text-brand-blue-500" />
                                                    )}
                                                    {item.status === 'done' && (
                                                        <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                        </div>
                                                    )}
                                                    {item.status === 'error' && (
                                                        <div className="w-4 h-4 rounded-full bg-red-400 flex items-center justify-center">
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </div>
                                                    )}
                                                    {item.status === 'idle' && (
                                                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                                                    )}
                                                </div>

                                                <span className="flex-1 text-[12px] text-slate-500 truncate font-mono">{item.url}</span>

                                                {item.type && (
                                                    <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${LINK_TYPE_STYLES[item.type] || LINK_TYPE_STYLES.other}`}>
                                                        {item.type}
                                                    </span>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => updateItem(item.key, { showPaste: !item.showPaste })}
                                                    className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-colors"
                                                >
                                                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${item.showPaste ? 'rotate-180' : ''}`} />
                                                    Paste
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setBulkItems(prev => prev.filter(i => i.key !== item.key))}
                                                    className="shrink-0 p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
                                                >
                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            {/* Paste area */}
                                            {item.showPaste && (
                                                <div className="px-4 py-3 border-t border-slate-100">
                                                    <textarea
                                                        value={item.pastedContent}
                                                        onChange={e => updateItem(item.key, { pastedContent: e.target.value })}
                                                        rows={4}
                                                        placeholder="Paste the full text of the page here — article, paper, LinkedIn post, GitHub README, tweet…"
                                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-brand-blue-500 transition-all resize-none font-mono leading-relaxed"
                                                    />
                                                </div>
                                            )}

                                            {/* Results (title + notes) once done */}
                                            {item.status === 'done' && (
                                                <div className="px-4 py-3 border-t border-slate-100 space-y-2">
                                                    <input
                                                        type="text"
                                                        value={item.title}
                                                        onChange={e => updateItem(item.key, { title: e.target.value })}
                                                        placeholder="Title"
                                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all"
                                                    />
                                                    <textarea
                                                        value={item.notes}
                                                        onChange={e => updateItem(item.key, { notes: e.target.value })}
                                                        rows={2}
                                                        placeholder="Notes"
                                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:border-brand-blue-500 transition-all resize-none"
                                                    />
                                                </div>
                                            )}

                                            {item.status === 'error' && (
                                                <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-red-500">{item.error}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Fixed footer */}
                        <div className="px-8 py-5 border-t border-slate-100 flex items-center gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={handleAnalyzeAll}
                                disabled={pendingCount === 0}
                                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <SparklesIcon className="w-4 h-4" />
                                Analyze{pendingCount > 0 ? ` ${pendingCount}` : ''}
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveBulk}
                                disabled={savingBulk || readyCount === 0}
                                className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue-500 text-white text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-brand-blue-600 disabled:opacity-50 transition-all"
                            >
                                {savingBulk ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Saving…</> : `Save ${readyCount > 0 ? readyCount + ' ' : ''}Link${readyCount !== 1 ? 's' : ''}`}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowLinkForm(false); setBulkItems([]); setBulkUrls(''); }}
                                className="ml-auto px-5 py-2.5 bg-slate-100 text-slate-700 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
