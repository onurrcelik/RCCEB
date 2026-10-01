/**
 * Sends an admin notification email when a member taps "I'm interested" on a perk, so
 * the introduction can be made without anyone watching the admin Perks tab.
 *
 * Fire-and-forget — failures are logged but never block saving the interest. Only fires
 * for a genuinely new interest, never when a member re-taps one they already have.
 */

import { getBaseUrl } from '@/app/lib/site-url';
import { emailFrom } from '@/app/lib/brand';
import type { Perk } from '@/app/members/dashboard/perks/perks-data';

type InterestedMember = {
    name: string | null;
    email: string;
    phone: string | null;
    linkedin: string | null;
    location: string | null;
};

export async function sendPerkInterestNotification(perk: Perk, member: InterestedMember) {
    const apiKey = process.env.RESEND_API_KEY;
    const notificationEmails = process.env.NOTIFICATION_EMAIL;

    if (!apiKey || !notificationEmails) {
        console.warn('Perk interest notification skipped: RESEND_API_KEY or NOTIFICATION_EMAIL not configured');
        return;
    }

    const recipients = notificationEmails.split(',').map(e => e.trim()).filter(Boolean);
    const adminLink = `${getBaseUrl()}/admin/perks`;
    const memberName = member.name || member.email;

    const row = (label: string, value: string | null | undefined, link?: string) => {
        if (!value) return '';
        const cell = link
            ? `<a href="${link}" style="color:#2563eb;text-decoration:none;">${value}</a>`
            : value;
        return `
        <tr>
            <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:12px;width:110px;vertical-align:top;">${label}</td>
            <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#111827;font-size:13px;line-height:1.5;">${cell}</td>
        </tr>`;
    };

    const linkedin = member.linkedin
        ? (member.linkedin.startsWith('http') ? member.linkedin : `https://${member.linkedin}`)
        : null;

    const emailHtml = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <div style="background:linear-gradient(135deg,#213b6d 0%,#0a1628 100%);padding:28px 24px;text-align:center;">
            <p style="color:#93c5fd;margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">Member Perks</p>
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Interested in ${perk.name}</h1>
            <p style="color:#93c5fd;margin:6px 0 0 0;font-size:13px;">${memberName}</p>
        </div>

        <div style="padding:20px 24px;">
            <p style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;margin:0 0 8px 0;">Who to introduce</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                ${row('Name', member.name)}
                ${row('Email', member.email, `mailto:${member.email}`)}
                ${row('Phone', member.phone)}
                ${row('LinkedIn', member.linkedin, linkedin ?? undefined)}
                ${row('Location', member.location)}
            </table>

            <p style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;margin:0 0 8px 0;">The perk</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
                ${row('Partner', perk.name, perk.website)}
                ${row('Offer', perk.offer)}
                ${row('What it is', perk.tagline)}
            </table>

            <div style="text-align:center;">
                <a href="${adminLink}" style="display:inline-block;padding:11px 22px;background:#213b6d;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">See everyone interested →</a>
            </div>
        </div>

        <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="color:#9ca3af;font-size:11px;margin:0;">
                ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
        </div>
    </div>`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: emailFrom(),
            to: recipients,
            reply_to: member.email,
            subject: `Perk interest: ${memberName} → ${perk.name}`,
            html: emailHtml,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend error (${res.status}): ${body}`);
    }

    console.log(`✅ Perk interest notification sent for ${memberName} → ${perk.name}`);
}
