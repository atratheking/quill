const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  Tray,
  Menu,
  nativeImage,
  clipboard,
  dialog,
  shell,
  systemPreferences,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
app.setName("Quill");
const isWindows = process.platform === "win32";
const isDev = process.argv.includes("--dev");
let hub,
  bar,
  tray,
  helper,
  store = {},
  engine;
let quitting = false;
let speech = {
  status: "idle",
  text: "",
  error: "",
  app: "Quill",
  bundleId: "",
};
let startedAt = 0;
let finalHandled = true;
let startGeneration = 0;
let registeredShortcut = null;
let escapeRegistered = false;
const pending = new Map();
const allowedStore = new Set([
  "history",
  "dictionary",
  "snippets",
  "settings",
  "notes",
]);
const root = app.getAppPath();
let file;
const readStore = () => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};
function saveStore() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function broadcast(channel, data) {
  for (const win of [hub, bar])
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}
function syncBarVisibility() {
  if (!bar || bar.isDestroyed()) return;
  const active = ["starting", "listening", "processing"].includes(
    speech.status,
  );
  if (active || store.settings?.showBar === true) bar.showInactive();
  else bar.hide();
}
function setSpeech(data) {
  speech = { ...speech, ...data };
  const active = ["starting", "listening", "processing"].includes(
    speech.status,
  );
  if (active && !escapeRegistered) {
    escapeRegistered = globalShortcut.register("Escape", () => {
      startGeneration++;
      finalHandled = true;
      try {
        sendNative({ type: "cancel" });
      } catch {}
      setSpeech({ status: "idle", text: "", error: "" });
    });
  } else if (!active && escapeRegistered) {
    globalShortcut.unregister("Escape");
    escapeRegistered = false;
  }
  broadcast("speech", speech);
  syncBarVisibility();
}
function loadWindow(win, query = "") {
  if (isDev) win.loadURL("http://127.0.0.1:5173/" + query);
  else
    win.loadFile(path.join(root, "dist/index.html"), {
      query: query ? { overlay: "1" } : {},
    });
}
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:") && !url.startsWith("http://127.0.0.1:5173/"))
      event.preventDefault();
  });
}
function showHub() {
  if (!hub || hub.isDestroyed()) createHub();
  hub.show();
  hub.focus();
}
function createHub() {
  hub = new BrowserWindow({
    width: 1200,
    height: 810,
    minWidth: 820,
    minHeight: 600,
    title: "Quill",
    backgroundColor: "#F5F4F0",
    titleBarStyle: "hidden",
    ...(isWindows ? { titleBarOverlay: { color: "#F5F4F0", symbolColor: "#242621", height: 36 } } : {}),
    trafficLightPosition: { x: 18, y: 19 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  secureWindow(hub);
  loadWindow(hub);
  hub.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      hub.hide();
    }
  });
}
function createBar() {
  const bounds = screen.getPrimaryDisplay().workArea;
  bar = new BrowserWindow({
    width: 450,
    height: 168,
    x: Math.round(bounds.x + (bounds.width - 450) / 2),
    y: bounds.y + bounds.height - 176,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  bar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  secureWindow(bar);
  loadWindow(bar, "?overlay=1");
  bar.webContents.once("did-finish-load", syncBarVisibility);
}
function sendNative(command) {
  if (!helper?.stdin?.writable)
    throw new Error("Speech helper is unavailable. Reopen Quill.");
  helper.stdin.write(JSON.stringify(command) + "\n");
}
function requestNative(type, extra = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Native helper did not respond."));
    }, 2500);
    pending.set(id, { resolve, timer, type });
    try {
      sendNative({ type, id, ...extra });
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e);
    }
  });
}
function reportPasteFailure(message) {
  setSpeech({ pasteStatus: "failed", error: message });
  // A hidden hub and an idle-only recording bar must not hide paste failures.
  // Do not steal focus if the user has already started another dictation.
  if (speech.status === "idle" || speech.status === "error") {
    showHub();
    hub.webContents.send("navigate", {
      page: "Settings",
      settingsTab: "System",
    });
  }
}
async function pasteToTarget(target) {
  setSpeech({ pasteStatus: "pending" });
  try {
    const result = await requestNative("paste", { bundleId: target.bundleId });
    if (result.type !== "pasted") {
      reportPasteFailure(
        result.code === "accessibility_permission_denied"
          ? "Your words were copied, but macOS has not authorized this copy of Quill to paste. Reconnect Quill in System Settings → Privacy & Security → Accessibility, then use Recheck access below."
          : result.message ||
              `Your words were copied, but the paste command failed. You can paste them with ${isWindows ? "Ctrl" : "Command"} + V.`,
      );
      return;
    }
    setSpeech({ pasteStatus: "sent" });
  } catch (error) {
    reportPasteFailure(
      "Your words were copied, but Quill could not send the paste command. " +
        error.message,
    );
  }
}
async function permissionStatus() {
  const result = await requestNative("status");
  return {
    accessibility: result.permissions?.accessibility === true,
    appAccessibility: isWindows || systemPreferences.isTrustedAccessibilityClient(false),
    microphone: result.permissions?.microphone || "unknown",
    speech: result.permissions?.speech || "unknown",
  };
}
async function completeDictation(event) {
  if (finalHandled) return;
  finalHandled = true;
  const raw = event.text || "";
  const duration = Math.max(
    1,
    Number(event.duration) || (Date.now() - startedAt) / 1000,
  );
  const entry = engine.makeDictation(raw, {
    dictionary: store.dictionary || [],
    snippets: store.snippets || [],
    style: store.settings?.style || "casual",
    cleanup: store.settings?.cleanup !== false,
    duration,
    app: speech.app,
  });
  if (entry) {
    store.history = [entry, ...(store.history || [])];
    saveStore();
    broadcast("store", store);
    clipboard.writeText(entry.text);
    const target = { bundleId: speech.bundleId };
    setSpeech({
      status: "idle",
      text: entry.text,
      error: "",
      pasteStatus: "clipboard",
    });
    if (
      store.settings?.autoPaste !== false &&
      target.bundleId &&
      target.bundleId !== "ai.quill.local" &&
      (!isWindows || speech.targetPid !== process.pid)
    ) {
      bar?.hide();
      await pasteToTarget(target);
    }
  } else
    setSpeech({
      status: "idle",
      text: "",
      error: "No speech was detected. Check your microphone and try again.",
    });
}
function startHelper() {
  const helperName = isWindows ? "quill-speech.exe" : "flow-speech";
  const executable = path.join(app.isPackaged ? process.resourcesPath : root, "native/bin", helperName);
  if (!fs.existsSync(executable)) {
    setSpeech({
      status: "error",
      error:
        isWindows ? "The speech helper is missing. Run native/windows/build.ps1 and reopen Quill." : "The speech helper is missing. Run native/build.sh and reopen the app.",
    });
    return;
  }
  helper = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  helper.stdout.setEncoding("utf8");
  helper.stdin.on("error", (error) => {
    if (!quitting) setSpeech({ status: "error", error: error.message });
  });
  let buffer = "";
  helper.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        nativeEvent(JSON.parse(line));
      } catch (e) {
        console.error("Speech event error", e.message);
      }
    }
  });
  helper.stderr.on("data", (d) => console.error(d.toString()));
  helper.on("error", (e) => setSpeech({ status: "error", error: e.message }));
  helper.on("exit", () => {
    helper = null;
    if (!quitting)
      setSpeech({
        status: "error",
        error: "Speech service stopped. Quit and reopen Quill.",
      });
  });
}
function nativeEvent(event) {
  if (event.id && pending.has(event.id)) {
    const p = pending.get(event.id);
    clearTimeout(p.timer);
    pending.delete(event.id);
    p.resolve(event);
    if (p.type === "paste") return;
  }
  if (event.type === "level") broadcast("speech:level", event.level);
  if (event.type === "listening") setSpeech({ status: "listening", error: "" });
  if (event.type === "partial") setSpeech({ text: event.text || "" });
  if (event.type === "final")
    completeDictation(event).catch((e) =>
      setSpeech({ status: "error", error: e.message }),
    );
  if (event.type === "stopped") setSpeech({ status: "idle", text: "" });
  if (event.type === "cancelled")
    setSpeech({ status: "idle", text: "", error: "" });
  if (event.type === "error") {
    if (
      event.code === "busy" &&
      ["starting", "listening", "processing"].includes(speech.status)
    )
      return;
    if (
      event.code === "accessibility_permission_denied" ||
      event.code?.startsWith("paste_") ||
      event.code === "accessibility_required" ||
      event.code === "paste_permission_denied" ||
      event.code === "accessibility_denied"
    ) {
      setSpeech({
        error:
          event.code === "accessibility_permission_denied"
            ? "Text copied. Enable Accessibility for Quill to paste into other apps."
            : event.message ||
              "Text copied. Paste it manually into your other app.",
      });
      return;
    }
    finalHandled = true;
    setSpeech({
      status: "error",
      error: event.message || "Speech recognition could not start.",
    });
  }
}
async function toggle() {
  if (speech.status === "listening" || speech.status === "starting") {
    startGeneration++;
    setSpeech({ status: "processing" });
    sendNative({ type: "stop" });
    return;
  }
  if (speech.status === "processing") return;
  const generation = ++startGeneration;
  // Reserve this start before awaiting the target, without showing the bar yet.
  speech = { ...speech, status: "starting", text: "", error: "" };
  let target = {};
  try {
    target = await requestNative("frontmost");
  } catch {}
  if (generation !== startGeneration || speech.status !== "starting") return;
  startedAt = Date.now();
  finalHandled = false;
  setSpeech({
    status: "starting",
    text: "",
    error: "",
    app: target.name || "Quill",
    bundleId: target.bundleId || "",
    targetPid: target.pid,
  });
  try {
    sendNative({
      type: "start",
      language: store.settings?.language || "en-AU",
      contextualStrings: (store.dictionary || [])
        .map((w) => w.word)
        .slice(0, 500),
    });
  } catch (e) {
    setSpeech({ status: "error", error: e.message });
  }
}
function registerShortcut(value) {
  if (value === registeredShortcut) return true;
  let success = false;
  try {
    success = globalShortcut.register(value, () =>
      toggle().catch((e) => setSpeech({ status: "error", error: e.message })),
    );
  } catch {}
  if (!success) return false;
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  registeredShortcut = value;
  return true;
}
app.whenReady().then(async () => {
  file = path.join(app.getPath("userData"), "workspace.json");
  // Carry the previous local workspace forward without replacing or deleting it.
  const previousFile = path.join(
    app.getPath("appData"),
    "Flow Local",
    "workspace.json",
  );
  if (!fs.existsSync(file) && fs.existsSync(previousFile)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(previousFile, file, fs.constants.COPYFILE_EXCL);
  }
  store = readStore();
  engine = await import(pathToFileURL(path.join(root, "src/engine.mjs")).href);
  createHub();
  createBar();
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAUUlEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFAAAcAQAAScRjEgAAAAASUVORK5CYII=",
  );
  if (isWindows) {
    const trayIcon = nativeImage.createFromPath(path.join(root, "public/quill.iconset/icon_32x32.png"));
    tray = new Tray(trayIcon);
  } else {
    icon.setTemplateImage(true);
    tray = new Tray(icon);
  }
  tray.setTitle("▥");
  tray.setToolTip("Quill");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Quill", click: showHub },
      {
        label: "Start / stop dictation",
        accelerator: "CommandOrControl+Shift+Space",
        click: () => toggle(),
      },
      { type: "separator" },
      {
        label: "Quit Quill",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showHub);
  if (
    !registerShortcut(
      store.settings?.shortcut || "CommandOrControl+Shift+Space",
    )
  ) {
    setSpeech({
      error:
        "The dictation shortcut is already in use. Choose another in Settings.",
    });
  }
  startHelper();
  if (process.argv.includes("--smoke-test")) {
    // CI exercises the packaged renderer and native bridge without audio or input.
    const timeout = setTimeout(() => app.exit(1), 15000);
    const check = async () => {
      try {
        if (await hub.webContents.executeJavaScript("document.querySelector('#root').children.length") < 1)
          throw new Error("Renderer did not mount.");
        const status = await permissionStatus();
        if (!status.microphone || !status.speech) throw new Error("Native status unavailable.");
        console.log("Quill packaged startup check passed.");
        clearTimeout(timeout);
        quitting = true;
        app.quit();
      } catch (error) { console.error(error); app.exit(1); }
    };
    if (hub.webContents.isLoading()) hub.webContents.once("did-finish-load", check);
    else check();
  }
  app.on("activate", showHub);
});
app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
  helper?.kill();
});
app.on("window-all-closed", () => {});
ipcMain.handle("store:get", () => store);
ipcMain.handle("store:set", (_, payload) => {
  if (!payload || !allowedStore.has(payload.key))
    throw new Error("Invalid setting");
  store[payload.key] = payload.value;
  saveStore();
  broadcast("store", store);
  if (payload.key === "settings") syncBarVisibility();
  return true;
});
ipcMain.handle("speech:toggle", () => toggle());
ipcMain.handle("speech:stop", () => {
  startGeneration++;
  setSpeech({ status: "processing" });
  sendNative({ type: "stop" });
});
ipcMain.handle("speech:cancel", () => {
  startGeneration++;
  finalHandled = true;
  sendNative({ type: "cancel" });
  setSpeech({ status: "idle", text: "" });
});
ipcMain.handle("speech:state", () => speech);
ipcMain.handle("speech:status", () => requestNative("status"));
ipcMain.handle("permissions:status", permissionStatus);
ipcMain.handle("settings:locate-app", () => {
  const bundle = app.isPackaged && !isWindows
    ? path.dirname(path.dirname(path.dirname(process.execPath)))
    : process.execPath;
  shell.showItemInFolder(bundle);
});
ipcMain.handle("window:show", showHub);
ipcMain.handle("window:minimize", () => hub?.minimize());
ipcMain.handle("window:maximize", () =>
  hub?.isMaximized() ? hub.unmaximize() : hub.maximize(),
);
ipcMain.handle("window:close", () => hub?.hide());
ipcMain.handle("clipboard:copy", (_, text) => {
  if (typeof text === "string") clipboard.writeText(text);
});
ipcMain.handle("shortcut:set", (_, shortcut) => registerShortcut(shortcut));
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("settings:open-permissions", (_, kind) => {
  if (isWindows) {
    return shell.openExternal(kind === "microphone" ? "ms-settings:privacy-microphone" : "ms-settings:speech");
  }
  if (kind === "accessibility")
    systemPreferences.isTrustedAccessibilityClient(true);
  const suffix =
    kind === "accessibility"
      ? "Privacy_Accessibility"
      : kind === "speech"
        ? "Privacy_SpeechRecognition"
        : "Privacy_Microphone";
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?" + suffix,
  );
});
ipcMain.handle("history:export", async () => {
  const result = await dialog.showSaveDialog(hub, {
    defaultPath: "Quill dictations.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(
      result.filePath,
      JSON.stringify(store.history || [], null, 2),
    );
    return true;
  }
  return false;
});
