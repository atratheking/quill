"""Validate the Windows helper without capturing audio or injecting input."""
import json
from pathlib import Path
import subprocess

helper = Path(__file__).resolve().parents[1] / 'bin' / 'quill-speech.exe'
commands = [
    {'type': 'status', 'id': 'status'},
    {'type': 'frontmost', 'id': 'target'},
    {'type': 'start', 'language': 'invalid-test-locale', 'id': 'bad-language'},
    {'type': 'paste', 'bundleId': '0', 'id': 'bad-target'},
    {'type': 'cancel', 'id': 'cancel'},
    {'type': 'stop', 'id': 'stop'},
    {'type': 'unknown', 'id': 'unknown'},
    {'type': 'quit'},
]
result = subprocess.run([str(helper)], input='\n'.join(map(json.dumps, commands))+'\n',
                        text=True, encoding='utf-8', capture_output=True, timeout=20, check=True)
events = [json.loads(line) for line in result.stdout.splitlines()]
assert events[0]['type'] == 'ready' and events[0]['platform'] == 'Windows', events
by_id = {e['id']: e for e in events if 'id' in e}
assert by_id['status']['state'] == 'idle', events
assert by_id['target']['type'] == 'frontmost', events
assert by_id['bad-language']['type'] == 'error', events
assert by_id['bad-target']['code'] == 'paste_target_missing', events
assert by_id['cancel']['type'] == 'cancelled', events
assert by_id['stop']['type'] == 'stopped', events
assert by_id['unknown']['code'] == 'invalid_command', events
assert not any(e['type'] in ['listening', 'partial', 'level'] for e in events), events
print('Windows protocol checks passed; no microphone capture or keyboard injection.')
