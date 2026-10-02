export const JOB_BOARD_TYPES = ['job', 'need'] as const;
export type JobBoardPostType = typeof JOB_BOARD_TYPES[number];

export const JOB_BOARD_SUGGESTED_TAGS = [
    'Advice',
    'Introduction',
    'Contract Work',
    'Cofounder',
    'Hiring',
    'Feedback',
] as const;

export type JobBoardAuthor = {
    id: string;
    name: string;
    avatar_url: string | null;
    company_name: string | null;
};

// A single application shown to the post owner, with the applicant's profile
// fields from their members/directory record.
export type JobBoardApplicant = {
    member_id: string;
    name: string;
    avatar_url: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    bio: string | null;
};

export type JobBoardApplication = {
    id: string;
    applicant: JobBoardApplicant;
    pitch: string;
    link: string | null;
    created_at: string;
};

export type JobBoardPost = {
    id: string;
    type: JobBoardPostType;
    title: string;
    description: string;
    location: string | null;
    tags: string[];
    status: 'open' | 'closed';
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    author: JobBoardAuthor;
    is_own: boolean;
    viewer_applied: boolean;
    // Owner-only: how many applications the post has received.
    application_count: number;
};

export type JobBoardPostInput = {
    type: JobBoardPostType;
    title: string;
    description: string;
    location: string | null;
    tags: string[];
};

export type JobBoardSubscription = {
    notify_jobs: boolean;
    notify_needs: boolean;
};

export function normalizeJobBoardSubscription(body: Record<string, unknown>): JobBoardSubscription {
    return {
        notify_jobs: body.notify_jobs === true,
        notify_needs: body.notify_needs === true,
    };
}

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 30;

export function normalizeJobBoardPostInput(body: Record<string, unknown>): {
    value?: JobBoardPostInput;
    error?: string;
} {
    const type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const location = type === 'job' && typeof body.location === 'string'
        ? body.location.trim()
        : '';
    const tags = Array.isArray(body.tags)
        ? Array.from(new Set(
            body.tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map(tag => tag.trim())
                .filter(Boolean),
        ))
        : [];

    if (!JOB_BOARD_TYPES.includes(type as JobBoardPostType)) {
        return { error: 'Post type must be job or need' };
    }
    if (!title) return { error: 'Title is required' };
    if (!description) return { error: 'Description is required' };
    if (title.length > 140) return { error: 'Title is too long' };
    if (description.length > 5000) return { error: 'Description is too long' };
    if (location.length > 120) return { error: 'Location is too long' };
    if (tags.length > MAX_TAGS || tags.some(tag => tag.length > MAX_TAG_LENGTH)) {
        return { error: `Use up to ${MAX_TAGS} tags, each ${MAX_TAG_LENGTH} characters or fewer` };
    }

    return {
        value: {
            type: type as JobBoardPostType,
            title,
            description,
            location: type === 'job' && location ? location : null,
            tags,
        },
    };
}

export function getJobBoardDisplayLocation(post: Pick<JobBoardPost, 'type' | 'location'>) {
    return post.type === 'job' ? post.location || 'Online' : null;
}

export const MAX_PITCH_LENGTH = 1500;
export const MAX_APPLICATION_LINK_LENGTH = 500;

function normalizeLink(raw: unknown): { value: string | null; error?: string } {
    if (typeof raw !== 'string') return { value: null };
    const trimmed = raw.trim();
    if (!trimmed) return { value: null };
    if (trimmed.length > MAX_APPLICATION_LINK_LENGTH) return { value: null, error: 'Link is too long' };
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        // Basic shape check — keeps obviously broken values out.
        void new URL(withProtocol);
    } catch {
        return { value: null, error: 'Enter a valid link' };
    }
    return { value: withProtocol };
}

export type JobBoardApplicationInput = {
    pitch: string;
    link: string | null;
};

export function normalizeApplicationInput(body: Record<string, unknown>): {
    value?: JobBoardApplicationInput;
    error?: string;
} {
    const pitch = typeof body.pitch === 'string' ? body.pitch.trim() : '';
    if (!pitch) return { error: 'Add a short note on why you are a fit' };
    if (pitch.length > MAX_PITCH_LENGTH) return { error: 'Your note is too long' };

    const link = normalizeLink(body.link);
    if (link.error) return { error: link.error };

    return { value: { pitch, link: link.value } };
}
