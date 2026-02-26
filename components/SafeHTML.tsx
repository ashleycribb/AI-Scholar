import React, { useMemo } from 'react';
import DOMPurify from 'isomorphic-dompurify';

interface SafeHTMLProps extends React.HTMLAttributes<HTMLElement> {
    html: string;
    as?: React.ElementType;
}

// Add a hook to automatically add rel="noopener noreferrer" to target="_blank" links
// This runs globally on the DOMPurify instance to ensure security for all sanitized content
DOMPurify.addHook('afterSanitizeAttributes', (currentNode) => {
    if ('getAttribute' in currentNode) {
        const target = currentNode.getAttribute('target');
        if (target === '_blank') {
            currentNode.setAttribute('rel', 'noopener noreferrer');
        }
    }
});

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, as: Component = 'div', className, ...props }) => {
    const sanitizedHTML = useMemo(() => {
        return DOMPurify.sanitize(html, {
            ADD_ATTR: ['target'], // Explicitly allow target attribute
        });
    }, [html]);

    return (
        <Component
            className={className}
            dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
            {...props}
        />
    );
};
