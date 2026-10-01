// Shared HTML-escaping for untrusted text interpolated into email templates.
// Escapes quotes too (not just &/</>) so a value is also safe inside an
// HTML attribute (e.g. href="${value}"), not just a text node.
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
