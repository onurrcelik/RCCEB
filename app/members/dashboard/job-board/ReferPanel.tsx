'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckIcon, ClipboardIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { MAX_REFERRAL_NOTE_LENGTH } from '@/app/lib/job-board';

type DirectoryMember = { id: string; name: string | null; avatar_url: string | null };

type Props = {
    postId: string;
    shareToken: string | null;
    authorId: string;
    onCancel: () => void;
    onReferred: () => void;
};

function getInitials(name: string) {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export function ReferPanel({ postId, shareToken, authorId, onCancel, onReferred }: Props) {
    const [tab, setTab] = useState<'member' | 'friend'>('member');

    // Member referral state
    const [directory, setDirectory] = useState<DirectoryMember[]>([]);
    const [meId, setMeId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<DirectoryMember | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    // Outside-friend link state
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let active = true;
        Promise.all([
            fetch('/api/members/directory', { cache: 'no-store' }).then(res => (res.ok ? res.json() : { members: [] })),
            fetch('/api/members/profile', { cache: 'no-store' }).then(res => (res.ok ? res.json() : { member: null })),
        ]).then(([dir, profile]) => {
            if (!active) return;
            setDirectory(Array.isArray(dir.members) ? dir.members : []);
            setMeId(profile?.member?.id ?? null);
        }).catch(() => {});
        return () => { active = false; };
    }, []);

    const candidates = useMemo(() => {
        const query = search.trim().toLowerCase();
        return directory
            .filter(item => item.id !== authorId && item.id !== meId && item.name)
            .filter(item => !query || (item.name || '').toLowerCase().includes(query))
            .slice(0, 8);
    }, [directory, search, authorId, meId]);

    const friendLink = useMemo(() => {
        if (!shareToken || typeof window === 'undefined') return '';
        const ref = meId ? `?ref=${meId}` : '';
        return `${window.location.origin}/jobs/${shareToken}${ref}`;
    }, [shareToken, meId]);

    async function submitReferral() {
        if (!selected) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/members/job-board/${postId}/refer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referred_member_id: selected.id, note }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not send the referral');
                return;
            }
            setDone(true);
            onReferred();
        } catch {
            setError('Could not send the referral');
        } finally {
            setSaving(false);
        }
    }

    async function copyLink() {
        if (!friendLink) return;
        try {
            await navigator.clipboard.writeText(friendLink);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Could not copy the link');
        }
    }

    return (
        <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
            <div className="mb-4 flex gap-1 rounded-xl bg-zinc-900 p-1">
                {(['member', 'friend'] as const).map(value => (
                    <button
                        key={value}
                        onClick={() => { setTab(value); setError(''); }}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === value ? 'bg-gold-400 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
                    >
                        {value === 'member' ? 'A member' : 'An outside friend'}
                    </button>
                ))}
            </div>

            {tab === 'member' ? (
                done ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-emerald-300">
                        <CheckIcon className="h-4 w-4" /> Referral sent to {selected?.name}. We&apos;ve let them know.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {selected ? (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
                                <div className="flex items-center gap-2.5">
                                    {selected.avatar_url ? (
                                        <img src={selected.avatar_url} alt={selected.name || ''} className="h-8 w-8 rounded-full object-cover" />
                                    ) : (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-gold-300">
                                            {getInitials(selected.name || '?')}
                                        </div>
                                    )}
                                    <span className="text-sm font-medium text-white">{selected.name}</span>
                                </div>
                                <button onClick={() => setSelected(null)} className="text-[11px] font-semibold text-zinc-400 hover:text-white">Change</button>
                            </div>
                        ) : (
                            <div>
                                <div className="relative">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        value={search}
                                        onChange={event => setSearch(event.target.value)}
                                        placeholder="Search members by name..."
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                                    />
                                </div>
                                {candidates.length > 0 && (
                                    <div className="mt-2 max-h-56 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800">
                                        {candidates.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => setSelected(item)}
                                                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900"
                                            >
                                                {item.avatar_url ? (
                                                    <img src={item.avatar_url} alt={item.name || ''} className="h-8 w-8 rounded-full object-cover" />
                                                ) : (
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-gold-300">
                                                        {getInitials(item.name || '?')}
                                                    </div>
                                                )}
                                                <span className="text-sm text-zinc-200">{item.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {selected && (
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Note <span className="normal-case tracking-normal text-zinc-600">optional</span></span>
                                    <span className="text-[10px] text-zinc-600">{note.length}/{MAX_REFERRAL_NOTE_LENGTH}</span>
                                </div>
                                <textarea
                                    value={note}
                                    onChange={event => setNote(event.target.value)}
                                    maxLength={MAX_REFERRAL_NOTE_LENGTH}
                                    rows={3}
                                    placeholder="Why they'd be great for this — they'll see this in the referral."
                                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-950 outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                                />
                            </div>
                        )}

                        {error && <p className="text-xs text-red-400">{error}</p>}

                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white">
                                Cancel
                            </button>
                            <button
                                onClick={submitReferral}
                                disabled={!selected || saving}
                                className="rounded-xl bg-gold-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? 'Sending...' : 'Send referral'}
                            </button>
                        </div>
                    </div>
                )
            ) : (
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-zinc-400">
                        Share this link with someone outside the community. They can apply directly, and it&apos;ll show the poster that you referred them.
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            readOnly
                            value={friendLink}
                            onFocus={event => event.target.select()}
                            className="min-w-0 flex-1 truncate rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-300 outline-none"
                        />
                        <button
                            onClick={copyLink}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gold-400 px-3.5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300"
                        >
                            {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                    <div className="flex justify-end">
                        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:text-white">
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
