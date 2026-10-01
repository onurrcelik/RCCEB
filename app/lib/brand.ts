// Names and addresses that appear in emails and page copy, kept in one place so the
// portal never ships with another community's name in it.
export const BRAND = {
    shortName: 'RCCEB',
    name: 'Robert College Community Entrepreneurs Bond',
    website: 'https://www.rcceb.org',
    joinUrl: 'https://www.rcceb.org/join',
    // Colours for HTML email, where Tailwind classes don't reach.
    colors: {
        navy: '#0e1b2d',
        brandNavy: '#213b6d',
        gold: '#ae8d51',
        cream: '#f4f1ea',
    },
} as const;

export function emailFrom(): string {
    return process.env.EMAIL_FROM || 'RCCEB <hello@rcceb.org>';
}

export function replyToAddress(): string {
    return process.env.EMAIL_REPLY_TO || 'hello@rcceb.org';
}
