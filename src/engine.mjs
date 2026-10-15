const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrasePattern = (phrase) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escape(phrase)}(?![\\p{L}\\p{N}_])`, "giu");

export function polishText(raw, options = {}) {
  const {
    dictionary = [],
    snippets = [],
    style = "casual",
    cleanup = true,
  } = options;
  let text = raw.trim();
  if (!text) return "";
  // Expand exact spoken snippets first. Do not normalize saved expansion content.
  const exact = snippets.find(
    (s) =>
      s.trigger.toLocaleLowerCase() ===
      text.replace(/[.!?]$/, "").toLocaleLowerCase(),
  );
  if (exact) return exact.expansion;
  const expansions = [];
  for (const snippet of [...snippets].sort(
    (a, b) => b.trigger.length - a.trigger.length,
  )) {
    text = text.replace(phrasePattern(snippet.trigger), () => {
      const index = expansions.push(snippet.expansion) - 1;
      return `\uE000${index}\uE001`;
    });
  }
  if (cleanup) {
    text = text
      .replace(/\b(um+|uh+|erm|er)\b[,\s]*/gi, "")
      .replace(/\b(\p{L}+)\s+\1\b/giu, "$1");
    text = text
      .replace(/\bnew paragraph\b[,.]?\s*/gi, "\n\n")
      .replace(/\bnew line\b[,.]?\s*/gi, "\n");
    text = text.replace(
      /\b(comma|full stop|period|question mark|exclamation mark|colon)\b/gi,
      (match) =>
        ({
          comma: ",",
          "full stop": ".",
          period: ".",
          "question mark": "?",
          "exclamation mark": "!",
          colon: ":",
        })[match.toLowerCase()],
    );
    text = text
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/ +([,.!?:;])/g, "$1")
      .replace(/([,.!?:;])(?=[\p{L}])/gu, "$1 ")
      .trim();
  }
  for (const word of dictionary) {
    if (word.from?.trim())
      text = text.replace(phrasePattern(word.from.trim()), () => word.word);
    else text = text.replace(phrasePattern(word.word), () => word.word);
  }
  if (style !== "very-casual") {
    text = text
      .replace(
        /(^|[.!?]\s+|\n)([a-z])/g,
        (_, prefix, char) => prefix + char.toUpperCase(),
      )
      .replace(/\bi\b/g, "I");
    if (cleanup && /[\p{L}\p{N}]$/u.test(text)) text += ".";
  }
  text = text.replace(
    /\uE000(\d+)\uE001/g,
    (_, index) => expansions[Number(index)],
  );
  return text;
}
export const wordCount = (text) =>
  (text.trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
export function makeDictation(raw, options = {}) {
  const text = polishText(raw, options);
  if (!text) return null;
  return {
    id: crypto.randomUUID(),
    raw,
    text,
    words: wordCount(text),
    createdAt: new Date().toISOString(),
    duration: options.duration || 0,
    app: options.app || "Quill",
    sample: false,
  };
}
export function validateEntry(trigger, entries, editingId) {
  if (!trigger.trim()) return "Please enter a word or phrase.";
  if (
    entries.some(
      (item) =>
        item.id !== editingId &&
        (item.trigger || item.word).toLocaleLowerCase() ===
          trigger.trim().toLocaleLowerCase(),
    )
  )
    return "That word or phrase already exists.";
  return null;
}
