const ALLOWED_TAGS = new Set(['b', 'i', 'em', 'strong', 'u', 'sup', 'sub', 'span', 'div', 'p', 'br', 'a', 'ul', 'ol', 'li']);
const ALLOWED_ATTRS = new Set(['href', 'target', 'rel', 'title', 'alt', 'class']);
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function sanitizeNodes(root: HTMLElement): string {
    const allElements = root.getElementsByTagName('*');
    // Iterate backwards to safely remove/replace elements
    for (let i = allElements.length - 1; i >= 0; i--) {
        const el = allElements[i];
        const tagName = el.tagName.toLowerCase();

        if (!ALLOWED_TAGS.has(tagName)) {
            // Remove unsafe tags completely if they are script/style/etc
            if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'base'].includes(tagName)) {
                el.remove();
            } else {
                // Otherwise unwrap (replace with children) to preserve text content
                while (el.firstChild) {
                    el.parentNode?.insertBefore(el.firstChild, el);
                }
                el.remove();
            }
            continue;
        }

        // Sanitize attributes
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
            const attrName = attr.name.toLowerCase();
            if (!ALLOWED_ATTRS.has(attrName)) {
                el.removeAttribute(attr.name);
            } else if (attrName === 'href') {
                // Check protocol
                try {
                    const url = new URL(attr.value, 'http://dummy.com');
                    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
                        el.removeAttribute('href');
                    }
                } catch (e) {
                    // Invalid URL, remove
                    el.removeAttribute('href');
                }
            }
        }
    }

    return root.innerHTML;
}

export function sanitizeWithRegex(html: string): string {
    // Basic fallback for environments without DOMParser
    // 1. Remove script tags and their content
    let clean = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    // 2. Remove event handlers
    clean = clean.replace(/ on\w+="[^"]*"/g, "");
    // 3. Remove javascript: urls
    clean = clean.replace(/href=["']javascript:[^"']*["']/g, 'href="#"');

    return clean;
}
