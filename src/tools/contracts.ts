import { api } from "../client/index.js";
import { config } from "../config.js";
import { earnings } from "../state/earnings.js";
import { observeAgent, upsertContract } from "../state/store.js";
import type { Contract } from "../generated/types.js";

/** Pure: every deliverable of an accepted, unfulfilled contract is complete. */
export function readyToFulfill(c: Contract): boolean {
  const deliver = c.terms.deliver ?? [];
  return c.accepted && !c.fulfilled && deliver.length > 0 && deliver.every(d => d.unitsFulfilled >= d.unitsRequired);
}

/**
 * Contract bookkeeping after a delivery (AGENT_AUTO_CONTRACTS): fulfil the
 * contract once its last delivery lands, then negotiate the next offer with
 * the delivering ship, which is docked at a faction waypoint. Accepting the
 * offer stays with the agent. Failures are reported, never thrown: the
 * delivery itself already succeeded.
 */
export async function autoFulfill(contract: Contract, shipSymbol: string): Promise<{ note: string | null; fulfilled?: Contract; offer?: Contract }> {
  if (!config.agent.autoContracts || !readyToFulfill(contract)) return { note: null };
  let fulfilled: Contract;
  try {
    const { data } = await api.fulfillContract(contract.id);
    observeAgent(data.agent);
    upsertContract(data.contract);
    earnings.record(shipSymbol, data.contract.terms.payment.onFulfilled, "contract");
    fulfilled = data.contract;
  } catch (err) {
    return { note: `auto-fulfil failed (${err instanceof Error ? err.message : err}); call fulfill_contract` };
  }
  const paid = `contract fulfilled (+${fulfilled.terms.payment.onFulfilled} cr)`;
  try {
    const { data } = await api.negotiateContract(shipSymbol);
    upsertContract(data.contract);
    const terms = (data.contract.terms.deliver ?? []).map(d => `${d.unitsRequired} ${d.tradeSymbol} → ${d.destinationSymbol}`).join(", ");
    const pay = data.contract.terms.payment;
    return {
      note: `${paid}; new offer ${data.contract.id} (${data.contract.type}: ${terms}; pays ${pay.onAccepted} + ${pay.onFulfilled}) — accept_contract if it pays`,
      fulfilled,
      offer: data.contract,
    };
  } catch (err) {
    return { note: `${paid}; negotiating the next one failed (${err instanceof Error ? err.message : err}) — negotiate_contract at a faction waypoint`, fulfilled };
  }
}
