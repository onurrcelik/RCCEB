'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { type JobBoardPost } from '@/app/lib/job-board';

type Props = {
    post?: JobBoardPost | null;
    onCancel: () => void;
    onSaved: () => void;
};

export function PostForm({ post, onCancel, onSaved }: Props) {
    const [title, setTitle] = useState(post?.title ?? '');
    const [description, setDescription] = useState(post?.description ?? '');
    const [location, setLocation] = useState(post?.location ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setTitle(post?.title ?? '');
        setDescription(post?.description ?? '');
        setLocation(post?.location ?? '');
        setError('');
    }, [post]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await fetch(post ? `/api/members/job-board/${post.id}` : '/api/members/job-board', {
                method: post ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'job', title, description, location, tags: [] }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not save post');
                return;
            }
            onSaved();
        } catch {
            setError('Could not save post. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mb-6 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/80">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-white">{post ? 'Edit post' : 'Add to the Job Board'}</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Members apply with a short note and profile — you review applicants and reach out.</p>
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
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                    />
                </label>

                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Description</span>
                    <textarea
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        maxLength={5000}
                        required
                        rows={6}
                        className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-zinc-950 outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                    />
                </label>

                <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Location <span className="normal-case tracking-normal text-zinc-600">optional, blank means Online</span>
                    </span>
                    <input
                        value={location}
                        onChange={event => setLocation(event.target.value)}
                        maxLength={120}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
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
                        {saving ? 'Saving...' : post ? 'Save changes' : 'Publish'}
                    </button>
                </div>
            </div>
        </form>
    );
}
