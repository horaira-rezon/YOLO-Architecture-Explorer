/** Python 3 `round()` (banker's rounding: ties go to the even integer). */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (Math.abs(diff - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

/** Ultralytics `make_divisible`: smallest multiple of `divisor` that is >= x. */
export function makeDivisible(x: number, divisor = 8): number {
  return Math.ceil(x / divisor - 1e-12) * divisor;
}

export function stableHash(text: string): string {
  // FNV-1a 32-bit, twice with different seeds → 16 hex chars. Fast and deterministic (not cryptographic).
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"));
}
