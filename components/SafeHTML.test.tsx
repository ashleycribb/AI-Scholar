import { describe, test, expect } from "bun:test";
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeHTML } from "./SafeHTML";

describe("SafeHTML Component", () => {
    test("Fallback: strips tags in non-browser environment", () => {
        const html = "<b>Bold</b><script>alert(1)</script>";
        const output = renderToStaticMarkup(<SafeHTML html={html} />);
        // The fallback logic is html.replace(/<[^>]*>?/gm, '')
        // So "<b>Bold</b><script>alert(1)</script>" -> "Boldalert(1)"
        // Wrapped in <div> by default.
        expect(output).toBe("<div>Boldalert(1)</div>");
    });

    test("Fallback: renders plain text correctly", () => {
        const html = "Just text";
        const output = renderToStaticMarkup(<SafeHTML html={html} />);
        expect(output).toBe("<div>Just text</div>");
    });

    test("Accepts different 'as' prop", () => {
        const html = "Text";
        const output = renderToStaticMarkup(<SafeHTML as="span" html={html} />);
        expect(output).toBe("<span>Text</span>");
    });
});
