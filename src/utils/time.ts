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

// ---- Agent-facing time format ----
// Every time the model sees is UTC ISO-8601 to the second ("2026-09-25T15:08:40Z")
// next to a relative value ("in 42s", "3m 05s ago") computed when the text is
// built, so the model never has to subtract timestamps itself.

/** Epoch ms → "2026-09-25T15:08:40Z" (UTC, no milliseconds). */
export function isoSec(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

/** Signed duration → "in 42s" / "3m 05s ago" / "in 2h 10m" / "now". */
export function relTime(targetMs: number, nowMs = Date.now()): string {
  const d = Math.round((targetMs - nowMs) / 1000);
  if (d === 0) return "now";
  const s = Math.abs(d);
  const txt = s < 60 ? `${s}s`
    : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
    : s < 86_400 ? `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`
    : `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
  return d > 0 ? `in ${txt}` : `${txt} ago`;
}

/** ISO string or epoch ms → "2026-09-25T15:08:40Z (in 42s)"; "unknown" if unparseable. */
export function stamp(t: string | number | undefined | null, nowMs = Date.now()): string {
  const ms = typeof t === "number" ? t : t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? `${isoSec(ms)} (${relTime(ms, nowMs)})` : "unknown";
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Deep copy of a tool result / working memory with every ISO timestamp
 * property trimmed to the second and given a `<key>Rel` sibling. Objects with
 * a `signature` (surveys) keep their raw strings: they are sent back to the
 * API verbatim. A `remainingSeconds` next to an `expiration` is recomputed,
 * since a cached ship object's countdown is frozen at fetch time.
 */
export function annotateTimes<T>(v: T, nowMs = Date.now()): T {
  if (Array.isArray(v)) return v.map(x => annotateTimes(x, nowMs)) as T;
  if (v === null || typeof v !== "object") return v;
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const verbatim = "signature" in src;
  for (const [k, x] of Object.entries(src)) {
    out[k] = annotateTimes(x, nowMs);
    if (typeof x === "string" && ISO_RE.test(x) && !(`${k}Rel` in src)) {
      const ms = Date.parse(x);
      if (!Number.isFinite(ms)) continue;
      if (!verbatim) out[k] = isoSec(ms);
      out[`${k}Rel`] = relTime(ms, nowMs);
    }
  }
  if (typeof src["remainingSeconds"] === "number" && typeof src["expiration"] === "string") {
    const ms = Date.parse(src["expiration"]);
    if (Number.isFinite(ms)) out["remainingSeconds"] = Math.max(0, Math.ceil((ms - nowMs) / 1000));
  }
  return out as T;
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
