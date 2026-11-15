/**
 * Fix 8: the S3A engine ships with the app. With every CDN blocked, the engine binary still loads from the app's
 * own origin, passes its pinned SHA-256, and runs; a changed binary is refused.
 */
import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';

const s3a = await import('./s3aWasmService');

const LOCAL_WASM = path.resolve('public/s3a_wasm_snapshot_bg.wasm');
const BLOCKED_HOSTS = /(^|\.)(jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|cdn\.tailwindcss\.com|esm\.sh)$/;

/** A browser fetch with the CDNs blocked: same-origin paths are served from public/, CDN hosts fail like a block. */
function fetchWithCdnBlocked(served: Uint8Array = fs.readFileSync(LOCAL_WASM)) {
  const requested: string[] = [];
  const impl = async (url: string) => {
    requested.push(url);
    const u = new URL(url, 'https://scholar.example');
    if (BLOCKED_HOSTS.test(u.hostname)) throw new TypeError('Failed to fetch (blocked)');
    if (u.hostname === 'scholar.example' && u.pathname === s3a.S3A_ENGINE_WASM_URL) return new Response(served, { status: 200 });
    return new Response('not found', { status: 404 });
  };
  return { impl, requested };
}

describe('S3A engine without a CDN', () => {
  test('no app source imports code from a URL', () => {
    const roots = ['App.tsx', 'index.tsx', 'services', 'components', 'utils'];
    const offenders: string[] = [];
    const walk = (p: string) => {
      const st = fs.statSync(p);
      if (st.isDirectory()) { for (const n of fs.readdirSync(p)) if (n !== 'node_modules') walk(path.join(p, n)); return; }
      if (!/\.(ts|tsx|js)$/.test(p) || /\.test\.(ts|tsx)$/.test(p)) return;
      const src = fs.readFileSync(p, 'utf8');
      if (/(?:from\s*|import\s*\(\s*)["']https?:\/\//.test(src)) offenders.push(p);
    };
    roots.forEach(r => walk(path.resolve(r)));
    expect(offenders).toEqual([]);
  });

  test('the bundled binary is the pinned v0.1.56 build', () => {
    const info = fs.readFileSync(path.resolve('services/wasm/BUILD_INFO.txt'), 'utf8');
    expect(info).toContain(`version: ${s3a.S3A_ENGINE_VERSION}`);
    expect(info).toContain(`sha256(s3a_wasm_snapshot_bg.wasm): ${s3a.S3A_ENGINE_WASM_SHA256}`);
    expect(fs.readFileSync(LOCAL_WASM).equals(fs.readFileSync(path.resolve('services/wasm/s3a_wasm_snapshot_bg.wasm')))).toBe(true);
  });

  test('with CDNs blocked the engine loads from the app origin, verifies, and runs', async () => {
    const { impl, requested } = fetchWithCdnBlocked();
    const bytes = await s3a.loadVerifiedEngineBytes(impl);
    expect(requested).toEqual([s3a.S3A_ENGINE_WASM_URL]);
    // A fresh copy of the bundled engine glue, instantiated only from those bytes.
    const engine = await import(`./wasm/s3a_wasm_snapshot.js?cdn-blocked=1`);
    await engine.default({ module_or_path: bytes });
    const snap = engine.new_session('018f3a54629a7a1a9f5b333333333333');
    expect(snap.add_paper('W2741809807', '10.7717/peerj.4375', 2018, 900, 0)).toBe(0);
    const reloaded = engine.from_bytes(snap.export_bytes());
    expect(reloaded).toBeDefined();
    expect(engine.verb_id_for_iri('viewed')).toBe(12);
  });

  test('the service itself initializes with CDNs blocked (global fetch blocked for every CDN host)', async () => {
    const realFetch = globalThis.fetch;
    const { impl } = fetchWithCdnBlocked();
    globalThis.fetch = ((input: RequestInfo | URL) => impl(String(input))) as typeof fetch;
    try {
      await s3a.initS3AWasm();
      const bytes = (await import('./wasm/s3a_wasm_snapshot.js')).new_session('018f3a54629a7a1a9f5b444444444444').export_bytes();
      await expect(s3a.parseParticipantSnapshot(bytes)).resolves.toBeDefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('a changed or missing engine binary is refused, never run', async () => {
    const good = fs.readFileSync(LOCAL_WASM);
    const tampered = new Uint8Array(good);
    tampered[tampered.length - 1] ^= 0xff;
    await expect(s3a.loadVerifiedEngineBytes(fetchWithCdnBlocked(tampered).impl)).rejects.toThrow(s3a.EngineIntegrityError);
    await expect(s3a.loadVerifiedEngineBytes(fetchWithCdnBlocked().impl, '/missing.wasm')).rejects.toThrow(/HTTP 404/);
  });
});
