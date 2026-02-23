import { test, expect, describe } from "bun:test";

// Mock DOM classes
class MockNode {
  nodeType: number;
  textContent: string | null = null;
  childNodes: MockNode[] = [];
  parentNode: MockNode | null = null;

  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }

  appendChild(child: MockNode) {
    if (child.nodeType === 11) { // DOCUMENT_FRAGMENT_NODE
        // Move children
        const children = [...child.childNodes];
        children.forEach(c => {
            c.parentNode = this;
            this.childNodes.push(c);
        });
        child.childNodes = [];
        return child;
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
}

class MockElement extends MockNode {
  tagName: string;
  attributes: { name: string; value: string }[] = [];

  constructor(tagName: string) {
    super(1); // ELEMENT_NODE
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    const existing = this.attributes.find(a => a.name === name);
    if (existing) {
      existing.value = value;
    } else {
      this.attributes.push({ name, value });
    }
  }

  getAttribute(name: string) {
    return this.attributes.find(a => a.name === name)?.value || null;
  }

  hasAttribute(name: string) {
    return !!this.attributes.find(a => a.name === name);
  }

  get innerHTML() {
    return this.childNodes.map(child => {
        if (child instanceof MockTextNode) return child.textContent;
        if (child instanceof MockElement) {
            const attrs = child.attributes.map(a => `${a.name}="${a.value}"`).join(' ');
            const startTag = attrs ? `<${child.tagName.toLowerCase()} ${attrs}>` : `<${child.tagName.toLowerCase()}>`;
            const endTag = `</${child.tagName.toLowerCase()}>`;
             // Simplified self-closing
            if (['br', 'img', 'input'].includes(child.tagName.toLowerCase())) return `<${child.tagName.toLowerCase()}${attrs ? ' ' + attrs : ''}>`;
            return `${startTag}${child.innerHTML}${endTag}`;
        }
        return '';
    }).join('');
  }
}

class MockTextNode extends MockNode {
    constructor(text: string) {
        super(3); // TEXT_NODE
        this.textContent = text;
    }
}

class MockDocumentFragment extends MockNode {
    constructor() {
        super(11); // DOCUMENT_FRAGMENT_NODE
    }
}

class MockDocument {
    body: MockElement;

    constructor() {
        this.body = new MockElement('BODY');
    }

    createDocumentFragment() {
        return new MockDocumentFragment();
    }

    createElement(tagName: string) {
        return new MockElement(tagName);
    }

    createTextNode(text: string) {
        return new MockTextNode(text);
    }
}

// Simple parser helper
function parseHTML(html: string): MockDocument {
    const doc = new MockDocument();

    // Manual mapping for test cases
    if (html.includes('<script>')) {
        if (html.includes('<b>Bold</b>')) {
             const b = new MockElement('b');
             b.appendChild(new MockTextNode('Bold'));
             doc.body.appendChild(b);
        }
        const script = new MockElement('script');
        script.appendChild(new MockTextNode('alert(1)'));
        doc.body.appendChild(script);
    } else if (html === '<b>Bold</b>') {
        const b = new MockElement('b');
        b.appendChild(new MockTextNode('Bold'));
        doc.body.appendChild(b);
    } else if (html.includes('javascript:alert')) {
        const a = new MockElement('a');
        a.setAttribute('href', 'javascript:alert(1)');
        a.appendChild(new MockTextNode('Click me'));
        doc.body.appendChild(a);
    } else if (html.includes('onclick')) {
         const div = new MockElement('div');
         div.setAttribute('onclick', 'alert(1)');
         div.appendChild(new MockTextNode('Click'));
         doc.body.appendChild(div);
    } else if (html.includes('http://example.com')) {
         const a = new MockElement('a');
         a.setAttribute('href', 'http://example.com');
         a.appendChild(new MockTextNode('Link'));
         doc.body.appendChild(a);
    } else {
        doc.body.appendChild(new MockTextNode(html));
    }

    return doc;
}

class MockDOMParser {
    parseFromString(str: string, mime: string) {
        return parseHTML(str);
    }
}

// Global Mocks
global.Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3
} as any;

global.DOMParser = MockDOMParser as any;
global.document = new MockDocument() as any;
global.document.createDocumentFragment = () => new MockDocumentFragment();
global.document.createElement = (tag: string) => new MockElement(tag);
global.document.createTextNode = (text: string) => new MockTextNode(text);
global.window = { DOMParser: MockDOMParser } as any;

// Import after mocks
import { sanitizeHTML } from './SafeHTML';

describe('sanitizeHTML', () => {
    test('renders sanitized content', () => {
        const html = sanitizeHTML('<b>Bold</b><script>alert(1)</script>');
        expect(html).toContain('<b>Bold</b>');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('alert(1)');
    });

    test('removes javascript: href', () => {
        const html = sanitizeHTML('<a href="javascript:alert(1)">Click me</a>');
        expect(html).toContain('Click me');
        expect(html).not.toContain('javascript:');
    });

    test('allows valid http href', () => {
         const html = sanitizeHTML('<a href="http://example.com">Link</a>');
         expect(html).toContain('href="http://example.com"');
         expect(html).toContain('target="_blank"');
    });

    test('removes dangerous attributes', () => {
        const html = sanitizeHTML('<div onclick="alert(1)">Click</div>');
        expect(html).not.toContain('onclick');
        expect(html).toContain('<div>Click</div>');
    });
});
