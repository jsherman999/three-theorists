import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KeyVault,
  LlmClient,
  buildStreamRequest,
  normalizeModels,
  parseStreamEvent,
  pickDefaultModel,
  readSse,
} from "../js/providers.js";

function streamOf(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(iterable) {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("readSse joins events split across chunks and handles CRLF, comments and multi-line data", async () => {
  const events = await collect(
    readSse(
      streamOf([
        ": keep-alive\n\nevent: message_start\nda",
        'ta: {"a":1}\n\n',
        "data: line one\r\ndata: line two\r\n\r\n",
        "data: [DONE]",
      ]),
    ),
  );
  assert.deepEqual(events, [
    { event: "message_start", data: '{"a":1}' },
    { event: "", data: "line one\nline two" },
    { event: "", data: "[DONE]" },
  ]);
});

test("readSse gives up when the stream stalls", async () => {
  const stalled = new ReadableStream({ start() {} });
  await assert.rejects(collect(readSse(stalled, { idleMs: 30, provider: { name: "Tester" } })), /Tester stopped responding/);
});

test("anthropic events yield text and normalized stop reasons", () => {
  assert.deepEqual(parseStreamEvent("anthropic", { data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}' }), [{ text: "Hi" }]);
  assert.deepEqual(parseStreamEvent("anthropic", { data: '{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}' }), []);
  assert.deepEqual(parseStreamEvent("anthropic", { data: '{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}' }), [{ stop: "length" }]);
  assert.deepEqual(parseStreamEvent("anthropic", { data: '{"type":"message_delta","delta":{"stop_reason":"refusal"}}' }), [{ stop: "refusal" }]);
  assert.throws(() => parseStreamEvent("anthropic", { data: '{"type":"error","error":{"message":"Overloaded"}}' }), /Anthropic: Overloaded/);
});

test("openai and openrouter events yield text, finish reasons and mid-stream errors", () => {
  assert.deepEqual(parseStreamEvent("openai", { data: '{"choices":[{"delta":{"content":"Yo"}}]}' }), [{ text: "Yo" }]);
  assert.deepEqual(parseStreamEvent("openai", { data: '{"choices":[{"delta":{},"finish_reason":"stop"}]}' }), [{ stop: "end" }]);
  assert.deepEqual(parseStreamEvent("openai", { data: "[DONE]" }), []);
  assert.throws(() => parseStreamEvent("openrouter", { data: '{"error":{"message":"No credits"}}' }), /OpenRouter: No credits/);
});

test("gemini events skip thought parts and map finish reasons", () => {
  const data = JSON.stringify({
    candidates: [{ content: { parts: [{ text: "secret", thought: true }, { text: "Hello" }] }, finishReason: "MAX_TOKENS" }],
  });
  assert.deepEqual(parseStreamEvent("gemini", { data }), [{ text: "Hello" }, { stop: "length" }]);
  assert.deepEqual(parseStreamEvent("gemini", { data: '{"promptFeedback":{"blockReason":"SAFETY"}}' }), [{ stop: "refusal" }]);
  assert.deepEqual(parseStreamEvent("gemini", { data: '{"candidates":[{"content":{"parts":[{"text":"x"}]},"finishReason":"STOP"}]}' }), [{ text: "x" }]);
});

test("buildStreamRequest uses each provider's native shape", () => {
  const args = { key: "k", model: "claude-opus-5", system: "SYS", messages: [{ role: "user", content: "Q" }] };
  const anthropic = buildStreamRequest("anthropic", args);
  assert.equal(anthropic.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropic.headers["x-api-key"], "k");
  assert.equal(anthropic.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.deepEqual(anthropic.body, { model: "claude-opus-5", max_tokens: 16000, system: "SYS", messages: args.messages, stream: true });
  assert.equal(buildStreamRequest("anthropic", { ...args, model: "claude-3-haiku-20240307" }).body.max_tokens, 4096);
  assert.equal(buildStreamRequest("anthropic", { ...args, maxOutput: 8192 }).body.max_tokens, 8192);

  const openai = buildStreamRequest("openai", { ...args, model: "gpt-5" });
  assert.equal(openai.headers.Authorization, "Bearer k");
  assert.deepEqual(openai.body.messages[0], { role: "system", content: "SYS" });
  assert.equal(openai.body.max_tokens, undefined);

  const router = buildStreamRequest("openrouter", { ...args, model: "x/y", maxOutput: 50000 });
  assert.equal(router.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(router.body.max_tokens, 16000);

  const history = [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "A1" },
    { role: "user", content: "Q2" },
  ];
  const gemini = buildStreamRequest("gemini", { ...args, model: "gemini-2.5-pro", messages: history });
  assert.match(gemini.url, /models\/gemini-2\.5-pro:streamGenerateContent\?alt=sse$/);
  assert.equal(gemini.headers["x-goog-api-key"], "k");
  assert.deepEqual(gemini.body.systemInstruction, { parts: [{ text: "SYS" }] });
  assert.deepEqual(gemini.body.contents.map((c) => c.role), ["user", "model", "user"]);

  const gemma = buildStreamRequest("gemini", { ...args, model: "gemma-3-27b-it" });
  assert.equal(gemma.body.systemInstruction, undefined);
  assert.match(gemma.body.contents[0].parts[0].text, /^SYS\n\n---\n\nQ$/);
  assert.equal(args.messages[0].content, "Q", "input messages are not mutated");
});

test("normalizeModels groups, filters and orders each provider's list", () => {
  const anthropic = normalizeModels("anthropic", [
    { id: "claude-sonnet-5", display_name: "Claude Sonnet 5", created_at: "2026-03-01T00:00:00Z", max_tokens: 64000 },
    { id: "claude-opus-5", display_name: "Claude Opus 5", created_at: "2026-05-01T00:00:00Z", max_tokens: 128000 },
  ]);
  assert.deepEqual(anthropic.map((m) => m.id), ["claude-opus-5", "claude-sonnet-5"]);
  assert.equal(anthropic[0].maxOutput, 128000);
  assert.equal(pickDefaultModel("anthropic", anthropic), "claude-opus-5");

  const openai = normalizeModels("openai", [
    { id: "text-embedding-3-small", created: 3 },
    { id: "gpt-4o", created: 1 },
    { id: "gpt-5", created: 2 },
    { id: "gpt-4o-realtime-preview", created: 4 },
  ]);
  assert.deepEqual(openai.map((m) => [m.id, m.group]), [
    ["gpt-5", "Chat models"],
    ["gpt-4o", "Chat models"],
    ["gpt-4o-realtime-preview", "Other models"],
    ["text-embedding-3-small", "Other models"],
  ]);
  assert.equal(pickDefaultModel("openai", openai), "gpt-5");

  const gemini = normalizeModels("gemini", [
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-3-27b-it", displayName: "Gemma 3 27B", supportedGenerationMethods: ["generateContent"] },
  ]);
  assert.deepEqual(gemini.map((m) => m.id), ["gemini-2.5-flash", "gemini-2.5-pro", "gemma-3-27b-it"]);
  assert.equal(pickDefaultModel("gemini", gemini), "gemini-2.5-pro");

  const router = normalizeModels("openrouter", [
    { id: "meta/llama:free", name: "Llama (free)", pricing: { prompt: "0", completion: "0" } },
    { id: "anthropic/claude-opus-5", name: "Anthropic: Claude Opus 5", pricing: { prompt: "0.000005", completion: "0.000025" }, top_provider: { max_completion_tokens: 128000 } },
    { id: "anthropic/claude-opus-5:batch", name: "Anthropic: Claude Opus 5 (batch)" },
    { id: "google/lyria-3-clip-preview", name: "Lyria", pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text", "audio"] } },
  ]);
  assert.deepEqual(router.map((m) => m.id), ["anthropic/claude-opus-5", "meta/llama:free"]);
  assert.deepEqual(router.map((m) => m.group), ["Paid models", "Free models"]);
  assert.equal(pickDefaultModel("openrouter", router), "anthropic/claude-opus-5");
});

test("KeyVault keeps keys per provider in session or local storage", () => {
  const session = memoryStorage();
  const local = memoryStorage();
  const vault = new KeyVault({ session, local });
  vault.write("anthropic", " sk-ant-1 ");
  assert.deepEqual(vault.read("anthropic"), { key: "sk-ant-1", remembered: false });
  vault.write("anthropic", "sk-ant-2", { remember: true });
  assert.deepEqual(vault.read("anthropic"), { key: "sk-ant-2", remembered: true });
  assert.equal(session.getItem("three-theorists-key-v1:anthropic"), null);
  assert.deepEqual(vault.read("openai"), { key: "", remembered: false });
  vault.clear("anthropic");
  assert.deepEqual(vault.read("anthropic"), { key: "", remembered: false });
});

function sseResponse(lines, init = {}) {
  return new Response(streamOf(lines), { status: 200, headers: { "content-type": "text/event-stream" }, ...init });
}

test("LlmClient.stream sends the request and yields the streamed answer", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return sseResponse([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Feeling "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"first."}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
    ]);
  };
  const client = new LlmClient(fetchImpl);
  const chunks = await collect(
    client.stream({ providerId: "anthropic", key: "sk-ant-x", model: "claude-opus-5", system: "S", messages: [{ role: "user", content: "Q" }] }),
  );
  assert.deepEqual(chunks, [{ text: "Feeling " }, { text: "first." }, { stop: "end" }]);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(JSON.parse(calls[0].options.body).stream, true);
});

test("LlmClient explains HTTP failures in plain words", async () => {
  const client = new LlmClient(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 }));
  await assert.rejects(
    collect(client.stream({ providerId: "anthropic", key: "bad", model: "m", system: "S", messages: [] })),
    /Anthropic rejected the API key\./,
  );
  const gemini = new LlmClient(async () => new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 400 }));
  await assert.rejects(gemini.listModels("gemini", "bad"), /Google rejected the API key\./);
});

test("an OpenAI network failure is re-checked against the model list", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/chat/completions")) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 });
  };
  const client = new LlmClient(fetchImpl);
  await assert.rejects(
    collect(client.stream({ providerId: "openai", key: "bad", model: "gpt-5", system: "S", messages: [] })),
    /OpenAI rejected the API key\./,
  );
});

test("OpenAI models that can't stream for unverified orgs fall back to one complete answer", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (body.stream) {
      return new Response(JSON.stringify({ error: { message: "Your organization must be verified to stream this model." } }), { status: 400 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "Whole answer." }, finish_reason: "stop" }] }), { status: 200 });
  };
  const chunks = await collect(new LlmClient(fetchImpl).stream({ providerId: "openai", key: "k", model: "gpt-5", system: "S", messages: [] }));
  assert.deepEqual(chunks, [{ text: "Whole answer." }, { stop: "end" }]);
  assert.deepEqual(bodies.map((b) => b.stream), [true, false]);
});

test("aborting stops a stream with an AbortError", async () => {
  const controller = new AbortController();
  const fetchImpl = async (url, options) =>
    new Response(
      new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));
          options.signal.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")));
        },
      }),
      { status: 200 },
    );
  const client = new LlmClient(fetchImpl);
  const seen = [];
  await assert.rejects(
    (async () => {
      for await (const chunk of client.stream({ providerId: "openrouter", key: "k", model: "m", system: "S", messages: [], signal: controller.signal })) {
        seen.push(chunk);
        controller.abort();
      }
    })(),
    (error) => error.name === "AbortError",
  );
  assert.deepEqual(seen, [{ text: "a" }]);
});

test("listModels pages through Anthropic's list and checks OpenRouter keys first", async () => {
  const urls = [];
  const anthropicFetch = async (url) => {
    urls.push(String(url));
    const page = String(url).includes("after_id")
      ? { data: [{ id: "claude-sonnet-5", created_at: "2026-01-01T00:00:00Z" }], has_more: false }
      : { data: [{ id: "claude-opus-5", created_at: "2026-02-01T00:00:00Z" }], has_more: true, last_id: "claude-opus-5" };
    return new Response(JSON.stringify(page), { status: 200 });
  };
  const models = await new LlmClient(anthropicFetch).listModels("anthropic", "k");
  assert.deepEqual(models.map((m) => m.id), ["claude-opus-5", "claude-sonnet-5"]);
  assert.match(urls[1], /after_id=claude-opus-5/);

  const routerFetch = async (url) =>
    String(url).endsWith("/key")
      ? new Response(JSON.stringify({ error: { message: "No auth credentials found" } }), { status: 401 })
      : new Response(JSON.stringify({ data: [{ id: "a/b" }] }), { status: 200 });
  await assert.rejects(new LlmClient(routerFetch).listModels("openrouter", "bad"), /OpenRouter rejected the API key\./);
});
