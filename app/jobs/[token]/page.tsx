'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircleIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { MAX_PITCH_LENGTH } from '@/app/lib/job-board';
import { RccebLogo } from '@/app/components/ui/RccebLogo';

type PublicJob = {
    title: string;
    description: string;
    location: string | null;
    status: 'open' | 'closed';
    poster_name: string;
    company_name: string | null;
};

export default function PublicJobPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    return (
        <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
            <JobApply token={token} />
        </Suspense>
    );
}

function JobApply({ token }: { token: string }) {
    const searchParams = useSearchParams();
    const ref = searchParams.get('ref') || '';

    const [job, setJob] = useState<PublicJob | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [loading, setLoading] = useState(true);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [pitch, setPitch] = useState('');
    const [link, setLink] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        let active = true;
        fetch(`/api/jobs/${token}`, { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
            .then(data => { if (active) setJob(data.job); })
            .catch(() => { if (active) setNotFound(true); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [token]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/jobs/${token}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, pitch, link, ref }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not submit your application');
                return;
            }
            setSubmitted(true);
        } catch {
            setError('Could not submit your application');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 px-5 py-12 text-white sm:py-16">
            <div className="mx-auto w-full max-w-xl">
                <RccebLogo className="mb-10" />

                {loading ? (
                    <div className="space-y-4">
                        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-zinc-900" />
                        <div className="h-32 animate-pulse rounded-2xl bg-zinc-900" />
                    </div>
                ) : notFound || !job ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                        <h1 className="text-lg font-semibold">This job link isn&apos;t available</h1>
                        <p className="mt-2 text-sm text-zinc-400">The link may be broken or the post may have been removed.</p>
                    </div>
                ) : submitted ? (
                    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-8 text-center">
                        <CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-400" />
                        <h1 className="mt-4 text-lg font-semibold">Application sent</h1>
                        <p className="mt-2 text-sm text-zinc-300">
                            Thanks, {name.split(' ')[0] || 'there'}. {job.poster_name} will review your application and reach out if it&apos;s a fit.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                                {ref ? "You've been referred" : 'Job opportunity'}
                            </p>
                            <h1 className="mt-2 text-xl font-bold leading-snug">{job.title}</h1>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                                <span className="text-zinc-300">{job.company_name || job.poster_name}</span>
                                <span className="text-zinc-600">•</span>
                                <span className="inline-flex items-center gap-1">
                                    <MapPinIcon className="h-3 w-3" /> {job.location || 'Online'}
                                </span>
                            </div>
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{job.description}</p>
                        </div>

                        {job.status !== 'open' ? (
                            <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-center text-sm text-zinc-400">
                                This job is no longer accepting applications.
                            </p>
                        ) : (
                            <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                                <h2 className="text-sm font-semibold">Apply</h2>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Name</span>
                                        <input value={name} onChange={e => setName(e.target.value)} required maxLength={120} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-950 outline-none focus:border-gold-400" />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Email</span>
                                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={200} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-950 outline-none focus:border-gold-400" />
                                    </label>
                                </div>
                                <label className="block">
                                    <div className="mb-1.5 flex items-center justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Why you&apos;re a fit</span>
                                        <span className="text-[10px] text-zinc-600">{pitch.length}/{MAX_PITCH_LENGTH}</span>
                                    </div>
                                    <textarea value={pitch} onChange={e => setPitch(e.target.value)} required maxLength={MAX_PITCH_LENGTH} rows={4} className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-950 outline-none focus:border-gold-400" />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Link <span className="normal-case tracking-normal text-zinc-600">optional — portfolio, CV, LinkedIn</span></span>
                                    <input value={link} onChange={e => setLink(e.target.value)} maxLength={500} placeholder="https://" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-950 outline-none focus:border-gold-400" />
                                </label>

                                {error && <p className="text-xs text-red-400">{error}</p>}

                                <button type="submit" disabled={saving} className="w-full rounded-xl bg-gold-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50">
                                    {saving ? 'Sending...' : 'Submit application'}
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
