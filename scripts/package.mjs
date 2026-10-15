import { packager } from "@electron/packager";
import { mkdir, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = process.cwd();
execFileSync(path.join(root, "native/build.sh"), {
  cwd: root,
  stdio: "inherit",
});
const outputs = await packager({
  dir: root,
  out: path.join(root, "release"),
  name: "Quill",
  platform: "darwin",
  arch: "arm64",
  appBundleId: "ai.quill.local",
  appCategoryType: "public.app-category.productivity",
  appVersion: "1.0.0",
  overwrite: true,
  asar: true,
  icon: path.join(root, "public/quill.icns"),
  prune: true,
  ignore: [
    /^\/output(?:\/|$)/,
    /^\/research(?:\/|$)/,
    /^\/release(?:\/|$)/,
    /^\/native(?:\/|$)/,
    /^\/tests(?:\/|$)/,
    /^\/scripts(?:\/|$)/,
    /^\/\.git(?:\/|$)/,
  ],
  extendInfo: {
    NSMicrophoneUsageDescription:
      "Quill uses your microphone only when you start dictation, to turn your speech into text.",
    NSSpeechRecognitionUsageDescription:
      "Quill transcribes dictation using Apple Speech. Audio stays on this Mac when supported; otherwise Apple processes the audio.",
    LSMinimumSystemVersion: "13.0",
  },
});
for (const output of outputs) {
  const app = path.join(output, "Quill.app");
  const native = path.join(app, "Contents/Resources/native/bin");
  await mkdir(native, { recursive: true });
  await copyFile(
    path.join(root, "native/bin/flow-speech"),
    path.join(native, "flow-speech"),
  );
  execFileSync("chmod", ["755", path.join(native, "flow-speech")]);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
    stdio: "inherit",
  });
  console.log(`Built ${app}`);
}
