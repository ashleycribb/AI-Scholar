import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeHTML } from './SafeHTML';
import { escapeHtml, safeHttpUrl } from '../extension/lib/escapeHtml';

/**
 * XSS payload tests that render through real React (renderToStaticMarkup).
 *
 * No DOMParser exists server-side, so SafeHTML takes its tag-stripping
 * fallback; the output is React text, which React escapes. The assertion that
 * matters is the same in every environment: no payload may produce a live
 * element, attribute or URL in the rendered markup.
 *
 * The DOMParser (allow-list) path is covered by SafeHTML.test.tsx.
 */

const PAYLOADS = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '<svg onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="  JaVaScRiPt:alert(1)">x</a>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<body onload=alert(1)>',
    '<div onmouseover="alert(1)">hover</div>',
    '<style>@import "javascript:alert(1)"</style>',
    '<form action="javascript:alert(1)"><input type=submit></form>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '"><img src=x onerror=alert(1)>',
];

const globals = globalThis as any;
let saved: { window: unknown; DOMParser: unknown };

beforeEach(() => {
    // Other test files install a mock DOMParser/window globally; force the
    // server-side path so this file is order-independent.
    saved = { window: globals.window, DOMParser: globals.DOMParser };
    delete globals.window;
    delete globals.DOMParser;
});
afterEach(() => {
    if (saved.window !== undefined) globals.window = saved.window;
    if (saved.DOMParser !== undefined) globals.DOMParser = saved.DOMParser;
});

describe('SafeHTML renders XSS payloads inert', () => {
    for (const payload of PAYLOADS) {
        test(payload, () => {
            const out = renderToStaticMarkup(<SafeHTML html={payload} />);
            expect(out).not.toMatch(/<(script|img|svg|iframe|style|form|input|math|body)\b/i);
            expect(out).not.toMatch(/\son[a-z]+\s*=/i);
            expect(out).not.toMatch(/href\s*=/i);
        });
    }

    test('works with a custom wrapper element and className', () => {
        const out = renderToStaticMarkup(<SafeHTML html="<b>x</b>" as="span" className="c" />);
        expect(out.startsWith('<span class="c">')).toBe(true);
    });
});

describe('extension content-script escaping helpers', () => {
    test('escapeHtml neutralises markup in text and quoted attributes', () => {
        const hostile = `"><img src=x onerror=alert(1)> & 'q' \`b\``;
        const out = escapeHtml(hostile);
        expect(out).not.toMatch(/[<>"'`]/);
        expect(out).toContain('&lt;img');
        expect(out).toContain('&amp;');
    });

    test('escapeHtml tolerates null, undefined and non-strings', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(42)).toBe('42');
    });

    test('a template built with escapeHtml has no live element from hostile LLM output', () => {
        const finding = '<img src=x onerror=alert(1)>';
        const html = `<li>${escapeHtml(finding)}</li><button data-query="${escapeHtml('" onclick="alert(1)')}">x</button>`;
        expect(html.match(/<img/g)).toBeNull();
        // the only attribute on the button is data-query; the injected quote is escaped
        expect(html).toContain('data-query="&quot; onclick=&quot;alert(1)"');
    });

    test('safeHttpUrl only passes http(s)', () => {
        expect(safeHttpUrl('https://example.org/a.pdf')).toBe('https://example.org/a.pdf');
        expect(safeHttpUrl('http://example.org')).toBe('http://example.org/');
        for (const bad of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x', '//evil', '', null, undefined, 5, {}]) {
            expect(safeHttpUrl(bad as any)).toBeNull();
        }
    });
});
