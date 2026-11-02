import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AI suggests, the researcher judges. The claim card must not offer a made-up
 * confidence value or a canned "claim verified" finding.
 */
const card = readFileSync(join(import.meta.dir, 'S3AClaimGovernanceCard.tsx'), 'utf8');
const inspector = readFileSync(join(import.meta.dir, 'S3AInspectorModal.tsx'), 'utf8');

describe('claim card shows no simulated confidence', () => {
    test('no simulated confidence state or slider buttons', () => {
        expect(card).not.toMatch(/simulatedConfidence|setSimulatedConfidence/i);
        expect(card).not.toContain('Test Epistemic Confidence');
        expect(card).not.toMatch(/High \(92%|Low \(58%/);
    });

    test('no canned verification finding', () => {
        expect(card).not.toContain('solid textual alignment');
        expect(card).not.toContain('Claim Verification Finding');
    });

    test('the card still requires a human to approve or reject', () => {
        expect(card).toContain('handleHumanApprove');
        expect(card).toContain('handleHumanReject');
    });

    test('inspector labels an unscored AI step plainly', () => {
        expect(inspector).toContain('not scored');
    });
});
