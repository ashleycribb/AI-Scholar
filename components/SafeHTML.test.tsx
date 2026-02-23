import { expect, test, describe } from 'bun:test';
import { SafeHTML } from './SafeHTML';
import React from 'react';
import { renderToString } from 'react-dom/server';

describe('SafeHTML Component', () => {
  test('strips HTML tags in non-browser environment (fallback)', () => {
    // In bun test, window/DOMParser is undefined by default, triggering the fallback.
    // The fallback uses a regex to strip tags but preserves text content.
    // This text content is then rendered safely by React (escaped).

    const input = '<b>Bold Text</b> with <script>alert(1)</script>';
    const output = renderToString(<SafeHTML html={input} />);

    // The regex /<[^>]*>?/gm removes <script> and </script> tags, leaving "alert(1)".
    // Since this is rendered as text, it is safe.
    expect(output).toBe('Bold Text with alert(1)');
  });

  test('handles plain text correctly', () => {
    const input = 'Just plain text.';
    const output = renderToString(<SafeHTML html={input} />);
    expect(output).toBe('Just plain text.');
  });

  test('handles empty string', () => {
      const output = renderToString(<SafeHTML html="" />);
      expect(output).toBe('');
  });
});
