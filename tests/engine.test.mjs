import { test } from "node:test";
import assert from "node:assert/strict";
import {
  polishText,
  makeDictation,
  validateEntry,
  wordCount,
} from "../src/engine.mjs";
test("spoken cleanup and dictionary corrections work together", () => {
  assert.equal(
    polishText(
      "um hey the the whisper flow app is ready comma can you try it question mark",
      { dictionary: [{ word: "Wispr Flow", from: "whisper flow" }] },
    ),
    "Hey the Wispr Flow app is ready, can you try it?",
  );
});
test("whole spoken snippet preserves multiline formatting and casing", () => {
  assert.equal(
    polishText("my sign off.", {
      snippets: [{ trigger: "my sign off", expansion: "Thanks,\nAlex" }],
    }),
    "Thanks,\nAlex",
  );
});
test("inline snippets do not alter emails, links, or special characters", () => {
  assert.equal(
    polishText("contact my email", {
      snippets: [{ trigger: "my email", expansion: "alex@example.test" }],
    }),
    "Contact alex@example.test",
  );
});
test("corrections match words without replacing parts of other words", () => {
  assert.equal(
    polishText("fig figures fig.", {
      dictionary: [{ word: "Figma", from: "fig" }],
      cleanup: false,
    }),
    "Figma figures Figma.",
  );
});
test("cleanup can be disabled and very casual preserves casing", () => {
  assert.equal(
    polishText("um hello hello", { cleanup: false, style: "very-casual" }),
    "um hello hello",
  );
  assert.equal(polishText("um hello hello", { style: "very-casual" }), "hello");
});
test("spoken line breaks survive normalization", () => {
  assert.equal(
    polishText("hello new paragraph welcome back"),
    "Hello\n\nWelcome back.",
  );
});
test("empty speech is not stored and new dictation has actual stats", () => {
  assert.equal(makeDictation(" "), null);
  const result = makeDictation("hello world", { duration: 3, app: "Notes" });
  assert.equal(result.words, 2);
  assert.equal(result.duration, 3);
  assert.equal(result.sample, false);
  assert.equal(result.app, "Notes");
});
test("entries reject empty and duplicate names without blocking own edits", () => {
  const items = [{ id: "a", word: "Figma" }];
  assert.ok(validateEntry("  ", items));
  assert.ok(validateEntry("FIGMA", items));
  assert.equal(validateEntry("Figma", items, "a"), null);
});
test("word counts support multilingual text and contractions", () => {
  assert.equal(wordCount("We’re testing 3 words"), 4);
  assert.equal(wordCount("مرحبا بالعالم"), 2);
});
