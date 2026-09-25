import { api } from "../client/index.js";
import { upsertShip } from "../state/store.js";
import type { Ship } from "../generated/types.js";

// Auto nav-state transitions: tools that need DOCKED or IN_ORBIT switch the
// ship themselves instead of costing the agent a separate dock/orbit action
// and LLM round. Callers run under the ship lock with the guard-fetched ship.

export async function ensureDocked(symbol: string, ship: Ship | undefined): Promise<void> {
  if (ship?.nav.status !== "IN_ORBIT") return;
  const { data } = await api.dock(symbol);
  ship.nav = data.nav;
  upsertShip(ship);
}

export async function ensureOrbit(symbol: string, ship: Ship | undefined): Promise<void> {
  if (ship?.nav.status !== "DOCKED") return;
  const { data } = await api.orbit(symbol);
  ship.nav = data.nav;
  upsertShip(ship);
}
