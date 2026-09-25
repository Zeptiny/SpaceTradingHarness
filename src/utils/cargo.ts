/**
 * Pure planner for sell_all: which cargo to sell here (in tradeVolume-sized
 * calls, since one call can't move more than a good's tradeVolume), which to
 * throw away, and what stays in the hold.
 */
export interface MarketSide {
  symbol: string;
  type: string; // EXPORT | IMPORT | EXCHANGE
  tradeVolume: number;
  youGet: number;
}

export interface CargoPlan {
  sells: { symbol: string; units: number }[];
  jettison: { symbol: string; units: number }[];
  kept: { symbol: string; units: number; why: string }[];
}

export function planClearCargo(
  inventory: { symbol: string; units: number }[],
  market: MarketSide[] | null,
  opts: { goods?: string[] | undefined; keep?: string[] | undefined; jettison?: string[] | undefined } = {},
): CargoPlan {
  const plan: CargoPlan = { sells: [], jettison: [], kept: [] };
  for (const item of inventory) {
    if (item.units <= 0) continue;
    if (opts.keep?.includes(item.symbol)) {
      plan.kept.push({ ...item, why: "keep" });
      continue;
    }
    if (opts.goods && !opts.goods.includes(item.symbol)) {
      plan.kept.push({ ...item, why: "not listed" });
      continue;
    }
    const side = market?.find(m => m.symbol === item.symbol);
    const buysIt = !!side && (side.type === "IMPORT" || side.type === "EXCHANGE");
    if (buysIt) {
      const chunk = Math.max(1, side.tradeVolume);
      for (let left = item.units; left > 0; left -= chunk) plan.sells.push({ symbol: item.symbol, units: Math.min(chunk, left) });
    } else if (opts.jettison?.includes(item.symbol)) {
      plan.jettison.push({ ...item });
    } else {
      plan.kept.push({ ...item, why: market ? "market doesn't buy it" : "no market here" });
    }
  }
  return plan;
}
