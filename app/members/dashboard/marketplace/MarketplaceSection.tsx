'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { type MarketplaceListing, type MarketplaceListingType, type MarketplaceSubscription } from '@/app/lib/marketplace';
import { ListingForm } from './ListingForm';
import { ListingRow } from './ListingRow';

type Filter = 'all' | MarketplaceListingType;

const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'ask', label: 'Asks' },
    { id: 'offer', label: 'Offers' },
];

function NotifyToggle({
    label,
    description,
    enabled,
    disabled,
    onToggle,
}: {
    label: string;
    description: string;
    enabled: boolean;
    disabled: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{description}</div>
            </div>
            <button
                onClick={onToggle}
                disabled={disabled}
                aria-pressed={enabled}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${enabled ? 'bg-gold-400' : 'bg-zinc-700'}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}

function NotifyCard() {
    const [subscription, setSubscription] = useState<MarketplaceSubscription | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        fetch('/api/members/marketplace/notifications', { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (active && data?.subscription) setSubscription(data.subscription); })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    async function toggle(key: keyof MarketplaceSubscription) {
        if (!subscription) return;
        const previous = subscription;
        const next = { ...subscription, [key]: !subscription[key] };
        setSubscription(next);
        setSaving(true);
        try {
            const res = await fetch('/api/members/marketplace/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            if (!res.ok) throw new Error('save failed');
            const data = await res.json();
            if (data?.subscription) setSubscription(data.subscription);
        } catch {
            setSubscription(previous);
        } finally {
            setSaving(false);
        }
    }

    if (!subscription) return null;

    return (
        <div className="mb-6 space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5">
            <NotifyToggle
                label="Email me new asks"
                description={subscription.notify_asks ? "You'll get an email when a member asks for help." : 'Hear about it when a member needs something you might help with.'}
                enabled={subscription.notify_asks}
                disabled={saving}
                onToggle={() => toggle('notify_asks')}
            />
            <div className="h-px bg-zinc-800" />
            <NotifyToggle
                label="Email me new offers"
                description={subscription.notify_offers ? "You'll get an email when a member offers help." : 'Hear about it when a member offers something they can help with.'}
                enabled={subscription.notify_offers}
                disabled={saving}
                onToggle={() => toggle('notify_offers')}
            />
        </div>
    );
}

export function MarketplaceSection() {
    const [listings, setListings] = useState<MarketplaceListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [formOpen, setFormOpen] = useState(false);
    const [newType, setNewType] = useState<MarketplaceListingType>('ask');
    const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchListings = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/members/marketplace?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not load Asks & Offers');
                return;
            }
            setListings(Array.isArray(data.listings) ? data.listings : []);
        } catch {
            setError('Could not load Asks & Offers');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchListings();
    }, [fetchListings]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return listings.filter(listing =>
            (filter === 'all' || listing.type === filter) && (
                !query || [
                    listing.title,
                    listing.description,
                    listing.author.name,
                    ...listing.tags,
                ].some(value => value.toLowerCase().includes(query))
            ),
        );
    }, [listings, search, filter]);

    function openNew(type: MarketplaceListingType) {
        setEditingListing(null);
        setNewType(type);
        setFormOpen(true);
    }

    function openEdit(listing: MarketplaceListing) {
        setEditingListing(listing);
        setFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleSaved() {
        setFormOpen(false);
        setEditingListing(null);
        fetchListings();
    }

    const emptyLabel = filter === 'ask' ? 'No asks yet.' : filter === 'offer' ? 'No offers yet.' : 'Nothing posted yet.';

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
                <button onClick={() => openNew('ask')} className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300">
                    <PlusIcon className="h-4 w-4" /> Ask for help
                </button>
                <button onClick={() => openNew('offer')} className="inline-flex items-center gap-2 rounded-xl border border-gold-400/50 px-4 py-2.5 text-xs font-semibold text-gold-300 transition-colors hover:bg-gold-400/10">
                    <PlusIcon className="h-4 w-4" /> Offer help
                </button>
            </div>

            {formOpen && (
                <ListingForm
                    defaultType={newType}
                    listing={editingListing}
                    onCancel={() => { setFormOpen(false); setEditingListing(null); }}
                    onSaved={handleSaved}
                />
            )}

            <NotifyCard />

            <div className="relative mb-4">
                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search titles, descriptions, people..."
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-10 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                        <XMarkIcon className="h-4 w-4" />
                        <span className="sr-only">Clear search</span>
                    </button>
                )}
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
                {FILTERS.map(option => (
                    <button
                        key={option.id}
                        onClick={() => setFilter(option.id)}
                        aria-pressed={filter === option.id}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${filter === option.id ? 'border-gold-400 bg-gold-400/10 text-gold-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</div>}

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-zinc-900/70" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-sm text-zinc-400">{search ? 'Nothing matches your search.' : emptyLabel}</p>
                    {!search && (
                        <button onClick={() => openNew(filter === 'offer' ? 'offer' : 'ask')} className="mt-3 text-xs font-semibold text-gold-300 hover:underline">
                            {filter === 'offer' ? 'Post the first offer' : 'Post the first ask'}
                        </button>
                    )}
                </div>
            ) : (
                <div>
                    {filtered.map(listing => (
                        <ListingRow
                            key={listing.id}
                            listing={listing}
                            expanded={expandedId === listing.id}
                            onToggle={() => setExpandedId(current => current === listing.id ? null : listing.id)}
                            onEdit={() => openEdit(listing)}
                            onChanged={() => fetchListings(true)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
