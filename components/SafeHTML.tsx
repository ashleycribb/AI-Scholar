import React, { useMemo } from 'react';

interface SafeHTMLProps {
    content: string;
    as?: keyof JSX.IntrinsicElements;
    className?: string;
}

const ALLOWED_TAGS = new Set([
    'b', 'i', 'em', 'strong', 'a', 'span', 'div', 'p', 'ol', 'ul', 'li', 'br', 'u'
]);

const ALLOWED_ATTRIBUTES = new Set(['href', 'class', 'target', 'rel', 'title', 'alt']);

export const sanitizeHTML = (content: string): string => {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return content;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');

        const sanitizeNode = (node: Node): Node | null => {
            if (node.nodeType === Node.TEXT_NODE) {
                return document.createTextNode(node.textContent || '');
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                const tagName = el.tagName.toLowerCase();

                if (!ALLOWED_TAGS.has(tagName)) {
                    // Strip disallowed tags but keep children text if not dangerous
                    if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button'].includes(tagName)) {
                        return null;
                    }
                    const fragment = document.createDocumentFragment();
                    Array.from(el.childNodes).forEach(child => {
                        const cleanChild = sanitizeNode(child);
                        if (cleanChild) fragment.appendChild(cleanChild);
                    });
                    return fragment;
                }

                const cleanEl = document.createElement(tagName);

                // Allow specific attributes
                Array.from(el.attributes).forEach(attr => {
                    if (ALLOWED_ATTRIBUTES.has(attr.name)) {
                        if (attr.name === 'href') {
                            const val = attr.value.trim().toLowerCase();
                            if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('mailto:')) {
                                cleanEl.setAttribute('href', attr.value);
                            }
                        } else {
                            cleanEl.setAttribute(attr.name, attr.value);
                        }
                    }
                });

                // Ensure links open in new tab for security
                if (tagName === 'a') {
                    cleanEl.setAttribute('target', '_blank');
                    cleanEl.setAttribute('rel', 'noopener noreferrer');
                }

                Array.from(el.childNodes).forEach(child => {
                    const cleanChild = sanitizeNode(child);
                    if (cleanChild) cleanEl.appendChild(cleanChild);
                });

                return cleanEl;
            }
            return null;
        };

        const resultFragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(child => {
            const cleanChild = sanitizeNode(child);
            if (cleanChild) resultFragment.appendChild(cleanChild);
        });

        const div = document.createElement('div');
        div.appendChild(resultFragment);
        return div.innerHTML;

    } catch (error) {
        console.error('SafeHTML sanitization failed:', error);
        return ''; // Fail safe
    }
};

export const SafeHTML: React.FC<SafeHTMLProps> = ({ content, as: Tag = 'div', className }) => {
    const sanitizedContent = useMemo(() => sanitizeHTML(content), [content]);

    return (
        <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
    );
};
