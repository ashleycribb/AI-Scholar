import { describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudyInviteBanner } from './StudyInviteBanner';

// The modal imports the S3A WASM service (a CDN module). Stub it so the test is
// offline, and record setConsent so we can prove nothing is granted by rendering.
const setConsentCalls: unknown[][] = [];
mock.module('../services/s3aWasmService', () => ({
  setConsent: async (...args: unknown[]) => { setConsentCalls.push(args); return true; },
  getConsentState: async () => 'none',
  getStudyId: async () => '',
}));
const { FirstRunConsentModal } = await import('./FirstRunConsentModal');

/** Depth-first search of a React element tree for elements of a given type. */
function findAll(node: any, type: string, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, type, out)); return out; }
  if (node.type === type) out.push(node);
  if (typeof node.type === 'function' && node.type !== React.Fragment) {
    // Function components in the banner tree are not used; recurse into props only.
  }
  findAll(node.props?.children, type, out);
  return out;
}

describe('StudyInviteBanner', () => {
  test('shows the study id and a Join study button, escaped', () => {
    const html = renderToStaticMarkup(
      <StudyInviteBanner studyId={'<img src=x onerror=alert(1)>'} onJoin={() => {}} onDismiss={() => {}} />
    );
    expect(html).toContain('Join study');
    expect(html).toContain('Nothing is recorded unless you join');
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&lt;img');
  });

  test('onJoin fires only from the Join study click, with the study id', () => {
    const joined: string[] = [];
    let dismissed = 0;
    // Rendering alone must not call anything.
    const tree = StudyInviteBanner({
      studyId: 'STUDY-7',
      onJoin: (id) => joined.push(id),
      onDismiss: () => { dismissed++; },
    }) as any;
    expect(joined).toEqual([]);
    const buttons = findAll(tree, 'button');
    expect(buttons.length).toBe(2);
    const join = buttons.find((b) => String(b.props.children).includes('Join study'));
    const later = buttons.find((b) => String(b.props.children).includes('Not now'));
    join.props.onClick();
    expect(joined).toEqual(['STUDY-7']);
    later.props.onClick();
    expect(dismissed).toBe(1);
  });
});

describe('FirstRunConsentModal', () => {
  test('renders nothing while isOpen is false, even when given an invite study id', () => {
    const html = renderToStaticMarkup(
      <FirstRunConsentModal isOpen={false} onClose={() => {}} initialStudyId="STUDY-7" />
    );
    expect(html).toBe('');
    expect(setConsentCalls).toEqual([]);
  });
});
