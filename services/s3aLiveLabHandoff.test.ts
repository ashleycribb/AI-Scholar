import { afterEach, describe, expect, test } from 'bun:test';
import {
  checkS3ALocalHealth,
  isLiveLabHandoffAvailable,
  syncToS3ALocalLab,
  type S3ASnapshotPayload,
} from './s3aLiveLabHandoff';

const samplePayload: S3ASnapshotPayload = {
  query: 'test',
  papers: [{ title: 'A paper' }],
};

const hostedStudio = { protocol: 'https:', hostname: 'scholar-explorer.ai.studio' };

describe('live lab handoff origin detection', () => {
  test('allows live ingest only on localhost http (local dev)', () => {
    expect(isLiveLabHandoffAvailable({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(isLiveLabHandoffAvailable({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true);
    expect(isLiveLabHandoffAvailable({ protocol: 'http:', hostname: '[::1]' })).toBe(true);
    expect(isLiveLabHandoffAvailable({ protocol: 'http:', hostname: '::1' })).toBe(true);
  });

  test('does not allow live ingest from https or non-localhost hosts', () => {
    expect(isLiveLabHandoffAvailable(hostedStudio)).toBe(false);
    expect(isLiveLabHandoffAvailable({ protocol: 'https:', hostname: 'localhost' })).toBe(false);
    expect(isLiveLabHandoffAvailable({ protocol: 'https:', hostname: '127.0.0.1' })).toBe(false);
    expect(isLiveLabHandoffAvailable({ protocol: 'http:', hostname: 'example.com' })).toBe(false);
    expect(isLiveLabHandoffAvailable({ protocol: '', hostname: '' })).toBe(false);
  });
});

describe('no localhost fetch on https', () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  afterEach(() => {
    globalThis.fetch = originalFetch;
    calls.length = 0;
  });

  function installFetchSpy() {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('fetch should not be called from an https origin');
    }) as typeof fetch;
  }

  test('checkS3ALocalHealth does not fetch 127.0.0.1 from an https origin', async () => {
    installFetchSpy();
    await expect(checkS3ALocalHealth(hostedStudio)).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  test('syncToS3ALocalLab does not fetch 127.0.0.1 from an https origin', async () => {
    installFetchSpy();
    await expect(syncToS3ALocalLab(samplePayload, 'scholar_live_lab.s3a', hostedStudio)).rejects.toThrow(
      /only available when Scholar Explorer runs on http:\/\/localhost/
    );
    expect(calls).toEqual([]);
    expect(calls.some((u) => u.includes('127.0.0.1'))).toBe(false);
  });
});
