import { describe, expect, test } from 'bun:test';
import { sanitizeNodes, sanitizeWithRegex } from './SafeHTMLUtils';

// --- Mocks ---

class MockNode {
  nodeType: number;
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;
  textContent: string | null = null;

  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }

  get firstChild(): MockNode | null {
    return this.childNodes[0] || null;
  }

  insertBefore(newNode: MockNode, referenceNode: MockNode | null) {
      if (newNode.parentNode) {
          newNode.parentNode.removeChild(newNode);
      }
      newNode.parentNode = this;

      if (!referenceNode) {
          this.childNodes.push(newNode);
          return;
      }

      const index = this.childNodes.indexOf(referenceNode);
      if (index === -1) throw new Error("Reference node not found");
      this.childNodes.splice(index, 0, newNode);
  }

  removeChild(child: MockNode) {
      const index = this.childNodes.indexOf(child);
      if (index > -1) {
          this.childNodes.splice(index, 1);
          child.parentNode = null;
      }
  }
}

class MockElement extends MockNode {
  tagName: string;
  attributes: { name: string; value: string }[] = [];

  constructor(tagName: string) {
    super(1); // ELEMENT_NODE
    this.tagName = tagName.toUpperCase();
  }

  getAttribute(name: string): string | null {
      const attr = this.attributes.find(a => a.name === name);
      return attr ? attr.value : null;
  }

  setAttribute(name: string, value: string) {
      const attr = this.attributes.find(a => a.name === name);
      if (attr) {
          attr.value = value;
      } else {
          this.attributes.push({ name, value });
      }
  }

  removeAttribute(name: string) {
      this.attributes = this.attributes.filter(a => a.name !== name);
  }

  getElementsByTagName(tagName: string): MockElement[] {
      const results: MockElement[] = [];
      const traverse = (node: MockNode) => {
          if (node instanceof MockElement) {
              if (tagName === '*' || node.tagName === tagName.toUpperCase()) {
                  // Don't include self if called on self? The DOM method searches descendants.
                  // But my traversal starts from children.
              }
          }
          for (const child of node.childNodes) {
              if (child instanceof MockElement) {
                  if (tagName === '*' || child.tagName === tagName.toUpperCase()) {
                      results.push(child);
                  }
                  traverse(child);
              }
          }
      };

      // We traverse from this element's children
      for (const child of this.childNodes) {
           if (child instanceof MockElement) {
                if (tagName === '*' || child.tagName === tagName.toUpperCase()) {
                    results.push(child);
                }
                traverse(child);
           }
      }
      return results;
  }

  remove() {
      if (this.parentNode) {
          this.parentNode.removeChild(this);
      }
  }

  get innerHTML(): string {
      // Very simple serialization for test purposes
      let html = '';
      for (const child of this.childNodes) {
          if (child instanceof MockElement) {
              const attrs = child.attributes.map(a => `${a.name}="${a.value}"`).join(' ');
              const openTag = attrs ? `<${child.tagName.toLowerCase()} ${attrs}>` : `<${child.tagName.toLowerCase()}>`;
              html += `${openTag}${child.innerHTML}</${child.tagName.toLowerCase()}>`;
          } else if (child instanceof MockText) {
              html += child.textContent || '';
          }
      }
      return html;
  }
}

class MockText extends MockNode {
    constructor(text: string) {
        super(3); // TEXT_NODE
        this.textContent = text;
    }
}

// Helper to create element tree from simple structure
function createElement(tagName: string, attrs: Record<string, string> = {}, children: (MockNode|string)[] = []): MockElement {
    const el = new MockElement(tagName);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    for (const child of children) {
        if (typeof child === 'string') {
            el.insertBefore(new MockText(child), null);
        } else {
            el.insertBefore(child, null);
        }
    }
    return el;
}

// --- Tests ---

describe('SafeHTML Sanitization', () => {

    test('sanitizeWithRegex basic functionality', () => {
        expect(sanitizeWithRegex('<b>Bold</b>')).toBe('<b>Bold</b>');
        expect(sanitizeWithRegex('<script>alert(1)</script>')).toBe('');
        expect(sanitizeWithRegex('<a href="javascript:alert(1)">Link</a>')).toBe('<a href="#">Link</a>');
        expect(sanitizeWithRegex('<div onclick="alert(1)">Click me</div>')).toBe('<div>Click me</div>');
    });

    test('sanitizeNodes allows valid tags', () => {
        const root = createElement('div', {}, [
            createElement('b', {}, ['Bold text']),
            createElement('i', {}, ['Italic text']),
            createElement('a', { href: 'https://example.com' }, ['Link'])
        ]);

        // Mock HTMLElement type casting
        const result = sanitizeNodes(root as any);
        expect(result).toBe('<b>Bold text</b><i>Italic text</i><a href="https://example.com">Link</a>');
    });

    test('sanitizeNodes removes script tags completely', () => {
         const root = createElement('div', {}, [
            createElement('p', {}, ['Before']),
            createElement('script', {}, ['alert(1)']),
            createElement('p', {}, ['After'])
        ]);

        const result = sanitizeNodes(root as any);
        expect(result).toBe('<p>Before</p><p>After</p>');
    });

    test('sanitizeNodes unwraps disallowed tags but keeps content', () => {
         const root = createElement('div', {}, [
            createElement('badtag', {}, ['Some content']),
            createElement('anotherbad', {}, [
                createElement('b', {}, ['Bold inside bad'])
            ])
        ]);

        const result = sanitizeNodes(root as any);
        // Should unwrap <badtag> -> 'Some content'
        // Should unwrap <anotherbad> -> <b>Bold inside bad</b>
        expect(result).toBe('Some content<b>Bold inside bad</b>');
    });

    test('sanitizeNodes removes dangerous attributes', () => {
        const root = createElement('div', {}, [
            createElement('div', { onclick: 'alert(1)', class: 'safe' }, ['Click me'])
        ]);

        const result = sanitizeNodes(root as any);
        expect(result).toBe('<div class="safe">Click me</div>');
    });

    test('sanitizeNodes removes javascript: URLs', () => {
        const root = createElement('div', {}, [
            createElement('a', { href: 'javascript:alert(1)' }, ['Bad Link']),
            createElement('a', { href: 'https://good.com' }, ['Good Link'])
        ]);

        const result = sanitizeNodes(root as any);
        expect(result).toBe('<a>Bad Link</a><a href="https://good.com">Good Link</a>');
    });

    test('sanitizeNodes allows relative URLs', () => {
         const root = createElement('div', {}, [
            createElement('a', { href: '/internal' }, ['Internal'])
        ]);

        const result = sanitizeNodes(root as any);
        expect(result).toBe('<a href="/internal">Internal</a>');
    });

    test('sanitizeNodes handles nested sanitization', () => {
        // <div onclick=".."><b><script>...</script></b></div>
        const root = createElement('div', {}, [
             createElement('div', { onclick: 'bad' }, [
                 createElement('b', {}, [
                     createElement('script', {}, ['bad script'])
                 ])
             ])
        ]);

        const result = sanitizeNodes(root as any);
        // div onclick removed -> <div>
        // b allowed -> <b>
        // script removed -> (empty)
        expect(result).toBe('<div><b></b></div>');
    });

});
