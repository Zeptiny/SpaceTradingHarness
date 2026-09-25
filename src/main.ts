import { config } from "./config.js";
import { startPanel } from "./panel/server.js";
import { startAgent } from "./agent/loop.js";
import { startSocketIngest } from "./events/socket.js";
import { startCollector } from "./state/collector.js";
import "./tools/read.js";
import "./tools/actions.js";
import "./tools/internal.js";
import "./tools/advanced.js";
import "./tools/routines.js";
import { startRoutines } from "./routines/engine.js";
import { bus } from "./events/bus.js";
import { mirror } from "./state/store.js";
import { usage } from "./state/usage.js";
import { dataFile } from "./state/persist.js";

// Writes the stores that batch their saves, so a stop or crash keeps the last seconds too.
function flushState(): void {
  try {
    mirror.flush();
    usage.flush();
  } catch (err) {
    console.error("[process] flush on exit failed:", err);
  }
}

process.on("unhandledRejection", reason => {
  console.error("[process] unhandled rejection:", reason);
});
process.on("uncaughtException", err => {
  console.error("[process] uncaught exception:", err);
  flushState();
  process.exit(1); // tsx watch / supervisor restarts us; state is checkpointed
});

bus.subscribe(e => {
  if (e.type === "ToolCalled" && e.outcome !== "ok") {
    console.log(`[tool] ${e.tool} → ${e.outcome}: ${e.summary}`);
  } else if (e.type === "AgentWoke" || e.type === "LoopSummary" || e.type === "GameEvent") {
    if (e.type !== "GameEvent") console.log(`[${e.type.toLowerCase()}]`, "reason" in e ? e.reason : "text" in e ? e.text : "");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    flushState();
    process.exit(0);
  });
}

console.log(`[harness] base=${config.baseUrl} model=${config.llm.model} policy=${config.agent.policy}`);
mirror.restore(dataFile("mirror.json"));
startPanel();
startAgent();
void startSocketIngest();
startCollector();
startRoutines();
