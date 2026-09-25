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

/** Whole seconds from now until an ISO timestamp (0 if past or unparseable). */
export function secondsUntil(iso: string | undefined | null): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - Date.now()) / 1000)) : 0;
}

/** Appended to transit/cooldown rejections so the agent stops retrying early. */
export const WAIT_HINT = "retrying before then is always rejected; the harness auto-wakes the ship then. Use wait_for_ship if it is under 2 min, otherwise work other ships or end_loop";

/** ", cooldown 70s" for tool summaries, so the agent sees the lockout before it tries the next action. */
export function cooldownNote(cd: Cooldown | undefined | null): string {
  return cd && cd.remainingSeconds > 0 ? `, cooldown ${cd.remainingSeconds}s` : "";
}

export function etaWakeAt(nav: ShipNav): number | undefined {
  if (!nav.route?.arrival) return undefined;
  const t = Date.parse(nav.route.arrival);
  return Number.isFinite(t) && t > Date.now() ? t + 2_000 : undefined;
}

export function clampWakeAt(t: number, minGapMs = 10_000): number {
  return Math.max(t, Date.now() + minGapMs);
}
