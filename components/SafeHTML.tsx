import React, { useMemo } from 'react';
import DOMPurify from 'isomorphic-dompurify';

interface SafeHTMLProps extends React.HTMLAttributes<HTMLElement> {
    html: string;
    as?: React.ElementType;
}

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'sup', 'sub', 'span', 'div', 'p', 'br', 'a', 'ul', 'ol', 'li'];
const ALLOWED_ATTRIBUTES = ['href', 'target', 'rel', 'title', 'alt', 'class'];

// Configure global hook for security (reverse tabnabbing)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Check if node is an element and has target="_blank"
    if ('getAttribute' in node && typeof node.getAttribute === 'function' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, as: Component = 'div', ...props }) => {
    const sanitizedHtml = useMemo(() => {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS,
            ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
        });
    }, [html]);

    return <Component {...props} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
};
