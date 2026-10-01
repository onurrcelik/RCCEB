'use client';

import { useState } from 'react';
import { ChevronDownIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { type MarketplaceListing } from '@/app/lib/marketplace';

type Props = {
    listing: MarketplaceListing;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onChanged: () => void;
};

function getInitials(name: string) {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function Linkified({ text }: { text: string }) {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return (
        <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
            {parts.map((part, index) => part.startsWith('http') ? (
                <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="break-all text-gold-300 hover:underline">
                    {part}
                </a>
            ) : part)}
        </p>
    );
}

export function ListingRow({ listing, expanded, onToggle, onEdit, onChanged }: Props) {
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');

    async function deleteListing() {
        if (!window.confirm('Permanently delete this listing?')) return;
        setWorking(true);
        const res = await fetch(`/api/members/marketplace/${listing.id}`, { method: 'DELETE' });
        setWorking(false);
        if (res.ok) onChanged();
        else setError('Could not delete listing');
    }

    return (
        <article className={`overflow-hidden border-x border-b border-zinc-800 bg-zinc-900/55 transition-colors first:rounded-t-2xl first:border-t last:rounded-b-2xl hover:bg-zinc-900/85 ${expanded ? 'bg-zinc-900/85' : ''}`}>
            <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-4 text-left sm:gap-4 sm:px-5">
                {listing.author.avatar_url ? (
                    <img src={listing.author.avatar_url} alt={listing.author.name} className="mt-0.5 h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                    <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-700 text-xs font-bold text-gold-300">
                        {getInitials(listing.author.name)}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-gold-300 sm:text-[15px]">{listing.title}</h3>
                        {listing.is_own && (
                            <span className="rounded bg-gold-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-300">Yours</span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">{listing.author.name}</div>
                </div>
                <ChevronDownIcon className={`mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-zinc-800 bg-zinc-950/60 px-5 py-5 sm:px-6">
                    <Linkified text={listing.description} />

                    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Contact</div>
                        <div className="mt-1"><Linkified text={listing.contact_info} /></div>
                    </div>

                    {listing.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                            {listing.tags.map(tag => (
                                <span key={tag} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[10px] font-medium text-zinc-300">{tag}</span>
                            ))}
                        </div>
                    )}

                    {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

                    {listing.is_own && (
                        <div className="mt-5 flex justify-end gap-2 border-t border-zinc-800 pt-4">
                            <button
                                onClick={onEdit}
                                disabled={working}
                                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                            >
                                <PencilIcon className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                                onClick={deleteListing}
                                disabled={working}
                                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                            >
                                <TrashIcon className="h-3.5 w-3.5" /> Delete
                            </button>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}
