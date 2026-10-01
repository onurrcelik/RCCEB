import { getSupabase } from '@/app/lib/supabase';
import { buildUnsubscribeUrl, isUnsubscribed } from '@/app/lib/unsubscribe';
import { randomBytes } from 'crypto';
import { BRAND, emailFrom, replyToAddress } from '@/app/lib/brand';

type LinkKind = 'magiclink' | 'invite' | 'signup';

export async function generateMemberLink(email: string, redirectTo: string, attempts: LinkKind[]) {
    return (await generateMemberLinkDetails(email, redirectTo, attempts)).link;
}

// Like generateMemberLink, but also returns the 6-digit email OTP so login can
// complete when the emailed link opens in a different browser than the one the
// member started in. Verified client-side via auth.verifyOtp.
export async function generateMemberLinkDetails(email: string, redirectTo: string, attempts: LinkKind[]) {
    const supabase = getSupabase();
    let lastError: string | undefined;

    for (const type of attempts) {
        const { data, error } = type === 'signup'
            ? await supabase.auth.admin.generateLink({
                type: 'signup',
                email,
                password: randomBytes(24).toString('hex'),
                options: { redirectTo },
            })
            : await supabase.auth.admin.generateLink({
                type,
                email,
                options: { redirectTo },
            });

        if (data?.properties?.action_link) {
            return { link: data.properties.action_link, otp: data.properties.email_otp || null };
        }

        lastError = error?.message || `Failed to generate ${type} link`;
    }

    throw new Error(lastError || 'Failed to generate auth link');
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

    if (category === 'marketing' && await isUnsubscribed(to)) return;

    // Must be an https URL: List-Unsubscribe-Post advertises RFC 8058 one-click,
    // and mail clients POST to it. A mailto: here makes the client's Unsubscribe
    // button silently do nothing — which is exactly what members reported.
    const unsubscribeUrl = buildUnsubscribeUrl(to);
    const defaultHeaders = {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyToAddress()}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `rcceb-${Date.now()}`,
    };

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
            from,
            to: [to],
            subject,
            text: text + `\n\n—\n${BRAND.name}\n\nUnsubscribe: ${unsubscribeUrl}`,
            headers: { ...defaultHeaders, ...extraHeaders },
            ...(html ? { html: html + `<p style="color:#999;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">${BRAND.name} &nbsp;·&nbsp; <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a></p>` } : {}),
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend ${response.status}: ${body}`);
    }
}
