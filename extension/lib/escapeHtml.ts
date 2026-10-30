// Helpers for building HTML strings in content scripts from untrusted data
// (LLM output, scraped page metadata, API responses). Prefer textContent /
// DOM APIs; when an innerHTML template is unavoidable, every interpolated
// value must go through escapeHtml (text and quoted attribute values) and
// every URL through safeHttpUrl.

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
};

export const escapeHtml = (value: unknown): string =>
    String(value ?? '').replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]);

/** Returns the normalised URL if it is http(s), otherwise null. */
export const safeHttpUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
};
