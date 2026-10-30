import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Regression guard. The March 2026 XSS and BroadcastChannel fixes were
 * silently reverted by a later AI Studio sync (commit 77dcf33). These checks
 * fail loudly if a raw HTML sink or an unvalidated channel handler comes back.
 */

const ROOT = join(import.meta.dir, '..');
const SKIP = new Set(['node_modules', 'dist', 'dist-extension', '.git', 'local_engine', 'migrated_prompt_history']);

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        if (SKIP.has(name)) return [];
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });

const sources = walk(ROOT).map((file) => ({ file: relative(ROOT, file), text: readFileSync(file, 'utf8') }));

describe('raw HTML sinks', () => {
    test('no dangerouslySetInnerHTML anywhere (use components/SafeHTML)', () => {
        const hits = sources.filter((s) => s.text.includes('dangerouslySetInnerHTML')).map((s) => s.file);
        expect(hits).toEqual([]);
    });

    test('content-script innerHTML templates interpolate only escaped or constant values', () => {
        const allowedConst = /^(coPilotIconSvg|findingsHTML|limitationsHTML|suggestionsHTML)$/;
        const offenders: string[] = [];
        for (const { file, text } of sources.filter((s) => s.file.startsWith('extension/content-scripts/'))) {
            const templates = text.matchAll(/innerHTML\s*=\s*`([^`]*)`/g);
            for (const [, body] of templates) {
                for (const [, expr] of body.matchAll(/\$\{([^}]*)\}/g)) {
                    const e = expr.trim();
                    if (!/^escapeHtml\(.*\)$/.test(e) && !allowedConst.test(e)) offenders.push(`${file}: \${${e}}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('BroadcastChannel handlers validate input', () => {
    const find = (file: string) => sources.find((s) => s.file === file)!.text;

    test('web app listener goes through parseExtensionMessage', () => {
        const text = find('services/extensionService.ts');
        expect(text).toContain('parseExtensionMessage(');
        expect(text).not.toMatch(/event\.data\.(type|paper|papers|paperId)/);
    });

    test('extension background and popup validate channel data', () => {
        expect(find('extension/background.ts')).toContain('parseWebAppMessage(');
        expect(find('extension/popup.tsx')).toContain('parsePopupMessage(');
        expect(find('extension/background.ts')).not.toMatch(/event\.data\.(type|paper|isFavorite)/);
        expect(find('extension/popup.tsx')).not.toMatch(/event\.data\.(type|paper|paperId)/);
    });
});
