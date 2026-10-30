import React, { useMemo } from 'react';

interface SafeHTMLProps {
  html: string;
  className?: string;
  as?: React.ElementType;
}

const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 'sup', 'sub', 'span', 'div', 'p', 'br', 'a', 'ul', 'ol', 'li'
]);

const ALLOWED_ATTRIBUTES = new Set([
  'href', 'target', 'rel', 'title', 'alt', 'class'
]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const isSafeUrl = (url: string) => {
    try {
        const parsed = new URL(url, 'http://dummy.com'); // Base for relative URLs
        return ALLOWED_PROTOCOLS.has(parsed.protocol);
    } catch (e) {
        return false;
    }
};

const sanitizeNode = (node: Node, key: string | number): React.ReactNode => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    const children: React.ReactNode[] = [];

    // Iterate over child nodes first
    element.childNodes.forEach((child, index) => {
      children.push(sanitizeNode(child, `${key}-${index}`));
    });

    if (!ALLOWED_TAGS.has(tagName)) {
        // Strip invalid tags but preserve children
        return <React.Fragment key={key}>{children}</React.Fragment>;
    }

    const props: Record<string, string> = {};
    Array.from(element.attributes).forEach((attr) => {
      if (ALLOWED_ATTRIBUTES.has(attr.name)) {
        if (attr.name === 'href') {
            if (!isSafeUrl(attr.value)) {
                return; // skip unsafe URLs
            }
        }
        props[attr.name] = attr.value;
      }
    });

    // React uses className instead of class
    if (props.class) {
      props.className = props.class;
      delete props.class;
    }

    // Security: Enforce rel="noopener noreferrer" for target="_blank"
    if (tagName === 'a' && props.target === '_blank') {
      props.rel = 'noopener noreferrer';
    }

    return React.createElement(tagName, { ...props, key }, children);
  }

  return null;
};

export const sanitizeHTMLString = (html: string): React.ReactNode => {
    // Check for DOMParser availability (browser environment)
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
      return html.replace(/<[^>]*>?/gm, '');
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const children: React.ReactNode[] = [];

      doc.body.childNodes.forEach((child, index) => {
        children.push(sanitizeNode(child, index));
      });

      return children;
    } catch (e) {
      console.error('Failed to parse HTML', e);
      return html.replace(/<[^>]*>?/gm, '');
    }
};

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, className, as: Component = 'div' }) => {
  const sanitizedContent = useMemo(() => sanitizeHTMLString(html), [html]);

  if (Component === React.Fragment) {
      return <>{sanitizedContent}</>;
  }

  return (
    <Component className={className}>
      {sanitizedContent}
    </Component>
  );
};
