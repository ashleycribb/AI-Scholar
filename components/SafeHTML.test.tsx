import { expect, test, describe, afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import React from 'react';

// Setup happy-dom environment BEFORE importing libraries that depend on it
GlobalRegistrator.register();

// Dynamically import libraries to ensure globals are set
const { render, screen, cleanup } = await import('@testing-library/react');
const { SafeHTML } = await import('./SafeHTML');

describe('SafeHTML Component', () => {
    afterEach(() => {
        cleanup();
    });

    test('renders sanitized HTML correctly', () => {
        const unsafeHTML = '<p>Hello <strong>World</strong></p><script>alert("XSS")</script>';
        render(<SafeHTML html={unsafeHTML} data-testid="safe-html" />);

        const element = screen.getByTestId('safe-html');
        // Check content exists
        expect(element.innerHTML).toContain('<p>Hello <strong>World</strong></p>');
        // Check script is stripped
        expect(element.innerHTML).not.toContain('<script>');
        expect(element.innerHTML).not.toContain('alert("XSS")');
    });

    test('adds rel="noopener noreferrer" to target="_blank" links', () => {
        const linkHTML = '<a href="https://example.com" target="_blank">External Link</a>';
        render(<SafeHTML html={linkHTML} data-testid="link-html" />);

        const element = screen.getByTestId('link-html');
        const link = element.querySelector('a');
        expect(link).toBeTruthy();
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    test('renders as a different element (li)', () => {
        const listHTML = 'Item 1';
        render(
            <ul>
                <SafeHTML as="li" html={listHTML} data-testid="list-item" />
            </ul>
        );

        const element = screen.getByTestId('list-item');
        expect(element.tagName).toBe('LI');
        expect(element.textContent).toBe('Item 1');
    });

    test('does not modify target if not _blank', () => {
        const linkHTML = '<a href="https://example.com" target="_self">Self Link</a>';
        render(<SafeHTML html={linkHTML} data-testid="self-link" />);

        const element = screen.getByTestId('self-link');
        const link = element.querySelector('a');
        expect(link).toBeTruthy();
        expect(link?.getAttribute('target')).toBe('_self');
        expect(link?.hasAttribute('rel')).toBe(false);
    });
});
