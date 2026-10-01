'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EyeIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
    PITCH_STAGES,
    companyInitials,
    pitchStageLabel,
    type PitchDeck,
    type PitchStage,
} from '@/app/lib/pitch-decks';

type SortMode = 'newest' | 'views';

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400';

function formatSubmitted(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DeckForm({
    deck,
    onCancel,
    onSaved,
}: {
    deck?: PitchDeck | null;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [title, setTitle] = useState(deck?.title ?? '');
    const [company, setCompany] = useState(deck?.company_name ?? '');
    const [description, setDescription] = useState(deck?.description ?? '');
    const [stage, setStage] = useState<PitchStage>(deck?.stage ?? 'seed');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setTitle(deck?.title ?? '');
        setCompany(deck?.company_name ?? '');
        setDescription(deck?.description ?? '');
        setStage(deck?.stage ?? 'seed');
        setFile(null);
        setError('');
    }, [deck]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!deck && !file) {
            setError('Add a PDF of your deck');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const body = new FormData();
            body.set('title', title);
            body.set('company_name', company);
            body.set('description', description);
            body.set('stage', stage);
            if (file) body.set('file', file);
            const res = await fetch(deck ? `/api/members/pitch-decks/${deck.id}` : '/api/members/pitch-decks', {
                method: deck ? 'PATCH' : 'POST',
                body,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Could not save deck');
                return;
            }
            onSaved();
        } catch {
            setError('Could not save deck. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mb-6 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/80">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-white">{deck ? 'Edit deck' : 'Submit a deck'}</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Onboarded members can open the PDF. It is not public.</p>
                </div>
                <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white">
                    <XMarkIcon className="h-4 w-4" />
                    <span className="sr-only">Cancel</span>
                </button>
            </div>
            <div className="space-y-5 p-5">
                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Title</span>
                    <input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} required placeholder="What is this deck about?" className={inputClass} />
                </label>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Company</span>
                        <input value={company} onChange={event => setCompany(event.target.value)} maxLength={120} required placeholder="Company name" className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Stage</span>
                        <select value={stage} onChange={event => setStage(event.target.value as PitchStage)} className={inputClass}>
                            {PITCH_STAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                    </label>
                </div>
                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Description</span>
                    <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={1500} required rows={4} placeholder="What should a member know before opening the deck?" className={`${inputClass} leading-relaxed`} />
                </label>
                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">PDF</span>
                    <input
                        type="file"
                        accept="application/pdf,.pdf"
                        required={!deck}
                        onChange={event => setFile(event.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-800 file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700"
                    />
                    <span className="mt-2 block text-xs text-zinc-500">
                        {deck ? `Current file: ${deck.file_name}. Leave this empty to keep it. ` : ''}PDF, up to 4 MB.
                    </span>
                </label>
                {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</div>}
                <div className="flex justify-end">
                    <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center rounded-xl bg-gold-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300 disabled:opacity-60">
                        {saving ? 'Saving…' : deck ? 'Save changes' : 'Submit deck'}
                    </button>
                </div>
            </div>
        </form>
    );
}

function ReviewPanel({
    deck,
    onClose,
    onEdit,
    onChanged,
}: {
    deck: PitchDeck;
    onClose: () => void;
    onEdit: () => void;
    onChanged: () => void;
}) {
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    async function handleDelete() {
        setDeleting(true);
        setError('');
        try {
            const res = await fetch(`/api/members/pitch-decks/${deck.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Could not delete deck');
                return;
            }
            onChanged();
            onClose();
        } catch {
            setError('Could not delete deck. Please try again.');
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="deck-review-title"
                className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-zinc-700 bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"
                onClick={event => event.stopPropagation()}
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-xs font-bold text-gold-300">
                            {companyInitials(deck.company_name)}
                        </span>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-300">{pitchStageLabel(deck.stage)}</p>
                            <h2 id="deck-review-title" className="text-lg font-semibold text-white">{deck.title}</h2>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
                <p className="text-sm font-medium text-zinc-200">{deck.company_name}</p>
                <p className="mt-1 text-xs text-zinc-500">
                    {`Submitted ${formatSubmitted(deck.created_at)} by ${deck.author.name} · ${formatSize(deck.file_size)} · ${deck.view_count} ${deck.view_count === 1 ? 'view' : 'views'}`}
                </p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{deck.description}</p>
                {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</div>}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <a
                        href={`/api/members/pitch-decks/${deck.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => window.setTimeout(onChanged, 600)}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300"
                    >
                        Open deck
                    </a>
                    {deck.is_own && (
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={onEdit} className="text-xs font-semibold text-zinc-300 hover:text-white">Edit</button>
                            {confirmingDelete ? (
                                <button type="button" onClick={handleDelete} disabled={deleting} className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-60">
                                    {deleting ? 'Deleting…' : 'Confirm delete'}
                                </button>
                            ) : (
                                <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs font-semibold text-red-300 hover:text-red-200">Delete</button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function PitchDecksSection() {
    const [decks, setDecks] = useState<PitchDeck[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [stage, setStage] = useState<PitchStage | 'all'>('all');
    const [sort, setSort] = useState<SortMode>('newest');
    const [mineOnly, setMineOnly] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<PitchDeck | null>(null);
    const [reviewing, setReviewing] = useState<PitchDeck | null>(null);

    const fetchDecks = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/members/pitch-decks?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not load pitch decks');
                return;
            }
            const next = Array.isArray(data.decks) ? data.decks as PitchDeck[] : [];
            setDecks(next);
            setReviewing(current => current ? next.find(deck => deck.id === current.id) ?? null : null);
        } catch {
            setError('Could not load pitch decks');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDecks();
    }, [fetchDecks]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        const list = decks.filter(deck => {
            if (mineOnly && !deck.is_own) return false;
            if (stage !== 'all' && deck.stage !== stage) return false;
            if (!query) return true;
            return [deck.title, deck.company_name, deck.description, deck.author.name, pitchStageLabel(deck.stage)]
                .some(value => value.toLowerCase().includes(query));
        });
        return list.sort((a, b) => {
            if (sort === 'views' && b.view_count !== a.view_count) return b.view_count - a.view_count;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [decks, search, stage, sort, mineOnly]);

    const filtersActive = Boolean(search || stage !== 'all' || sort !== 'newest' || mineOnly);

    function openNew() {
        setEditing(null);
        setReviewing(null);
        setFormOpen(true);
    }

    function openEdit(deck: PitchDeck) {
        setReviewing(null);
        setEditing(deck);
        setFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function clearFilters() {
        setSearch('');
        setStage('all');
        setSort('newest');
        setMineOnly(false);
    }

    return (
        <div>
            <div className="mb-5 flex justify-stretch sm:justify-end">
                <button type="button" onClick={openNew} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gold-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300 sm:w-auto">
                    <PlusIcon className="h-4 w-4" /> Submit deck
                </button>
            </div>

            {formOpen && (
                <DeckForm
                    deck={editing}
                    onCancel={() => { setFormOpen(false); setEditing(null); }}
                    onSaved={() => { setFormOpen(false); setEditing(null); fetchDecks(); }}
                />
            )}

            <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="block sm:col-span-2 xl:col-span-1">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Keyword</span>
                        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, company or description" className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Stage</span>
                        <select value={stage} onChange={event => setStage(event.target.value as PitchStage | 'all')} className={inputClass}>
                            <option value="all">All</option>
                            {PITCH_STAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Sort</span>
                        <select value={sort} onChange={event => setSort(event.target.value as SortMode)} className={inputClass}>
                            <option value="newest">Newest</option>
                            <option value="views">Most viewed</option>
                        </select>
                    </label>
                    <div className="flex items-end gap-2">
                        <button
                            type="button"
                            onClick={() => setMineOnly(current => !current)}
                            className={`min-h-11 flex-1 rounded-xl border px-4 text-xs font-semibold transition-colors ${mineOnly ? 'border-gold-400 bg-gold-400 text-zinc-950' : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-500'}`}
                        >
                            Mine
                        </button>
                        {filtersActive && (
                            <button type="button" onClick={clearFilters} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-zinc-400 hover:text-white">
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</div>}

            {loading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-zinc-900/70" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-sm text-zinc-400">{filtersActive ? 'No decks match these filters.' : 'No pitch decks yet.'}</p>
                    {!filtersActive && <button type="button" onClick={openNew} className="mt-3 text-xs font-semibold text-gold-300 hover:underline">Submit the first deck</button>}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {filtered.map(deck => (
                        <button
                            key={deck.id}
                            type="button"
                            onClick={() => setReviewing(deck)}
                            className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-left transition-colors hover:border-zinc-600"
                        >
                            <div className="mb-3 flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400/15 text-[10px] font-bold text-gold-300">
                                    {companyInitials(deck.company_name)}
                                </span>
                                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                                    {pitchStageLabel(deck.stage)}
                                </span>
                                {deck.is_own && <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-300">Yours</span>}
                            </div>
                            <h3 className="text-base font-semibold text-white">{deck.title}</h3>
                            <p className="mt-0.5 text-sm text-zinc-400">{deck.company_name}</p>
                            <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-400">{deck.description}</p>
                            <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                                <span>Submitted {formatSubmitted(deck.created_at)} by {deck.author.name}</span>
                                <span className="inline-flex shrink-0 items-center gap-1">
                                    <EyeIcon className="h-3.5 w-3.5" />
                                    {deck.view_count}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {reviewing && (
                <ReviewPanel
                    deck={reviewing}
                    onClose={() => setReviewing(null)}
                    onEdit={() => openEdit(reviewing)}
                    onChanged={() => fetchDecks(true)}
                />
            )}
        </div>
    );
}
