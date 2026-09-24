// Bring-your-own-key access to four LLM providers, called straight from the
// browser. There is no server: a key only ever travels in the auth header of a
// request to the provider the visitor picked. Every network call in the app
// lives in this file.

const LIST_TIMEOUT_MS = 20000;
const FIRST_BYTE_TIMEOUT_MS = 90000;
const IDLE_TIMEOUT_MS = 90000;
const MAX_OUTPUT_TOKENS = 16000;
const KEY_PREFIX = "three-theorists-key-v1:";

export const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    label: "Anthropic (Claude)",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "Anthropic keys start with sk-ant-.",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    label: "OpenAI (GPT)",
    keysUrl: "https://platform.openai.com/api-keys",
    keyHint: "OpenAI keys start with sk-.",
  },
  gemini: {
    id: "gemini",
    name: "Google",
    label: "Google (Gemini)",
    keysUrl: "https://aistudio.google.com/apikey",
    keyHint: "Create a Gemini API key in Google AI Studio.",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    label: "OpenRouter (many vendors)",
    keysUrl: "https://openrouter.ai/settings/keys",
    keyHint: "OpenRouter keys start with sk-or- and reach models from many vendors.",
  },
};

export class ProviderError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.code = code;
  }
}

function abortError() {
  const error = new Error("Stopped.");
  error.name = "AbortError";
  return error;
}

// ---------------------------------------------------------------------------
// Key storage

function safeStorage(candidate) {
  try {
    if (!candidate) return null;
    const probe = "__three_theorists_probe__";
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Session storage keeps a key for one tab; "remember" moves it to local
 * storage on this device. If neither is available, the key lives in memory.
 */
export class KeyVault {
  constructor({ session, local } = {}) {
    this.session = safeStorage(session === undefined ? globalThis.sessionStorage : session);
    this.local = safeStorage(local === undefined ? globalThis.localStorage : local);
    this.memory = new Map();
  }

  read(providerId) {
    const name = KEY_PREFIX + providerId;
    const local = this.local?.getItem(name);
    if (local) return { key: local, remembered: true };
    const session = this.session?.getItem(name);
    if (session) return { key: session, remembered: false };
    return { key: this.memory.get(providerId) || "", remembered: false };
  }

  write(providerId, key, { remember = false } = {}) {
    const name = KEY_PREFIX + providerId;
    const value = String(key || "").trim();
    this.local?.removeItem(name);
    this.session?.removeItem(name);
    this.memory.delete(providerId);
    if (!value) return { key: "", remembered: false };
    const target = remember ? this.local : this.session;
    if (target) target.setItem(name, value);
    else this.memory.set(providerId, value);
    return { key: value, remembered: Boolean(remember && this.local) };
  }

  clear(providerId) {
    return this.write(providerId, "");
  }
}

// ---------------------------------------------------------------------------
// Models

const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/i;
const OPENAI_NOT_CHAT = /(audio|realtime|tts|transcribe|whisper|embedding|image|moderation|instruct|search|dall-e|davinci|babbage|codex|computer-use|deep-research)/i;
const GEMINI_SPECIALIZED = /(tts|image|embedding|aqa|audio|live|robotics|computer-use|veo|imagen|lyria)/i;

function versionOf(id) {
  const match = String(id).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

/**
 * Turns a provider's raw model rows into {id, name, group, created, maxOutput}
 * entries, ordered the way they should appear in the dropdown.
 */
export function normalizeModels(providerId, rows) {
  const seen = new Set();
  const models = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    let id = String(row.id || row.name || "").trim();
    if (providerId === "gemini") {
      id = id.replace(/^models\//, "");
      const methods = row.supportedGenerationMethods;
      if (Array.isArray(methods) && !methods.includes("generateContent")) continue;
    }
    if (providerId === "openrouter") {
      // Batch-only variants can't stream, and music or image generators can't hold a conversation.
      const outputs = row.architecture?.output_modalities;
      if (id.endsWith(":batch") || (Array.isArray(outputs) && outputs.some((kind) => kind !== "text"))) continue;
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      name: String(row.display_name || row.displayName || row.name || id).trim().replace(/^models\//, ""),
      group: groupFor(providerId, id, row),
      created: createdAt(row),
      maxOutput: Number(row.max_tokens || row.outputTokenLimit || row.top_provider?.max_completion_tokens) || null,
    });
  }
  const order = GROUP_ORDER[providerId] || [];
  return models.sort((a, b) => {
    const group = order.indexOf(a.group) - order.indexOf(b.group);
    if (group) return group;
    if (providerId === "anthropic" || providerId === "openai") return b.created - a.created || a.name.localeCompare(b.name);
    if (providerId === "gemini") return versionOf(b.id) - versionOf(a.id) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

const GROUP_ORDER = {
  anthropic: ["Claude models"],
  openai: ["Chat models", "Other models"],
  gemini: ["Gemini models", "Open models (Gemma)", "Specialized models"],
  openrouter: ["Paid models", "Free models"],
};

function groupFor(providerId, id, row) {
  if (providerId === "anthropic") return "Claude models";
  if (providerId === "openai") return OPENAI_CHAT.test(id) && !OPENAI_NOT_CHAT.test(id) ? "Chat models" : "Other models";
  if (providerId === "gemini") {
    if (/^gemma/i.test(id)) return "Open models (Gemma)";
    return GEMINI_SPECIALIZED.test(id) ? "Specialized models" : "Gemini models";
  }
  const pricing = row.pricing || {};
  const free = id.endsWith(":free") || (pricing.prompt !== undefined && Number(pricing.prompt) === 0 && Number(pricing.completion) === 0);
  return free ? "Free models" : "Paid models";
}

function createdAt(row) {
  if (typeof row.created === "number") return row.created * 1000;
  const parsed = Date.parse(row.created_at || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function groupModels(models) {
  const groups = new Map();
  for (const model of models) {
    if (!groups.has(model.group)) groups.set(model.group, []);
    groups.get(model.group).push(model);
  }
  return [...groups].map(([label, items]) => ({ label, models: items }));
}

const PREFERRED = {
  anthropic: [/^claude-opus-5$/, /^claude-sonnet-5$/, /^claude-opus-/, /^claude-sonnet-/],
  openai: [/^gpt-\d+(\.\d+)?$/, /^gpt-\d+(\.\d+)?-chat/, /^gpt-4o$/],
  gemini: [/^gemini-[\d.]+-pro$/, /^gemini-[\d.]+-pro/, /^gemini-[\d.]+-flash$/],
  openrouter: [/^anthropic\/claude-opus-5$/, /^anthropic\/claude-sonnet-5$/, /^openai\/gpt-\d+(\.\d+)?$/, /^google\/gemini-[\d.]+-pro$/],
};

/** A sensible first choice from a freshly loaded list; the visitor can change it. */
export function pickDefaultModel(providerId, models) {
  if (!models.length) return "";
  const firstGroup = models[0].group;
  const candidates = models.filter((model) => model.group === firstGroup);
  for (const pattern of PREFERRED[providerId] || []) {
    const hit = candidates.find((model) => pattern.test(model.id));
    if (hit) return hit.id;
  }
  return candidates[0].id;
}

// ---------------------------------------------------------------------------
// Requests

function authHeaders(providerId, key) {
  switch (providerId) {
    case "anthropic":
      return {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        // Anthropic requires this opt-in for calls made directly from a browser.
        "anthropic-dangerous-direct-browser-access": "true",
      };
    case "gemini":
      return { "x-goog-api-key": key };
    case "openrouter":
      return { Authorization: `Bearer ${key}`, "X-Title": "Three Theorists" };
    default:
      return { Authorization: `Bearer ${key}` };
  }
}

function anthropicMaxTokens(model, maxOutput) {
  if (maxOutput) return Math.min(maxOutput, MAX_OUTPUT_TOKENS);
  if (/^claude-3-(haiku|sonnet|opus)/.test(model)) return 4096;
  if (/^claude-3-5-/.test(model)) return 8192;
  return MAX_OUTPUT_TOKENS;
}

/** The URL, headers and JSON body for one streaming chat request. */
export function buildStreamRequest(providerId, { key, model, system, messages, maxOutput = null }) {
  const headers = authHeaders(providerId, key);
  if (providerId === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers,
      body: { model, max_tokens: anthropicMaxTokens(model, maxOutput), system, messages, stream: true },
    };
  }
  if (providerId === "gemini") {
    // Gemma models reject system instructions, so fold the brief into the first turn.
    const gemma = /^gemma/i.test(model);
    const contents = messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    if (gemma && contents.length) contents[0].parts[0].text = `${system}\n\n---\n\n${contents[0].parts[0].text}`;
    const body = { contents };
    if (!gemma) body.systemInstruction = { parts: [{ text: system }] };
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers,
      body,
    };
  }
  const url = providerId === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const body = { model, stream: true, messages: [{ role: "system", content: system }, ...messages] };
  if (providerId === "openrouter" && maxOutput) body.max_tokens = Math.min(maxOutput, MAX_OUTPUT_TOKENS);
  return { url, headers, body };
}

function describeFailure(provider, status, payload) {
  const raw = payload?.error?.message || payload?.message || (typeof payload?.error === "string" ? payload.error : "");
  const detail = String(raw || "").trim();
  if (status === 401 || (status === 400 && /api key/i.test(detail))) return `${provider.name} rejected the API key.`;
  if (status === 402) return `${provider.name} reports insufficient credits on this key.`;
  if (status === 403) return `${provider.name} refused this request${detail ? `: ${detail}` : "."}`;
  if (status === 404) return `${provider.name} couldn't find that model${detail ? `: ${detail}` : "."}`;
  if (status === 429) return `${provider.name} is rate limiting requests${detail ? `: ${detail}` : ". Try again shortly."}`;
  if (status === 503 || status === 529) return `${provider.name} is overloaded right now. Try again shortly.`;
  return `${provider.name} returned ${status}${detail ? `: ${detail}` : "."}`;
}

export function normalizeStop(reason) {
  const value = String(reason || "").toLowerCase();
  if (["max_tokens", "length", "max_output_tokens"].includes(value)) return "length";
  if (["refusal", "content_filter", "safety", "recitation", "prohibited_content", "blocklist", "spii"].includes(value)) return "refusal";
  return "end";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("");
  return "";
}

// Each parser turns one server-sent event into zero or more {text} / {stop} items.
const EVENT_PARSERS = {
  anthropic({ data }, provider) {
    const payload = parseJson(data);
    if (!payload) return [];
    if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") return [{ text: payload.delta.text }];
    if (payload.type === "message_delta" && payload.delta?.stop_reason) return [{ stop: normalizeStop(payload.delta.stop_reason) }];
    if (payload.type === "error") throw new ProviderError(`${provider.name}: ${payload.error?.message || "the answer stream failed."}`);
    return [];
  },
  openai({ data }, provider) {
    if (!data || data === "[DONE]") return [];
    const payload = parseJson(data);
    if (!payload) return [];
    if (payload.error) throw new ProviderError(`${provider.name}: ${payload.error.message || payload.error}`);
    const choice = payload.choices?.[0];
    if (!choice) return [];
    const out = [];
    const text = contentText(choice.delta?.content);
    if (text) out.push({ text });
    if (choice.finish_reason) out.push({ stop: normalizeStop(choice.finish_reason) });
    return out;
  },
  gemini({ data }, provider) {
    const payload = parseJson(data);
    if (!payload) return [];
    if (payload.error) throw new ProviderError(`${provider.name}: ${payload.error.message || "the answer stream failed."}`);
    if (payload.promptFeedback?.blockReason) return [{ stop: "refusal" }];
    const candidate = payload.candidates?.[0];
    if (!candidate) return [];
    const out = [];
    const text = (candidate.content?.parts || [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    if (text) out.push({ text });
    if (candidate.finishReason && candidate.finishReason !== "STOP") out.push({ stop: normalizeStop(candidate.finishReason) });
    return out;
  },
};
EVENT_PARSERS.openrouter = EVENT_PARSERS.openai;

export function parseStreamEvent(providerId, event) {
  return EVENT_PARSERS[providerId](event, PROVIDERS[providerId]);
}

function readWithTimeout(reader, ms, provider) {
  let timer;
  const stall = new Promise((_, reject) => {
    timer = setTimeout(() => {
      // Reject before cancelling: cancel() settles the pending read as "done",
      // which would otherwise win the race and pass a stall off as a normal end.
      reject(new ProviderError(`${provider?.name || "The provider"} stopped responding.`, { code: "timeout" }));
      reader.cancel().catch(() => {});
    }, ms);
  });
  return Promise.race([reader.read(), stall]).finally(() => clearTimeout(timer));
}

/**
 * Reads a text/event-stream body and yields {event, data} for each message.
 * Handles LF and CRLF line endings, multi-line data fields and comment lines.
 */
export async function* readSse(stream, { idleMs = IDLE_TIMEOUT_MS, provider = null } = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const boundary = /\r?\n\r?\n/;
  try {
    while (true) {
      const { value, done } = await readWithTimeout(reader, idleMs, provider);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = boundary.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const event = parseSseBlock(block);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    const tail = parseSseBlock(buffer);
    if (tail) yield tail;
  } finally {
    // A no-op once the stream is finished; frees the connection if the reader stopped early.
    reader.cancel().catch(() => {});
  }
}

function parseSseBlock(block) {
  let event = "";
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (!event && !data.length) return null;
  return { event, data: data.join("\n") };
}

function linkSignals(signal, controller) {
  if (!signal) return controller.signal;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, controller.signal]);
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller.signal;
}

export class LlmClient {
  constructor(fetchImpl = null) {
    // Look up the global fetch per call rather than capturing it once.
    this.fetch = typeof fetchImpl === "function" ? fetchImpl : typeof globalThis.fetch === "function" ? (...args) => globalThis.fetch(...args) : null;
  }

  /** Sends a request and returns the Response when it is OK; throws ProviderError otherwise. */
  async send(url, { provider, method = "GET", headers = {}, body = null, signal = null, timeoutMs = LIST_TIMEOUT_MS }) {
    if (!this.fetch) throw new ProviderError("This browser can't reach the network.");
    const timeout = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeout.abort();
    }, timeoutMs);
    const finalHeaders = { Accept: "application/json, text/event-stream", ...headers };
    if (body) finalHeaders["Content-Type"] = "application/json";
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: linkSignals(signal, timeout),
      });
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw new ProviderError(`${provider.name} took too long to respond.`, { code: "timeout" });
      if (error instanceof TypeError) throw new ProviderError(`Couldn't reach ${provider.name}. Check your connection.`, { code: "network" });
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new ProviderError(describeFailure(provider, response.status, await readJson(response)), { status: response.status });
    }
    return response;
  }

  async getJson(url, { provider, key }) {
    const response = await this.send(url, { provider, headers: authHeaders(provider.id, key) });
    const payload = await readJson(response);
    if (!payload) throw new ProviderError(`${provider.name} sent a response this page couldn't read.`);
    return payload;
  }

  /**
   * OpenAI answers a bad key on its chat endpoint from an edge layer that
   * omits CORS headers, so the browser only sees a network failure. Its model
   * list does answer with readable errors, so use that to explain the failure.
   */
  async verifyKey(providerId, key) {
    const provider = PROVIDERS[providerId];
    try {
      await this.getJson(providerId === "openrouter" ? "https://openrouter.ai/api/v1/key" : modelsUrl(providerId), { provider, key });
      return { ok: true, message: `${provider.name} accepted the API key.` };
    } catch (error) {
      return { ok: false, message: error.message, status: error.status, code: error.code };
    }
  }

  async listModels(providerId, key) {
    const provider = PROVIDERS[providerId];
    if (!provider) throw new ProviderError("Choose an AI provider first.");
    if (!key) throw new ProviderError(`Paste your ${provider.name} API key first.`);
    const rows = [];
    if (providerId === "anthropic") {
      let after = "";
      do {
        const url = new URL(modelsUrl(providerId));
        url.searchParams.set("limit", "1000");
        if (after) url.searchParams.set("after_id", after);
        const page = await this.getJson(url.toString(), { provider, key });
        rows.push(...(page.data || []));
        after = page.has_more ? page.last_id : "";
      } while (after && rows.length < 5000);
    } else if (providerId === "gemini") {
      let token = "";
      do {
        const url = new URL(modelsUrl(providerId));
        url.searchParams.set("pageSize", "1000");
        if (token) url.searchParams.set("pageToken", token);
        const page = await this.getJson(url.toString(), { provider, key });
        rows.push(...(page.models || []));
        token = page.nextPageToken || "";
      } while (token && rows.length < 5000);
    } else {
      // OpenRouter's model list is public, so check the key separately first.
      if (providerId === "openrouter") await this.getJson("https://openrouter.ai/api/v1/key", { provider, key });
      const payload = await this.getJson(modelsUrl(providerId), { provider, key });
      rows.push(...(payload.data || []));
    }
    const models = normalizeModels(providerId, rows);
    if (!models.length) throw new ProviderError(`${provider.name} returned no usable models for this key.`);
    return models;
  }

  /** Streams one answer, yielding {text} chunks and a final {stop} when the provider reports one. */
  async *stream({ providerId, key, model, system, messages, maxOutput = null, signal = null }) {
    const provider = PROVIDERS[providerId];
    if (!provider) throw new ProviderError("Choose an AI provider in Settings.");
    if (!key) throw new ProviderError(`Add your ${provider.name} API key in Settings.`);
    if (!model) throw new ProviderError("Choose a model in Settings.");
    const request = buildStreamRequest(providerId, { key, model, system, messages, maxOutput });
    let response;
    try {
      response = await this.send(request.url, {
        provider,
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal,
        timeoutMs: FIRST_BYTE_TIMEOUT_MS,
      });
    } catch (error) {
      if (error.code === "network" && providerId === "openai") {
        const check = await this.verifyKey(providerId, key);
        if (!check.ok) throw new ProviderError(check.message, check);
      }
      // OpenAI only streams some models for verified organizations; ask for the whole answer at once instead.
      if (providerId === "openai" && error.status === 400 && /verif/i.test(error.message) && /stream/i.test(error.message)) {
        yield* this.completeOpenAi(provider, request, signal);
        return;
      }
      throw error;
    }
    if (!response.body) throw new ProviderError(`${provider.name} sent an empty response.`);
    for await (const event of readSse(response.body, { provider })) {
      if (signal?.aborted) throw abortError();
      yield* parseStreamEvent(providerId, event);
    }
  }

  async *completeOpenAi(provider, request, signal) {
    const response = await this.send(request.url, {
      provider,
      method: "POST",
      headers: request.headers,
      body: { ...request.body, stream: false },
      signal,
      timeoutMs: FIRST_BYTE_TIMEOUT_MS * 2,
    });
    const choice = (await readJson(response))?.choices?.[0];
    const text = contentText(choice?.message?.content);
    if (text) yield { text };
    if (choice?.finish_reason) yield { stop: normalizeStop(choice.finish_reason) };
  }
}

function modelsUrl(providerId) {
  return {
    anthropic: "https://api.anthropic.com/v1/models",
    openai: "https://api.openai.com/v1/models",
    gemini: "https://generativelanguage.googleapis.com/v1beta/models",
    openrouter: "https://openrouter.ai/api/v1/models",
  }[providerId];
}
