import { config } from "./config.js";
import { startPanel } from "./panel/server.js";
import { startAgent } from "./agent/loop.js";
import { startSocketIngest } from "./events/socket.js";
import { startCollector } from "./state/collector.js";
import "./tools/read.js";
import "./tools/actions.js";
import "./tools/internal.js";
import "./tools/advanced.js";
import { bus } from "./events/bus.js";

process.on("unhandledRejection", reason => {
  console.error("[process] unhandled rejection:", reason);
});
process.on("uncaughtException", err => {
  console.error("[process] uncaught exception:", err);
  process.exit(1); // tsx watch / supervisor restarts us; state is checkpointed
});

bus.subscribe(e => {
  if (e.type === "ToolCalled" && e.outcome !== "ok") {
    console.log(`[tool] ${e.tool} → ${e.outcome}: ${e.summary}`);
  } else if (e.type === "AgentWoke" || e.type === "LoopSummary" || e.type === "GameEvent") {
    if (e.type !== "GameEvent") console.log(`[${e.type.toLowerCase()}]`, "reason" in e ? e.reason : "text" in e ? e.text : "");
  }
});

console.log(`[harness] base=${config.baseUrl} model=${config.llm.model} policy=${config.agent.policy}`);
startPanel();
startAgent();
void startSocketIngest();
startCollector();
