import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pass 1 is the researcher's own ~15 second skim and is not recorded. Opening a
 * paper page or switching a tab must not emit an xAPI statement. Recording
 * starts when the researcher selects a paper (pass 2), and only with consent.
 */
const app = readFileSync(join(import.meta.dir, '..', 'App.tsx'), 'utf8');

describe('Pass 1 is not recorded', () => {
    test("App.tsx never emits 'opened' or 'viewed' statements", () => {
        expect(app).not.toMatch(/emitStatement\(\s*['"`](opened|viewed)['"`]/);
    });

    test("selecting a paper still emits 'saved' (where recording starts)", () => {
        expect(app).toMatch(/emitStatement\(\s*['"`]saved['"`]/);
    });
});
