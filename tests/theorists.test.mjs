import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEORISTS,
  HISTORY_LIMIT,
  buildMessages,
  buildRebuttalPrompt,
  buildSystemPrompt,
  rebuttalParticipants,
  theoristById,
} from "../js/theorists.js";
import { escapeHtml, renderMarkdown, renderInline, wordCount } from "../js/markdown.js";

const body = theoristById("body");

function round(id, question, answers, extra = {}) {
  return { id, kind: "question", question, participants: ["body", "substrate", "loop"], answers, ...extra };
}

const done = (text) => ({ status: "done", text });

test("each theorist's system prompt carries its school, the others, and the reply settings", () => {
  for (const theorist of THEORISTS) {
    const prompt = buildSystemPrompt(theorist, { length: "quick", level: "kid" });
    assert.match(prompt, new RegExp(`Your school: ${theorist.school}`));
    for (const other of THEORISTS.filter((t) => t.id !== theorist.id)) assert.ok(prompt.includes(other.name));
    assert.match(prompt, /60 to 110 words/);
    assert.match(prompt, /10-year-old/);
    assert.match(prompt, /never invent quotes/);
  }
  assert.match(buildSystemPrompt(body, { length: "rebuttal" }), /90 to 150 words/);
  assert.match(buildSystemPrompt(body, { length: "nonsense", level: "nonsense" }), /150 to 250 words[\s\S]*curious adult/);
});

test("history keeps only this theorist's finished answers, alternating strictly", () => {
  const rounds = [
    round("r1", "What is consciousness?", { body: done("Feeling."), substrate: done("Wiring.") }),
    round("r2", "Is my dog conscious?", { body: { status: "error", text: "", error: "boom" } }),
    round("r3", "What about AI?", {}),
  ];
  const messages = buildMessages(body, rounds, rounds[2]);
  assert.deepEqual(messages, [
    { role: "user", content: "What is consciousness?" },
    { role: "assistant", content: "Feeling." },
    { role: "user", content: "What about AI?" },
  ]);
});

test("history is capped to the most recent exchanges", () => {
  const rounds = Array.from({ length: HISTORY_LIMIT + 3 }, (_, i) => round(`r${i}`, `Q${i}`, { body: done(`A${i}`) }));
  const current = round("now", "Latest?", {});
  const messages = buildMessages(body, [...rounds, current], current);
  assert.equal(messages.length, HISTORY_LIMIT * 2 + 1);
  assert.equal(messages[0].content, "Q3");
  assert.equal(messages.at(-1).content, "Latest?");
});

test("a retry of an earlier round only sees what came before it", () => {
  const rounds = [
    round("r1", "First?", { body: done("One.") }),
    round("r2", "Second?", { body: { status: "error", text: "" } }),
    round("r3", "Third?", { body: done("Three.") }),
  ];
  const messages = buildMessages(body, rounds, rounds[1]);
  assert.deepEqual(messages.map((m) => m.content), ["First?", "One.", "Second?"]);
});

test("rebuttals quote the other finished answers and replay correctly in later history", () => {
  const parent = round("r1", "Could AI be conscious?", {
    body: done("No stakes, no feeling."),
    substrate: done("Wrong hardware."),
    loop: { status: "error", text: "" },
  });
  assert.deepEqual(rebuttalParticipants(parent), ["body", "substrate"]);
  const prompt = buildRebuttalPrompt(body, parent);
  assert.match(prompt, /Another panelist just answered/);
  assert.match(prompt, /The Substrate Theorist \(The Physical Substrate\) said:\n"""\nWrong hardware\.\n"""/);
  assert.doesNotMatch(prompt, /No stakes/);
  assert.match(prompt, /Respond to the Substrate Theorist/);

  const rebuttal = { id: "r2", kind: "rebuttal", parentId: "r1", question: parent.question, participants: ["body", "substrate"], answers: { body: done("I agree it's not software.") } };
  const followUp = round("r3", "And octopuses?", {});
  const messages = buildMessages(body, [parent, rebuttal, followUp], followUp);
  assert.equal(messages.length, 5);
  assert.match(messages[2].content, /Wrong hardware/);
  assert.equal(messages[3].content, "I agree it's not software.");
});

test("rebuttals need at least two finished answers", () => {
  assert.deepEqual(rebuttalParticipants(round("r", "q", { body: done("x") })), []);
});

test("markdown escapes HTML and renders the small supported subset", () => {
  const html = renderMarkdown('Hello <script>alert(1)</script> **bold** and *soft*\n\n- one\n- two with `code`\n\n1. first\n2. second\n\n> quoted');
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>soft<\/em>/);
  assert.match(html, /<ul><li>one<\/li><li>two with <code>code<\/code><\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
});

test("markdown only links http(s) URLs and keeps attributes escaped", () => {
  assert.match(renderInline("[site](https://example.com/a?b=1&c=2)"), /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">site<\/a>/);
  assert.doesNotMatch(renderInline("[x](javascript:alert(1))"), /<a /);
  assert.doesNotMatch(renderInline('[x](https://e.com/"onmouseover="alert(1))'), /"onmouseover="/);
  assert.equal(escapeHtml(`<a href="x">'`), "&lt;a href=&quot;x&quot;&gt;&#39;");
});

test("markdown leaves arithmetic and snake_case alone and continues wrapped list items", () => {
  assert.equal(renderInline("2 * 3 * 4"), "2 * 3 * 4");
  assert.equal(renderInline("snake_case_name"), "snake_case_name");
  assert.match(renderMarkdown("- a long item\n  that wraps\n- next"), /<li>a long item that wraps<\/li><li>next<\/li>/);
  assert.match(renderMarkdown("## Heading"), /<p class="md-heading"><strong>Heading<\/strong><\/p>/);
});

test("wordCount counts words, not punctuation", () => {
  assert.equal(wordCount("Feeling comes first — it's the body's job."), 7);
});
