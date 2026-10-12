// Demo-only bootstrap. Metro resolves the real packages/shared/canonical.ts when it arrives.
// Live builds explicitly fail if that file is absent.
export function canonicalJSON(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (Array.isArray(v)) return v.map(canonical);
    if (typeof v === 'object' && v && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((key) => [key, canonical((v as Record<string, unknown>)[key])]),
      );
    }
    throw new Error('Canonical JSON needs plain JSON values.');
  }
  return JSON.stringify(canonical(value));
}
