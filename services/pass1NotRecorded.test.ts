import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pass 1 recording starts when the researcher selects a paper (the inclusion
 * decision), and only with consent. The skim before selection (browsing
 * results, opening a paper page, switching tabs) is not recorded: no
 * 'opened' or 'viewed' statements.
 */
const app = readFileSync(join(import.meta.dir, '..', 'App.tsx'), 'utf8');

describe('pre-selection skim is not recorded; selecting a paper is pass 1', () => {
    test("App.tsx never emits 'opened' or 'viewed' statements", () => {
        expect(app).not.toMatch(/emitStatement\(\s*['"`](opened|viewed)['"`]/);
    });

    test("selecting a paper emits 'saved' tagged as pass 1", () => {
        const saved = [...app.matchAll(/emitStatement\(\s*['"`]saved['"`][\s\S]*?\.catch\(/g)].map((m) => m[0]);
        expect(saved.length).toBeGreaterThan(0);
        for (const call of saved) expect(call).toMatch(/pass:\s*1\b/);
    });
});
