'use client';

import { ChevronDownIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { getJobBoardDisplayLocation, type JobBoardPost } from '@/app/lib/job-board';
import { PostDetails } from './PostDetails';
import { MemberLink } from '../MemberLink';

type Props = {
    post: JobBoardPost;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onChanged: () => void;
};

function getInitials(name: string) {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export function PostRow({ post, expanded, onToggle, onEdit, onChanged }: Props) {
    const location = getJobBoardDisplayLocation(post);
    const company = post.author.company_name || 'Independent';

    return (
        <article className={`overflow-hidden border-x border-b border-zinc-800 bg-zinc-900/55 transition-colors first:rounded-t-2xl first:border-t last:rounded-b-2xl hover:bg-zinc-900/85 ${expanded ? 'bg-zinc-900/85' : ''}`}>
            <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-4 text-left sm:gap-4 sm:px-5">
                <MemberLink memberId={post.author.id} className="mt-0.5 shrink-0 rounded-full">
                    {post.author.avatar_url ? (
                        <img src={post.author.avatar_url} alt={post.author.name} className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-700 text-xs font-bold text-gold-300">
                            {getInitials(post.author.name)}
                        </span>
                    )}
                </MemberLink>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-gold-300 sm:text-[15px]">{post.title}</h3>
                        {post.status === 'closed' && (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">Closed</span>
                        )}
                        {post.is_own && (
                            <span className="rounded bg-gold-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-300">Yours</span>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-300">
                        <span>{company}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="inline-flex items-center gap-1 text-zinc-400">
                            <MapPinIcon className="h-3 w-3" /> {location}
                        </span>
                    </div>
                </div>
                <ChevronDownIcon className={`mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && <PostDetails post={post} onEdit={onEdit} onChanged={onChanged} />}
        </article>
    );
}
