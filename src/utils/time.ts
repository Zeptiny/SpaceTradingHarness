import type { Cooldown, ShipNav } from "../generated/types.js";

export function now(): number {
  return Date.now();
}

export function cooldownWakeAt(cd: Cooldown | undefined | null): number | undefined {
  if (!cd) return undefined;
  if (cd.expiration) {
    const t = Date.parse(cd.expiration);
    if (Number.isFinite(t)) return t + 1_000;
  }
  if (cd.remainingSeconds > 0) return Date.now() + (cd.remainingSeconds + 1) * 1000;
  return undefined;
}

export function etaWakeAt(nav: ShipNav): number | undefined {
  if (!nav.route?.arrival) return undefined;
  const t = Date.parse(nav.route.arrival);
  return Number.isFinite(t) && t > Date.now() ? t + 2_000 : undefined;
}

export function clampWakeAt(t: number, minGapMs = 10_000): number {
  return Math.max(t, Date.now() + minGapMs);
}
