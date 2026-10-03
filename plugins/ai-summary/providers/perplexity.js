import { withExtras } from "./headers.js";
import { readSse } from "./sse.js";
import {
  ChatRole,
  ChunkKind,
  PERPLEXITY_PRESETS,
  ProviderId,
} from "./types.js";

const LOG_NS = "ai-summary:perplexity";

const TEXT_DELTA = "response.output_text.delta";
const THINKING_DELTAS = new Set([
  "response.reasoning_text.delta",
  "response.reasoning_summary_text.delta",
]);
const COMPLETED = "response.completed";
const INCOMPLETE = "response.incomplete";
const FAILED = "response.failed";
const ERROR = "error";

const toAgentInput = (messages) => {
  let instructions = "";
  const input = [];
  for (const m of messages) {
    if (m.role === ChatRole.System) {
      instructions += (instructions ? "\n\n" : "") + m.content;
      continue;
    }
    input.push({
      type: "message",
      role: m.role === ChatRole.Assistant ? "assistant" : "user",
      content: m.content,
    });
  }
  return { instructions, input };
};

const buildBody = (config, messages, opts) => {
  const { instructions, input } = toAgentInput(messages);
  const model = (config.model ?? "").trim();
  const body = {
    input,
    stream: true,
    max_output_tokens: opts.maxTokens,
  };
  if (PERPLEXITY_PRESETS.includes(model)) body.preset = model;
  else body.model = model;
  if (instructions) body.instructions = instructions;
  if (opts.enableThinking) body.reasoning = { effort: "medium" };
  return body;
};

const callPerplexity = (config, messages, opts) => {
  const endpoint = (config.baseUrl ?? "").trim().replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  return fetch(endpoint, {
    method: "POST",
    headers: withExtras(headers, config),
    body: JSON.stringify(buildBody(config, messages, opts)),
    signal: opts.signal,
  });
};

const errorMessage = (payload) =>
  payload?.response?.error?.message || payload?.error?.message || payload?.message || "";

export const streamPerplexity = async function* (config, messages, opts) {
  let res;
  try {
    res = await callPerplexity(config, messages, opts);
  } catch (err) {
    console.warn(LOG_NS, "request failed", err);
    yield { kind: ChunkKind.Error, message: "AI request failed" };
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    console.warn(LOG_NS, `bad response ${res.status}`, text.slice(0, 200));
    yield { kind: ChunkKind.Error, message: `Provider returned ${res.status}` };
    return;
  }
  let finishReason;
  let textOut = false;
  for await (const ev of readSse(res.body)) {
    if (ev.data === "[DONE]") break;
    let payload;
    try {
      payload = JSON.parse(ev.data);
    } catch {
      continue;
    }
    const type = ev.event || payload?.type;
    if (type === TEXT_DELTA && typeof payload.delta === "string" && payload.delta) {
      textOut = true;
      yield { kind: ChunkKind.Text, text: payload.delta };
    } else if (THINKING_DELTAS.has(type) && typeof payload.delta === "string" && payload.delta) {
      yield { kind: ChunkKind.Thinking, text: payload.delta };
    } else if (type === COMPLETED) {
      finishReason = "stop";
      break;
    } else if (type === INCOMPLETE) {
      const reason = payload?.response?.incomplete_details?.reason;
      finishReason = reason === "max_output_tokens" ? "length" : reason || "incomplete";
      break;
    } else if (type === FAILED || type === ERROR) {
      const message = errorMessage(payload);
      console.warn(LOG_NS, "stream failed", message.slice(0, 200));
      yield { kind: ChunkKind.Error, message: message ? `Perplexity: ${message}` : "Perplexity request failed" };
      return;
    }
  }
  if (!textOut) {
    console.warn(LOG_NS, "no text emitted", { finishReason });
  }
  yield { kind: ChunkKind.Done, finishReason };
};

export const perplexityAdapter = {
  id: ProviderId.Perplexity,
  stream: streamPerplexity,
};
