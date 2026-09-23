import { api } from "./client/index.js";
import { transport } from "./transport/http.js";
import { chat } from "./agent/llm.js";
import { config } from "./config.js";

async function main() {
  console.log("== smoke: server status ==");
  const status = await api.status();
  console.log("status:", status.data["status"], "version:", status.data["version"]);

  console.log("\n== smoke: my agent ==");
  const { data: agent } = await api.myAgent();
  console.log(`agent ${agent.symbol}: ${agent.credits} credits, HQ ${agent.headquarters}, ${agent.shipCount} ships`);

  console.log("\n== smoke: fleet ==");
  const ships = await api.listShips(5, 1).then(r => r.data);
  for (const s of ships) {
    console.log(`  ${s.symbol} [${s.nav.status}] @ ${s.nav.waypointSymbol} fuel ${s.fuel.current}/${s.fuel.capacity} cargo ${s.cargo.units}/${s.cargo.capacity}`);
  }

  console.log("\n== smoke: rate headers ==");
  console.log(" ", JSON.stringify(transport.rate));

  console.log("\n== smoke: contracts ==");
  const contracts = await api.listContracts(5, 1).then(r => r.data);
  for (const c of contracts) {
    console.log(`  ${c.id.slice(0, 8)} ${c.type} accepted=${c.accepted} fulfilled=${c.fulfilled}`);
  }

  console.log("\n== smoke: LLM round-trip ==");
  const reply = await chat(
    [
      { role: "system", content: "You are a probe. Answer briefly." },
      { role: "user", content: "Reply with the single word: pong" },
    ],
    {
      tools: [
        {
          name: "ping_tool",
          description: "Signals completion",
          parameters: { type: "object", properties: {}, required: [] },
        },
      ],
    },
  );
  console.log("  content:", JSON.stringify(reply.content));
  console.log("  toolCalls:", JSON.stringify(reply.toolCalls));

  console.log("\n== smoke: LLM model config ==", config.llm.model);
  console.log("\nAll smoke checks passed.");
}

main().catch(err => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
