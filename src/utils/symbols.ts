export interface WaypointId {
  full: string;
  system: string;
}

export function parseWaypointSymbol(symbol: string): WaypointId | null {
  const m = /^([A-Z0-9]+-[A-Z0-9]+)-([A-Z0-9]+)$/.exec(symbol);
  if (!m) return null;
  return { full: symbol, system: m[1]! };
}

export function systemOf(waypointSymbol: string): string {
  const parsed = parseWaypointSymbol(waypointSymbol);
  return parsed?.system ?? waypointSymbol;
}

export function splitWaypoint(symbol: string): { system: string; waypoint: string } | null {
  const parsed = parseWaypointSymbol(symbol);
  return parsed ? { system: parsed.system, waypoint: symbol } : null;
}
