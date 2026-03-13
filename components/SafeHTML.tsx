import React from 'react';
import DOMPurify from 'isomorphic-dompurify';

// Configure hook once to ensure security
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ('target' in node && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

interface SafeHTMLProps {
  html: string;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, className, as: Component = 'div' }) => {
  // Ensure target is allowed so the hook can see it
  const sanitizedHTML = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
  });

  return (
    <Component
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
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
