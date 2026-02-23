import React from 'react';

const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 'sup', 'sub',
  'span', 'div', 'p', 'br', 'a', 'ul', 'ol', 'li'
]);

const ALLOWED_ATTRIBUTES = new Set([
  'href', 'target', 'rel', 'title', 'alt', 'class'
]);

interface SafeHTMLProps {
  html: string;
}

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html }) => {
  // Fallback for non-browser environments (e.g., SSR, tests without DOM)
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    const plainText = html.replace(/<[^>]*>?/gm, '');
    return <>{plainText}</>;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const nodes = Array.from(doc.body.childNodes);

    const convertNode = (node: Node, key: number): React.ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        if (ALLOWED_TAGS.has(tagName)) {
          const props: Record<string, any> = { key };

          Array.from(element.attributes).forEach((attr) => {
            if (ALLOWED_ATTRIBUTES.has(attr.name)) {
               if (attr.name === 'href') {
                 // Validate href
                 const href = attr.value.trim();
                 // Allow http, https, mailto, doi (and relative URLs? No, citations are usually absolute or doi)
                 if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('doi:')) {
                   props.href = href;
                   // Force safe target/rel for external links
                   if (tagName === 'a') {
                     props.target = '_blank';
                     props.rel = 'noopener noreferrer';
                   }
                 }
               } else if (attr.name === 'class') {
                  props.className = attr.value;
               } else {
                 props[attr.name] = attr.value;
               }
            }
          });

          const children = Array.from(element.childNodes).map((child, i) => convertNode(child, i));
          return React.createElement(tagName, props, children);
        } else {
          // Dangerous tags to strip completely
          if (['script', 'style', 'iframe', 'object', 'embed', 'applet', 'base', 'form', 'input', 'button'].includes(tagName)) {
            return null;
          }
           // For other unknown tags, unwrap them (keep children)
           const children = Array.from(element.childNodes).map((child, i) => convertNode(child, i));
           return <React.Fragment key={key}>{children}</React.Fragment>;
        }
      }
      return null;
    };

    return <>{nodes.map((node, i) => convertNode(node, i))}</>;

  } catch (e) {
    console.error('Error parsing HTML in SafeHTML:', e);
    return <>{html.replace(/<[^>]*>?/gm, '')}</>;
  }
};
