/** Reset header → epoch ms. Accepts an ISO date, epoch s/ms, or seconds-from-now. */
export function parseReset(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
    return Date.now() + n * 1000;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
