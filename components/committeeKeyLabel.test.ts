import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The committee signing key is generated in memory on every page load. The UI must say
 * so, and must not describe the signature as a lasting reviewer identity.
 */
const dash = readFileSync(join(import.meta.dir, 'ResearcherDashboard.tsx'), 'utf8');
const svc = readFileSync(join(import.meta.dir, '..', 'services', 's3aWasmService.ts'), 'utf8');

describe('ephemeral committee signing key is labelled', () => {
    test('the service exports a notice and the key is still in-memory only', () => {
        expect(svc).toContain('export const EPHEMERAL_REVIEWER_KEY_NOTICE');
        expect(svc).toMatch(/let reviewerKeyPair: CryptoKeyPair \| null = null;/);
        expect(svc).not.toMatch(/localStorage[^\n]*reviewer|indexedDB[^\n]*reviewerKey/i);
    });

    test('the Decisions tab shows the notice and the demo-key wording', () => {
        expect(dash).toContain('{EPHEMERAL_REVIEWER_KEY_NOTICE}');
        expect(dash).toContain('temporary demo key');
        expect(dash).not.toContain('Signed with Ed25519 WebCrypto');
    });
});
