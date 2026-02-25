import { expect, test, describe } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeHTML } from './SafeHTML';

describe('SafeHTML Component', () => {
    test('renders valid HTML correctly', () => {
        const html = '<b>Bold</b> text';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).toContain('<b>Bold</b>');
        expect(output).toContain('text');
    });

    test('removes script tags', () => {
        const html = '<div><script>alert(1)</script>Safe</div>';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).not.toContain('script');
        expect(output).not.toContain('alert(1)');
        expect(output).toContain('Safe');
    });

    test('removes dangerous attributes', () => {
        const html = '<div onclick="alert(1)">Click</div>';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).not.toContain('onclick');
        expect(output).toContain('<div>Click</div>');
    });

    test('sanitizes href javascript:', () => {
        const html = '<a href="javascript:alert(1)">Link</a>';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).not.toContain('href="javascript');
        expect(output).toContain('<a>Link</a>');
    });

    test('allows valid href', () => {
        const html = '<a href="http://example.com">Link</a>';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).toContain('href="http://example.com"');
    });

    test('unwraps unsafe tags but keeps content', () => {
        const html = '<unsafe>Content</unsafe>';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).not.toContain('<unsafe>');
        expect(output).toContain('Content');
        // DOMPurify typically strips tags but keeps text.
        // <div>Content</div> (wrapped in div by SafeHTML)
        expect(output).toBe('<div>Content</div>');
    });

    test('adds rel="noopener noreferrer" to target="_blank"', () => {
        const html = '<a href="http://example.com" target="_blank">Link</a>';
        const output = renderToStaticMarkup(React.createElement(SafeHTML, { html }));
        expect(output).toContain('target="_blank"');
        expect(output).toContain('rel="noopener noreferrer"');
    });
});
