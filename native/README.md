# Quill Speech helper

macOS 13+ native Apple Speech bridge. It does not open the microphone or request permissions until it receives an explicit `start` command. Audio is never saved to disk. This project uses Apple Speech, and does not reproduce Wispr Flow's proprietary transcription or rewriting models.

## Build and check

```sh
./native/build.sh
python3 native/test_protocol.py
```

Run these commands from the `flow-clone` directory. The build uses installed Xcode command-line tools and produces `native/bin/flow-speech` for the current Mac architecture, with an ad hoc signature. `build.sh` also runs a prompt-free self-test. `flow-speech --self-test` independently checks protocol validation and embedded privacy strings; `test_protocol.py` checks the real JSON process, validation errors, idle cleanup and signal handling. Neither check captures audio, posts paste events, or requests privacy access.

## Electron packaging

Place the helper at `Contents/Resources/native/bin/flow-speech`, then spawn that absolute path with stdin/stdout pipes. Keep stdin open. Stdin EOF, `quit`, SIGINT, SIGHUP and SIGTERM stop capture and exit cleanly.

The helper embeds `native/Info.plist` in its Mach-O executable. The **Electron application's** `Contents/Info.plist` must also contain these strings so macOS can attribute child-process privacy requests to the responsible app:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Quill uses your microphone only when you start dictation, to turn your speech into text.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Quill transcribes dictation using Apple Speech. Audio stays on this Mac when supported; otherwise Apple processes the audio.</string>
```

When applying hardened runtime signing, sign the helper with `native/entitlements.plist` (`com.apple.security.device.audio-input`), then sign the enclosing app using its Electron entitlements. Retain a stable app bundle identifier and installation path for predictable macOS permission attribution. The current build is a local unsandboxed app; App Store sandbox distribution needs its own entitlement and signing review. No Apple Events or Input Monitoring entitlement is needed by this helper. Accessibility permission is required to post Command-V; the app should provide its own explicit action to open the corresponding System Settings pane. The helper never requests Accessibility permission itself.

## Protocol

All messages are one JSON object per line. Stdout contains JSON only. An optional `id` is echoed in responses. Commands are processed on the main run loop. The startup `ready` event reports `state`, `permissions`, supported language identifiers and protocol version 1.

| Command | Fields | Result |
| --- | --- | --- |
| `status` | `id?` | `status` with idle/authorizing/listening/stopping state, speech/microphone authorization and Accessibility boolean; never prompts |
| `frontmost` | `id?` | `frontmost` with bundleId, name and pid, or nulls; reads app identity only |
| `start` | `id?`, `language?`, `contextualStrings?` | Authorization, listening, partial and level events, then final or error |
| `stop` | `id?` | Stops capture immediately, ends audio, waits up to six seconds for final text; idle calls return `stopped` |
| `cancel` | `id?` | Stops and discards the session, emits `cancelled`; pending authorization callbacks cannot start capture |
| `paste` | `id?`, `bundleId?` | Activates the running destination app and posts Command-V only with existing Accessibility trust; returns `pasted` or error |
| `quit` | — | Cleans up and exits |

Start example:

```json
{"type":"start","id":"dictation-1","language":"en-AU","contextualStrings":["Wispr","Acme Corp"]}
```

`language` accepts an Apple-supported locale identifier (hyphens or underscores), or `auto`/omitted for the system locale. This is locale selection, not automatic spoken-language detection. `contextualStrings` is a vocabulary array, limited to 500 nonempty terms of 200 characters each; it biases recognition rather than enforcing exact spelling. Unsupported locales and malformed vocabulary are rejected before requesting any permission.

Session events carry `sessionId`, `language`, `onDevice`, `engine` and `fallbackUsed`. Transcripts use the `text` field. `level` carries normalized microphone RMS between 0 and 1, approximately 12 times per second. `final` includes `duration`, `reason`, and an optional `warning`; on timeout or a late recognition failure it preserves the most recent partial transcript, which may be empty. A request rejected while another is active returns `busy` without replacing the current session.

`onDevice: true` means on-device processing is **required**. When unsupported, or after an early local-model failure, the helper allows Apple Speech service processing and reports `onDevice: false`, `engine: "apple-speech-service"`. This allows Apple to use its service; it does not prove whether a particular audio buffer left the device. An early local-model failure gets one service retry, announced by a `fallback` event, with the last eight seconds of captured audio replayed from memory. Network access and Apple's service availability may limit service recognition. Apple may end a long recognition session automatically; the helper emits its final text and returns to idle.

`authorization` events include `permissions`. Denial errors have `speech_permission_denied` or `microphone_permission_denied` codes and an actionable message. The start command may show macOS's Speech Recognition and Microphone prompts at first use. `stop` or `cancel` during authorization invalidates the session; an already visible system prompt may still need the user's response, but recording will not begin afterward.

Before showing an overlay, call `frontmost` and retain the destination `bundleId`. Before `paste`, Electron must write the intended text to the clipboard and hide its overlay. Pass the retained bundle ID to avoid pasting into a changed destination. The helper checks the destination is frontmost before posting the shortcut. It never reads the clipboard, document, selection, window contents or focused field. `pasted` means the keyboard events were posted, and does not verify that the destination accepted them. When permission or focus is unavailable, keep the text visible with a Copy action.

## Apple references

- [Live audio recognition](https://developer.apple.com/documentation/speech/recognizing-speech-in-live-audio)
- [Speech authorization and usage description](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)
- [On-device recognition requirement](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)
- [App activation](https://developer.apple.com/documentation/appkit/nsrunningapplication/activate(options:))
- [Accessibility trust](https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted)
