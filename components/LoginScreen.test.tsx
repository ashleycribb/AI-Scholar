import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginView, describeLoginError, type LoginViewState } from './LoginScreen';

const noop = () => {};
const render = (state: LoginViewState) => renderToStaticMarkup(
  <LoginView state={state} onEmailChange={noop} onSubmit={noop} onUseDifferentEmail={noop} onCheckNow={noop} onLogout={noop} onClose={noop} />
);

describe('LoginView states', () => {
  test('email step: one email field, no password, no role picker, no invite code, no guest shortcut', () => {
    const html = render({ step: 'email', email: '', busy: false });
    expect(html).toContain('type="email"');
    expect(html).toContain('Email me a sign-in link');
    expect(html).not.toMatch(/type="password"/);
    expect(html).not.toMatch(/Principal Investigator|Guest|Invite|Redeem/i);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Signing in is optional');
    expect(html).toContain('never put in study records');
  });

  test('busy: the button is disabled and says Sending', () => {
    const html = render({ step: 'email', email: 'a@b.edu', busy: true });
    expect(html).toContain('Sending');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  test('each request failure shows its own message and invalid_email marks the field', () => {
    const cases: [Parameters<typeof describeLoginError>[0], RegExp][] = [
      ['invalid_email', /valid email address/],
      ['rate_limited', /Too many sign-in requests/],
      ['not_configured', /not available on this server yet/],
      ['origin_not_allowed', /allowed list/],
      ['network', /Could not reach the server/],
      ['error', /Something went wrong/],
    ];
    for (const [error, re] of cases) {
      const html = render({ step: 'email', email: 'a@b.edu', busy: false, error });
      expect(html).toMatch(re);
      expect(html).toContain('role="alert"');
      expect(html.includes('aria-invalid="true"')).toBe(error === 'invalid_email');
    }
  });

  test('rate limit message uses the Retry-After hint', () => {
    expect(describeLoginError('rate_limited', 120)).toContain('2 minutes');
    expect(describeLoginError('rate_limited', 30)).toContain('1 minute.');
  });

  test('no failure message reveals whether an address is allowed to sign in', () => {
    for (const e of ['invalid_email', 'rate_limited', 'not_configured', 'origin_not_allowed', 'network', 'error'] as const) {
      expect(describeLoginError(e)).not.toMatch(/no account|not registered|unknown (user|address)|not authori[sz]ed|not on the (invite )?list/i);
    }
    expect(render({ step: 'sent', email: 'a@b.edu', message: 'If this address can sign in, a sign-in link has been emailed.', checking: false }))
      .toContain('If this address can sign in');
  });

  test('sent step: shows the address (escaped), the server message, and the check / change buttons', () => {
    const html = render({ step: 'sent', email: '<img src=x onerror=alert(1)>@evil.test', message: 'If this address can sign in, a sign-in link has been emailed.', checking: false });
    expect(html).toContain('Check your email');
    expect(html).toContain('I clicked the link');
    expect(html).toContain('Use a different email');
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&lt;img');
  });

  test('sent step while checking disables the check button', () => {
    const html = render({ step: 'sent', email: 'a@b.edu', message: 'm', checking: true });
    expect(html).toContain('Checking');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Checking/s);
  });

  test('signed-in step: shows the address and role from the session and offers sign out', () => {
    const html = render({ step: 'signed_in', user: { displayName: 'pi@uni.edu', email: 'pi@uni.edu', role: 'pi_researcher', serverRole: 'researcher' } });
    expect(html).toContain('You are signed in');
    expect(html).toContain('pi@uni.edu');
    expect(html).toContain('Researcher');
    expect(html).toContain('Sign out');
    expect(render({ step: 'signed_in', user: { displayName: 'Participant #AB12', role: 'participant', serverRole: 'participant' } })).toContain('Participant #AB12');
  });
});
