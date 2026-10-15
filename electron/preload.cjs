const { contextBridge, ipcRenderer } = require("electron");
const requests = new Set([
  "store:get",
  "theme:set",
  "store:set",
  "speech:toggle",
  "speech:stop",
  "speech:cancel",
  "speech:state",
  "speech:status",
  "permissions:status",
  "settings:locate-app",
  "window:show",
  "window:minimize",
  "window:close",
  "window:maximize",
  "clipboard:copy",
  "history:export",
  "shortcut:set",
  "settings:open-permissions",
  "app:version",
]);
const events = new Set(["speech", "store", "navigate"]);
contextBridge.exposeInMainWorld("flow", {
  platform: process.platform,
  invoke: (channel, payload) =>
    requests.has(channel)
      ? ipcRenderer.invoke(channel, payload)
      : Promise.reject(new Error("Unsupported action")),
  on: (channel, callback) => {
    if (!events.has(channel)) return () => {};
    const handler = (_, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
