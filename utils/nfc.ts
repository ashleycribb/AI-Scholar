/**
 * Unicode NFC for stored text (data fix 7). The same name typed or fetched as composed ("é") or decomposed
 * ("e" + U+0301) must be stored as the same bytes, or exports, comparisons and hashes silently differ.
 */
export function nfcDeep<T>(value: T): T {
  if (typeof value === 'string') return value.normalize('NFC') as unknown as T;
  if (Array.isArray(value)) return value.map(v => nfcDeep(v)) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k.normalize('NFC')] = nfcDeep(v);
    return out as T;
  }
  return value;
}

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** True for an ISO-8601 UTC timestamp ending in Z, e.g. 2026-11-15T04:00:00.000Z. */
export function isUtcIso(s: unknown): s is string {
  return typeof s === 'string' && UTC_ISO.test(s) && !Number.isNaN(Date.parse(s));
}
