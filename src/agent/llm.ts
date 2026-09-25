import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({
  baseURL: config.llm.url,
  apiKey: config.llm.apiKey,
  timeout: config.llm.timeoutMs,
  maxRetries: 0, // the agent loop retries with backoff (AGENT_LLM_RETRIES)
});

export interface ToolSpec {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ParsedToolCall {
  id: string | null;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatResult {
  content: string | null;
  /** The model's native reasoning as plain text, if the endpoint returned any. */
  reasoning: string | null;
  /** Reasoning fields exactly as the endpoint returned them, to send back on the assistant message. */
  reasoningFields: Record<string, unknown>;
  toolCalls: ParsedToolCall[];
  usage: { prompt: number; completion: number; cached: number };
}

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export async function chat(
  messages: ChatMessage[],
  opts: { tools?: ToolSpec[]; temperature?: number } = {},
): Promise<ChatResult> {
  const completion = await client.chat.completions.create({
    model: config.llm.model,
    messages,
    temperature: opts.temperature ?? 0.2,
    ...(opts.tools?.length
      ? {
          tools: opts.tools.map(t => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: (t.parameters ?? { type: "object" }) as Record<string, unknown>,
            },
          })),
          tool_choice: "auto" as const,
        }
      : {}),
  } satisfies OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
  const msg = completion.choices[0]?.message;
  const toolCalls: ParsedToolCall[] = [];
  for (const tc of msg?.tool_calls ?? []) {
    if (tc.type !== "function") continue;
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(tc.function.arguments || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = { _unparsedArguments: tc.function.arguments };
    }
    toolCalls.push({ id: tc.id ?? null, name: tc.function.name, args });
  }
  const u = completion.usage;
  const r = extractReasoning(msg as unknown as Record<string, unknown> | undefined);
  return {
    content: r.content,
    reasoning: r.reasoning,
    reasoningFields: r.fields,
    toolCalls,
    usage: {
      prompt: u?.prompt_tokens ?? 0,
      completion: u?.completion_tokens ?? 0,
      cached: u?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}

// Non-standard fields OpenAI-compatible servers use for native reasoning:
// reasoning_content (DeepSeek, vLLM, Qwen, Kimi), reasoning (OpenRouter,
// Ollama, newer vLLM), reasoning_details (OpenRouter, structured) and thinking.
const REASONING_FIELDS = ["reasoning_content", "reasoning", "thinking", "reasoning_details"] as const;

function detailsText(details: unknown): string {
  if (!Array.isArray(details)) return "";
  return details
    .map(d => {
      if (!d || typeof d !== "object") return "";
      const o = d as { text?: unknown; summary?: unknown };
      if (typeof o.text === "string") return o.text;
      if (typeof o.summary === "string") return o.summary;
      return ""; // encrypted blocks carry no readable text
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Pulls the model's reasoning out of an assistant message. Also handles
 * servers that inline it in content as <think>…</think> (or leave only the
 * closing tag when the template opened it), returning content without it.
 */
export function extractReasoning(msg: Record<string, unknown> | undefined): {
  content: string | null;
  reasoning: string | null;
  fields: Record<string, unknown>;
} {
  const fields: Record<string, unknown> = {};
  let reasoning = "";
  for (const key of REASONING_FIELDS) {
    const v = msg?.[key];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && !v.length) continue;
    fields[key] = v;
    const text = key === "reasoning_details" ? detailsText(v) : typeof v === "string" ? v : "";
    // Servers often return the same text under two names; keep the first.
    if (!reasoning && text.trim()) reasoning = text.trim();
  }
  let content = typeof msg?.content === "string" ? msg.content : null;
  if (content) {
    const inline = content.match(/^\s*(?:<think>)?([\s\S]*?)<\/think>/);
    if (inline && (content.trimStart().startsWith("<think>") || !content.includes("<think>"))) {
      if (!reasoning && inline[1]!.trim()) reasoning = inline[1]!.trim();
      content = content.slice(inline[0].length).trim() || null;
    }
  }
  return { content, reasoning: reasoning || null, fields };
}

/** Timeouts, connection failures, 429 and 5xx are worth another attempt; 4xx request errors are not. */
export function isRetryableLlmError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /time(d)? ?out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|fetch failed|Connection error/i.test(msg);
}

// Lenient fallback for models/endpoints that answer in text instead of tool_calls.
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // fall through to bracket slicing
  }
  const start = t.search(/[[{]/);
  if (start < 0) throw new Error(`no JSON found in: ${t.slice(0, 120)}`);
  const openChar = t[start]!;
  const closeChar = openChar === "{" ? "}" : "]";
  const end = t.lastIndexOf(closeChar);
  if (end <= start) throw new Error(`unterminated JSON in: ${t.slice(0, 120)}`);
  return JSON.parse(t.slice(start, end + 1));
}
