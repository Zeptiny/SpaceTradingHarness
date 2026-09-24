import { test } from "node:test";
import assert from "node:assert/strict";
import { compactMarket, contractSummary, isContractOpen } from "./projections.js";
import type { Contract, Market, TradeSymbol } from "../generated/types.js";

const good = (symbol: TradeSymbol) => ({
  symbol,
  name: symbol.toLowerCase(),
  description: "A long prose description of this good that the agent never needs to decide on. ".repeat(3),
});

const market: Market = {
  symbol: "X1-AB12-A1",
  exports: (["IRON", "COPPER", "ALUMINUM", "FUEL"] as const).map(good),
  imports: (["ICE_WATER", "QUARTZ_SAND", "SILICON_CRYSTALS", "AMMONIA_ICE", "PRECIOUS_STONES", "ELECTRONICS"] as const).map(good),
  exchange: [good("MACHINERY")],
  transactions: Array.from({ length: 20 }, (_, i) => ({
    waypointSymbol: "X1-AB12-A1",
    shipSymbol: `OTHER-${i}`,
    tradeSymbol: "IRON",
    type: "SELL" as const,
    units: 10,
    pricePerUnit: 100,
    totalPrice: 1000,
    timestamp: "2026-09-24T10:00:00.000Z",
  })),
  tradeGoods: (["IRON", "COPPER", "ALUMINUM", "FUEL", "ICE_WATER", "QUARTZ_SAND", "SILICON_CRYSTALS", "AMMONIA_ICE", "PRECIOUS_STONES", "ELECTRONICS", "MACHINERY"] as const)
    .map((symbol, i) => ({
      symbol,
      type: i < 4 ? "EXPORT" as const : i < 10 ? "IMPORT" as const : "EXCHANGE" as const,
      tradeVolume: 60,
      supply: "MODERATE" as const,
      activity: "WEAK" as const,
      purchasePrice: 100 + i,
      sellPrice: 90 + i,
    })),
};

test("compact market keeps every price well inside the tool-result cap", () => {
  const raw = JSON.stringify(market);
  const compact = compactMarket(market);
  const json = JSON.stringify(compact);
  assert.ok(raw.length > 8_000, `fixture should be large (was ${raw.length})`);
  assert.ok(json.length < 2_000, `compact market too large: ${json.length}`);
  assert.ok("tradeGoods" in compact);
  assert.equal(compact.tradeGoods.length, 11);
  assert.deepEqual(compact.tradeGoods[0], {
    symbol: "IRON", type: "EXPORT", supply: "MODERATE", activity: "WEAK", purchasePrice: 100, sellPrice: 90, tradeVolume: 60,
  });
});

test("compact market without a ship present lists goods and says why prices are missing", () => {
  const { tradeGoods: _drop, ...noPrices } = market;
  const compact = compactMarket(noPrices);
  assert.ok("exports" in compact);
  assert.deepEqual(compact.exports, ["IRON", "COPPER", "ALUMINUM", "FUEL"]);
  assert.match(compact.note, /ship/);
});

const contract = (over: Partial<Contract> & { deadline: string }): Contract => ({
  id: "c1",
  factionSymbol: "COSMIC",
  type: "PROCUREMENT",
  accepted: false,
  fulfilled: false,
  expiration: over.expiration ?? over.deadline,
  terms: { deadline: over.deadline, payment: { onAccepted: 1000, onFulfilled: 9000 }, deliver: [] },
  ...over,
});

test("an accepted contract past its accept-by time is still open until its delivery deadline", () => {
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  const c = contract({ accepted: true, deadline: future, deadlineToAccept: past, expiration: past });
  assert.equal(isContractOpen(c), true);
  assert.equal(contractSummary(c).expired, false);
});

test("an unaccepted offer past deadlineToAccept is expired", () => {
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const c = contract({ deadline: future, deadlineToAccept: past });
  assert.equal(isContractOpen(c), false);
  assert.equal(contractSummary(c).expired, true);
});
