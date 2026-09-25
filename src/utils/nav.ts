import type { ShipNavFlightMode } from "../generated/types.js";

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// SpaceTraders fuel cost per flight mode. Kept deliberately lenient (no
// per-mode minimums) so a guard never blocks a route the API would accept —
// the API remains the final arbiter.
export function fuelCost(dist: number, mode: ShipNavFlightMode): number {
  const d = Math.round(dist);
  switch (mode) {
    case "DRIFT":
      return 1;
    case "BURN":
      return 2 * d;
    default:
      return d; // CRUISE, STEALTH
  }
}
