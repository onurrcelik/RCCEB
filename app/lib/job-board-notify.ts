import { query } from '@/app/lib/db';
import { buildUnsubscribeUrl } from '@/app/lib/unsubscribe';
import { escapeHtml } from '@/app/lib/html-escape';
import type { JobBoardPostType } from '@/app/lib/job-board';
import { BRAND, emailFrom, replyToAddress } from '@/app/lib/brand';

type NewPostForNotification = {
    id: string;
    type: JobBoardPostType;
    title: string;
    description: string;
    location: string | null;
};

type NotifyAuthor = {
    id: string;
    name: string | null;
    company_name: string | null;
};

function truncate(value: string, max: number): string {
    const trimmed = value.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function buildHtml(post: NewPostForNotification, author: NotifyAuthor, boardUrl: string): string {
    const noun = post.type === 'job' ? 'job' : 'need';
    const authorName = escapeHtml(author.name?.trim() || `A ${BRAND.shortName} member`);
    const company = author.company_name?.trim();
    const byline = company ? `${authorName} · ${escapeHtml(company)}` : authorName;
    const locationLine = post.type === 'job' && post.location
        ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b7280;margin:0 0 16px 0;">📍 ${escapeHtml(post.location)}</p>`
        : '';

    return `<div style="max-width:560px;font-family:Arial,sans-serif;color:#18181b;">
  <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.08em;">New ${noun} on the Job Board</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 4px 0;">${escapeHtml(post.title)}</h1>
  <p style="font-size:13px;color:#6b7280;margin:0 0 16px 0;">Posted by ${byline}</p>
  ${locationLine}
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px 0;white-space:pre-line;">${escapeHtml(truncate(post.description, 600))}</p>
  <a href="${boardUrl}" style="display:inline-block;background:${BRAND.colors.brandNavy};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">View on the Job Board</a>
  <p style="font-size:12px;color:#9ca3af;margin:28px 0 0 0;">You're getting this because you opted in to Job Board notifications. Turn them off anytime from the Job Board in your member portal.</p>
</div>`;
}

function buildText(post: NewPostForNotification, author: NotifyAuthor, boardUrl: string): string {
    const noun = post.type === 'job' ? 'job' : 'need';
    const authorName = author.name?.trim() || `A ${BRAND.shortName} member`;
    const company = author.company_name?.trim();
    const byline = company ? `${authorName} · ${company}` : authorName;
    const lines = [
        `New ${noun} on the ${BRAND.shortName} Job Board`,
        '',
        post.title,
        `Posted by ${byline}`,
    ];
    if (post.type === 'job' && post.location) lines.push(`Location: ${post.location}`);
    lines.push('', truncate(post.description, 600), '', `View it here: ${boardUrl}`);
    lines.push('', "You're getting this because you opted in to Job Board notifications. Turn them off anytime from the Job Board in your member portal.");
    return lines.join('\n');
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string, text: string) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: emailFrom(),
            reply_to: [replyToAddress()],
            to: [to],
            subject,
            html,
            text,
            headers: {
                // One-Click requires an https endpoint to POST to — a mailto: here
                // leaves the client's Unsubscribe button doing nothing.
                'List-Unsubscribe': `<${buildUnsubscribeUrl(to)}>, <mailto:${replyToAddress()}?subject=unsubscribe>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Resend API error (${response.status}): ${errorBody}`);
    }
}

/**
 * Emails every member who opted in to notifications for this post's type.
 * The post author is always skipped. Failures are swallowed per-recipient so a
 * bad address never blocks the rest, and the caller's post creation never fails
 * because of email delivery.
 */
export async function notifyNewJobBoardPost(
    post: NewPostForNotification,
    author: NotifyAuthor,
    boardUrl: string,
): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('notifyNewJobBoardPost skipped: RESEND_API_KEY not configured');
        return;
    }

    // Column name comes from a closed, validated union (JobBoardPostType), never
    // raw user input, so it's safe to embed directly — can't be a bind param anyway.
    const column = post.type === 'job' ? 'notify_jobs' : 'notify_needs';

    let subscriptions: { member_id: string }[];
    try {
        ({ rows: subscriptions } = await query<{ member_id: string }>(
            `SELECT member_id FROM job_board_subscriptions WHERE ${column} = true AND member_id != $1`,
            [author.id],
        ));
    } catch (error) {
        console.error('notifyNewJobBoardPost: failed to load subscribers', error);
        return;
    }
    if (!subscriptions.length) return;

    let recipients: { email: string | null }[];
    try {
        ({ rows: recipients } = await query<{ email: string | null }>(
            'SELECT email FROM members WHERE id = ANY($1) AND is_past_member = false AND onboarding_complete = true',
            [subscriptions.map(subscription => subscription.member_id)],
        ));
    } catch (error) {
        console.error('notifyNewJobBoardPost: failed to load recipients', error);
        return;
    }

    const candidates = Array.from(new Set(
        recipients
            .map(recipient => recipient.email?.trim().toLowerCase())
            .filter((email): email is string => Boolean(email)),
    ));
    // A global unsubscribe outranks the per-member Job Board toggle.
    const optedOut = new Set(
        (await query<{ email: string }>('SELECT email FROM email_unsubscribes WHERE email = ANY($1)', [candidates])).rows
            .map(row => row.email),
    );
    const emails = candidates.filter(email => !optedOut.has(email));
    if (!emails.length) return;

    const noun = post.type === 'job' ? 'job' : 'need';
    const subject = `New ${noun} on the ${BRAND.shortName} Job Board: ${truncate(post.title, 80)}`;
    const html = buildHtml(post, author, boardUrl);
    const text = buildText(post, author, boardUrl);

    const results = await Promise.allSettled(
        emails.map(email => sendEmail(apiKey, email, subject, html, text)),
    );

    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed) {
        console.error(`notifyNewJobBoardPost: ${failed}/${emails.length} notifications failed for post ${post.id}`);
    } else {
        console.log(`✅ Job Board notification sent to ${emails.length} member(s) for post ${post.id}`);
    }
}

function buttonHtml(label: string, url: string): string {
    return `<a href="${url}" style="display:inline-block;background:${BRAND.colors.brandNavy};color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">${label}</a>`;
}

/**
 * Emails the post author when someone applies to their job. Best-effort:
 * callers wrap this in try/catch so a delivery failure never breaks the apply.
 */
export async function notifyPosterNewApplication(
    author: { email: string; name: string | null },
    application: { title: string; applicantName: string; referrerName: string | null },
    boardUrl: string,
): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('notifyPosterNewApplication skipped: RESEND_API_KEY not configured');
        return;
    }

    const applicant = escapeHtml(application.applicantName.trim() || 'Someone');
    const title = escapeHtml(truncate(application.title, 100));
    const referredLine = application.referrerName?.trim()
        ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b7280;margin:0 0 16px 0;">Referred by ${escapeHtml(application.referrerName.trim())}</p>`
        : '';

    const html = `<div style="max-width:560px;font-family:Arial,sans-serif;color:#18181b;">
  <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.08em;">New application</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 4px 0;">${applicant} applied to ${title}</h1>
  ${referredLine}
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px 0;">Open your Job Board to read their note, view their profile, and reach out.</p>
  ${buttonHtml('View applicants', boardUrl)}
</div>`;
    const text = [
        `${application.applicantName.trim() || 'Someone'} applied to "${application.title}" on the ${BRAND.shortName} Job Board.`,
        application.referrerName?.trim() ? `Referred by ${application.referrerName.trim()}.` : '',
        '',
        `View their application: ${boardUrl}`,
    ].filter(Boolean).join('\n');

    await sendEmail(apiKey, author.email, `New application: ${truncate(application.title, 80)}`, html, text);
}

/**
 * Emails a member when another member refers them to a job. Best-effort.
 */
export async function notifyMemberReferred(
    referred: { email: string; name: string | null },
    referral: { title: string; referrerName: string; note: string | null },
    boardUrl: string,
): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('notifyMemberReferred skipped: RESEND_API_KEY not configured');
        return;
    }

    const referrer = escapeHtml(referral.referrerName.trim() || `A ${BRAND.shortName} member`);
    const title = escapeHtml(truncate(referral.title, 100));
    const noteBlock = referral.note?.trim()
        ? `<blockquote style="border-left:3px solid ${BRAND.colors.brandNavy};margin:0 0 20px 0;padding:4px 0 4px 14px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(referral.note.trim())}</blockquote>`
        : '';

    const html = `<div style="max-width:560px;font-family:Arial,sans-serif;color:#18181b;">
  <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.08em;">You were referred</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 12px 0;">${referrer} thinks you'd be a fit for ${title}</h1>
  ${noteBlock}
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px 0;">Open the Job Board to read the full post and apply in one tap.</p>
  ${buttonHtml('See the job', boardUrl)}
</div>`;
    const text = [
        `${referral.referrerName.trim() || `A ${BRAND.shortName} member`} referred you for "${referral.title}" on the ${BRAND.shortName} Job Board.`,
        referral.note?.trim() ? `\n"${referral.note.trim()}"` : '',
        '',
        `See the job and apply: ${boardUrl}`,
    ].filter(Boolean).join('\n');

    await sendEmail(apiKey, referred.email, `${referral.referrerName.trim() || 'A member'} referred you for a job`, html, text);
}
