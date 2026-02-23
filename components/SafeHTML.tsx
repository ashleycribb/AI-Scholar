import React, { useMemo } from 'react';

interface SafeHTMLProps extends React.HTMLAttributes<HTMLElement> {
  html: string;
  as?: React.ElementType;
}

const ALLOWED_TAGS = ['b', 'i', 'u', 'em', 'strong', 'a', 'span', 'sub', 'sup', 'div', 'p', 'br', 'li', 'ul', 'ol'];
const ALLOWED_ATTRS = ['href', 'target', 'rel', 'class', 'title', 'alt'];

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, as: Component = 'div', className, ...props }) => {
  const sanitizedHtml = useMemo(() => {
    if (!html) return '';

    // In environments without DOMParser (e.g. some SSR or tests), return empty string for safety.
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return '';
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Create a new document fragment to hold the sanitized content
        const fragment = document.createDocumentFragment();

        const sanitize = (node: Node): Node | null => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.cloneNode(true);
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                const tagName = el.tagName.toLowerCase();

                if (ALLOWED_TAGS.includes(tagName)) {
                    const newEl = document.createElement(tagName);

                    // Copy allowed attributes
                    Array.from(el.attributes).forEach(attr => {
                        if (ALLOWED_ATTRS.includes(attr.name)) {
                            // specialized checks for href to prevent javascript:
                            if (attr.name === 'href') {
                                const val = attr.value.trim().toLowerCase();
                                if (val.startsWith('http') || val.startsWith('mailto') || val.startsWith('/')) {
                                    newEl.setAttribute(attr.name, attr.value);
                                }
                            } else {
                                newEl.setAttribute(attr.name, attr.value);
                            }
                        }
                    });

                    // Recursively sanitize children
                    Array.from(el.childNodes).forEach(child => {
                        const sanitizedChild = sanitize(child);
                        if (sanitizedChild) {
                            newEl.appendChild(sanitizedChild);
                        }
                    });

                    return newEl;
                } else {
                    // Unwrap disallowed tags but keep their children
                    const unwrappedFragment = document.createDocumentFragment();
                    Array.from(el.childNodes).forEach(child => {
                        const sanitizedChild = sanitize(child);
                        if (sanitizedChild) {
                            unwrappedFragment.appendChild(sanitizedChild);
                        }
                    });
                    return unwrappedFragment;
                }
            }
            return null;
        };

        Array.from(doc.body.childNodes).forEach(child => {
             const sanitizedChild = sanitize(child);
             if (sanitizedChild) fragment.appendChild(sanitizedChild);
        });

        const div = document.createElement('div');
        div.appendChild(fragment);
        return div.innerHTML;
    } catch (e) {
        console.error('Error sanitizing HTML:', e);
        return '';
    }

  }, [html]);

  return <Component className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} {...props} />;
};
