# Quill

A macOS dictation app with a quiet recording overlay, automatic paste, and a workspace for your words. Built with Electron, React, TypeScript, and a native Swift helper using Apple Speech.

Quill is an independent project inspired by Wispr Flow. It uses its own implementation and does not include Wispr’s proprietary speech models or cloud services.

## Features

- Start and stop dictation with a customizable global keyboard shortcut.
- Transcribe with Apple Speech and paste into the app you were using.
- Browse local dictation history, search transcripts, and copy text.
- Manage dictionary terms, snippets, writing preferences, and notes.
- Keep the overlay hidden while idle, or enable an always-visible bar in settings.
- Check microphone, speech recognition, and Accessibility permissions in the app.

Text cleanup uses local rules. Team accounts, cloud sync, and Wispr’s AI rewriting are not implemented.

## Build on your Mac

Requirements: an Apple Silicon Mac running macOS 13 or later, Node.js 24 or later, npm, and Xcode Command Line Tools (`xcode-select --install`). The packaging script currently targets Apple Silicon.

```sh
git clone https://github.com/atratheking/quill.git
cd quill
npm ci
npm run package:mac
open release/Quill-darwin-arm64/Quill.app
```

This creates a locally signed app, not a notarized distribution. macOS may require you to allow it in System Settings → Privacy & Security.

## Dictate

1. Open Quill and grant Microphone and Speech Recognition access when requested.
2. Enable the current Quill app in System Settings → Privacy & Security → Accessibility so it can paste text.
3. Put the cursor in the text field you want to use.
4. Press **⌘⇧Space** to start, speak, then press the shortcut again to stop and paste. The shortcut can be changed in settings, for example to **⌘⇧D**. **Escape** cancels.

If pasting fails, the transcript remains available in history and on the clipboard. Quill’s System settings include permission checks, a button to locate the current app, and a recheck action. Rebuilding or moving a locally signed app can invalidate an earlier Accessibility approval; remove the stale entry and enable the current copy.

## Development

```sh
npm run dev
```

Open the displayed local URL to work on the interface. Browser mode previews the workspace; native dictation and automatic paste require the desktop app.

```sh
npm run build
npm run desktop
```

Build the native helper first with `./native/build.sh` when running the unpackaged desktop app. The packaged build includes it automatically.

## Checks

```sh
npm test
npm run build
./native/build.sh
python3 native/test_protocol.py
```

The native checks validate the helper protocol without recording audio or requesting permissions. See [native/README.md](native/README.md) for protocol details.

## Data and privacy

Workspace data, including transcripts and preferences, is saved locally under `~/Library/Application Support/Quill/workspace.json`. Audio is not saved to disk. Apple Speech uses on-device recognition when supported; it can fall back to Apple’s speech service when a local model is unavailable. Service recognition may require a network connection.

The repository excludes local workspace data, recordings, research downloads, dependencies, build output, and packaged apps.

## Assets

Quill includes original SVG banner artwork, Figtree and EB Garamond fonts, and Lucide icons. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for credits and included licenses.
