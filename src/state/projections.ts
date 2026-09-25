import type { Contract, Faction, Market, Ship, ShipCargo, Shipyard, Waypoint } from "../generated/types.js";

// Compact projections shared by tool results, working memory and the panel.
// They drop prose (names/descriptions) and third-party logs so the data the
// agent actually decides on survives the tool-result size cap.

export function compactCargo(c: ShipCargo) {
  return {
    units: c.units,
    capacity: c.capacity,
    inventory: c.inventory.map(i => ({ symbol: i.symbol, units: i.units })),
  };
}

export function compactShip(s: Ship) {
  const route = s.nav.status === "IN_TRANSIT" && s.nav.route
    ? {
        route: {
          from: s.nav.route.origin.symbol,
          to: s.nav.route.destination.symbol,
          departed: s.nav.route.departureTime,
          arrival: s.nav.route.arrival,
        },
      }
    : {};
  return {
    symbol: s.symbol,
    role: s.registration?.role,
    frame: s.frame?.symbol,
    speed: s.engine?.speed,
    nav: { status: s.nav.status, waypoint: s.nav.waypointSymbol, system: s.nav.systemSymbol, flightMode: s.nav.flightMode, ...route },
    fuel: { current: s.fuel.current, capacity: s.fuel.capacity },
    cargo: compactCargo(s.cargo),
    cooldown: s.cooldown && s.cooldown.remainingSeconds > 0
      ? { remainingSeconds: s.cooldown.remainingSeconds, expiration: s.cooldown.expiration }
      : null,
    mounts: s.mounts.map(m => m.symbol),
    modules: s.modules.map(m => m.symbol),
  };
}

// Prices are named from the agent's side: youPay is what the market charges
// you to buy one unit (API purchasePrice), youGet is what it pays you per unit
// you sell (API sellPrice). The API names read backwards to models.
export function compactMarket(m: Market) {
  if (m.tradeGoods?.length) {
    return {
      symbol: m.symbol,
      tradeGoods: m.tradeGoods.map(g => ({
        symbol: g.symbol,
        type: g.type,
        supply: g.supply,
        activity: g.activity,
        youPay: g.purchasePrice,
        youGet: g.sellPrice,
        tradeVolume: g.tradeVolume,
      })),
    };
  }
  return {
    symbol: m.symbol,
    exports: m.exports.map(g => g.symbol),
    imports: m.imports.map(g => g.symbol),
    exchange: m.exchange.map(g => g.symbol),
    note: "no ship present — prices are only visible while one of your ships is at this waypoint",
  };
}

export function compactShipyard(y: Shipyard) {
  if (y.ships?.length) {
    return {
      symbol: y.symbol,
      modificationsFee: y.modificationsFee,
      ships: y.ships.map(s => ({
        type: s.type,
        price: s.purchasePrice,
        supply: s.supply,
        frame: s.frame.symbol,
        speed: s.engine.speed,
        fuelCapacity: s.frame.fuelCapacity,
        mounts: s.mounts.map(m => m.symbol),
        modules: s.modules.map(m => m.symbol),
      })),
    };
  }
  return {
    symbol: y.symbol,
    modificationsFee: y.modificationsFee,
    shipTypes: y.shipTypes.map(t => t.type),
    note: "no ship present — prices are only visible while one of your ships is at this waypoint",
  };
}

export function compactWaypoint(w: Waypoint) {
  return {
    symbol: w.symbol,
    type: w.type,
    x: w.x,
    y: w.y,
    traits: w.traits.map(t => t.symbol),
    orbitals: w.orbitals.map(o => o.symbol),
    orbits: w.orbits,
    faction: w.faction?.symbol,
    modifiers: w.modifiers?.map(m => m.symbol),
    isUnderConstruction: w.isUnderConstruction,
  };
}

export function compactFaction(f: Faction) {
  return {
    symbol: f.symbol,
    name: f.name,
    headquarters: f.headquarters,
    isRecruiting: f.isRecruiting,
    traits: f.traits.map(t => t.symbol),
  };
}

export function contractSummary(c: Contract) {
  return {
    id: c.id,
    type: c.type,
    faction: c.factionSymbol,
    accepted: c.accepted,
    fulfilled: c.fulfilled,
    expired: !c.fulfilled && isContractExpired(c),
    deadline: c.terms.deadline,
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

// Offers expire at deadlineToAccept; accepted contracts at terms.deadline.
function isContractExpired(c: Contract): boolean {
  const cutoff = c.accepted ? c.terms.deadline : (c.deadlineToAccept ?? c.expiration);
  return !!cutoff && Date.parse(cutoff) < Date.now();
}

export function isContractOpen(c: Contract): boolean {
  return !c.fulfilled && !isContractExpired(c);
}

/**
 * One line per ship for the live fleet table the loop appends after every
 * round: where each ship is, what it holds, and when it can act. Keeps the
 * agent from acting on ships still in flight after older results were trimmed.
 */
export function fleetTable(
  ships: Ship[],
  routineOf: (ship: string) => { description: string; phase: string } | undefined,
  now = Date.now(),
): string {
  const secs = (iso: string | undefined) => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : 0;
  };
  return ships.map(s => {
    const frame = (s.frame?.symbol ?? "").replace(/^FRAME_/, "");
    const where = s.nav.status === "IN_TRANSIT"
      ? `IN_TRANSIT ${s.nav.route.origin.symbol} → ${s.nav.route.destination.symbol}, arrives in ${secs(s.nav.route.arrival)}s`
      : `${s.nav.status} @ ${s.nav.waypointSymbol}`;
    const goods = s.cargo.inventory.filter(i => i.units > 0).map(i => `${i.symbol}:${i.units}`).join(",");
    const cd = secs(s.cooldown?.expiration);
    const state = s.nav.status === "IN_TRANSIT" ? "" : cd > 0 ? ` | cooldown ${cd}s` : " | ready";
    const r = routineOf(s.symbol);
    const routine = r ? ` | routine: ${r.description} (${r.phase})` : "";
    const fuel = s.fuel.capacity > 0 ? ` | fuel ${s.fuel.current}/${s.fuel.capacity}` : "";
    return `${s.symbol} ${frame} | ${where} | cargo ${s.cargo.units}/${s.cargo.capacity}${goods ? ` ${goods}` : ""}${fuel}${state}${routine}`;
  }).join("\n");
}
