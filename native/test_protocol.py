#!/usr/bin/env python3
"""Exercise the real helper process without privacy prompts or audio capture."""
import json
import pathlib
import signal
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
HELPER = ROOT / "bin" / "flow-speech"

commands = [
    {"type": "status", "id": "status-check"},
    {"type": "frontmost", "id": "target-check"},
    {"type": "start", "language": "invalid-test-locale", "id": "language-check"},
    {"type": "start", "contextualStrings": [123]},
    {"type": "cancel", "id": "cancel-check"},
    {"type": "stop", "id": "stop-check"},
    {"type": "unrecognized", "id": "unknown-check"},
]
lines = [json.dumps(command) for command in commands] + ["{broken JSON", "", '{"type":"quit"}']
result = subprocess.run([str(HELPER)], input="\n".join(lines) + "\n", capture_output=True, text=True, timeout=15, check=True)
events = [json.loads(line) for line in result.stdout.splitlines()]
assert events[0]["type"] == "ready", events
status = next(event for event in events if event.get("id") == "status-check")
assert status["state"] == "idle" and status["permissions"] == events[0]["permissions"], status
target = next(event for event in events if event.get("id") == "target-check")
assert target["type"] == "frontmost" and all(key in target for key in ("bundleId", "name", "pid")), target
assert next(event for event in events if event.get("id") == "language-check")["code"] == "unsupported_language"
assert next(event for event in events if event.get("id") == "cancel-check")["type"] == "cancelled"
assert next(event for event in events if event.get("id") == "stop-check")["type"] == "stopped"
assert next(event for event in events if event.get("id") == "unknown-check")["code"] == "unknown_command"
assert {event.get("code") for event in events} >= {"invalid_command", "invalid_json"}
assert not any(event["type"] in ("authorization", "listening", "partial", "level") for event in events), events

process = subprocess.Popen([str(HELPER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
assert json.loads(process.stdout.readline())["type"] == "ready"
process.send_signal(signal.SIGTERM)
assert process.wait(timeout=5) == 0
print("Native protocol checks passed: status, target metadata, validation, idle stop/cancel, SIGTERM; no microphone or privacy prompts.")
