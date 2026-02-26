import React, { useMemo } from 'react';
import DOMPurify from 'isomorphic-dompurify';

// Configure DOMPurify hook to ensure target="_blank" links have rel="noopener noreferrer"
// We do this once at module level to avoid re-registering the hook multiple times.
// Note: This modifies the global DOMPurify instance.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ('target' in node && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

interface SafeHTMLProps extends React.HTMLAttributes<HTMLElement> {
  html: string;
  as?: React.ElementType;
}

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, as: Component = 'div', ...props }) => {
  const sanitizedHTML = useMemo(() => {
    return DOMPurify.sanitize(html, {
        ADD_ATTR: ['target'], // Explicitly allow target attribute so we can sanitize it with the hook
    });
  }, [html]);

  return (
    <Component
      {...props}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
};
