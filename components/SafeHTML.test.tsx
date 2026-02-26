import { describe, test, expect, beforeAll } from 'bun:test';
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeHTML } from '../components/SafeHTML';

// Setup DOM environment
GlobalRegistrator.register();

describe('SafeHTML Component', () => {

  test('sanitizes malicious scripts', () => {
    const maliciousHTML = '<div>Hello <script>alert("xss")</script>World</div>';
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    act(() => {
      root.render(<SafeHTML html={maliciousHTML} />);
    });

    // DOMPurify removes script tag completely
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.textContent).toContain('Hello World');

    root.unmount();
    document.body.removeChild(container);
  });

  test('adds rel="noopener noreferrer" to target="_blank"', () => {
    const linkHTML = '<a href="http://example.com" target="_blank">Link</a>';
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    act(() => {
      root.render(<SafeHTML html={linkHTML} />);
    });

    const anchor = container.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');

    root.unmount();
    document.body.removeChild(container);
  });

  test('renders correct tag via "as" prop', () => {
    const html = '<span>Content</span>';
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    act(() => {
      root.render(<SafeHTML as="li" html={html} />);
    });

    const li = container.querySelector('li');
    expect(li).toBeTruthy();
    expect(li?.innerHTML).toContain('<span>Content</span>');

    root.unmount();
    document.body.removeChild(container);
  });
});
