import React, { useMemo } from 'react';

interface SafeHTMLProps {
  html: string;
  className?: string;
  as?: React.ElementType;
  style?: React.CSSProperties;
}

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'sup', 'sub', 'span', 'div', 'p', 'br', 'a', 'ul', 'ol', 'li'];
const ALLOWED_ATTRIBUTES = ['href', 'target', 'rel', 'title', 'alt', 'class'];

export const SafeHTML: React.FC<SafeHTMLProps> = ({ html, className, as: Component = 'div', style }) => {
  const sanitizedContent = useMemo(() => {
    // Check for browser environment
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
       // Fallback for non-browser environments (SSR, tests): simple regex strip
       // This is a basic fallback and might not be perfect, but prevents crashes.
       return html.replace(/<[^>]*>?/gm, '');
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return convertNodes(doc.body.childNodes);
    } catch (e) {
        console.error("Error sanitizing HTML", e);
        // Fallback on error
        return html.replace(/<[^>]*>?/gm, '');
    }
  }, [html]);

  // If fallback text was returned
  if (typeof sanitizedContent === 'string') {
      return <Component className={className} style={style}>{sanitizedContent}</Component>;
  }

  return (
    <Component className={className} style={style}>
      {sanitizedContent}
    </Component>
  );
};

function convertNodes(nodes: NodeListOf<ChildNode>): React.ReactNode[] {
    return Array.from(nodes).map((node, index) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            if (ALLOWED_TAGS.includes(tagName)) {
                const props: any = { key: index };

                // Copy allowed attributes
                Array.from(element.attributes).forEach(attr => {
                    if (ALLOWED_ATTRIBUTES.includes(attr.name)) {
                        if (attr.name === 'href') {
                             // Sanitize href: prevent javascript: URIs
                             if (attr.value.trim().toLowerCase().startsWith('javascript:')) {
                                 return;
                             }
                        }

                        // Handle class -> className
                        if (attr.name === 'class') {
                            props.className = attr.value;
                        } else {
                            props[attr.name] = attr.value;
                        }
                    }
                });

                return React.createElement(
                    tagName,
                    props,
                    convertNodes(element.childNodes)
                );
            } else {
                // For disallowed tags, unwrap them and render children
                // This preserves text content but removes potentially dangerous or unwanted tags.
                // e.g. <script>alert(1)</script> -> alert(1) (as text)
                // e.g. <unknown>text</unknown> -> text
                return <React.Fragment key={index}>{convertNodes(element.childNodes)}</React.Fragment>;
            }
        }
        return null;
    });
}
