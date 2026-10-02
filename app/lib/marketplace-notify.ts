import { query } from '@/app/lib/db';
import { escapeHtml } from '@/app/lib/html-escape';
import { sendResendEmail } from '@/app/lib/member-auth';
import type { MarketplaceListingType } from '@/app/lib/marketplace';
import { BRAND } from '@/app/lib/brand';

type NewListingForNotification = {
    id: string;
    type: MarketplaceListingType;
    title: string;
    description: string;
};

function truncate(value: string, max: number): string {
    const trimmed = value.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/**
 * Emails every member who opted in to this kind of post (asks or offers). The author is
 * always skipped. Sent as marketing mail, so it carries an unsubscribe link and skips
 * anyone who unsubscribed. Failures are logged per recipient and never fail the post.
 */
export async function notifyNewMarketplaceListing(
    listing: NewListingForNotification,
    author: { id: string; name: string | null },
    boardUrl: string,
): Promise<void> {
    // Column name comes from a closed, validated union, never raw user input.
    const column = listing.type === 'ask' ? 'notify_asks' : 'notify_offers';

    let recipients: { email: string }[];
    try {
        ({ rows: recipients } = await query<{ email: string }>(
            `SELECT DISTINCT lower(m.email) AS email
             FROM marketplace_subscriptions s
             JOIN members m ON m.id = s.member_id
             WHERE s.${column} = true AND s.member_id != $1
               AND m.email IS NOT NULL AND m.onboarding_complete = true AND m.is_past_member = false`,
            [author.id],
        ));
    } catch (error) {
        console.error('notifyNewMarketplaceListing: failed to load recipients', error);
        return;
    }
    if (!recipients.length) return;

    const noun = listing.type === 'ask' ? 'ask' : 'offer';
    const authorName = author.name?.trim() || `A ${BRAND.shortName} member`;
    const lead = listing.type === 'ask' ? `${authorName} is asking for help` : `${authorName} is offering help`;
    const description = truncate(listing.description, 600);

    const subject = `New ${noun} on ${BRAND.shortName} Asks & Offers: ${truncate(listing.title, 80)}`;
    const text = [
        `${lead} on ${BRAND.shortName} Asks & Offers.`,
        '',
        listing.title,
        '',
        description,
        '',
        `See it and get in touch: ${boardUrl}`,
        '',
        "You're getting this because you turned on Asks & Offers emails. Turn them off anytime from Asks & Offers in your member portal.",
    ].join('\n');
    const html = `<div style="max-width:560px;font-family:Arial,sans-serif;color:#18181b;">
  <p style="font-size:13px;color:#6b7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.08em;">New ${noun} on Asks &amp; Offers</p>
  <h1 style="font-size:20px;font-weight:700;margin:0 0 4px 0;">${escapeHtml(listing.title)}</h1>
  <p style="font-size:13px;color:#6b7280;margin:0 0 16px 0;">${escapeHtml(lead)}</p>
  <p style="font-size:15px;line-height:1.7;margin:0 0 24px 0;white-space:pre-line;">${escapeHtml(description)}</p>
  <a href="${boardUrl}" style="display:inline-block;background:${BRAND.colors.brandNavy};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">See it and get in touch</a>
  <p style="font-size:12px;color:#9ca3af;margin:28px 0 0 0;">You're getting this because you turned on Asks &amp; Offers emails. Turn them off anytime from Asks &amp; Offers in your member portal.</p>
</div>`;

    const results = await Promise.allSettled(
        recipients.map(({ email }) => sendResendEmail({ to: email, subject, text, html, category: 'marketing' })),
    );
    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed) {
        console.error(`notifyNewMarketplaceListing: ${failed}/${recipients.length} emails failed for listing ${listing.id}`);
    }
}
