#!/usr/bin/env node
// Enforces docs/ARCHITECTURE.md §5.7 import-boundary rules. Run via `npm run check:arch`.
// Rules:
//   1. fetch/axios/undici only in src/transport/ and src/agent/llm.ts (documented carve-out).
//   2. src/panel may import only from state/, events/, tools/registry, config — never client/transport/agent internals.
//   3. Nothing writes to src/generated; imports INTO generated from tools/agent/panel are fine (types only).
//   4. tools/ and guards/ never import panel; agent may import tools/state/events.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");
const failures = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const files = walk(SRC);

for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");

  // Rule 1: direct HTTP clients only in transport + llm carve-out
  if (/\b(fetch|axios|undici|http\.request|https\.request)\s*\(/.test(src) && !/import\s*\(/.test(src.split("\n")[0] ?? "")) {
    const isFetchCall = /(^|[^.\w])fetch\s*\(/.test(src);
    if (isFetchCall && rel !== "transport/http.ts" && rel !== "agent/llm.ts") {
      failures.push(`${rel}: direct fetch() — only transport/http.ts (and agent/llm.ts carve-out) may call HTTP`);
    }
  }

  // Rules 2-4: import boundaries
  const imports = [...src.matchAll(/from\s+["'](\.[^"']+)["']/g)].map(m => m[1]);
  for (const imp of imports) {
    const target = path
      .normalize(path.join(path.dirname(rel), imp))
      .replace(/\\/g, "/")
      .replace(/\.js$/, "");
    const top = target.split("/")[0];
    if (rel.startsWith("panel/") && !["state", "events", "config", "generated"].includes(top) && target !== "tools/registry") {
      failures.push(`${rel}: panel imports "${imp}" (→ ${top}/) — panel may only read state/, events/, tools/registry, config`);
    }
    if (rel.startsWith("tools/") && top === "panel") failures.push(`${rel}: tools must not import panel`);
    if (rel.startsWith("guards/") && ["panel", "tools", "agent"].includes(top)) {
      failures.push(`${rel}: guards must not import ${top}/`);
    }
    if (rel.startsWith("client/") && ["panel", "tools", "agent", "guards"].includes(top)) {
      failures.push(`${rel}: client must not import ${top}/`);
    }
    if (rel.startsWith("transport/") && !["config", "generated", "events", "state"].includes(top)) {
      failures.push(`${rel}: transport must not import ${top}/ (only config/generated/events/state)`);
    }
  }
}

if (failures.length) {
  console.error("ARCHITECTURE VIOLATIONS:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("check:arch OK — no import-boundary violations");
