'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { type MarketplaceListing } from '@/app/lib/marketplace';

type Props = {
    listing?: MarketplaceListing | null;
    onCancel: () => void;
    onSaved: () => void;
};

export function ListingForm({ listing, onCancel, onSaved }: Props) {
    const [title, setTitle] = useState(listing?.title ?? '');
    const [description, setDescription] = useState(listing?.description ?? '');
    const [contactInfo, setContactInfo] = useState(listing?.contact_info ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setTitle(listing?.title ?? '');
        setDescription(listing?.description ?? '');
        setContactInfo(listing?.contact_info ?? '');
        setError('');
    }, [listing]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await fetch(listing ? `/api/members/marketplace/${listing.id}` : '/api/members/marketplace', {
                method: listing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, contact_info: contactInfo, tags: [] }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not save listing');
                return;
            }
            onSaved();
        } catch {
            setError('Could not save listing. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mb-6 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/80">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-white">{listing ? 'Edit listing' : 'Add to the Marketplace'}</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Say what you can help with and how members should reach you.</p>
                </div>
                <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white">
                    <XMarkIcon className="h-4 w-4" />
                    <span className="sr-only">Cancel</span>
                </button>
            </div>

            <div className="space-y-5 p-5">
                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Title</span>
                    <input
                        value={title}
                        onChange={event => setTitle(event.target.value)}
                        maxLength={140}
                        required
                        placeholder="e.g. I can help with pitch decks"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                    />
                </label>

                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Description</span>
                    <textarea
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        maxLength={3000}
                        required
                        rows={5}
                        placeholder="What tasks can you help with?"
                        className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                    />
                </label>

                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Contact info</span>
                    <input
                        value={contactInfo}
                        onChange={event => setContactInfo(event.target.value)}
                        maxLength={300}
                        required
                        placeholder="e.g. email me at you@example.com, or DM on LinkedIn"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                    />
                </label>

                {error && <p className="text-xs text-red-400">{error}</p>}

                <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
                    <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white">
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-gold-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : listing ? 'Save changes' : 'Publish'}
                    </button>
                </div>
            </div>
        </form>
    );
}
