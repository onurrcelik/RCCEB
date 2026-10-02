import { buildUnsubscribeUrl, isUnsubscribed } from '@/app/lib/unsubscribe';
import { BRAND, emailFrom, replyToAddress } from '@/app/lib/brand';
import { escapeHtml } from '@/app/lib/html-escape';

// The sign-in email: a one-tap link plus the same sign-in as a 6-digit code, for when
// the link opens in a different browser than the one the person started in.
export async function sendSignInEmail({ to, name, link, code, minutes, audience }: {
    to: string;
    name?: string | null;
    link: string;
    code: string;
    minutes: number;
    audience: 'member' | 'admin';
}) {
    const first = (name || '').split(' ')[0];
    const greeting = first ? `Welcome back, ${first}` : 'Hello';
    const place = audience === 'admin' ? 'the RCCEB admin dashboard' : 'the RCCEB member portal';
    await sendResendEmail({
        to,
        subject: audience === 'admin' ? 'Your RCCEB admin sign-in link' : 'Your RCCEB sign-in link',
        text: `${greeting},\n\nSign in to ${place}:\n${link}\n\nOr enter this code on the sign-in page: ${code}\n\nThe link and code expire in ${minutes} minutes. If you didn't request this, you can ignore this email.`,
        html: `<div style="max-width:520px;font-family:Inter,Arial,sans-serif;color:${BRAND.colors.navy};">
<p style="font-size:15px;line-height:1.7;">${escapeHtml(greeting)},</p>
<p style="margin:24px 0;"><a href="${link}" style="display:inline-block;background:${BRAND.colors.brandNavy};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px;">Sign in to ${place.replace('the ', '')}</a></p>
<p style="font-size:14px;">Or enter this code on the sign-in page: <strong style="font-size:18px;letter-spacing:3px;">${code}</strong></p>
<p style="color:#888;font-size:12px;">The link and code expire in ${minutes} minutes. If you didn't request this, you can ignore this email.</p>
</div>`,
    });
}

// 'transactional' — something the recipient asked for right now (login link, invite).
// Always delivered, even to people who unsubscribed.
// 'marketing'     — 1-on-1 match emails, round announcements, anything bulk.
// Suppressed for anyone on the unsubscribe list.
export async function sendResendEmail({
    to,
    subject,
    text,
    html,
    from = emailFrom(),
    headers: extraHeaders,
    category = 'transactional',
}: {
    to: string,
    subject: string,
    text: string,
    html?: string,
    from?: string,
    headers?: Record<string, string>,
    category?: 'transactional' | 'marketing',
}) {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error('RESEND_API_KEY is missing');

    const marketing = category === 'marketing';
    if (marketing && await isUnsubscribed(to)) return;

    // Unsubscribe links only go on marketing mail. Transactional mail is delivered
    // regardless, so an Unsubscribe link on a sign-in email would do nothing.
    // Must be an https URL: List-Unsubscribe-Post advertises RFC 8058 one-click,
    // and mail clients POST to it. A mailto: here makes the client's Unsubscribe
    // button silently do nothing — which is exactly what members reported.
    const unsubscribeUrl = marketing ? buildUnsubscribeUrl(to) : null;
    const defaultHeaders: Record<string, string> = {
        'X-Entity-Ref-ID': `rcceb-${Date.now()}`,
        ...(unsubscribeUrl ? {
            'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyToAddress()}?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        } : {}),
    };
    const textFooter = `\n\n—\n${BRAND.name}` + (unsubscribeUrl ? `\n\nUnsubscribe: ${unsubscribeUrl}` : '');
    const htmlFooter = `<p style="color:#999;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">${BRAND.name}`
        + (unsubscribeUrl ? ` &nbsp;·&nbsp; <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>` : '')
        + '</p>';

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
            from,
            reply_to: [replyToAddress()],
            to: [to],
            subject,
            text: text + textFooter,
            headers: { ...defaultHeaders, ...extraHeaders },
            ...(html ? { html: html + htmlFooter } : {}),
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend ${response.status}: ${body}`);
    }
}
