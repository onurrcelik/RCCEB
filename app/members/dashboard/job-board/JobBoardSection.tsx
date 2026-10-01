'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    MagnifyingGlassIcon,
    MapPinIcon,
    PlusIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { getJobBoardDisplayLocation, type JobBoardPost, type JobBoardSubscription } from '@/app/lib/job-board';
import { PostForm } from './PostForm';
import { PostRow } from './PostRow';

type NotifyKey = keyof JobBoardSubscription;

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
    const [subscription, setSubscription] = useState<JobBoardSubscription | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        fetch('/api/members/job-board/notifications', { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (active && data?.subscription) setSubscription(data.subscription); })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    async function toggle(key: NotifyKey) {
        if (!subscription) return;
        const previous = subscription;
        const next = { ...subscription, [key]: !subscription[key] };
        setSubscription(next);
        setSaving(true);
        try {
            const res = await fetch('/api/members/job-board/notifications', {
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
                label="Email me about new jobs"
                description={subscription.notify_jobs ? "You'll get an email when a member posts a new job." : 'Skip checking back — get notified when a new job is posted.'}
                enabled={subscription.notify_jobs}
                disabled={saving}
                onToggle={() => toggle('notify_jobs')}
            />
            <div className="h-px bg-zinc-800" />
            <NotifyToggle
                label="Email me about new needs"
                description={subscription.notify_needs ? "You'll get an email when a member posts a new need." : 'Get notified when a member posts something they need.'}
                enabled={subscription.notify_needs}
                disabled={saving}
                onToggle={() => toggle('notify_needs')}
            />
        </div>
    );
}

export function JobBoardSection() {
    const [posts, setPosts] = useState<JobBoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [location, setLocation] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<JobBoardPost | null>(null);
    const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

    const fetchPosts = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/members/job-board?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Could not load the Job Board');
                return;
            }
            setPosts(Array.isArray(data.posts) ? data.posts : []);
        } catch {
            setError('Could not load the Job Board');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === 'visible') fetchPosts(true);
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        const intervalId = window.setInterval(refresh, 5000);
        return () => {
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
            window.clearInterval(intervalId);
        };
    }, [fetchPosts]);

    const locations = useMemo(() => Array.from(new Set(
        posts
            .filter(post => post.type === 'job')
            .map(post => getJobBoardDisplayLocation(post))
            .filter((value): value is string => Boolean(value)),
    )).sort((a, b) => a.localeCompare(b)), [posts]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return posts.filter(post => {
            const matchesLocation = !location || (post.type === 'job' && getJobBoardDisplayLocation(post) === location);
            if (!matchesLocation) return false;
            if (!query) return true;
            return [
                post.title,
                post.description,
                post.location || 'Online',
                post.author.name,
                post.author.company_name || '',
                ...post.tags,
            ].some(value => value.toLowerCase().includes(query));
        });
    }, [location, posts, search]);

    const jobs = filtered.filter(post => post.type === 'job');

    function openNewPost() {
        setEditingPost(null);
        setFormOpen(true);
    }

    function openEdit(post: JobBoardPost) {
        setEditingPost(post);
        setFormOpen(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleSaved() {
        setFormOpen(false);
        setEditingPost(null);
        fetchPosts();
    }

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-5 flex items-center justify-end">
                <button onClick={openNewPost} className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300">
                    <PlusIcon className="h-4 w-4" /> Add post
                </button>
            </div>

            <NotifyCard />

            {formOpen && (
                <PostForm
                    post={editingPost}
                    onCancel={() => { setFormOpen(false); setEditingPost(null); }}
                    onSaved={handleSaved}
                />
            )}

            <div className="mb-6 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Search titles, descriptions, people, companies..."
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-10 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-600 focus:border-gold-400"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                            <XMarkIcon className="h-4 w-4" />
                            <span className="sr-only">Clear search</span>
                        </button>
                    )}
                </div>
                <div className="relative sm:w-44">
                    <MapPinIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <select
                        value={location}
                        onChange={event => setLocation(event.target.value)}
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-4 text-sm text-zinc-300 outline-none transition-colors focus:border-gold-400"
                    >
                        <option value="">All locations</option>
                        {locations.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                </div>
            </div>

            {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">{error}</div>}

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-zinc-900/70" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="py-20 text-center">
                    <p className="text-sm text-zinc-400">{search || location ? 'No posts match your search.' : 'No posts yet.'}</p>
                    {!search && !location && <button onClick={openNewPost} className="mt-3 text-xs font-semibold text-gold-300 hover:underline">Add the first post</button>}
                </div>
            ) : (
                <div className="space-y-8">
                    {jobs.length > 0 && (
                        <section>
                            <div className="mb-3 flex items-center gap-3">
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Jobs</h2>
                                <span className="text-[10px] text-zinc-600">{jobs.length}</span>
                                <div className="h-px flex-1 bg-zinc-800" />
                            </div>
                            <div>
                                {jobs.map(post => (
                                    <PostRow
                                        key={post.id}
                                        post={post}
                                        expanded={expandedPostId === post.id}
                                        onToggle={() => setExpandedPostId(current => current === post.id ? null : post.id)}
                                        onEdit={() => openEdit(post)}
                                        onChanged={() => fetchPosts(true)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                </div>
            )}
        </div>
    );
}
