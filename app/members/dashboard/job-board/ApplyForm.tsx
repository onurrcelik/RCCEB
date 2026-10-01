'use client';

import { useState } from 'react';
import { MAX_PITCH_LENGTH } from '@/app/lib/job-board';

type Props = {
    postId: string;
    onCancel: () => void;
    onApplied: () => void;
};

export function ApplyForm({ postId, onCancel, onApplied }: Props) {
    const [pitch, setPitch] = useState('');
    const [link, setLink] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/members/job-board/${postId}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pitch, link }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not submit your application');
                return;
            }
            onApplied();
        } catch {
            setError('Could not submit your application');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Why you&apos;re a fit</span>
                    <span className="text-[10px] text-zinc-600">{pitch.length}/{MAX_PITCH_LENGTH}</span>
                </div>
                <textarea
                    value={pitch}
                    onChange={event => setPitch(event.target.value)}
                    maxLength={MAX_PITCH_LENGTH}
                    required
                    autoFocus
                    rows={4}
                    placeholder="A sentence or two on why you're a good match — the poster reads this first."
                    className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                />
            </div>

            <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Link <span className="normal-case tracking-normal text-zinc-600">optional — portfolio, CV, LinkedIn</span>
                </span>
                <input
                    value={link}
                    onChange={event => setLink(event.target.value)}
                    maxLength={500}
                    placeholder="https://"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                />
            </label>

            <p className="text-[11px] leading-relaxed text-zinc-500">
                Your profile and contact details are shared with the poster so they can reach out.
            </p>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-gold-400 px-5 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? 'Sending...' : 'Submit application'}
                </button>
            </div>
        </form>
    );
}
