'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    ArrowTopRightOnSquareIcon,
    CheckCircleIcon,
    EnvelopeIcon,
    LockClosedIcon,
    PencilIcon,
    PhoneIcon,
    TrashIcon,
    UserGroupIcon,
} from '@heroicons/react/24/outline';
import type { JobBoardApplication, JobBoardPost } from '@/app/lib/job-board';
import { MemberLink } from '../MemberLink';
import { ApplyForm } from './ApplyForm';

type Props = {
    post: JobBoardPost;
    onEdit: () => void;
    onChanged: () => void;
};

function getInitials(name: string) {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function Description({ text }: { text: string }) {
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

export function PostDetails({ post, onEdit, onChanged }: Props) {
    const [applications, setApplications] = useState<JobBoardApplication[]>([]);
    const [loadingApplications, setLoadingApplications] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [showApply, setShowApply] = useState(false);

    const loadApplications = useCallback(() => {
        if (!post.is_own) return;
        setLoadingApplications(true);
        fetch(`/api/members/job-board/${post.id}/applications`, { cache: 'no-store' })
            .then(res => res.json())
            .then(data => setApplications(Array.isArray(data.applications) ? data.applications : []))
            .finally(() => setLoadingApplications(false));
    }, [post.id, post.is_own]);

    useEffect(() => {
        loadApplications();
    }, [loadApplications, post.application_count]);

    async function withdraw() {
        if (!window.confirm('Withdraw your application?')) return;
        setWorking(true);
        setError('');
        try {
            const res = await fetch(`/api/members/job-board/${post.id}/apply`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Could not withdraw');
                return;
            }
            onChanged();
        } catch {
            setError('Could not withdraw');
        } finally {
            setWorking(false);
        }
    }

    async function closePost() {
        if (!window.confirm('Close this post? It will stop accepting applications and disappear after seven days.')) return;
        setWorking(true);
        const res = await fetch(`/api/members/job-board/${post.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'close' }),
        });
        setWorking(false);
        if (res.ok) onChanged();
        else setError('Could not close post');
    }

    async function deletePost() {
        if (!window.confirm('Permanently delete this post?')) return;
        setWorking(true);
        const res = await fetch(`/api/members/job-board/${post.id}`, { method: 'DELETE' });
        setWorking(false);
        if (res.ok) onChanged();
        else setError('Could not delete post');
    }

    return (
        <div className="border-t border-zinc-800 bg-zinc-950/60 px-5 py-5 sm:px-6">
            <Description text={post.description} />

            <div className="mt-4 text-[11px] text-zinc-500">
                Posted by <MemberLink memberId={post.author.id} className="font-medium text-zinc-300 underline-offset-2 hover:underline">{post.author.name}</MemberLink>
                {post.author.company_name ? ` at ${post.author.company_name}` : ''}
            </div>

            {post.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                    {post.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[10px] font-medium text-zinc-300">{tag}</span>
                    ))}
                </div>
            )}

            {!post.is_own && (
                <div className="mt-5 border-t border-zinc-800 pt-5">
                    {post.viewer_applied ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300">
                                <CheckCircleIcon className="h-4 w-4" /> Applied — the poster will reach out
                            </span>
                            <button onClick={withdraw} disabled={working} className="text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50">
                                Withdraw
                            </button>
                        </div>
                    ) : post.status === 'open' ? (
                        <button
                            onClick={() => setShowApply(value => !value)}
                            className="rounded-xl bg-gold-400 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-gold-300"
                        >
                            Apply
                        </button>
                    ) : (
                        <div className="inline-flex items-center gap-2 text-xs text-zinc-500">
                            <LockClosedIcon className="h-4 w-4" /> This post is closed.
                        </div>
                    )}

                    {showApply && post.status === 'open' && !post.viewer_applied && (
                        <ApplyForm
                            postId={post.id}
                            onCancel={() => setShowApply(false)}
                            onApplied={() => { setShowApply(false); onChanged(); }}
                        />
                    )}
                </div>
            )}

            {post.is_own && (
                <div className="mt-5 border-t border-zinc-800 pt-5">
                    <div className="mb-4 flex flex-wrap gap-2">
                        <button onClick={onEdit} disabled={working} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white">
                            <PencilIcon className="h-3.5 w-3.5" /> Edit
                        </button>
                        {post.status === 'open' && (
                            <button onClick={closePost} disabled={working} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white">
                                <CheckCircleIcon className="h-3.5 w-3.5" /> Close
                            </button>
                        )}
                        <button onClick={deletePost} disabled={working} className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/15">
                            <TrashIcon className="h-3.5 w-3.5" /> Delete
                        </button>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        <UserGroupIcon className="h-3.5 w-3.5" />
                        Applicants ({post.application_count})
                    </div>
                    {loadingApplications ? (
                        <div className="mt-3 h-16 animate-pulse rounded-xl bg-zinc-900" />
                    ) : applications.length === 0 ? (
                        <p className="mt-3 text-xs text-zinc-600">No applications yet.</p>
                    ) : (
                        <div className="mt-3 space-y-3">
                            {applications.map(application => (
                                <ApplicantCard key={application.id} application={application} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
    );
}

function ApplicantCard({ application }: { application: JobBoardApplication }) {
    const { applicant } = application;
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start gap-3">
                <MemberLink memberId={applicant.member_id} className="shrink-0 rounded-full">
                    {applicant.avatar_url ? (
                        <img src={applicant.avatar_url} alt={applicant.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-gold-300">
                            {getInitials(applicant.name)}
                        </span>
                    )}
                </MemberLink>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <MemberLink memberId={applicant.member_id} className="text-sm font-semibold text-zinc-100">{applicant.name}</MemberLink>
                        {applicant.company_name && <span className="text-[11px] text-zinc-500">{applicant.company_name}</span>}
                    </div>
                </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-zinc-300">{application.pitch}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
                {applicant.email && (
                    <a href={`mailto:${applicant.email}`} className="inline-flex items-center gap-1 hover:text-white">
                        <EnvelopeIcon className="h-3.5 w-3.5" /> {applicant.email}
                    </a>
                )}
                {applicant.phone && (
                    <span className="inline-flex items-center gap-1">
                        <PhoneIcon className="h-3.5 w-3.5" /> {applicant.phone}
                    </span>
                )}
                {applicant.linkedin && (
                    <a href={applicant.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-300 hover:underline">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> LinkedIn
                    </a>
                )}
                {application.link && (
                    <a href={application.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-300 hover:underline">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> Attached link
                    </a>
                )}
            </div>
        </div>
    );
}
