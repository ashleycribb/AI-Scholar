import React, { useMemo } from 'react';
import { sanitizeNodes, sanitizeWithRegex } from './SafeHTMLUtils';

interface SafeHTMLProps {
  html: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, className, as: Component = 'div' }) => {
  const sanitizedContent = useMemo(() => {
    if (typeof window === 'undefined' || !window.DOMParser) {
       return sanitizeWithRegex(html);
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return sanitizeNodes(doc.body);
    } catch (e) {
      console.error('Sanitization failed', e);
      return '';
    }
  }, [html]);

  return <Component className={className} dangerouslySetInnerHTML={{ __html: sanitizedContent }} />;
};
