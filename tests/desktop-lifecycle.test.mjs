import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
const source = fs.readFileSync(
  new URL("../electron/main.cjs", import.meta.url),
  "utf8",
);
function harness(platform = "darwin") {
  const commands = [];
  const handlers = new Map();
  const shortcuts = new Map();
  const shown = [];
  const electron = {
    app: {
      setName() {},
      getAppPath() {
        return "/local-test";
      },
      whenReady() {
        return { then() {} };
      },
      on() {},
    },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    systemPreferences: { isTrustedAccessibilityClient: () => false },
    globalShortcut: {
      register: (name, fn) => {
        shortcuts.set(name, fn);
        return true;
      },
      unregister: (name) => shortcuts.delete(name),
    },
  };
  const context = vm.createContext({
    require: (name) =>
      name === "electron"
        ? electron
        : name === "node:path"
          ? path
          : name === "node:url"
            ? { pathToFileURL }
            : name === "node:fs"
              ? {}
              : name === "node:child_process"
                ? {}
                : undefined,
    __dirname: "/local-test/electron",
    process: { argv: [], platform, pid: 100 },
    crypto,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(
    source +
      "\nglobalThis.api={toggle,permissionStatus,nativeEvent,setSpeech,pasteToTarget,syncBarVisibility,getSpeech:()=>speech,setHub:value=>hub=value,setHelper:value=>helper=value,setBar:value=>bar=value,setSettings:value=>store.settings=value};",
    context,
  );
  context.api.setHelper({
    stdin: { writable: true, write: (line) => commands.push(JSON.parse(line)) },
  });
  context.api.setHub({
    isDestroyed: () => false,
    show: () => shown.push(true),
    focus() {},
    webContents: { send() {} },
  });
  return { ...context.api, commands, handlers, shortcuts, shown };
}
function trackBar(h) {
  const visibility = [];
  h.setBar({
    isDestroyed: () => false,
    showInactive: () => visibility.push(true),
    hide: () => visibility.push(false),
    webContents: { send() {} },
  });
  return visibility;
}
test("the recording bar stays hidden on idle startup unless explicitly enabled", () => {
  const h = harness();
  const visibility = trackBar(h);
  h.syncBarVisibility();
  assert.equal(visibility.at(-1), false);
  h.setSettings({ showBar: true });
  h.syncBarVisibility();
  assert.equal(visibility.at(-1), true);
  h.setSettings({ showBar: false });
  h.setSpeech({ status: "error", error: "Permission required" });
  assert.equal(visibility.at(-1), false);
});
test("Accessibility denial keeps copied text available and reveals the permission problem", async () => {
  const h = harness();
  const paste = h.pasteToTarget({ bundleId: "test.destination" });
  assert.equal(h.commands[0].type, "paste");
  assert.equal(h.commands[0].bundleId, "test.destination");
  h.nativeEvent({
    type: "error",
    id: h.commands[0].id,
    code: "accessibility_permission_denied",
  });
  await paste;
  assert.equal(h.getSpeech().status, "idle");
  assert.equal(h.getSpeech().pasteStatus, "failed");
  assert.match(h.getSpeech().error, /not authorized this copy/);
  assert.equal(h.shown.length, 1);
});
test("paste is reported as sent only after acknowledgment from the native helper", async () => {
  const h = harness();
  const paste = h.pasteToTarget({ bundleId: "test.destination" });
  assert.equal(h.getSpeech().pasteStatus, "pending");
  h.nativeEvent({ type: "pasted", id: h.commands[0].id, posted: true });
  await paste;
  assert.equal(h.getSpeech().pasteStatus, "sent");
  assert.equal(h.shown.length, 0);
});
test("a failed paste does not steal focus from a newer dictation", async () => {
  const h = harness();
  const paste = h.pasteToTarget({ bundleId: "test.destination" });
  h.setSpeech({ status: "listening" });
  h.nativeEvent({
    type: "error",
    id: h.commands[0].id,
    code: "paste_target_not_focused",
    message: "Copy and paste manually.",
  });
  await paste;
  assert.equal(h.getSpeech().status, "listening");
  assert.equal(h.getSpeech().pasteStatus, "failed");
  assert.equal(h.shown.length, 0);
});
test("paste transport failures are surfaced instead of silently swallowed", async () => {
  const h = harness();
  h.setHelper({ stdin: { writable: false } });
  await h.pasteToTarget({ bundleId: "test.destination" });
  assert.equal(h.getSpeech().pasteStatus, "failed");
  assert.match(h.getSpeech().error, /could not send the paste command/);
  assert.equal(h.shown.length, 1);
});
test("the recording bar appears for dictation and hides after completion or cancellation", () => {
  const h = harness();
  const visibility = trackBar(h);
  h.setSettings({ showBar: false });
  for (const status of ["starting", "listening", "processing"]) {
    h.setSpeech({ status });
    assert.equal(visibility.at(-1), true);
  }
  h.setSpeech({ status: "idle" });
  assert.equal(visibility.at(-1), false);
  h.setSpeech({ status: "listening" });
  h.nativeEvent({ type: "cancelled" });
  assert.equal(visibility.at(-1), false);
});
test("a rapid second shortcut cancels a pending start before opening the microphone", async () => {
  const h = harness();
  const first = h.toggle();
  assert.equal(h.commands[0].type, "frontmost");
  await h.toggle();
  assert.equal(h.commands[1].type, "stop");
  h.nativeEvent({ type: "stopped" });
  h.nativeEvent({
    type: "frontmost",
    id: h.commands[0].id,
    bundleId: "test.destination",
    name: "Notes",
  });
  await first;
  assert.equal(
    h.commands.some((c) => c.type === "start"),
    false,
  );
  assert.equal(h.getSpeech().status, "idle");
});
test("one start captures its destination and busy does not discard the active session", async () => {
  const h = harness();
  const start = h.toggle();
  h.nativeEvent({
    type: "frontmost",
    id: h.commands[0].id,
    bundleId: "test.destination",
    name: "Notes",
  });
  await start;
  assert.equal(h.commands[1].type, "start");
  assert.equal(h.getSpeech().bundleId, "test.destination");
  h.nativeEvent({ type: "listening" });
  h.nativeEvent({ type: "error", code: "busy", message: "Already active" });
  assert.equal(h.getSpeech().status, "listening");
  assert.ok(h.shortcuts.has("Escape"));
});
test("a late paste failure preserves a new recording and Escape cancellation", async () => {
  const h = harness();
  const start = h.toggle();
  h.nativeEvent({
    type: "frontmost",
    id: h.commands[0].id,
    bundleId: "test.destination",
    name: "Notes",
  });
  await start;
  h.nativeEvent({ type: "listening" });
  h.nativeEvent({
    type: "error",
    code: "paste_target_not_focused",
    message: "Paste manually",
  });
  assert.equal(h.getSpeech().status, "listening");
  assert.ok(h.shortcuts.has("Escape"));
  h.shortcuts.get("Escape")();
  assert.equal(h.getSpeech().status, "idle");
  assert.equal(h.commands.at(-1).type, "cancel");
  assert.equal(h.shortcuts.has("Escape"), false);
});

test("Windows permission checks do not call the macOS Accessibility API", async () => {
  const h = harness("win32");
  const check = h.permissionStatus();
  h.nativeEvent({type: "status", id: h.commands[0].id, permissions: {
    accessibility: true, microphone: "unknown", speech: "authorized"
  }});
  const result = await check;
  assert.equal(result.appAccessibility, true);
  assert.equal(result.speech, "authorized");
});
test("Windows preserves the original window handle through start and paste", async () => {
  const h = harness("win32");
  const start = h.toggle();
  h.nativeEvent({type: "frontmost", id: h.commands[0].id, bundleId: "987654", name: "Notepad", pid: 200});
  await start;
  assert.equal(h.getSpeech().targetPid, 200);
  const paste = h.pasteToTarget({bundleId: h.getSpeech().bundleId});
  const command = h.commands.at(-1);
  assert.equal(command.bundleId, "987654");
  h.nativeEvent({type: "pasted", id: command.id, posted: true});
  await paste;
  assert.equal(h.getSpeech().pasteStatus, "sent");
});
