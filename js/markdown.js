// A deliberately small Markdown renderer for model answers: paragraphs,
// bullet and numbered lists, block quotes, bold, italics, inline code and
// http(s) links. Everything is HTML-escaped first, so model output can never
// inject markup.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function renderInline(text) {
  const codes = [];
  let html = escapeHtml(text).replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?![_\w])/g, "$1<em>$2</em>");
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
}

const BULLET = /^\s*[-*•+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function renderMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let list = null;
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      const start = list.type === "ol" && list.start !== 1 ? ` start="${list.start}"` : "";
      out.push(`<${list.type}${start}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
    }
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushAll();
      continue;
    }
    if (RULE.test(line)) {
      flushAll();
      continue;
    }
    let match;
    if ((match = line.match(HEADING))) {
      flushAll();
      out.push(`<p class="md-heading"><strong>${renderInline(match[1])}</strong></p>`);
    } else if ((match = line.match(BULLET)) || (match = line.match(NUMBERED))) {
      const type = match.length === 3 ? "ol" : "ul";
      const text = type === "ol" ? match[2] : match[1];
      flushParagraph();
      flushQuote();
      if (!list || list.type !== type) {
        flushList();
        list = { type, start: type === "ol" ? Number(match[1]) : 1, items: [] };
      }
      list.items.push(text);
    } else if ((match = line.match(QUOTE))) {
      flushParagraph();
      flushList();
      quote.push(match[1]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      flushQuote();
      paragraph.push(line.trim());
    }
  }
  flushAll();
  return out.join("\n");
}

export function wordCount(text) {
  return (String(text || "").match(/[A-Za-z0-9’'-]+/g) || []).length;
}
