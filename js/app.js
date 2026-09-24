import {
  THEORISTS,
  THEORIST_IDS,
  theoristById,
  LENGTHS,
  LEVELS,
  STORY_PROMPT,
  buildSystemPrompt,
  buildMessages,
  rebuttalParticipants,
} from "./theorists.js";
import { PROVIDERS, KeyVault, LlmClient, groupModels, pickDefaultModel } from "./providers.js";
import { renderMarkdown, escapeHtml, wordCount } from "./markdown.js";
import { emblemSvg } from "./emblems.js";

const SETTINGS_KEY = "three-theorists-settings-v1";
const THREAD_KEY = "three-theorists-thread-v1";
const MODELS_KEY = "three-theorists-models-v1:";
const MAX_SAVED_ROUNDS = 60;

const INTRO_QUESTION = "Introduce yourselves: what's your theory, in a nutshell?";
const STARTERS = [
  INTRO_QUESTION,
  "Could an AI like ChatGPT or Claude ever be conscious?",
  "Is my dog conscious? What about a fish, or an octopus?",
  "What happens to consciousness under anesthesia?",
  "Why do we have feelings at all?",
  "Are we conscious when we dream?",
  "Could a plant or a thermostat be a tiny bit conscious?",
  "What's the biggest weakness of your view?",
  "How could we ever test which of you is right?",
];

const DEFAULT_SETTINGS = {
  providerId: "anthropic",
  models: {},
  length: "standard",
  level: "adult",
  panel: { body: true, substrate: true, loop: true },
};

// --------------------------------------------------------------------------
// Storage (per-browser conveniences only; every access is guarded)

const store = {
  get(key, fallback) {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the page keeps working without it.
    }
  },
};

function loadSettings() {
  const saved = store.get(SETTINGS_KEY, {});
  const settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    models: { ...(saved.models || {}) },
    panel: { ...DEFAULT_SETTINGS.panel, ...(saved.panel || {}) },
  };
  if (!PROVIDERS[settings.providerId]) settings.providerId = DEFAULT_SETTINGS.providerId;
  if (!LENGTHS[settings.length]) settings.length = DEFAULT_SETTINGS.length;
  if (!LEVELS[settings.level]) settings.level = DEFAULT_SETTINGS.level;
  if (!THEORIST_IDS.some((id) => settings.panel[id])) settings.panel = { ...DEFAULT_SETTINGS.panel };
  return settings;
}

function loadRounds() {
  const rounds = store.get(THREAD_KEY, []);
  if (!Array.isArray(rounds)) return [];
  return rounds
    .filter((round) => round && round.id && Array.isArray(round.participants) && round.answers)
    .map((round) => {
      for (const answer of Object.values(round.answers)) {
        if (answer.status === "waiting" || answer.status === "streaming") answer.status = answer.text ? "stopped" : "error";
        if (answer.status === "error" && !answer.error) answer.error = "This answer was interrupted.";
      }
      return round;
    });
}

const saveSettings = () => store.set(SETTINGS_KEY, state.settings);
const saveRounds = () => store.set(THREAD_KEY, state.rounds.slice(-MAX_SAVED_ROUNDS));
const cachedModels = (providerId) => store.get(MODELS_KEY + providerId, null)?.models || null;
const cacheModels = (providerId, models) => store.set(MODELS_KEY + providerId, { at: Date.now(), models });

// --------------------------------------------------------------------------
// State

const vault = new KeyVault();
const client = new LlmClient();

const state = {
  settings: loadSettings(),
  rounds: loadRounds(),
  run: null,
  pendingQuestion: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  panel: $("panel"),
  thread: $("thread"),
  composer: $("composer"),
  input: $("composer-input"),
  who: $("who"),
  length: $("length"),
  level: $("level"),
  ask: $("ask"),
  tuneToggle: $("tune-toggle"),
  connection: $("connection"),
  connectionLabel: $("connection-label"),
  connectionDetail: $("connection-detail"),
  announcer: $("announcer"),
  toast: $("toast"),
  dialog: $("settings"),
  settingsForm: $("settings-form"),
  closeSettings: $("close-settings"),
  lede: $("settings-lede"),
  provider: $("provider"),
  key: $("api-key"),
  toggleKey: $("toggle-key"),
  keyHint: $("key-hint"),
  keysLink: $("keys-link"),
  remember: $("remember"),
  loadModels: $("load-models"),
  modelFilter: $("model-filter"),
  model: $("model"),
  modelStatus: $("model-status"),
  forget: $("forget-key"),
  save: $("save-settings"),
};

const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const shortName = (theorist) => theorist.name.replace(/^The /, "").replace(/ Theorist$/, "");
const inkStyle = (id) => `--ink-color: var(--${id}-ink)`;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function connection() {
  const providerId = state.settings.providerId;
  const model = state.settings.models[providerId] || "";
  const { key } = vault.read(providerId);
  return { providerId, model, key, ready: Boolean(key && model) };
}

function modelName(providerId, modelId) {
  return cachedModels(providerId)?.find((model) => model.id === modelId)?.name || modelId;
}

// --------------------------------------------------------------------------
// Static chrome: panel, composer controls, connection pill

function renderPanel() {
  els.panel.innerHTML = THEORISTS.map(
    (theorist) => `
      <article class="theorist" data-theorist="${theorist.id}" style="${inkStyle(theorist.id)}">
        ${emblemSvg(theorist.id)}
        <div class="theorist-text">
          <p class="theorist-school">${escapeHtml(theorist.school)}</p>
          <h2 class="theorist-name">${escapeHtml(theorist.name)}</h2>
          <p class="theorist-thesis">${escapeHtml(theorist.thesis)}</p>
          <p class="theorist-blurb">${escapeHtml(theorist.blurb)}</p>
          <p class="theorist-influences">Draws on ${theorist.influences.map((name) => `<strong>${escapeHtml(name)}</strong>`).join(", ")}</p>
          <div class="story-wrap">
            <button class="story" type="button" data-action="story" data-theorist="${theorist.id}">Hear their story</button>
          </div>
        </div>
      </article>`,
  ).join("");
}

function renderControls() {
  els.who.insertAdjacentHTML(
    "beforeend",
    THEORISTS.map(
      (theorist) => `
        <label class="who-chip" style="${inkStyle(theorist.id)}" title="Include ${escapeHtml(theorist.name)}">
          <input type="checkbox" value="${theorist.id}" ${state.settings.panel[theorist.id] ? "checked" : ""}>
          <span class="who-dot" aria-hidden="true"></span>
          <span>${escapeHtml(shortName(theorist))}</span>
        </label>`,
    ).join(""),
  );
  els.length.insertAdjacentHTML(
    "beforeend",
    Object.entries(LENGTHS)
      .map(
        ([id, length]) => `
        <label class="seg">
          <input type="radio" name="length" value="${id}" ${state.settings.length === id ? "checked" : ""}>
          <span>${escapeHtml(length.label)}</span>
        </label>`,
      )
      .join(""),
  );
  els.level.innerHTML = Object.entries(LEVELS)
    .map(([id, level]) => `<option value="${id}" ${state.settings.level === id ? "selected" : ""}>${escapeHtml(level.label)}</option>`)
    .join("");
}

function updateConnection() {
  const { providerId, model, key, ready } = connection();
  const provider = PROVIDERS[providerId];
  els.connection.classList.toggle("is-ready", ready);
  if (ready) {
    els.connectionLabel.textContent = modelName(providerId, model);
    els.connectionDetail.textContent = `${provider.label} · change`;
    els.connection.setAttribute("aria-label", `Model: ${modelName(providerId, model)} from ${provider.name}. Change settings.`);
  } else {
    els.connectionLabel.textContent = "Connect a model";
    els.connectionDetail.textContent = key ? "Choose a model to start" : "Add an API key to start";
    els.connection.setAttribute("aria-label", "Connect a model: open settings");
  }
}

function setBusy(busy) {
  els.ask.innerHTML = busy ? "Stop" : 'Ask<span class="ask-more"> the panel</span>';
  els.ask.classList.toggle("is-stop", busy);
  els.ask.setAttribute("aria-label", busy ? "Stop the answers" : "Ask the panel");
  for (const button of document.querySelectorAll("[data-action='story'], [data-action='starter'], [data-action='retry'], [data-action='rebut'], [data-action='clear']")) {
    button.disabled = busy;
  }
}

function announce(message) {
  els.announcer.textContent = message;
}

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2400);
}

// --------------------------------------------------------------------------
// Thread rendering

function renderThread() {
  els.thread.replaceChildren();
  if (!state.rounds.length) {
    els.thread.append(emptyState());
  } else {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `
      <button class="quiet" type="button" data-action="copy-transcript">Copy transcript</button>
      <button class="quiet danger" type="button" data-action="clear">Start over</button>`;
    els.thread.append(toolbar);
    for (const round of state.rounds) els.thread.append(roundElement(round));
  }
  updateSpeaking();
  setBusy(Boolean(state.run));
}

function emptyState() {
  const fragment = $("empty-template").content.cloneNode(true);
  const list = fragment.querySelector(".starters");
  list.innerHTML = STARTERS.map(
    (question, index) =>
      `<li><button class="starter${index === 0 ? " is-lead" : ""}" type="button" data-action="starter" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button></li>`,
  ).join("");
  if (!connection().ready) {
    const callout = document.createElement("p");
    callout.className = "connect-callout";
    callout.innerHTML = `<span>First, connect a model with your own API key from Anthropic, OpenAI, Google or OpenRouter.</span>
      <button class="primary" type="button" data-action="settings">Connect</button>`;
    fragment.querySelector(".empty-lede").after(callout);
  }
  return fragment;
}

function roundTitle(round) {
  if (round.kind === "rebuttal") return { label: "They respond to each other", text: `On: ${round.question}` };
  if (round.display) return { label: "You asked", text: round.display };
  return { label: "You asked", text: round.question };
}

function roundElement(round) {
  const section = document.createElement("section");
  section.className = `round round-${round.kind}`;
  section.dataset.round = round.id;
  const { label, text } = roundTitle(round);
  const ids = THEORIST_IDS.filter((id) => round.participants.includes(id));
  section.innerHTML = `
    <div class="round-q">
      <p class="round-label">${escapeHtml(label)}</p>
      <p class="round-text">${escapeHtml(text)}</p>
    </div>
    <div class="answers" data-count="${ids.length}">
      ${ids.map((id) => answerShell(round, id)).join("")}
    </div>
    <div class="round-actions"></div>`;
  for (const id of ids) fillAnswer(section, round, id);
  fillRoundActions(section, round);
  return section;
}

function answerShell(round, id) {
  const theorist = theoristById(id);
  return `
    <article class="answer" data-theorist="${id}" style="${inkStyle(id)}" aria-label="${escapeHtml(theorist.name)}">
      <header class="answer-head">
        ${emblemSvg(id)}
        <span class="answer-who">
          <span class="answer-name">${escapeHtml(theorist.name)}</span>
          <span class="answer-school">${escapeHtml(theorist.school)}</span>
        </span>
      </header>
      <div class="answer-body md"></div>
      <footer class="answer-foot"></footer>
    </article>`;
}

function roundSection(roundId) {
  return els.thread.querySelector(`.round[data-round="${CSS.escape(roundId)}"]`);
}

function fillAnswer(section, round, id) {
  const card = section?.querySelector(`.answer[data-theorist="${id}"]`);
  if (!card) return;
  const answer = round.answers[id] || { status: "waiting", text: "" };
  const live = answer.status === "waiting" || answer.status === "streaming";
  card.classList.toggle("is-speaking", live);
  const body = card.querySelector(".answer-body");
  if (answer.status === "waiting" && !answer.text) {
    body.innerHTML = `<p class="thinking">${escapeHtml(answer.retrying || "Thinking it over…")}</p>`;
  } else {
    body.innerHTML = renderMarkdown(answer.text) + (live ? '<span class="caret" aria-hidden="true"></span>' : "");
    // Keep the caret on the last line of text rather than below it.
    const caret = body.querySelector(".caret");
    const last = caret && caret.previousElementSibling;
    if (last) (last.matches("ul, ol") ? last.lastElementChild || last : last).append(caret);
  }
  card.querySelector(".answer-foot").innerHTML = footerHtml(answer);
}

function footerHtml(answer) {
  const parts = [];
  if (answer.note) parts.push(`<p class="answer-note">${escapeHtml(answer.note)}</p>`);
  if (answer.status === "error") {
    parts.push(`<p class="answer-error">${escapeHtml(answer.error || "Something went wrong.")}</p>`);
    if (/key|credit|model/i.test(answer.error || "")) parts.push(`<button class="quiet" type="button" data-action="settings">Open settings</button>`);
    parts.push(`<button class="quiet" type="button" data-action="retry" ${state.run ? "disabled" : ""}>Try again</button>`);
    return parts.join("");
  }
  if (answer.status === "done" || answer.status === "stopped") {
    const words = wordCount(answer.text);
    const meta = [answer.status === "stopped" ? "Stopped" : "", answer.model, `${words} words`].filter(Boolean).join(" · ");
    parts.push(`<span class="meta" title="${escapeHtml(meta)}">${escapeHtml(meta)}</span>`);
    if (answer.text) parts.push(`<button class="quiet" type="button" data-action="copy">Copy</button>`);
    if (answer.status === "stopped") parts.push(`<button class="quiet" type="button" data-action="retry" ${state.run ? "disabled" : ""}>Try again</button>`);
  }
  return parts.join("");
}

function fillRoundActions(section, round) {
  const holder = section?.querySelector(".round-actions");
  if (!holder) return;
  const hasRebuttal = state.rounds.some((other) => other.kind === "rebuttal" && other.parentId === round.id);
  const participants = round.kind === "question" ? rebuttalParticipants(round) : [];
  const running = state.run?.roundId === round.id;
  if (!participants.length || hasRebuttal || running) {
    holder.replaceChildren();
    return;
  }
  const dots = participants.map((id) => `<span style="background: var(--${id}-ink)"></span>`).join("");
  holder.innerHTML = `<button class="rebut" type="button" data-action="rebut">
      <span class="rebut-dots" aria-hidden="true">${dots}</span>Let them respond to each other</button>`;
  holder.querySelector("button").disabled = Boolean(state.run);
}

function updateSpeaking() {
  const speaking = new Set();
  for (const round of state.rounds) {
    for (const [id, answer] of Object.entries(round.answers)) {
      if (answer.status === "waiting" || answer.status === "streaming") speaking.add(id);
    }
  }
  for (const card of els.panel.querySelectorAll(".theorist")) {
    card.classList.toggle("is-speaking", speaking.has(card.dataset.theorist));
  }
}

const pending = new Map();
let frame = 0;
function scheduleFill(round, id) {
  pending.set(`${round.id}:${id}`, [round, id]);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const [pendingRound, pendingId] of pending.values()) fillAnswer(roundSection(pendingRound.id), pendingRound, pendingId);
    pending.clear();
  });
}

// --------------------------------------------------------------------------
// Asking

function ask(question, { participants, display = "" } = {}) {
  const text = String(question || "").trim();
  if (!text || state.run) return;
  if (!connection().ready) {
    state.pendingQuestion = { question: text, participants, display };
    openSettings("Connect a model first. Your question will go to the panel as soon as you save.");
    return;
  }
  const round = {
    id: uid(),
    kind: "question",
    question: text,
    display,
    participants: participants || THEORIST_IDS.filter((id) => state.settings.panel[id]),
    length: state.settings.length,
    level: state.settings.level,
    answers: {},
    at: Date.now(),
  };
  startRound(round);
}

function rebut(parentId) {
  const parent = state.rounds.find((round) => round.id === parentId);
  if (!parent || state.run) return;
  const participants = rebuttalParticipants(parent);
  if (!participants.length) return;
  startRound({
    id: uid(),
    kind: "rebuttal",
    parentId,
    question: parent.display || parent.question,
    participants,
    length: "rebuttal",
    level: state.settings.level,
    answers: {},
    at: Date.now(),
  });
}

function startRound(round) {
  state.rounds.push(round);
  const needsFullRender = state.rounds.length === 1;
  if (needsFullRender) renderThread();
  else {
    // Hide the "respond to each other" offer on the round being answered, if any.
    const parentSection = round.parentId && roundSection(round.parentId);
    if (parentSection) fillRoundActions(parentSection, state.rounds.find((r) => r.id === round.parentId));
    els.thread.append(roundElement(round));
  }
  const section = roundSection(round.id);
  section?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  runRound(round, round.participants);
}

async function runRound(round, ids) {
  const controller = new AbortController();
  state.run = { controller, roundId: round.id };
  setBusy(true);
  const section = roundSection(round.id);
  fillRoundActions(section, round);
  announce(ids.length > 1 ? "The panel is answering." : `${theoristById(ids[0]).name} is answering.`);
  try {
    await Promise.allSettled(ids.map((id) => runAnswer(round, id, controller.signal)));
  } finally {
    state.run = null;
    setBusy(false);
    saveRounds();
    fillRoundActions(roundSection(round.id), round);
    updateSpeaking();
    const failed = ids.filter((id) => round.answers[id]?.status === "error").length;
    announce(failed ? `${failed} of ${ids.length} answers failed.` : "The answers are in.");
  }
}

// Busy and rate-limited providers usually recover within seconds, so an
// answer that hasn't started yet gets two more tries before it gives up.
const RETRY_DELAYS_MS = [2500, 6000];

function isRetryable(error) {
  return [429, 500, 502, 503, 504, 529].includes(error?.status) || /overloaded|temporarily|rate limit/i.test(error?.message || "");
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Stopped."), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

function explainError(error, model) {
  const message = error?.message || String(error);
  if (error?.status === 429 && /:free$/.test(model)) {
    return `${message} Free models often take only one request at a time: switch two theorists off, or choose a paid model.`;
  }
  return message;
}

async function runAnswer(round, id, signal) {
  const theorist = theoristById(id);
  const { providerId, model, key } = connection();
  const answer = { status: "waiting", text: "", provider: providerId, model, note: "", error: "", retrying: "" };
  round.answers[id] = answer;
  fillAnswer(roundSection(round.id), round, id);
  updateSpeaking();
  const system = buildSystemPrompt(theorist, { length: round.length, level: round.level });
  const messages = buildMessages(theorist, state.rounds, round);
  const maxOutput = cachedModels(providerId)?.find((entry) => entry.id === model)?.maxOutput || null;
  for (let attempt = 0; ; attempt += 1) {
    try {
      for await (const chunk of client.stream({ providerId, key, model, system, messages, maxOutput, signal })) {
        if (chunk.text) {
          answer.text += chunk.text;
          answer.status = "streaming";
          answer.retrying = "";
          scheduleFill(round, id);
        }
        if (chunk.stop === "length") answer.note = "This answer hit the model's length limit and was cut off.";
        if (chunk.stop === "refusal") answer.note = "The model declined to continue this answer.";
      }
      if (answer.text.trim()) answer.status = "done";
      else {
        answer.status = "error";
        answer.error = answer.note || "The model sent back an empty answer. Try again, or pick a different model.";
        answer.note = "";
      }
      break;
    } catch (error) {
      const aborted = error?.name === "AbortError" || signal.aborted;
      if (!aborted && !answer.text && attempt < RETRY_DELAYS_MS.length && isRetryable(error)) {
        answer.retrying = `${PROVIDERS[providerId].name} is busy right now. Trying again in a moment…`;
        fillAnswer(roundSection(round.id), round, id);
        try {
          await wait(RETRY_DELAYS_MS[attempt] + Math.random() * 1000, signal);
          continue;
        } catch {
          // Stopped while waiting; fall through to the aborted state below.
        }
      }
      answer.retrying = "";
      if (aborted || signal.aborted) {
        answer.status = answer.text ? "stopped" : "error";
        if (!answer.text) answer.error = "Stopped before an answer arrived.";
      } else {
        answer.status = "error";
        answer.error = explainError(error, model);
      }
      break;
    }
  }
  pending.delete(`${round.id}:${id}`);
  fillAnswer(roundSection(round.id), round, id);
  updateSpeaking();
}

function retry(roundId, id) {
  const round = state.rounds.find((entry) => entry.id === roundId);
  if (!round || state.run) return;
  if (!connection().ready) {
    openSettings("Connect a model, then try again.");
    return;
  }
  runRound(round, [id]);
}

// --------------------------------------------------------------------------
// Transcript

function transcript() {
  const lines = ["# Three Theorists", "", `_${new Date().toLocaleString()}_`, ""];
  for (const round of state.rounds) {
    const { label, text } = roundTitle(round);
    lines.push(`## ${label}: ${text}`, "");
    for (const id of THEORIST_IDS) {
      const answer = round.answers[id];
      if (!answer?.text?.trim()) continue;
      const theorist = theoristById(id);
      lines.push(`### ${theorist.name} (${theorist.school})`, "", answer.text.trim(), "");
    }
  }
  return lines.join("\n");
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const blob = new Blob([text], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "three-theorists.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("Clipboard unavailable, so the text was downloaded instead");
  }
}

// --------------------------------------------------------------------------
// Settings dialog

let draftModels = [];

function openSettings(message = "") {
  els.lede.textContent =
    message || "All three theorists run on the model you pick here. This page has no server: your key goes only to the provider you choose.";
  els.lede.classList.toggle("is-alert", Boolean(message));
  showProvider(state.settings.providerId);
  if (!els.dialog.open) els.dialog.showModal();
  (els.key.value ? els.model : els.key).focus();
}

function showProvider(providerId) {
  const provider = PROVIDERS[providerId];
  els.provider.value = providerId;
  const { key, remembered } = vault.read(providerId);
  els.key.value = key;
  els.key.type = "password";
  els.toggleKey.textContent = "Show";
  els.toggleKey.setAttribute("aria-pressed", "false");
  els.remember.checked = remembered;
  els.keyHint.textContent = provider.keyHint;
  els.keysLink.href = provider.keysUrl;
  els.modelFilter.value = "";
  const models = cachedModels(providerId) || [];
  fillModels(providerId, models, state.settings.models[providerId]);
  setModelStatus(models.length ? `${models.length} models available. Load again to refresh the list.` : key ? "Load models to choose one." : "");
}

function fillModels(providerId, models, preferred) {
  draftModels = models;
  const filter = els.modelFilter.value.trim().toLowerCase();
  els.modelFilter.hidden = models.length <= 30;
  if (!models.length) {
    els.model.innerHTML = `<option value="">Load models to choose one</option>`;
    els.model.disabled = true;
    return;
  }
  const selected = models.some((model) => model.id === preferred) ? preferred : pickDefaultModel(providerId, models);
  const visible = filter
    ? models.filter((model) => model.id === selected || `${model.name} ${model.id}`.toLowerCase().includes(filter))
    : models;
  els.model.innerHTML = groupModels(visible)
    .map(
      (group) =>
        `<optgroup label="${escapeHtml(group.label)} (${group.models.length})">${group.models
          .map((model) => {
            const label = model.name === model.id ? model.id : `${model.name} · ${model.id}`;
            return `<option value="${escapeHtml(model.id)}" ${model.id === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
          })
          .join("")}</optgroup>`,
    )
    .join("");
  els.model.disabled = false;
}

function setModelStatus(message, tone = "") {
  els.modelStatus.textContent = message;
  els.modelStatus.className = `field-status${tone ? ` is-${tone}` : ""}`;
}

let loadToken = 0;
async function loadModelsFor(providerId) {
  const key = els.key.value.trim();
  if (!key) {
    setModelStatus("Paste your API key first.", "error");
    els.key.focus();
    return false;
  }
  const token = ++loadToken;
  els.loadModels.disabled = true;
  setModelStatus(`Checking your key with ${PROVIDERS[providerId].name} and loading models…`);
  try {
    const models = await client.listModels(providerId, key);
    if (token !== loadToken || els.provider.value !== providerId) return false;
    cacheModels(providerId, models);
    fillModels(providerId, models, els.model.value || state.settings.models[providerId]);
    setModelStatus(`Key accepted. ${models.length} models available.`, "ok");
    return true;
  } catch (error) {
    if (token === loadToken) setModelStatus(error.message || String(error), "error");
    return false;
  } finally {
    if (token === loadToken) els.loadModels.disabled = false;
  }
}

async function saveSettingsFromDialog() {
  const providerId = els.provider.value;
  const key = els.key.value.trim();
  if (key && !draftModels.length) {
    const loaded = await loadModelsFor(providerId);
    if (!loaded) return;
  }
  vault.write(providerId, key, { remember: els.remember.checked });
  state.settings.providerId = providerId;
  if (els.model.value) state.settings.models[providerId] = els.model.value;
  saveSettings();
  updateConnection();
  if (!key) {
    setModelStatus("Paste an API key to connect.", "error");
    els.key.focus();
    return;
  }
  const queued = state.pendingQuestion;
  state.pendingQuestion = null;
  els.dialog.close();
  if (!state.rounds.length) renderThread();
  if (queued && connection().ready) {
    if (els.input.value.trim() === queued.question) els.input.value = "";
    ask(queued.question, queued);
  }
}

function bindSettings() {
  els.provider.innerHTML = Object.values(PROVIDERS)
    .map((provider) => `<option value="${provider.id}">${escapeHtml(provider.label)}</option>`)
    .join("");
  els.connection.addEventListener("click", () => openSettings());
  els.provider.addEventListener("change", () => showProvider(els.provider.value));
  els.toggleKey.addEventListener("click", () => {
    const show = els.key.type === "password";
    els.key.type = show ? "text" : "password";
    els.toggleKey.textContent = show ? "Hide" : "Show";
    els.toggleKey.setAttribute("aria-pressed", String(show));
  });
  els.key.addEventListener("change", () => {
    if (els.key.value.trim().length >= 20) loadModelsFor(els.provider.value);
  });
  els.loadModels.addEventListener("click", () => loadModelsFor(els.provider.value));
  els.modelFilter.addEventListener("input", () => fillModels(els.provider.value, draftModels, els.model.value));
  els.save.addEventListener("click", saveSettingsFromDialog);
  els.forget.addEventListener("click", () => {
    const providerId = els.provider.value;
    vault.clear(providerId);
    els.key.value = "";
    els.remember.checked = false;
    setModelStatus(`Forgot the ${PROVIDERS[providerId].name} key on this device.`, "ok");
    updateConnection();
  });
  // Nothing in this form submits: Enter in the key or filter field must never close the dialog.
  els.settingsForm.addEventListener("submit", (event) => event.preventDefault());
  // Closing without saving (× or Escape) drops a question that was waiting on a connection.
  // Do it as the close is requested: browsers skip "cancel" without recent user activation,
  // and the "close" event can arrive after the dialog has already been reopened.
  const dropQueued = () => {
    state.pendingQuestion = null;
  };
  els.closeSettings.addEventListener("click", () => {
    dropQueued();
    els.dialog.close();
  });
  els.dialog.addEventListener("cancel", dropQueued);
  els.dialog.addEventListener("close", () => {
    els.key.type = "password";
    if (!els.dialog.open) dropQueued();
  });
  els.dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dropQueued();
    if (event.key === "Enter" && (event.target === els.key || event.target === els.modelFilter)) {
      event.preventDefault();
      if (event.target === els.key) loadModelsFor(els.provider.value);
    }
  });
}

// --------------------------------------------------------------------------
// Composer and thread events

function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 200)}px`;
}

function bindComposer() {
  els.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.run) {
      state.run.controller.abort();
      return;
    }
    const question = els.input.value.trim();
    if (!question) {
      els.input.focus();
      return;
    }
    if (connection().ready) {
      els.input.value = "";
      autosize();
    }
    ask(question);
  });
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!state.run) els.composer.requestSubmit();
    }
  });
  els.input.addEventListener("input", autosize);
  els.who.addEventListener("change", (event) => {
    const box = event.target;
    state.settings.panel[box.value] = box.checked;
    if (!THEORIST_IDS.some((id) => state.settings.panel[id])) {
      box.checked = true;
      state.settings.panel[box.value] = true;
      toast("At least one theorist has to stay on the panel");
    }
    saveSettings();
  });
  els.length.addEventListener("change", (event) => {
    state.settings.length = event.target.value;
    saveSettings();
  });
  els.tuneToggle.addEventListener("click", () => {
    const open = els.composer.classList.toggle("show-tuning");
    els.tuneToggle.setAttribute("aria-expanded", String(open));
  });
  els.level.addEventListener("change", () => {
    state.settings.level = els.level.value;
    saveSettings();
  });
}

function bindThread() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const roundId = button.closest(".round")?.dataset.round;
    const theoristId = button.closest("[data-theorist]")?.dataset.theorist;
    switch (button.dataset.action) {
      case "starter": {
        const question = button.dataset.question;
        ask(question);
        break;
      }
      case "story": {
        const theorist = theoristById(theoristId);
        ask(STORY_PROMPT, { participants: [theorist.id], display: `${theorist.name}, tell us your story.` });
        break;
      }
      case "rebut":
        rebut(roundId);
        break;
      case "retry":
        retry(roundId, theoristId);
        break;
      case "copy": {
        const round = state.rounds.find((entry) => entry.id === roundId);
        const text = round?.answers[theoristId]?.text || "";
        copyText(text.trim(), "Answer copied");
        break;
      }
      case "copy-transcript":
        copyText(transcript(), "Transcript copied as Markdown");
        break;
      case "clear":
        if (globalThis.confirm("Clear this conversation? The theorists will forget it too.")) {
          state.rounds = [];
          saveRounds();
          renderThread();
        }
        break;
      case "settings":
        openSettings();
        break;
      default:
        break;
    }
  });
}

// --------------------------------------------------------------------------

function init() {
  renderPanel();
  renderControls();
  bindSettings();
  bindComposer();
  bindThread();
  updateConnection();
  renderThread();
  if (state.rounds.length) {
    requestAnimationFrame(() => roundSection(state.rounds[state.rounds.length - 1].id)?.scrollIntoView({ block: "start" }));
  }
}

init();
