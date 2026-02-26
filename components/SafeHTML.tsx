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
};
