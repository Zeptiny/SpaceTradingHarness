import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({
  baseURL: config.llm.url,
  apiKey: config.llm.apiKey,
  timeout: config.llm.timeoutMs,
  maxRetries: 1,
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
  return {
    content: msg?.content ?? null,
    toolCalls,
    usage: {
      prompt: u?.prompt_tokens ?? 0,
      completion: u?.completion_tokens ?? 0,
      cached: u?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
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
