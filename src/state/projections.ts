import type { Contract, Ship } from "../generated/types.js";

export function compactShip(s: Ship) {
  return {
    symbol: s.symbol,
    nav: { status: s.nav.status, waypoint: s.nav.waypointSymbol, system: s.nav.systemSymbol, flightMode: s.nav.flightMode },
    fuel: s.fuel,
    cargo: s.cargo,
    cooldown: s.cooldown,
    crew: s.crew,
    mounts: s.mounts.map(m => m.symbol),
    modules: s.modules.map(m => m.symbol),
  };
}

export function contractProgress(c: Contract): string {
  return (c.terms.deliver ?? [])
    .map(d => `${d.tradeSymbol}:${d.unitsFulfilled}/${d.unitsRequired}`)
    .join(" ");
}

export function contractSummary(c: Contract) {
  return {
    id: c.id,
    type: c.type,
    faction: c.factionSymbol,
    accepted: c.accepted,
    fulfilled: c.fulfilled,
    expired: !!c.expiration && Date.parse(c.expiration) < Date.now(),
    expiration: c.expiration,
    deadlineToAccept: c.deadlineToAccept,
    payment: c.terms.payment,
    deliverables: (c.terms.deliver ?? []).map(d => ({
      symbol: d.tradeSymbol,
      destination: d.destinationSymbol,
      fulfilled: d.unitsFulfilled,
      required: d.unitsRequired,
    })),
  };
}
