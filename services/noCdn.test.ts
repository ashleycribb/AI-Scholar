import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore plain .mjs helper shared with the CI build check
import { findExternalAssets } from '../scripts/check-no-cdn.mjs';

const root = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('no third-party CDN for scripts, styles or fonts', () => {
  test('source HTML pages load nothing from another origin', () => {
    for (const page of ['index.html', 'extension/popup.html', 'privacy-policy.html']) {
      expect({ page, hits: findExternalAssets(read(page), 'html') }).toEqual({ page, hits: [] });
    }
  });

  test('index.css has no Google Fonts or other external @import', () => {
    expect(findExternalAssets(read('index.css'), 'css')).toEqual([]);
  });

  test('the checker catches each kind of CDN tag that used to be here', () => {
    const html = `
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <script src="//cdn.jsdelivr.net/npm/@citation-js/core@0.7.8/dist/core.min.js"></script>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
      <style>@import url('https://fonts.googleapis.com/css2?family=Inter');</style>
      <a href="https://doi.org/10.1/x">a normal link is fine</a>
      <script type="module" src="/index.tsx"></script>`;
    const hits = findExternalAssets(html, 'html');
    expect(hits.length).toBe(5);
    expect(findExternalAssets("@font-face{src:url(https://fonts.gstatic.com/x.woff2)}", 'css').length).toBe(1);
    expect(findExternalAssets("@font-face{src:url(./files/inter.woff2)}", 'css')).toEqual([]);
  });

  test('jsPDF and citation-js are imported from npm, not read from window globals', () => {
    expect(read('components/ReportModal.tsx')).toContain("from 'jspdf'");
    expect(read('components/ReportModal.tsx')).not.toContain('window.jspdf');
    const cite = read('services/citationService.ts');
    expect(cite).toContain("import('@citation-js/core')");
    expect(cite).not.toContain('window.Cite');
  });
});
