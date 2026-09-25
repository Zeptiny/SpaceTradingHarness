import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReasoning, isRetryableLlmError } from "./llm.js";

test("reasoning_content is captured and kept for echo", () => {
  const r = extractReasoning({ role: "assistant", content: "Docking NYUU-1.", reasoning_content: "Fuel is low, so dock first." });
  assert.equal(r.content, "Docking NYUU-1.");
  assert.equal(r.reasoning, "Fuel is low, so dock first.");
  assert.deepEqual(r.fields, { reasoning_content: "Fuel is low, so dock first." });
});

test("OpenRouter reasoning + reasoning_details: text taken once, both fields echoed", () => {
  const details = [
    { type: "reasoning.text", text: "Compare IRON_ORE prices." },
    { type: "reasoning.encrypted", data: "opaque" },
  ];
  const r = extractReasoning({ role: "assistant", content: null, reasoning: "Compare IRON_ORE prices.", reasoning_details: details });
  assert.equal(r.content, null);
  assert.equal(r.reasoning, "Compare IRON_ORE prices.");
  assert.deepEqual(r.fields, { reasoning: "Compare IRON_ORE prices.", reasoning_details: details });
});

test("reasoning_details alone yields text and summaries", () => {
  const r = extractReasoning({
    content: "",
    reasoning_details: [{ type: "reasoning.summary", summary: "Plan the route." }, { type: "reasoning.text", text: "Then refuel." }],
  });
  assert.equal(r.reasoning, "Plan the route.\n\nThen refuel.");
});

test("inline <think> blocks are split out of content", () => {
  const r = extractReasoning({ content: "<think>\nNeed fuel.\n</think>\n\nRefuel now." });
  assert.equal(r.reasoning, "Need fuel.");
  assert.equal(r.content, "Refuel now.");
  assert.deepEqual(r.fields, {});
});

test("template-opened think (only closing tag) is split too", () => {
  const r = extractReasoning({ content: "Need fuel.</think>[{\"tool\":\"refuel\"}]" });
  assert.equal(r.reasoning, "Need fuel.");
  assert.equal(r.content, "[{\"tool\":\"refuel\"}]");
});

test("plain content without reasoning is untouched", () => {
  const r = extractReasoning({ content: "Nothing to do." });
  assert.equal(r.content, "Nothing to do.");
  assert.equal(r.reasoning, null);
  assert.deepEqual(r.fields, {});
});

test("isRetryableLlmError: timeouts, 429 and 5xx retry; 4xx don't", () => {
  assert.equal(isRetryableLlmError(Object.assign(new Error("x"), { status: 429 })), true);
  assert.equal(isRetryableLlmError(Object.assign(new Error("x"), { status: 503 })), true);
  assert.equal(isRetryableLlmError(Object.assign(new Error("x"), { status: 400 })), false);
  assert.equal(isRetryableLlmError(new Error("Request timed out.")), true);
  assert.equal(isRetryableLlmError(new Error("fetch failed")), true);
  assert.equal(isRetryableLlmError(new Error("bad json")), false);
});
