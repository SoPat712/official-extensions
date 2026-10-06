export const ProviderId = Object.freeze({
  Ollama: "ollama",
  LlamaCpp: "llama-cpp",
  LmStudio: "lm-studio",
  Vllm: "vllm",
  OpenAICompat: "openai-compat",
});

export const PROVIDER_LABELS = Object.freeze({
  [ProviderId.Ollama]: "Ollama",
  [ProviderId.LlamaCpp]: "llama.cpp",
  [ProviderId.LmStudio]: "LM Studio",
  [ProviderId.Vllm]: "vLLM",
  [ProviderId.OpenAICompat]: "OpenAI-compatible",
});

const PROBE_TIMEOUT_MS = 2000;
const LIST_TIMEOUT_MS = 8000;

const PROBES = [
  { id: ProviderId.Ollama, path: "/api/version", ok: (d) => typeof d?.version === "string" },
  { id: ProviderId.LmStudio, path: "/api/v0/models", ok: (d) => Array.isArray(d?.data) },
  {
    id: ProviderId.LlamaCpp,
    path: "/props",
    ok: (d) => !!d?.default_generation_settings || typeof d?.chat_template === "string",
  },
  { id: ProviderId.Vllm, path: "/version", ok: (d) => typeof d?.version === "string" },
];

const QUERY_SCHEMA = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
};

export const originOf = (baseUrl) => {
  try {
    return new URL(String(baseUrl ?? "").trim()).origin;
  } catch {
    return "";
  }
};

const openAIBase = (baseUrl) => {
  const clean = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(clean);
    return url.pathname && url.pathname !== "/" ? clean : `${url.origin}/v1`;
  } catch {
    return "";
  }
};

const bearer = (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

const getJson = async (url, apiKey, timeoutMs) => {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...bearer(apiKey) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const detectProvider = async (baseUrl, apiKey) => {
  const origin = originOf(baseUrl);
  if (!origin) return ProviderId.OpenAICompat;
  const hits = await Promise.all(
    PROBES.map((p) =>
      getJson(`${origin}${p.path}`, apiKey, PROBE_TIMEOUT_MS)
        .then((d) => (p.ok(d) ? p.id : null))
        .catch(() => null),
    ),
  );
  return hits.find(Boolean) ?? ProviderId.OpenAICompat;
};

export const listModels = async (provider, baseUrl, apiKey) => {
  try {
    if (provider === ProviderId.Ollama) {
      const d = await getJson(`${originOf(baseUrl)}/api/tags`, apiKey, LIST_TIMEOUT_MS);
      return (d?.models ?? []).map((m) => m?.name).filter((n) => typeof n === "string");
    }
    if (provider === ProviderId.LmStudio) {
      const d = await getJson(`${originOf(baseUrl)}/api/v0/models`, apiKey, LIST_TIMEOUT_MS);
      return (d?.data ?? []).map((m) => m?.id).filter((n) => typeof n === "string");
    }
    const d = await getJson(`${openAIBase(baseUrl)}/models`, apiKey, LIST_TIMEOUT_MS);
    return (d?.data ?? []).map((m) => m?.id).filter((n) => typeof n === "string");
  } catch (err) {
    console.warn("image-search", `model listing failed for ${provider}`, err?.message ?? err);
    return [];
  }
};

const parseQuery = (raw) => {
  const text = String(raw ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    const q = JSON.parse(text)?.query;
    if (typeof q === "string" && q.trim()) return q.trim();
  } catch {}
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.replace(/^["'`]+|["'`]+$/g, "");
};

const askOllama = async (cfg, prompt, image) => {
  const res = await fetch(`${originOf(cfg.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearer(cfg.apiKey) },
    signal: AbortSignal.timeout(cfg.timeoutMs),
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      think: false,
      format: QUERY_SCHEMA,
      options: { temperature: 0 },
      messages: [{ role: "user", content: prompt, images: [image] }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseQuery((await res.json())?.message?.content);
};

const askOpenAI = async (cfg, prompt, image) => {
  const res = await fetch(`${openAIBase(cfg.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearer(cfg.apiKey) },
    signal: AbortSignal.timeout(cfg.timeoutMs),
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      temperature: 0,
      max_tokens: 64,
      response_format: { type: "json_schema", json_schema: { name: "image_query", schema: QUERY_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseQuery((await res.json())?.choices?.[0]?.message?.content);
};

export const describeImage = (cfg, prompt, image) =>
  cfg.provider === ProviderId.Ollama ? askOllama(cfg, prompt, image) : askOpenAI(cfg, prompt, image);
