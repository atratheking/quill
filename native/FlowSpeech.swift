import Foundation
import AppKit
import AVFoundation
import Speech
import ApplicationServices
import Darwin

// Newline-delimited JSON is the only content written to stdout. Keep diagnostics
// in events so Electron can surface actionable failures instead of guessing.
final class EventWriter {
    private let lock = NSLock()
    func emit(_ type: String, _ fields: [String: Any] = [:]) {
        var event = fields
        event["type"] = type
        event["timestamp"] = Date().timeIntervalSince1970
        guard JSONSerialization.isValidJSONObject(event),
              let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]) else { return }
        lock.lock()
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
        lock.unlock()
    }
}

struct Command {
    let type: String
    let id: Any?
    let language: String?
    let contextualStrings: [String]
    let bundleId: String?

    init(_ line: String) throws {
        guard line.utf8.count <= 1_048_576,
              let data = line.data(using: .utf8),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            throw ProtocolError.invalid("Expected a JSON object with a string 'type'.")
        }
        self.type = type
        self.id = object["id"]
        if let value = object["language"], !(value is String) {
            throw ProtocolError.invalid("'language' must be a locale string such as en-US.")
        }
        self.language = object["language"] as? String
        if let value = object["bundleId"], !(value is String) {
            throw ProtocolError.invalid("'bundleId' must be a string.")
        }
        self.bundleId = object["bundleId"] as? String
        if let values = object["contextualStrings"] {
            guard let words = values as? [String], words.count <= 500,
                  words.allSatisfy({ $0.count <= 200 }) else {
                throw ProtocolError.invalid("'contextualStrings' must contain at most 500 strings of 200 characters each.")
            }
            self.contextualStrings = Array(Set(words.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
        } else {
            self.contextualStrings = []
        }
    }
}

enum ProtocolError: Error {
    case invalid(String)
    var message: String { if case .invalid(let message) = self { return message }; return "Invalid command." }
}

// The audio tap runs off the main thread. Serialize request changes, keep a short
// in-memory audio tail for a one-time service fallback, and never write audio.
final class AudioSink {
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var buffers: [AVAudioPCMBuffer] = []
    private var seconds = 0.0
    private var lastMeter = 0.0
    var onLevel: ((Double) -> Void)?

    func replaceRequest(_ next: SFSpeechAudioBufferRecognitionRequest, replay: Bool) {
        lock.lock()
        request?.endAudio()
        request = next
        if replay { for buffer in buffers { next.append(buffer) } }
        lock.unlock()
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        request?.append(buffer)
        if let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) {
            copy.frameLength = buffer.frameLength
            let src = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffer.audioBufferList))
            let dst = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
            for index in 0..<min(src.count, dst.count) {
                if let from = src[index].mData, let to = dst[index].mData {
                    memcpy(to, from, Int(src[index].mDataByteSize))
                }
            }
            buffers.append(copy)
            seconds += Double(copy.frameLength) / copy.format.sampleRate
            while seconds > 8, buffers.count > 1 {
                let removed = buffers.removeFirst()
                seconds -= Double(removed.frameLength) / removed.format.sampleRate
            }
        }
        let now = Date.timeIntervalSinceReferenceDate
        var level: Double?
        if now - lastMeter > 0.08, let data = buffer.floatChannelData, buffer.frameLength > 0 {
            var square = 0.0
            for index in 0..<Int(buffer.frameLength) { square += Double(data[0][index] * data[0][index]) }
            level = min(1, sqrt(square / Double(buffer.frameLength)) * 5)
            lastMeter = now
        }
        lock.unlock()
        if let level { onLevel?(level) }
    }

    func endAudio() {
        lock.lock()
        request?.endAudio()
        request = nil
        lock.unlock()
    }

    func clear() {
        lock.lock()
        request?.endAudio()
        request = nil
        buffers.removeAll()
        seconds = 0
        lock.unlock()
    }
}

final class DictationSession {
    let token = UUID().uuidString
    let command: Command
    let locale: String
    let recognizer: SFSpeechRecognizer
    let engine = AVAudioEngine()
    let sink = AudioSink()
    var startedAt = Date()
    var request: SFSpeechAudioBufferRecognitionRequest?
    var task: SFSpeechRecognitionTask?
    var stoppingTimer: DispatchWorkItem?
    var tapInstalled = false
    var text = ""
    var onDevice: Bool
    var fallbackUsed = false
    var generation = 0

    init(command: Command, locale: String, recognizer: SFSpeechRecognizer) {
        self.command = command
        self.locale = locale
        self.recognizer = recognizer
        self.onDevice = recognizer.supportsOnDeviceRecognition
    }
}

final class SpeechBridge {
    let events = EventWriter()
    private var state = "idle"
    private var session: DictationSession?
    private var signals: [DispatchSourceSignal] = []

    func speechPermission() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    func microphonePermission() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    private func permissions() -> [String: Any] {
        ["speech": speechPermission(), "microphone": microphonePermission(), "accessibility": AXIsProcessTrusted()]
    }

    private func fields(_ command: Command? = nil, session current: DictationSession? = nil) -> [String: Any] {
        var result: [String: Any] = [:]
        if let id = (command ?? current?.command)?.id { result["id"] = id }
        if let current {
            result["sessionId"] = current.token
            result["language"] = current.locale
            result["onDevice"] = current.onDevice
            result["engine"] = current.onDevice ? "apple-on-device" : "apple-speech-service"
            result["fallbackUsed"] = current.fallbackUsed
        }
        return result
    }

    private func emit(_ type: String, command: Command? = nil, session current: DictationSession? = nil, values: [String: Any] = [:]) {
        var result = fields(command, session: current)
        result.merge(values) { _, next in next }
        events.emit(type, result)
    }

    private func error(_ code: String, _ message: String, command: Command? = nil, session current: DictationSession? = nil, extra: [String: Any] = [:]) {
        var values: [String: Any] = ["code": code, "message": message, "state": state]
        values.merge(extra) { _, next in next }
        emit("error", command: command, session: current, values: values)
    }

    func status(_ type: String = "status", command: Command? = nil) {
        emit(type, command: command, session: session, values: [
            "protocolVersion": 1, "state": state, "permissions": permissions(),
            "platform": "macOS", "supportedLanguages": SFSpeechRecognizer.supportedLocales().map(\.identifier).sorted(),
            "commands": ["status", "start", "stop", "cancel", "frontmost", "paste", "quit"]
        ])
    }

    func handle(_ line: String) {
        do {
            let command = try Command(line)
            switch command.type {
            case "status": status(command: command)
            case "start": start(command)
            case "stop": stop(command)
            case "cancel": cancel(command)
            case "frontmost": frontmost(command)
            case "paste": paste(command)
            case "quit": shutdown()
            default: error("unknown_command", "Unknown command '\(command.type)'.", command: command)
            }
        } catch let caught as ProtocolError {
            error("invalid_command", caught.message)
        } catch {
            self.error("invalid_json", "Could not parse command JSON: \(error.localizedDescription)")
        }
    }

    private func start(_ command: Command) {
        guard session == nil else {
            error("busy", "Dictation is already \(state). Stop or cancel the current session first.", command: command)
            return
        }
        let requested = command.language?.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedLocale = (requested == nil || requested == "" || requested == "auto") ? Locale.current.identifier : requested!
        let normalized = requestedLocale.replacingOccurrences(of: "_", with: "-").lowercased()
        guard let locale = SFSpeechRecognizer.supportedLocales().first(where: {
            $0.identifier.replacingOccurrences(of: "_", with: "-").lowercased() == normalized
        }), let recognizer = SFSpeechRecognizer(locale: locale) else {
            error("unsupported_language", "Apple Speech does not support the language '\(requestedLocale)'. Choose a supported language.", command: command)
            return
        }
        recognizer.queue = OperationQueue.main
        let current = DictationSession(command: command, locale: locale.identifier, recognizer: recognizer)
        session = current
        state = "authorizing"
        emit("authorization", session: current, values: ["permissions": permissions(), "state": state])
        // Only this explicit start command can display privacy prompts.
        SFSpeechRecognizer.requestAuthorization { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.session?.token == current.token else { return }
                self.emit("authorization", session: current, values: ["permissions": self.permissions(), "state": self.state])
                guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
                    self.failPermission("speech", current: current)
                    return
                }
                if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
                    AVCaptureDevice.requestAccess(for: .audio) { _ in
                        DispatchQueue.main.async {
                            guard self.session?.token == current.token else { return }
                            self.completeAuthorization(current)
                        }
                    }
                } else {
                    self.completeAuthorization(current)
                }
            }
        }
    }

    private func failPermission(_ permission: String, current: DictationSession) {
        let name = permission == "speech" ? "Speech Recognition" : "Microphone"
        cleanup(current)
        error("\(permission)_permission_denied", "\(name) access is unavailable. Enable it for Quill in System Settings → Privacy & Security → \(name), then try again.", session: current, extra: ["permission": permission, "permissions": permissions()])
    }

    private func completeAuthorization(_ current: DictationSession) {
        emit("authorization", session: current, values: ["permissions": permissions(), "state": state])
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            failPermission("microphone", current: current)
            return
        }
        guard current.recognizer.isAvailable || current.onDevice else {
            cleanup(current)
            error("recognizer_unavailable", "Apple Speech is unavailable for this language. Check your internet connection or choose another language.", session: current)
            return
        }
        let input = current.engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            cleanup(current)
            error("no_microphone", "No usable microphone was found. Connect an input device and choose it in System Settings → Sound → Input.", session: current)
            return
        }
        beginRecognition(current, replay: false)
        current.sink.onLevel = { [weak self, weak current] value in
            DispatchQueue.main.async {
                guard let self, let current, self.session?.token == current.token, self.state == "listening" else { return }
                self.emit("level", session: current, values: ["level": value])
            }
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak current] buffer, _ in
            current?.sink.append(buffer)
        }
        current.tapInstalled = true
        do {
            current.engine.prepare()
            try current.engine.start()
            current.startedAt = Date()
            state = "listening"
            emit("listening", session: current, values: ["state": state, "sampleRate": format.sampleRate])
        } catch {
            cleanup(current)
            self.error("microphone_start_failed", "Could not start the microphone: \(error.localizedDescription)", session: current)
        }
    }

    private func beginRecognition(_ current: DictationSession, replay: Bool) {
        current.generation += 1
        let generation = current.generation
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        request.contextualStrings = current.command.contextualStrings
        request.requiresOnDeviceRecognition = current.onDevice
        if #available(macOS 13.0, *) { request.addsPunctuation = true }
        current.request = request
        current.sink.replaceRequest(request, replay: replay)
        current.task = current.recognizer.recognitionTask(with: request) { [weak self, weak current] result, failure in
            guard let self, let current, self.session?.token == current.token, current.generation == generation else { return }
            if let result {
                current.text = result.bestTranscription.formattedString
                if result.isFinal {
                    self.finish(current, reason: "recognized")
                    return
                }
                self.emit("partial", session: current, values: ["text": current.text])
            }
            if let failure { self.recognitionFailed(failure, current: current) }
        }
    }

    private func recognitionFailed(_ failure: Error, current: DictationSession) {
        // Local language assets may be absent even when the capability exists.
        // Retry once with Apple's service and replay the audio already captured.
        if current.onDevice, !current.fallbackUsed, current.text.isEmpty,
           Date().timeIntervalSince(current.startedAt) < 7, state == "listening" {
            current.generation += 1
            current.task?.cancel()
            current.onDevice = false
            current.fallbackUsed = true
            emit("fallback", session: current, values: ["message": "On-device recognition is unavailable. Retrying with Apple Speech service."])
            beginRecognition(current, replay: true)
            return
        }
        let detail = failure as NSError
        if state == "stopping" {
            finish(current, reason: current.text.isEmpty ? "no_speech" : "last_partial", warning: failure.localizedDescription)
        } else if !current.text.isEmpty {
            finish(current, reason: "last_partial", warning: failure.localizedDescription)
        } else {
            cleanup(current)
            error("recognition_failed", "Speech recognition failed: \(failure.localizedDescription)", session: current, extra: ["domain": detail.domain, "nativeCode": detail.code])
        }
    }

    private func stop(_ command: Command) {
        guard let current = session else {
            emit("stopped", command: command, values: ["state": "idle"])
            return
        }
        if state == "authorizing" { cancel(command); return }
        guard state != "stopping" else { return }
        state = "stopping"
        stopAudio(current)
        current.sink.endAudio()
        current.task?.finish()
        emit("stopping", command: command, session: current, values: ["state": state])
        let timer = DispatchWorkItem { [weak self, weak current] in
            guard let self, let current, self.session?.token == current.token else { return }
            self.finish(current, reason: "finalization_timeout", warning: "Apple Speech did not finish in time. The latest available transcript was kept.")
        }
        current.stoppingTimer = timer
        DispatchQueue.main.asyncAfter(deadline: .now() + 6, execute: timer)
    }

    private func finish(_ current: DictationSession, reason: String, warning: String? = nil) {
        let duration = Date().timeIntervalSince(current.startedAt)
        cleanup(current)
        var values: [String: Any] = ["text": current.text, "reason": reason, "duration": duration, "state": "idle"]
        if let warning { values["warning"] = warning }
        emit("final", session: current, values: values)
    }

    private func stopAudio(_ current: DictationSession) {
        if current.engine.isRunning { current.engine.stop() }
        if current.tapInstalled {
            current.engine.inputNode.removeTap(onBus: 0)
            current.tapInstalled = false
        }
    }

    private func cleanup(_ current: DictationSession) {
        guard session?.token == current.token else { return }
        session = nil
        state = "idle"
        current.stoppingTimer?.cancel()
        stopAudio(current)
        current.sink.clear()
        current.task?.cancel()
        current.task = nil
        current.request = nil
    }

    private func cancel(_ command: Command) {
        let current = session
        if let current { cleanup(current) }
        emit("cancelled", command: command, session: current, values: ["state": "idle"])
    }

    private func frontmost(_ command: Command) {
        let app = NSWorkspace.shared.frontmostApplication
        emit("frontmost", command: command, values: ["bundleId": app?.bundleIdentifier as Any? ?? NSNull(), "name": app?.localizedName as Any? ?? NSNull(), "pid": app?.processIdentifier as Any? ?? NSNull()])
    }

    private func paste(_ command: Command) {
        guard AXIsProcessTrusted() else {
            error("accessibility_permission_denied", "Enable Quill in System Settings → Privacy & Security → Accessibility to paste into another app. Your transcript remains available to copy.", command: command)
            return
        }
        let app: NSRunningApplication?
        if let bundle = command.bundleId, !bundle.isEmpty {
            app = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first(where: { !$0.isTerminated })
        } else {
            app = NSWorkspace.shared.frontmostApplication
        }
        guard let target = app, target.processIdentifier != ProcessInfo.processInfo.processIdentifier else {
            error("paste_target_unavailable", "The destination app is no longer running. Copy the transcript and paste it manually.", command: command)
            return
        }
        // Electron has already put the text on the clipboard. Never read the
        // clipboard, focused text, selection, windows, or target document.
        if !target.isActive { _ = target.activate(options: [.activateIgnoringOtherApps]) }
        waitForPasteTarget(target, command: command, attempts: 12)
    }

    private func waitForPasteTarget(_ target: NSRunningApplication, command: Command, attempts: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { [weak self] in
            guard let self else { return }
            guard !target.isTerminated else {
                self.error("paste_target_unavailable", "The destination app closed before pasting.", command: command)
                return
            }
            if NSWorkspace.shared.frontmostApplication?.processIdentifier != target.processIdentifier {
                if attempts > 0 {
                    self.waitForPasteTarget(target, command: command, attempts: attempts - 1)
                } else {
                    self.error("paste_target_not_focused", "Could not focus the destination app. Your transcript is available to copy.", command: command)
                }
                return
            }
            guard AXIsProcessTrusted(),
                  let source = CGEventSource(stateID: .hidSystemState),
                  let down = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true),
                  let up = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false) else {
                self.error("paste_event_unavailable", "macOS could not create a paste event. Copy and paste the transcript manually.", command: command)
                return
            }
            down.flags = .maskCommand
            up.flags = .maskCommand
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
            self.emit("pasted", command: command, values: ["bundleId": target.bundleIdentifier as Any? ?? NSNull(), "name": target.localizedName as Any? ?? NSNull(), "posted": true])
        }
    }

    func installSignalHandlers() {
        for number in [SIGINT, SIGTERM, SIGHUP] {
            signal(number, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
            source.setEventHandler { [weak self] in self?.shutdown() }
            source.resume()
            signals.append(source)
        }
        signal(SIGPIPE, SIG_IGN)
    }

    func shutdown() {
        if let current = session { cleanup(current) }
        Darwin.exit(0)
    }

    func selfTest() -> Int32 {
        do {
            let command = try Command("{\"type\":\"start\",\"language\":\"en-US\",\"contextualStrings\":[\"Wispr\",\"Wispr\",\"Quill\"],\"id\":\"test\"}")
            guard command.contextualStrings == ["Quill", "Wispr"], command.language == "en-US" else { throw ProtocolError.invalid("Command validation failed.") }
            guard Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") is String,
                  Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") is String else {
                throw ProtocolError.invalid("Embedded privacy descriptions are missing.")
            }
            do { _ = try Command("{\"type\":\"start\",\"contextualStrings\":[1]}"); throw ProtocolError.invalid("Invalid vocabulary was accepted.") }
            catch let failure as ProtocolError where failure.message.contains("contextualStrings") { }
            events.emit("self-test", ["ok": true, "checks": ["JSON protocol", "vocabulary validation", "embedded privacy descriptions"], "microphoneOpened": false, "permissionRequested": false])
            return 0
        } catch {
            events.emit("self-test", ["ok": false, "message": error.localizedDescription])
            return 1
        }
    }
}

let bridge = SpeechBridge()
if CommandLine.arguments.contains("--self-test") { Darwin.exit(bridge.selfTest()) }
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
bridge.installSignalHandlers()
bridge.status("ready")
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
        DispatchQueue.main.async { bridge.handle(line) }
    }
    DispatchQueue.main.async { bridge.shutdown() }
}
RunLoop.main.run()
