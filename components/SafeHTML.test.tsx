import { describe, expect, test } from 'bun:test';
import React from 'react';
import { sanitizeHTMLString } from './SafeHTML';

// Mock DOM environment
if (typeof global.Node === 'undefined') {
    (global as any).Node = {
        TEXT_NODE: 3,
        ELEMENT_NODE: 1
    };
}

// Simple DOM structure for testing
class MockNode {
    nodeType: number;
    textContent: string | null = null;
    tagName: string = '';
    childNodes: MockNode[] = [];
    attributes: { name: string, value: string }[] = [];

    constructor(type: number) {
        this.nodeType = type;
    }
}

class MockElement extends MockNode {
    constructor(tagName: string) {
        super(1); // ELEMENT_NODE
        this.tagName = tagName.toUpperCase();
    }
}

class MockText extends MockNode {
    constructor(text: string) {
        super(3); // TEXT_NODE
        this.textContent = text;
    }
}

class MockDocument {
    body: MockElement;
    constructor() {
        this.body = new MockElement('BODY');
    }
}

// Mock parser
class MockDOMParser {
    parseFromString(str: string, mimeType: string): MockDocument {
        const doc = new MockDocument();

        // Very basic parser simulation for testing purposes
        const regex = /<(\/?)(\w+)([^>]*)>|([^<]+)/g;
        let match;
        let currentParent: MockNode = doc.body;
        const stack: MockNode[] = [doc.body];

        while ((match = regex.exec(str)) !== null) {
            const [full, isClosing, tagName, attrs, text] = match;

            if (text) {
                // Keep text as is, don't trim excessively to preserve spaces in content
                currentParent.childNodes.push(new MockText(text));
            } else if (tagName) {
                if (isClosing) {
                    stack.pop();
                    currentParent = stack[stack.length - 1] || doc.body;
                } else {
                    const el = new MockElement(tagName);
                    if (attrs) {
                        const attrRegex = /(\w+)="([^"]*)"/g;
                        let attrMatch;
                        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                            el.attributes.push({ name: attrMatch[1], value: attrMatch[2] });
                        }
                    }
                    currentParent.childNodes.push(el);

                    // Self-closing tags
                    const voidTags = ['br', 'img', 'hr', 'input'];
                    if (!voidTags.includes(tagName.toLowerCase()) && !full.endsWith('/>')) {
                        stack.push(el);
                        currentParent = el;
                    }
                }
            }
        }
        return doc;
    }
}

(global as any).DOMParser = MockDOMParser;
(global as any).window = { DOMParser: MockDOMParser };

describe('sanitizeHTMLString', () => {
    test('renders allowed tags', () => {
        const html = '<b>Bold</b>';
        const result = sanitizeHTMLString(html);
        const elements = result as React.ReactElement[];
        expect(elements.length).toBe(1);
        expect(elements[0].type).toBe('b');
        expect(elements[0].props.children).toEqual(['Bold']);
    });

    test('strips disallowed tags but keeps content', () => {
         const html = '<script>alert(1)</script>';
         const result = sanitizeHTMLString(html);
         const elements = result as React.ReactElement[];
         expect(elements.length).toBe(1);
         // Disallowed tags return a Fragment
         expect(elements[0].type).toBe(React.Fragment);
         expect(elements[0].props.children).toEqual(['alert(1)']);
    });

    test('removes disallowed attributes', () => {
        const html = '<a href="http://example.com" onclick="alert(1)">Link</a>';
        const result = sanitizeHTMLString(html);
        const elements = result as React.ReactElement[];
        expect(elements.length).toBe(1);
        expect(elements[0].type).toBe('a');
        expect(elements[0].props.href).toBe('http://example.com');
        expect(elements[0].props.onclick).toBeUndefined();
    });

    test('handles javascript: links', () => {
        const html = '<a href="javascript:alert(1)">Link</a>';
        const result = sanitizeHTMLString(html);
        const elements = result as React.ReactElement[];
        expect(elements.length).toBe(1);
        expect(elements[0].type).toBe('a');
        expect(elements[0].props.href).toBeUndefined();
    });

    test('allows safe relative URLs', () => {
        const html = '<a href="/relative/path">Link</a>';
        const result = sanitizeHTMLString(html);
        const elements = result as React.ReactElement[];
        expect(elements[0].props.href).toBe('/relative/path');
    });

    test('allows safe absolute URLs', () => {
        const html = '<a href="https://example.com">Link</a>';
        const result = sanitizeHTMLString(html);
        const elements = result as React.ReactElement[];
        expect(elements[0].props.href).toBe('https://example.com');
    });

    test('adds rel="noopener noreferrer" to target="_blank"', () => {
        const html = '<a href="http://example.com" target="_blank">Link</a>';
        const result = sanitizeHTMLString(html);
        const elements = result as React.ReactElement[];
        expect(elements[0].props.target).toBe('_blank');
        expect(elements[0].props.rel).toBe('noopener noreferrer');
    });
});
