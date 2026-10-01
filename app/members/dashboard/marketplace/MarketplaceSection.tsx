'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { type MarketplaceListing } from '@/app/lib/marketplace';
import { ListingForm } from './ListingForm';
import { ListingRow } from './ListingRow';

export function MarketplaceSection() {
    const [listings, setListings] = useState<MarketplaceListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchListings = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/members/marketplace?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not load the Marketplace');
                return;
            }
            setListings(Array.isArray(data.listings) ? data.listings : []);
        } catch {
            setError('Could not load the Marketplace');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchListings();
    }, [fetchListings]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return listings;
        return listings.filter(listing => [
            listing.title,
            listing.description,
            listing.author.name,
            ...listing.tags,
        ].some(value => value.toLowerCase().includes(query)));
    }, [listings, search]);

    function openNew() {
        setEditingListing(null);
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

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-5 flex items-center justify-end">
                <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300">
                    <PlusIcon className="h-4 w-4" /> Add listing
                </button>
            </div>

            {formOpen && (
                <ListingForm
                    listing={editingListing}
                    onCancel={() => { setFormOpen(false); setEditingListing(null); }}
                    onSaved={handleSaved}
                />
            )}

            <div className="relative mb-6">
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

            {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</div>}

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-zinc-900/70" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-sm text-zinc-400">{search ? 'No listings match your search.' : 'No listings yet.'}</p>
                    {!search && <button onClick={openNew} className="mt-3 text-xs font-semibold text-gold-300 hover:underline">Add the first listing</button>}
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
