import { packager } from "@electron/packager";
import { mkdir, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = process.cwd();
const windows = process.platform === "win32";
if (!windows && process.platform !== "darwin") throw new Error("Build on macOS or Windows.");
execFileSync(windows ? "powershell.exe" : path.join(root, "native/build.sh"), windows
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "native/windows/build.ps1")]
  : [], { cwd: root, stdio: "inherit" });
const outputs = await packager({
  dir: root, out: path.join(root, "release"), name: "Quill",
  platform: windows ? "win32" : "darwin", arch: windows ? "x64" : "arm64",
  appBundleId: "ai.quill.local", appCategoryType: "public.app-category.productivity",
  appVersion: "1.0.0", overwrite: true, asar: true, prune: true,
  ...(windows ? {} : { icon: path.join(root, "public/quill.icns") }),
  ignore: [
    /^\/(?:output|research|release|native|tests|scripts|\.git|\.github)(?:\/|$)/,
    /^\/public\/assets\/images\/(?:home|library)-banner\.png$/,
    /^\/public\/flow\.(?:icns|iconset)(?:\/|$)/,
  ],
  ...(!windows ? { extendInfo: {
    NSMicrophoneUsageDescription: "Quill uses your microphone only when you start dictation, to turn your speech into text.",
    NSSpeechRecognitionUsageDescription: "Quill transcribes dictation using Apple Speech. Audio stays on this Mac when supported; otherwise Apple processes the audio.",
    LSMinimumSystemVersion: "13.0",
  }} : {}),
});
for (const output of outputs) {
  const app = windows ? output : path.join(output, "Quill.app");
  const native = path.join(app, windows ? "resources/native/bin" : "Contents/Resources/native/bin");
  const helper = windows ? "quill-speech.exe" : "flow-speech";
  await mkdir(native, { recursive: true });
  await copyFile(path.join(root, "native/bin", helper), path.join(native, helper));
  if (!windows) {
    execFileSync("chmod", ["755", path.join(native, helper)]);
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  }
  console.log(`Built ${app}`);
}
