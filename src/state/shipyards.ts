import type { Shipyard } from "../generated/types.js";
import { loadJson, saveJsonAtomic, dataFile } from "./persist.js";

/**
 * Harness-local memory of ship offers seen at shipyards (like prices.ts for
 * markets). Prices are only revealed while one of our ships is at the
 * shipyard, so remembering them lets the agent plan purchases from anywhere.
 */
export interface ShipOffer {
  waypoint: string;
  type: string;
  price: number;
  supply: string;
  ts: number;
}

type Offers = Record<string, ShipOffer>; // key: `${waypoint}:${type}`

class ShipyardMemory {
  private offers: Offers = {};
  private file = dataFile("shipyards.json");

  constructor() {
    this.offers = loadJson<Offers>(this.file, {});
  }

  record(shipyard: Shipyard): void {
    const ships = shipyard.ships ?? [];
    if (!ships.length) return;
    const ts = Date.now();
    for (const s of ships) {
      this.offers[`${shipyard.symbol}:${s.type}`] = {
        waypoint: shipyard.symbol,
        type: s.type,
        price: s.purchasePrice,
        supply: s.supply,
        ts,
      };
    }
    saveJsonAtomic(this.file, this.offers);
  }

  /** Cheapest known offer per ship type, cheapest first. */
  cheapestByType(): ShipOffer[] {
    const best = new Map<string, ShipOffer>();
    for (const o of Object.values(this.offers)) {
      const cur = best.get(o.type);
      if (!cur || o.price < cur.price) best.set(o.type, o);
    }
    return [...best.values()].sort((a, b) => a.price - b.price);
  }
}

export const shipyards = new ShipyardMemory();
