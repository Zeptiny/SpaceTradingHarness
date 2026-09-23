import type { ZodType } from "zod";
import { z } from "zod";
import type { FreshReader, Guard } from "../guards/index.js";

export type ToolKind = "read" | "action" | "internal";

export interface ToolResult {
  summary: string;
  result: unknown;
  followUpWakeAt?: number | undefined;
  followUpReason?: string | undefined;
}

export interface ToolContext {
  shipLock: (symbol: string) => Promise<() => void>;
  fresh: FreshReader;
}

export interface ToolDefinition<A = Record<string, unknown>> {
  name: string;
  description: string;
  kind: ToolKind;
  input: ZodType<A>;
  guards?: Guard[];
  rateCost: number; // estimated API requests (0 for internal)
  handler: (args: A, ctx: ToolContext) => Promise<ToolResult>;
}

const registry = new Map<string, ToolDefinition<any>>();

export function registerTool(tool: ToolDefinition<any>): void {
  if (registry.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition<any> | undefined {
  return registry.get(name);
}

export function allTools(): ToolDefinition<any>[] {
  return [...registry.values()];
}

let cachedCatalog: { json: unknown; string: string; tools: { name: string; description: string; parameters: unknown }[] } | null = null;

function buildCatalog() {
  const json = allTools().map(t => ({
    name: t.name,
    description: t.description,
    kind: t.kind,
    rateCost: t.rateCost,
    input: schemaHint(t.input),
  }));
  const tools = allTools().map(t => ({
    name: t.name,
    description: t.description,
    parameters: schemaHint(t.input),
  }));
  return { json, string: JSON.stringify(json), tools };
}

function schemaHint(input: ZodType<any>): unknown {
  try {
    return z.toJSONSchema(input, { io: "input" });
  } catch {
    return { type: "object" };
  }
}

export function toolCatalogJson(): unknown {
  if (!cachedCatalog) cachedCatalog = buildCatalog();
  return cachedCatalog.json;
}

export function toolCatalogString(): string {
  if (!cachedCatalog) cachedCatalog = buildCatalog();
  return cachedCatalog.string;
}

export function toolSpecs(): { name: string; description: string; parameters: unknown }[] {
  if (!cachedCatalog) cachedCatalog = buildCatalog();
  return cachedCatalog.tools;
}
