import { describe, it, expect } from 'bun:test';
import DOMPurify from 'isomorphic-dompurify';

// Setup the hook as done in SafeHTML.tsx
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ('target' in node && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
    }
});

describe('SafeHTML Sanitization Logic', () => {
    it('strips malicious scripts', () => {
        const dirty = '<script>alert("xss")</script>Hello';
        const clean = DOMPurify.sanitize(dirty);
        expect(clean).toBe('Hello');
    });

    it('strips onerror handlers', () => {
        const dirty = '<img src=x onerror=alert(1)>';
        const clean = DOMPurify.sanitize(dirty);
        expect(clean).toBe('<img src="x">');
    });

    it('preserves safe HTML', () => {
        const safe = '<b>Bold</b> and <i>Italic</i>';
        const clean = DOMPurify.sanitize(safe);
        expect(clean).toBe('<b>Bold</b> and <i>Italic</i>');
    });

    it('adds rel="noopener noreferrer" to target="_blank" links when target is allowed', () => {
        const dirty = '<a href="https://example.com" target="_blank">Link</a>';
        // We must pass ADD_ATTR: ['target'] as the component does
        const clean = DOMPurify.sanitize(dirty, { ADD_ATTR: ['target'] });
        expect(clean).toContain('rel="noopener noreferrer"');
        expect(clean).toContain('target="_blank"');
    });

    it('does not add rel to other links', () => {
        const dirty = '<a href="https://example.com">Link</a>';
        const clean = DOMPurify.sanitize(dirty, { ADD_ATTR: ['target'] });
        expect(clean).not.toContain('rel="noopener noreferrer"');
    });

    it('strips target if not explicitly allowed', () => {
        const dirty = '<a href="https://example.com" target="_blank">Link</a>';
        // Default behavior (no ADD_ATTR)
        const clean = DOMPurify.sanitize(dirty);
        expect(clean).not.toContain('target="_blank"');
    });
});
